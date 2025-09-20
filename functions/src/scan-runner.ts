import { google } from 'googleapis';
import { Firestore } from 'firebase-admin/firestore';
import { logger } from './logger';
import { createCheckpointManager, ScanCheckpoint } from './checkpoint-manager';
import { createJobChainManager } from './job-chain';
import https from 'https';

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
  private _accessToken: string;
  private checkpointManager;
  private jobChainManager;
  private drive: any;
  private startTime: number;
  private dataConnectEndpoint: string;

  constructor(
    db: Firestore,
    jobId: string,
    uid: string,
    accessToken: string,
    dataConnectEndpoint: string,
    driveInstance?: any // Optional drive instance for testing
  ) {
    this.db = db;
    this.jobId = jobId;
    this.uid = uid;
    this._accessToken = accessToken;
    this.checkpointManager = createCheckpointManager(db);
    this.jobChainManager = createJobChainManager(db);
    this.startTime = Date.now();
    this.dataConnectEndpoint = dataConnectEndpoint;

    if (driveInstance) {
      this.drive = driveInstance;
    } else {
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: this._accessToken });
      this.drive = google.drive({ version: 'v3', auth });
    }
  }

  async runScan(): Promise<ScanResults> {
    try {
      logger.info('Starting scan', { jobId: this.jobId, uid: this.uid });

      const checkpoint = await this.checkpointManager.getCheckpoint(this.uid, this.jobId);

      await this.updateJobStatus('running', {
        current: 0,
        total: 0,
        percentage: 0,
        currentStep: 'Initializing scan...',
        filesProcessed: 0,
        bytesProcessed: 0,
      });

      const results = await this.executeScanWithCheckpoints(checkpoint);

      await this.checkpointManager.deleteCheckpoint(this.uid, this.jobId);

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

  private async executeScanWithCheckpoints(checkpoint: ScanCheckpoint | null): Promise<ScanResults> {
    let pageToken = checkpoint?.pageToken;
    let filesProcessed = checkpoint?.filesProcessed || 0;
    let bytesProcessed = checkpoint?.bytesProcessed || 0;
    let totalPages = 0;
    let writeOps = 0;

    try {
      do {
        if (this.jobChainManager.shouldChainJob(0)) {
          return await this.chainJob(pageToken, filesProcessed, bytesProcessed);
        }

        const response = await this.drive.files.list({
          pageSize: 1000,
          pageToken,
          fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, parents, md5Checksum, webViewLink, iconLink, thumbnailLink, trashed, starred, owners, shared)',
          q: 'trashed=false',
        });

        const files = response.data.files || [];
        pageToken = response.data.nextPageToken;
        totalPages++;

        for (let i = 0; i < files.length; i += 10) {
          const batch = files.slice(i, i + 10);
          const batchResults = await this.processBatch(batch);

          filesProcessed += batchResults.filesProcessed;
          bytesProcessed += batchResults.bytesProcessed;
          writeOps += batchResults.writeOps;

          await this.updateJobStatus('running', {
            current: filesProcessed,
            total: Math.max(filesProcessed, 1000),
            percentage: Math.min(95, (filesProcessed / 1000) * 100),
            currentStep: `Processing files: ${filesProcessed} processed`,
            filesProcessed,
            bytesProcessed,
          });

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

  private async processBatch(files: any[]): Promise<{ filesProcessed: number; bytesProcessed: number; writeOps: number }> {
    let filesProcessed = 0;
    let bytesProcessed = 0;
    let writeOps = 0;

    const mutations = files.map(file => {
      return `
        mutation CreateFile {
          file_insert(data: {
            id: "${file.id}",
            name: "${file.name}",
            mimeType: "${file.mimeType}",
            size: ${parseInt(file.size || '0')},
            trashed: ${file.trashed},
            starred: ${file.starred},
            owner: "${file.owners[0].emailAddress}",
            shared: ${file.shared},
            parents: ["${(file.parents || []).join('","')}"],
            webViewLink: "${file.webViewLink}",
            iconLink: "${file.iconLink}",
            thumbnailLink: "${file.thumbnailLink}",
            createdAt: "${file.createdTime}",
            modifiedAt: "${file.modifiedTime}",
            user: { id_expr: "auth.uid" }
          }) {
            id
          }
        }
      `;
    });

    for (const mutation of mutations) {
      try {
        await this.callDataConnect(mutation);
        filesProcessed++;
        bytesProcessed += parseInt(files.find(f => mutation.includes(f.id))?.size || '0');
        writeOps++;
      } catch (error) {
        logger.warn('Failed to process file', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return { filesProcessed, bytesProcessed, writeOps };
  }

  private async callDataConnect(query: string): Promise<any> {
    const data = JSON.stringify({ query });
    const options = {
      hostname: this.dataConnectEndpoint,
      path: '/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'Authorization': `Bearer ${this._accessToken}`
      }
    };

    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(body));
          } else {
            reject(new Error(`Request failed with status code ${res.statusCode}: ${body}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.write(data);
      req.end();
    });
  }

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

export function createScanRunner(
  db: Firestore,
  jobId: string,
  uid: string,
  accessToken: string,
  dataConnectEndpoint: string,
  driveInstance?: any
): ScanRunner {
  return new ScanRunner(db, jobId, uid, accessToken, dataConnectEndpoint, driveInstance);
}

export async function runScanJob(
  db: Firestore,
  jobId: string,
  dataConnectEndpoint: string
): Promise<void> {
  try {
    const jobDoc = await db.collection('scanJobs').doc(jobId).get();
    if (!jobDoc.exists) {
      throw new Error(`Job ${jobId} not found`);
    }

    const jobData = jobDoc.data();
    if (!jobData) {
      throw new Error(`Job ${jobId} has no data`);
    }

    const tokenDoc = await db.collection('users').doc(jobData.uid).collection('secrets').doc('googleDrive').get();
    if (!tokenDoc.exists) {
      throw new Error(`No refresh token found for user ${jobData.uid}`);
    }

    const tokenData = tokenDoc.data();
    if (!tokenData?.refreshToken) {
      throw new Error(`Invalid refresh token for user ${jobData.uid}`);
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_OAUTH_CLIENT_ID,
      process.env.GOOGLE_OAUTH_CLIENT_SECRET
    );

    oauth2Client.setCredentials({ refresh_token: tokenData.refreshToken });

    const { token: accessToken } = await oauth2Client.getAccessToken();

    if (!accessToken) {
      throw new Error('Failed to refresh access token');
    }

    const runner = createScanRunner(db, jobId, jobData.uid, accessToken, dataConnectEndpoint);
    await runner.runScan();
  } catch (error) {
    logger.error('Failed to run scan job', {
      jobId,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}