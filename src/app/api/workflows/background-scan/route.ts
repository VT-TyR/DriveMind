/**
 * @fileoverview Background Drive Scan API endpoint
 * Handles long-running scan operations with progress tracking
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/admin';
import { z } from 'zod';
import { rateLimiters } from '@/lib/security/rate-limiter';
import { securityMiddleware, sanitizeInput } from '@/lib/security/middleware';
import crypto from 'crypto';
import { 
  createScanJob, 
  updateScanJobProgress, 
  completeScanJob, 
  failScanJob,
  getActiveScanJob,
  updateFileIndex,
  shouldRunFullScan,
  isScanCancelled,
  cancelScanJob,
  type ScanJob 
} from '@/lib/firebase-db';
import { driveFor } from '@/lib/google-drive';
import { logger } from '@/lib/logger';
import { recordScanResults } from '@/lib/dataconnect';

const StartScanSchema = z.object({
  type: z.enum(['drive_scan', 'full_analysis', 'duplicate_detection']).optional().default('full_analysis'),
  config: z
    .object({
      maxDepth: z.number().int().min(1).max(10).optional(), // Reduced max depth for security
      includeTrashed: z.boolean().optional(),
      // Google Drive folder IDs are not UUIDs; accept typical Drive ID format (letters, numbers, - and _)
      rootFolderId: z.string().regex(/^[A-Za-z0-9_-]{10,200}$/).optional(),
      fileTypes: z.array(z.string().max(50)).max(10).optional(), // Limit array size
      forceFull: z.boolean().optional().default(false),
      forceDelta: z.boolean().optional().default(false),
    })
    .optional()
    .default({}),
});

export async function POST(request: NextRequest) {
  // Apply rate limiting for expensive operations
  return rateLimiters.expensive(request, async (req) => {
    // Apply security middleware
    return securityMiddleware(req, async (req) => {
      const requestId = crypto.randomUUID();
      const startTime = Date.now();
      
      try {
        logger.info('Background scan API called', { requestId });
    
        const token = req.headers.get('authorization')?.replace('Bearer ', '');
        if (!token) {
          logger.warn('No authorization token provided', { requestId });
          return NextResponse.json(
            { error: 'Authentication required', requestId },
            { status: 401 }
          );
        }

        const auth = getAdminAuth();
        if (!auth) {
          logger.error('Firebase Admin not initialized', { requestId });
          return NextResponse.json(
            { error: 'Service temporarily unavailable', requestId },
            { status: 503 }
          );
        }
    
        let uid: string;
        try {
          const decodedToken = await auth.verifyIdToken(token);
          uid = decodedToken.uid;
          const userHash = crypto.createHash('sha256').update(uid).digest('hex').substring(0, 8);
          logger.info('Token verified', { requestId, userHash });
        } catch (error) {
          logger.error('Token verification failed', { requestId });
          return NextResponse.json(
            { error: 'Invalid authentication token', requestId },
            { status: 401 }
          );
        }

        // Check if there's already an active scan
        let activeScan;
        try {
          activeScan = await getActiveScanJob(uid);
          if (activeScan) {
            logger.info('Active scan found', { requestId, jobId: activeScan.id });
            return NextResponse.json({
              message: 'Scan already in progress',
              jobId: activeScan.id,
              status: activeScan.status,
              progress: activeScan.progress,
              requestId,
            }, { status: 409 });
          }
        } catch (error) {
          logger.error('Failed to check active scan', { requestId });
          return NextResponse.json(
            { error: 'Service error', requestId },
            { status: 500 }
          );
        }

        // Parse and validate request body
        let type, config;
        try {
          const json = await req.json().catch(() => ({}));
          const sanitized = sanitizeInput(json);
          const parsed = StartScanSchema.parse(sanitized);
          type = parsed.type;
          config = parsed.config;
          logger.info('Scan configuration parsed', { requestId, type });
        } catch (error) {
          if (error instanceof z.ZodError) {
            logger.warn('Invalid request body', { requestId, errors: error.flatten() });
            return NextResponse.json(
              { error: 'Invalid request parameters', requestId },
              { status: 400 }
            );
          }
          throw error;
        }

        // Create the background scan job
        let jobId;
        try {
          jobId = await createScanJob(uid, type, config);
          logger.info('Scan job created', { requestId, jobId });
        } catch (error) {
          logger.error('Failed to create scan job', { requestId });
          return NextResponse.json(
            { error: 'Failed to initiate scan', requestId },
            { status: 500 }
          );
        }

        // Start background scan process
        setImmediate(async () => {
          try {
            await processBackgroundScan(uid, jobId, type, config);
            const userHash = crypto.createHash('sha256').update(uid).digest('hex').substring(0, 8);
            logger.info('Scan job completed', { requestId, jobId, userHash });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('Scan runner failed', { requestId, jobId, error: errorMessage });
            failScanJob(jobId, 'Scan processing failed').catch(failError => {
              logger.error('Failed to update job failure status', { requestId, jobId });
            });
          }
        });

        const duration = Date.now() - startTime;
        logger.info('Background scan initiated', { requestId, jobId, duration });
        
        return NextResponse.json({ 
          message: 'Background scan started',
          jobId,
          status: 'pending',
          requestId,
        });

      } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        logger.error('Background scan API error', {
          requestId,
          error: errorMessage,
          duration,
        });
        
        // Return sanitized error response
        return NextResponse.json(
          { 
            error: 'Failed to start background scan',
            requestId,
          },
          { status: 500 }
        );
      }
    });
  });
}

const CancelSchema = z.object({
  action: z.literal('cancel'),
  jobId: z.string().optional(),
});

export async function PATCH(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: 'No authorization token provided' }, { status: 401 });
    const auth = getAdminAuth();
    if (!auth) return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    const { uid } = await auth.verifyIdToken(token);

    const body = await request.json().catch(() => ({}));
    const parsed = CancelSchema.parse(body);

    // Determine jobId
    let jobId = parsed.jobId;
    if (!jobId) {
      const active = await getActiveScanJob(uid);
      if (!active) return NextResponse.json({ error: 'No active scan to cancel' }, { status: 404 });
      jobId = active.id;
    }

    await cancelScanJob(jobId, uid);
    return NextResponse.json({ jobId, status: 'cancelled' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request body', details: error.flatten() }, { status: 400 });
    }
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'No authorization token provided' }, { status: 401 });
    }

    const auth = getAdminAuth();
    if (!auth) {
      return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    }
    const decodedToken = await auth.verifyIdToken(token);
    const uid = decodedToken.uid;

    // Get current active scan job
    const activeScan = await getActiveScanJob(uid);
    
    if (!activeScan) {
      return NextResponse.json({ 
        status: 'idle',
        message: 'No active scan job'
      });
    }

    return NextResponse.json({
      jobId: activeScan.id,
      status: activeScan.status,
      progress: activeScan.progress,
      type: activeScan.type,
      createdAt: activeScan.createdAt,
      startedAt: activeScan.startedAt,
      results: activeScan.results,
      error: activeScan.error
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Failed to get scan status: ${errorMessage}`);
    return NextResponse.json(
      { error: 'Failed to get scan status' },
      { status: 500 }
    );
  }
}

/**
 * Background scan processor - runs asynchronously
 */
async function processBackgroundScan(
  uid: string, 
  jobId: string, 
  type: ScanJob['type'],
  config: ScanJob['config']
) {
  try {
    logger.info(`Starting background scan for user ${uid}, job ${jobId}, type ${type}`);
    
    // Update status to running
    await updateScanJobProgress(jobId, 
      { currentStep: 'Initializing scan...' }, 
      'running'
    );

    // Check if we should do full or delta scan
    await updateScanJobProgress(jobId, {
      currentStep: 'Checking scan requirements...',
      current: 1,
      total: 6
    });

    const scanDecision = await shouldRunFullScan(uid);
    logger.info(`Scan decision for user ${uid}: ${scanDecision.reason}`);

    // Phase 1: Initialize Google Drive connection
    await updateScanJobProgress(jobId, {
      currentStep: 'Connecting to Google Drive...',
      current: 2,
      total: 6
    });

    let drive;
    try {
      drive = await driveFor(uid);
      logger.info(`Successfully connected to Google Drive for user ${uid}`);
    } catch (error) {
      logger.error(`Failed to connect to Google Drive for user ${uid}: ${error}`);
      throw new Error('Google Drive connection failed. Please re-authorize your account.');
    }

    // Phase 2: Scan files
    await updateScanJobProgress(jobId, {
      currentStep: 'Scanning Google Drive files...',
      current: 3,
      total: 6
    });
    if (await isScanCancelled(jobId)) {
      logger.warn(`Scan ${jobId} cancelled before scanning`);
      await failScanJob(jobId, 'Scan cancelled by user');
      return;
    }

    const allFiles: any[] = [];
    let pageToken: string | undefined;
    let totalSize = 0;
    let pageCount = 0;

    do {
      try {
        // Cooperative cancellation check before each page
        if (await isScanCancelled(jobId)) {
          logger.warn(`Scan ${jobId} cancelled by user`);
          await failScanJob(jobId, 'Scan cancelled by user');
          return;
        }
        const response = await drive.files.list({
          pageSize: 1000, // Maximum allowed by Google Drive API
          pageToken,
          q: config.includeTrashed ? undefined : 'trashed = false',
          fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, parents, md5Checksum, version)',
          includeItemsFromAllDrives: true,
          supportsAllDrives: true,
        });

        const files = response.data.files || [];
        allFiles.push(...files);
        pageCount++;

        // Calculate total size (Google Workspace files often have no size)
        let filesWithSize = 0;
        for (const file of files) {
          const fileSize = parseInt(file.size || '0');
          totalSize += fileSize;
          if (fileSize > 0) filesWithSize++;
        }

        // Format size display more accurately
        const formatSize = (bytes: number) => {
          if (bytes === 0) return '0 B';
          const units = ['B', 'KB', 'MB', 'GB', 'TB'];
          let value = bytes;
          let unitIndex = 0;
          
          while (value >= 1024 && unitIndex < units.length - 1) {
            value /= 1024;
            unitIndex++;
          }
          
          return `${value.toFixed(1)} ${units[unitIndex]}`;
        };

        // Update progress with better info
        await updateScanJobProgress(jobId, {
          currentStep: `Scanning: ${allFiles.length.toLocaleString()} files found (${formatSize(totalSize)}${filesWithSize < allFiles.length ? ` + ${allFiles.length - filesWithSize} workspace files` : ''})`,
          current: 3,
          total: 6,
          bytesProcessed: totalSize
        });

        pageToken = response.data.nextPageToken || undefined;
        
        // Add a small delay to avoid hitting rate limits
        if (pageToken) {
          await new Promise(resolve => setTimeout(resolve, 200)); // Increased delay
        }

        // Safety check: if we've been scanning for too long, stop
        const scanDuration = Date.now() - Date.parse(new Date().toISOString());
        if (scanDuration > 30 * 60 * 1000) { // 30 minutes max
          logger.warn(`Scan ${jobId} timeout after 30 minutes`);
          await failScanJob(jobId, 'Scan timeout - please try again with a smaller scope');
          return;
        }

        // Safety check: if we have too many files, stop
        if (allFiles.length > 50000) {
          logger.warn(`Scan ${jobId} stopped - too many files (${allFiles.length})`);
          await failScanJob(jobId, 'Too many files - please organize your Drive and try again');
          return;
        }

        // Cancellation check after each page
        if (await isScanCancelled(jobId)) {
          logger.warn(`Scan ${jobId} cancelled by user after page ${pageCount}`);
          await failScanJob(jobId, 'Scan cancelled by user');
          return;
        }
        logger.info(`Page ${pageCount}: Found ${files.length} files, total: ${allFiles.length}`);

      } catch (driveError) {
        logger.error(`Drive API error on page ${pageCount}: ${driveError}`);
        throw new Error(`Failed to scan Google Drive: ${driveError instanceof Error ? driveError.message : 'Unknown error'}`);
      }
    } while (pageToken);

    // Count files with and without size data
    const filesWithSize = allFiles.filter(f => parseInt(f.size || '0') > 0).length;
    const filesWithoutSize = allFiles.length - filesWithSize;
    
    logger.info(`Completed Drive scan: ${allFiles.length} files (${filesWithSize} with size data, ${filesWithoutSize} workspace files), ${Math.round(totalSize / 1024 / 1024)} MB`);

    // Phase 3: Update file index (for delta scans)
    await updateScanJobProgress(jobId, {
      currentStep: 'Updating file index...',
      current: 4,
      total: 6
    });
    if (await isScanCancelled(jobId)) {
      logger.warn(`Scan ${jobId} cancelled before indexing`);
      await failScanJob(jobId, 'Scan cancelled by user');
      return;
    }

    const scanId = `scan_${jobId}_${Date.now()}`;
    const indexUpdate = await updateFileIndex(uid, allFiles, scanId);

    logger.info(`File index updated: ${indexUpdate.created} created, ${indexUpdate.updated} updated, ${indexUpdate.deleted} deleted`);

    // Phase 4: Analyze for duplicates
    await updateScanJobProgress(jobId, {
      currentStep: 'Analyzing for duplicates...',
      current: 5,
      total: 6
    });
    if (await isScanCancelled(jobId)) {
      logger.warn(`Scan ${jobId} cancelled before duplicate analysis`);
      await failScanJob(jobId, 'Scan cancelled by user');
      return;
    }

    // Simple duplicate detection based on size and name similarity
    const duplicates = findDuplicates(allFiles);
    logger.info(`Found ${duplicates.length} potential duplicate groups`);

    // Phase 5: Finalize results
    await updateScanJobProgress(jobId, {
      currentStep: 'Finalizing scan results...',
      current: 6,
      total: 6
    });
    if (await isScanCancelled(jobId)) {
      logger.warn(`Scan ${jobId} cancelled before finalization`);
      await failScanJob(jobId, 'Scan cancelled by user');
      return;
    }

    const resultsFilesWithSize = allFiles.filter(f => parseInt(f.size || '0') > 0).length;
    const resultsFilesWithoutSize = allFiles.length - resultsFilesWithSize;
    
    const results = {
      scanId,
      filesFound: allFiles.length,
      duplicatesDetected: duplicates.length,
      totalSize,
      insights: {
        totalFiles: allFiles.length,
        filesWithSize: resultsFilesWithSize,
        workspaceFiles: resultsFilesWithoutSize,
        duplicateGroups: duplicates.length,
        totalSize,
        archiveCandidates: Math.floor(allFiles.length * 0.05), // 5% archive candidates
        qualityScore: Math.max(20, 100 - Math.floor(duplicates.length / allFiles.length * 100)),
        recommendedActions: [
          duplicates.length > 0 ? 'Remove duplicate files to save storage' : 'No duplicates found',
          resultsFilesWithoutSize > 0 ? `${resultsFilesWithoutSize} Google Workspace files (Docs, Sheets, Slides) found` : null,
          'Archive old files to improve organization',
          'Set up automated organization rules'
        ].filter(Boolean),
        scanType: scanDecision.shouldRunFull ? 'full' : 'delta',
        indexChanges: indexUpdate
      }
    };

    // Complete the job
    await completeScanJob(jobId, results);

    // Fire-and-forget: record scan summary in DataConnect if enabled
    recordScanResults({
      id: jobId,
      uid,
      scanId,
      filesFound: results.filesFound,
      duplicatesDetected: results.duplicatesDetected,
      totalSize: results.totalSize,
    }).catch((e) => logger.warn('DataConnect scan summary publish failed', { jobId, uid, error: (e as Error).message }));
    
    const finalFilesWithSize = allFiles.filter(f => parseInt(f.size || '0') > 0).length;
    const finalFilesWithoutSize = allFiles.length - finalFilesWithSize;
    
    logger.info(`Background scan completed successfully for user ${uid}: ${allFiles.length} files (${finalFilesWithSize} with size data, ${finalFilesWithoutSize} workspace files), ${Math.round(totalSize / 1024 / 1024)} MB`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`Background scan failed for user ${uid}, job ${jobId}: ${errorMessage}`);
    await failScanJob(jobId, errorMessage);
    throw error;
  }
}

/**
 * Simple duplicate detection based on file size and name similarity
 */
function findDuplicates(files: any[]): any[][] {
  const duplicateGroups: any[][] = [];
  const sizeGroups = new Map<string, any[]>();

  // Group files by size
  for (const file of files) {
    const size = file.size || '0';
    if (!sizeGroups.has(size)) {
      sizeGroups.set(size, []);
    }
    sizeGroups.get(size)!.push(file);
  }

  // Find groups with multiple files of same size
  for (const [size, groupFiles] of sizeGroups) {
    if (groupFiles.length > 1 && size !== '0') {
      // Further group by similar names or MD5 if available
      const nameGroups = new Map<string, any[]>();
      
      for (const file of groupFiles) {
        const key = file.md5Checksum || file.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!nameGroups.has(key)) {
          nameGroups.set(key, []);
        }
        nameGroups.get(key)!.push(file);
      }

      // Add groups with multiple files
      for (const [, nameGroup] of nameGroups) {
        if (nameGroup.length > 1) {
          duplicateGroups.push(nameGroup);
        }
      }
    }
  }

  return duplicateGroups;
}
