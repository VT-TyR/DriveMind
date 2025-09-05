
'use server';
/**
 * @fileOverview Production snapshot capture engine.
 * Creates secure backups of files before destructive operations using Google Drive API
 * and Firebase Storage. Implements ALPHA-CODENAME v1.4 production standards.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { FlowAuth, getAuthenticatedUserSync } from '@/lib/flow-auth';
import { SnapshotCaptureInputSchema, SnapshotCaptureInput, SnapshotCaptureOutputSchema, SnapshotCaptureOutput } from '@/lib/ai-types';
import { driveFor } from '@/lib/google-drive';
import { saveSnapshot } from '@/lib/firebase-db';
import { logger } from '@/lib/logger';
import { requireFreshAuth } from '@/lib/guards';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { app } from '@/lib/firebase';
import stream from 'stream';
import { promisify } from 'util';


/**
 * Determine if a file is exportable and get the appropriate export format.
 */
function getExportFormat(mimeType: string): { format: string; extension: string } | null {
  const exportFormats: Record<string, { format: string; extension: string }> = {
    'application/vnd.google-apps.document': { format: 'application/pdf', extension: 'pdf' },
    'application/vnd.google-apps.spreadsheet': { format: 'application/pdf', extension: 'pdf' },
    'application/vnd.google-apps.presentation': { format: 'application/pdf', extension: 'pdf' },
    'application/vnd.google-apps.drawing': { format: 'image/png', extension: 'png' },
    'application/vnd.google-apps.form': { format: 'application/pdf', extension: 'pdf' },
  };
  
  return exportFormats[mimeType] || null;
}

/**
 * Check if a file should be snapshotted based on type and size.
 */
function shouldSnapshot(mimeType: string, sizeBytes: number): boolean {
  // Don't snapshot very large files (>100MB) to avoid storage costs
  if (sizeBytes > 100 * 1024 * 1024) {
    return false;
  }
  
  // Snapshot Google Workspace files
  if (mimeType.startsWith('application/vnd.google-apps.')) {
    return true;
  }
  
  // Snapshot important document types
  const importantTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv'
  ];
  
  return importantTypes.includes(mimeType);
}

/**
 * Upload file content to Firebase Storage.
 */
async function uploadToFirebaseStorage(
  uid: string, 
  batchId: string, 
  fileId: string, 
  fileName: string,
  content: Buffer, 
  mimeType: string,
  extension: string
): Promise<string> {
  const storage = getStorage(app);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  const storagePath = `snapshots/${uid}/${batchId}/${fileId}/${timestamp}-${sanitizedFileName}.${extension}`;
  
  const storageRef = ref(storage, storagePath);
  
  const metadata = {
    contentType: mimeType,
    customMetadata: {
      originalFileId: fileId,
      originalFileName: fileName,
      batchId: batchId,
      uid: uid,
      captureTime: new Date().toISOString()
    }
  };
  
  await uploadBytes(storageRef, content, metadata);
  const downloadUrl = await getDownloadURL(storageRef);
  
  return downloadUrl;
}

export async function snapshotCapture(input: SnapshotCaptureInput): Promise<SnapshotCaptureOutput> {
  return snapshotCaptureFlow(input);
}

const snapshotCaptureFlow = ai.defineFlow(
  {
    name: 'snapshotCaptureFlow',
    inputSchema: SnapshotCaptureInputSchema,
    outputSchema: SnapshotCaptureOutputSchema,
  },
  async ({ fileId, batchId, auth }: SnapshotCaptureInput) => {
    const startTime = Date.now();
    
    try {
      // Validate authentication
      const user = getAuthenticatedUserSync(auth);
      requireFreshAuth(auth);
      
      logger.info('Starting file snapshot capture', { fileId, batchId, uid: user.uid });
      
      // Get Drive API client
      const drive = await driveFor(user.uid);
      
      // Get file metadata first
      let fileMetadata;
      try {
        const response = await drive.files.get({
          fileId,
          fields: 'id, name, mimeType, size, parents, modifiedTime'
        });
        fileMetadata = response.data;
      } catch (error: any) {
        logger.error('Failed to get file metadata for snapshot', undefined, {
          fileId,
          batchId,
          uid: user.uid,
          error: error.message
        });
        throw new Error(`Cannot access file ${fileId}: ${error.message}`);
      }
      
      const fileName = fileMetadata.name || `file_${fileId}`;
      const mimeType = fileMetadata.mimeType || 'application/octet-stream';
      const sizeBytes = Number(fileMetadata.size || 0);
      
      logger.info('File metadata retrieved for snapshot', {
        fileId,
        batchId,
        uid: user.uid,
        fileName,
        mimeType,
        sizeBytes
      });
      
      // Check if we should snapshot this file
      if (!shouldSnapshot(mimeType, sizeBytes)) {
        logger.info('File skipped for snapshot (not suitable)', {
          fileId,
          batchId,
          uid: user.uid,
          fileName,
          mimeType,
          sizeBytes
        });
        
        return {
          snapshotPath: `skipped://${fileName} (${mimeType}, ${sizeBytes} bytes)`
        };
      }
      
      let fileContent: Buffer;
      let finalMimeType: string;
      let fileExtension: string;
      
      // Handle Google Workspace files (export them)
      const exportFormat = getExportFormat(mimeType);
      if (exportFormat) {
        logger.info('Exporting Google Workspace file', {
          fileId,
          batchId,
          uid: user.uid,
          fileName,
          originalType: mimeType,
          exportFormat: exportFormat.format
        });
        
        try {
          const exportResponse = await drive.files.export({
            fileId,
            mimeType: exportFormat.format
          });
          
          if (!exportResponse.data) {
            throw new Error('Export response has no data');
          }
          
          // Convert response data to Buffer
          if (Buffer.isBuffer(exportResponse.data)) {
            fileContent = exportResponse.data;
          } else if (typeof exportResponse.data === 'string') {
            fileContent = Buffer.from(exportResponse.data, 'utf8');
          } else {
            // Handle stream or other data types
            fileContent = Buffer.from(JSON.stringify(exportResponse.data));
          }
          
          finalMimeType = exportFormat.format;
          fileExtension = exportFormat.extension;
          
        } catch (error: any) {
          logger.error('Failed to export Google Workspace file', undefined, {
            fileId,
            batchId,
            uid: user.uid,
            fileName,
            error: error.message
          });
          throw new Error(`Cannot export file ${fileName}: ${error.message}`);
        }
        
      } else {
        // Handle regular files (download them)
        logger.info('Downloading regular file', {
          fileId,
          batchId,
          uid: user.uid,
          fileName,
          mimeType
        });
        
        try {
          const downloadResponse = await drive.files.get({
            fileId,
            alt: 'media'
          });
          
          if (!downloadResponse.data) {
            throw new Error('Download response has no data');
          }
          
          // Convert response data to Buffer
          if (Buffer.isBuffer(downloadResponse.data)) {
            fileContent = downloadResponse.data;
          } else if (typeof downloadResponse.data === 'string') {
            fileContent = Buffer.from(downloadResponse.data, 'binary');
          } else {
            fileContent = Buffer.from(JSON.stringify(downloadResponse.data));
          }
          
          finalMimeType = mimeType;
          fileExtension = fileName.split('.').pop() || 'bin';
          
        } catch (error: any) {
          logger.error('Failed to download regular file', undefined, {
            fileId,
            batchId,
            uid: user.uid,
            fileName,
            error: error.message
          });
          throw new Error(`Cannot download file ${fileName}: ${error.message}`);
        }
      }
      
      logger.info('File content obtained, uploading to storage', {
        fileId,
        batchId,
        uid: user.uid,
        fileName,
        contentSize: fileContent.length,
        finalMimeType,
        fileExtension
      });
      
      // Upload to Firebase Storage
      const downloadUrl = await uploadToFirebaseStorage(
        user.uid,
        batchId,
        fileId,
        fileName,
        fileContent,
        finalMimeType,
        fileExtension
      );
      
      // Save snapshot metadata to database
      await saveSnapshot(user.uid, fileId, batchId, downloadUrl);
      
      const duration = Date.now() - startTime;
      
      logger.info('File snapshot captured successfully', {
        fileId,
        batchId,
        uid: user.uid,
        fileName,
        contentSize: fileContent.length,
        downloadUrl,
        duration
      });
      
      return {
        snapshotPath: downloadUrl
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('File snapshot capture failed', undefined, {
        fileId,
        batchId,
        error: error instanceof Error ? error.message : String(error),
        duration,
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // For snapshot failures, we might want to continue the operation
      // rather than blocking it, depending on user preferences
      if (error instanceof Error) {
        throw error;
      }
      
      throw new Error('An unexpected error occurred during snapshot capture.');
    }
  }
);

    
