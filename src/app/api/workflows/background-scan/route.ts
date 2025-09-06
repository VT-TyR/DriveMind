/**
 * @fileoverview Background Drive Scan API endpoint
 * Handles long-running scan operations with progress tracking
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/admin';
import { 
  createScanJob, 
  updateScanJobProgress, 
  completeScanJob, 
  failScanJob,
  getActiveScanJob,
  updateFileIndex,
  shouldRunFullScan,
  type ScanJob 
} from '@/lib/firebase-db';
import { driveFor } from '@/lib/google-drive';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    logger.info('📡 Background scan API called');
    
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      logger.warn('❌ No authorization token provided');
      return NextResponse.json({ error: 'No authorization token provided' }, { status: 401 });
    }
    logger.info(`🔑 Authorization token received, length: ${token.length}`);

    const auth = getAdminAuth();
    if (!auth) {
      logger.error('💥 Firebase Admin not initialized');
      return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    }
    logger.info('✅ Firebase Admin Auth initialized');
    
    logger.info('🔍 Verifying Firebase ID token...');
    const decodedToken = await auth.verifyIdToken(token);
    const uid = decodedToken.uid;
    logger.info(`✅ Token verified for user: ${uid}`);

    // Check if there's already an active scan
    logger.info('🔍 Checking for active scan jobs...');
    const activeScan = await getActiveScanJob(uid);
    if (activeScan) {
      logger.info(`⚡ Found active scan: ${activeScan.id}, status: ${activeScan.status}`);
      return NextResponse.json({ 
        message: 'Scan already in progress',
        jobId: activeScan.id,
        status: activeScan.status,
        progress: activeScan.progress
      });
    }
    logger.info('✅ No active scan found');

    logger.info('📋 Parsing request body...');
    const body = await request.json();
    const { type = 'full_analysis', config = {} } = body;
    logger.info(`📊 Scan configuration: type=${type}, config=${JSON.stringify(config)}`);

    // Create the background scan job
    logger.info('🗂️ Creating scan job...');
    const jobId = await createScanJob(uid, type, config);
    logger.info(`✅ Scan job created: ${jobId}`);

    // Start the background processing (don't await - let it run async)
    logger.info('🚀 Starting background scan process...');
    processBackgroundScan(uid, jobId, type, config).catch(error => {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      logger.error(`💥 Background scan failed for user ${uid}, job ${jobId}: ${errorMessage}`);
      failScanJob(jobId, errorMessage);
    });

    logger.info('✅ Background scan initiated successfully');
    return NextResponse.json({ 
      message: 'Background scan started',
      jobId,
      status: 'pending'
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : 'No stack trace';
    logger.error(`💥 Background scan API error: ${errorMessage}`);
    logger.error(`📍 Error stack trace: ${errorStack}`);
    
    // Return more specific error information
    return NextResponse.json(
      { 
        error: 'Failed to start background scan', 
        details: errorMessage,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
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

    const allFiles: any[] = [];
    let pageToken: string | undefined;
    let totalSize = 0;
    let pageCount = 0;

    do {
      try {
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

        // Calculate total size
        for (const file of files) {
          totalSize += parseInt(file.size || '0');
        }

        // Update progress
        await updateScanJobProgress(jobId, {
          currentStep: `Scanning: ${allFiles.length.toLocaleString()} files found (${Math.round(totalSize / 1024 / 1024 / 1024)} GB)`,
          current: 3,
          total: 6,
          bytesProcessed: totalSize
        });

        pageToken = response.data.nextPageToken || undefined;
        
        // Add a small delay to avoid hitting rate limits
        if (pageToken) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        logger.info(`Page ${pageCount}: Found ${files.length} files, total: ${allFiles.length}`);

      } catch (driveError) {
        logger.error(`Drive API error on page ${pageCount}: ${driveError}`);
        throw new Error(`Failed to scan Google Drive: ${driveError instanceof Error ? driveError.message : 'Unknown error'}`);
      }
    } while (pageToken);

    logger.info(`Completed Drive scan: ${allFiles.length} files, ${Math.round(totalSize / 1024 / 1024)} MB`);

    // Phase 3: Update file index (for delta scans)
    await updateScanJobProgress(jobId, {
      currentStep: 'Updating file index...',
      current: 4,
      total: 6
    });

    const scanId = `scan_${jobId}_${Date.now()}`;
    const indexUpdate = await updateFileIndex(uid, allFiles, scanId);

    logger.info(`File index updated: ${indexUpdate.created} created, ${indexUpdate.updated} updated, ${indexUpdate.deleted} deleted`);

    // Phase 4: Analyze for duplicates
    await updateScanJobProgress(jobId, {
      currentStep: 'Analyzing for duplicates...',
      current: 5,
      total: 6
    });

    // Simple duplicate detection based on size and name similarity
    const duplicates = findDuplicates(allFiles);
    logger.info(`Found ${duplicates.length} potential duplicate groups`);

    // Phase 5: Finalize results
    await updateScanJobProgress(jobId, {
      currentStep: 'Finalizing scan results...',
      current: 6,
      total: 6
    });

    const results = {
      scanId,
      filesFound: allFiles.length,
      duplicatesDetected: duplicates.length,
      totalSize,
      insights: {
        totalFiles: allFiles.length,
        duplicateGroups: duplicates.length,
        totalSize,
        archiveCandidates: Math.floor(allFiles.length * 0.05), // 5% archive candidates
        qualityScore: Math.max(20, 100 - Math.floor(duplicates.length / allFiles.length * 100)),
        recommendedActions: [
          duplicates.length > 0 ? 'Remove duplicate files to save storage' : 'No duplicates found',
          'Archive old files to improve organization',
          'Set up automated organization rules'
        ].filter(Boolean),
        scanType: scanDecision.shouldRunFull ? 'full' : 'delta',
        indexChanges: indexUpdate
      }
    };

    // Complete the job
    await completeScanJob(jobId, results);
    
    logger.info(`Background scan completed successfully for user ${uid}: ${allFiles.length} files, ${Math.round(totalSize / 1024 / 1024)} MB`);

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