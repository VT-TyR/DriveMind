import { google } from 'googleapis';
import { Firestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { createCheckpointManager, ScanCheckpoint } from './checkpoint-manager';
import { createJobChainManager } from './job-chain';

type ScanStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'chained';

interface ScanProgress {
  current: number;
  total: number;
  percentage: number;
  currentStep: string;
  estimatedTimeRemaining?: number;
  bytesProcessed?: number;
  totalBytes?: number;
  filesProcessed?: number;
}

interface ScanJobDoc {
  uid: string;
  status: ScanStatus;
  type: 'drive_scan' | 'full_analysis' | 'duplicate_detection';
  progress: ScanProgress;
  config: {
    maxDepth?: number;
    includeTrashed?: boolean;
    rootFolderId?: string;
    fileTypes?: string[];
  };
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
  results?: any;
  error?: string;
}

interface FileIndexEntry {
  id: string;
  uid: string;
  name: string;
  mimeType: string;
  size: number;
  modifiedTime: string;
  parentId?: string;
  md5Checksum?: string;
  version: number;
  lastScanId: string;
  createdAt: number;
  updatedAt: number;
}

interface ScanResults {
  pages: number;
  writeOps: number;
  durationMs: number;
  filesProcessed: number;
  bytesProcessed: number;
  duplicatesFound?: number;
}

export class ScanRunner {
  private db: Firestore;
  private jobId: string;
  private uid: string;
  private _accessToken: string; // Prefixed with _ to indicate intentionally unused
  private checkpointManager;
  private jobChainManager;
  private drive: any;
  private startTime: number;

  constructor(
    db: Firestore, 
    jobId: string, 
    uid: string, 
    accessToken: string
  ) {
    this.db = db;
    this.jobId = jobId;
    this.uid = uid;
    this._accessToken = accessToken;
    this.checkpointManager = createCheckpointManager(db);
    this.jobChainManager = createJobChainManager(db);
    this.startTime = Date.now();

    // Initialize Google Drive API
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: this._accessToken });
    this.drive = google.drive({ version: 'v3', auth });
  }

  /**
   * Main scan execution method
   */
  async runScan(): Promise<ScanResults> {
    try {
      logger.info('Starting scan', { jobId: this.jobId, uid: this.uid });

      // Check for existing checkpoint
      const checkpoint = await this.checkpointManager.getCheckpoint(this.uid, this.jobId);
      
      // Update job status
      await this.updateJobStatus('running', {
        current: 0,
        total: 0,
        percentage: 0,
        currentStep: 'Initializing scan...',
        filesProcessed: 0,
        bytesProcessed: 0,
      });

      // Execute scan with checkpoint recovery
      const results = await this.executeScanWithCheckpoints(checkpoint);

      // Clean up checkpoint on success
      await this.checkpointManager.deleteCheckpoint(this.uid, this.jobId);

      // Update final status
      await this.updateJobStatus('completed', {
        current: results.filesProcessed,
        total: results.filesProcessed,
        percentage: 100,
        currentStep: 'Scan completed',
        filesProcessed: results.filesProcessed,
        bytesProcessed: results.bytesProcessed,
      }, results);

      logger.info('Scan completed', { 
        jobId: this.jobId, 
        results 
      });

      return results;

    } catch (error) {
      logger.error('Scan failed', { 
        jobId: this.jobId, 
        error: error instanceof Error ? error.message : String(error)
      });

      // Create recovery checkpoint
      await this.checkpointManager.createRecoveryCheckpoint(
        this.jobId,
        this.uid,
        error instanceof Error ? error : new Error(String(error)),
        {}
      );

      await this.updateJobStatus('failed', undefined, undefined, 
        error instanceof Error ? error.message : 'Scan failed'
      );

      throw error;
    }
  }

  /**
   * Execute scan with checkpoint support
   */
  private async executeScanWithCheckpoints(checkpoint: ScanCheckpoint | null): Promise<ScanResults> {
    let pageToken = checkpoint?.pageToken;
    let filesProcessed = checkpoint?.filesProcessed || 0;
    let bytesProcessed = checkpoint?.bytesProcessed || 0;
    let totalPages = 0;
    let writeOps = 0;

    try {
      // Scan files from Drive API
      do {
        // Check if we should chain the job
        if (this.jobChainManager.shouldChainJob(0)) {
          return await this.chainJob(pageToken, filesProcessed, bytesProcessed);
        }

        // List files from Google Drive
        const response = await this.drive.files.list({
          pageSize: 1000,
          pageToken,
          fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, parents, md5Checksum)',
          q: 'trashed=false',
        });

        const files = response.data.files || [];
        pageToken = response.data.nextPageToken;
        totalPages++;

        // Process files in batches
        for (let i = 0; i < files.length; i += 100) {
          const batch = files.slice(i, i + 100);
          const batchResults = await this.processBatch(batch);
          
          filesProcessed += batchResults.filesProcessed;
          bytesProcessed += batchResults.bytesProcessed;
          writeOps += batchResults.writeOps;

          // Update progress
          await this.updateJobStatus('running', {
            current: filesProcessed,
            total: Math.max(filesProcessed, 1000), // Estimate
            percentage: Math.min(95, (filesProcessed / 1000) * 100),
            currentStep: `Processing files: ${filesProcessed} processed`,
            filesProcessed,
            bytesProcessed,
          });

          // Check for checkpointing
          if (this.checkpointManager.shouldCheckpoint(batch.length)) {
            const checkpointData: ScanCheckpoint = {
              jobId: this.jobId,
              uid: this.uid,
              scanId: `scan_${Date.now()}`,
              pageToken,
              filesProcessed,
              bytesProcessed,
              scanType: 'full',
              createdAt: Date.now(),
              updatedAt: Date.now(),
              expiresAt: Date.now() + (24 * 60 * 60 * 1000),
              metadata: {
                duplicatesFound: 0,
                indexUpdates: {
                  created: writeOps,
                  modified: 0,
                  deleted: 0,
                },
                pagesProcessed: totalPages,
                errors: [],
              },
            };
            
            await this.checkpointManager.saveCheckpoint(checkpointData);
          }
        }

      } while (pageToken);

      return {
        pages: totalPages,
        writeOps,
        durationMs: Date.now() - this.startTime,
        filesProcessed,
        bytesProcessed,
        duplicatesFound: 0,
      };

    } catch (error) {
      logger.error('Scan execution error', { 
        jobId: this.jobId, 
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Process a batch of files
   */
  private async processBatch(files: any[]): Promise<{ filesProcessed: number; bytesProcessed: number; writeOps: number }> {
    const batch = this.db.batch();
    let filesProcessed = 0;
    let bytesProcessed = 0;
    let writeOps = 0;

    for (const file of files) {
      try {
        const fileEntry: FileIndexEntry = {
          id: file.id,
          uid: this.uid,
          name: file.name,
          mimeType: file.mimeType,
          size: parseInt(file.size || '0'),
          modifiedTime: file.modifiedTime,
          parentId: file.parents?.[0],
          md5Checksum: file.md5Checksum,
          version: 1,
          lastScanId: this.jobId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        batch.set(
          this.db.collection('fileIndex').doc(file.id),
          fileEntry,
          { merge: true }
        );

        filesProcessed++;
        bytesProcessed += fileEntry.size;
        writeOps++;

      } catch (error) {
        logger.warn('Failed to process file', { 
          fileId: file.id, 
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // Commit batch
    await batch.commit();

    return { filesProcessed, bytesProcessed, writeOps };
  }

  /**
   * Chain job when approaching timeout
   */
  private async chainJob(
    pageToken: string | undefined,
    filesProcessed: number,
    bytesProcessed: number
  ): Promise<ScanResults> {
    const checkpoint: ScanCheckpoint = {
      jobId: this.jobId,
      uid: this.uid,
      scanId: `scan_${Date.now()}`,
      pageToken,
      filesProcessed,
      bytesProcessed,
      scanType: 'full',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      expiresAt: Date.now() + (24 * 60 * 60 * 1000),
      metadata: {
        duplicatesFound: 0,
        indexUpdates: {
          created: filesProcessed,
          modified: 0,
          deleted: 0,
        },
        pagesProcessed: 1,
        errors: [],
      },
    };

    const chainedJobId = await this.jobChainManager.createChainedJob(
      this.jobId,
      this.uid,
      checkpoint
    );

    // Update current job status
    await this.updateJobStatus('chained', {
      current: filesProcessed,
      total: filesProcessed,
      percentage: 50,
      currentStep: `Continuing in chained job: ${chainedJobId}`,
      filesProcessed,
      bytesProcessed,
    });

    return {
      pages: 1,
      writeOps: 0,
      durationMs: Date.now() - this.startTime,
      filesProcessed,
      bytesProcessed,
      duplicatesFound: 0,
    };
  }

  /**
   * Update job status in Firestore
   */
  private async updateJobStatus(
    status: ScanStatus,
    progress?: ScanProgress,
    results?: any,
    error?: string
  ): Promise<void> {
    const update: Partial<ScanJobDoc> = {
      status,
      updatedAt: Date.now(),
    };

    if (status === 'running' && !update.startedAt) {
      update.startedAt = Date.now();
    }

    if (status === 'completed' || status === 'failed') {
      update.completedAt = Date.now();
    }

    if (progress) {
      update.progress = progress;
    }

    if (results) {
      update.results = results;
    }

    if (error) {
      update.error = error;
    }

    await this.db
      .collection('scanJobs')
      .doc(this.jobId)
      .update(update);
  }
}

/**
 * Factory function for creating scan runner
 */
export function createScanRunner(
  db: Firestore,
  jobId: string,
  uid: string,
  accessToken: string
): ScanRunner {
  return new ScanRunner(db, jobId, uid, accessToken);
}

/**
 * Main function to run a scan job (called by Cloud Function trigger)
 */
export async function runScanJob(
  db: Firestore,
  jobId: string
): Promise<void> {
  try {
    // Get job details from Firestore
    const jobDoc = await db.collection('scanJobs').doc(jobId).get();
    if (!jobDoc.exists) {
      throw new Error(`Job ${jobId} not found`);
    }
    
    const jobData = jobDoc.data();
    if (!jobData) {
      throw new Error(`Job ${jobId} has no data`);
    }
    
    // Get access token from user's token store
    const tokenDoc = await db.collection('tokens').doc(jobData.uid).get();
    if (!tokenDoc.exists) {
      throw new Error(`No access token found for user ${jobData.uid}`);
    }
    
    const tokenData = tokenDoc.data();
    if (!tokenData?.access_token) {
      throw new Error(`Invalid access token for user ${jobData.uid}`);
    }
    
    const runner = createScanRunner(db, jobId, jobData.uid, tokenData.access_token);
    await runner.runScan();
  } catch (error) {
    logger.error('Failed to run scan job', {
      jobId,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}