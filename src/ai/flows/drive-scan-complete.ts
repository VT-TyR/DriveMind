/**
 * @fileOverview Complete Drive scanning workflow
 * Recursively scans entire Google Drive, builds comprehensive inventory
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { driveFor } from '@/lib/google-drive';
import { FlowAuth, getAuthenticatedUserSync } from '@/lib/flow-auth';
import { logger } from '@/lib/logger';
import { saveAnalytics } from '@/lib/firebase-db';

const DriveFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  mimeType: z.string(),
  size: z.string().optional(),
  modifiedTime: z.string().optional(),
  createdTime: z.string().optional(),
  parents: z.array(z.string()).optional(),
  shared: z.boolean().optional(),
  permissions: z.array(z.any()).optional(),
  webViewLink: z.string().optional(),
  thumbnailLink: z.string().optional(),
  fileExtension: z.string().optional(),
  md5Checksum: z.string().optional(),
  folderColorRgb: z.string().optional(),
  starred: z.boolean().optional(),
  trashed: z.boolean().optional(),
});

const ScanResultSchema = z.object({
  totalFiles: z.number(),
  totalFolders: z.number(),
  totalSize: z.number(),
  deepestLevel: z.number(),
  fileTypes: z.record(z.number()),
  largestFiles: z.array(DriveFileSchema).max(10),
  oldestFiles: z.array(DriveFileSchema).max(10),
  duplicateCandidates: z.array(z.array(DriveFileSchema)),
  folderStructure: z.record(z.any()),
  scanDuration: z.number(),
  errors: z.array(z.string()),
});

export const DriveScanInputSchema = z.object({
  auth: z.object({
    uid: z.string(),
    email: z.string().optional(),
  }),
  maxDepth: z.number().optional().default(20),
  includeTrashed: z.boolean().optional().default(false),
  scanSharedDrives: z.boolean().optional().default(false),
});

export const DriveScanOutputSchema = ScanResultSchema.extend({
  scanId: z.string(),
  completedAt: z.date(),
});

export type DriveScanInput = z.infer<typeof DriveScanInputSchema>;
export type DriveScanOutput = z.infer<typeof DriveScanOutputSchema>;

interface ScanProgress {
  scannedFiles: number;
  scannedFolders: number;
  currentDepth: number;
  errors: string[];
}

async function scanFolder(
  drive: any, 
  folderId: string, 
  folderPath: string,
  depth: number,
  maxDepth: number,
  progress: ScanProgress,
  allFiles: Map<string, any>,
  folderStructure: Record<string, any>,
  includeTrashed: boolean
): Promise<void> {
  
  if (depth > maxDepth) {
    progress.errors.push(`Max depth ${maxDepth} reached at ${folderPath}`);
    return;
  }

  progress.currentDepth = Math.max(progress.currentDepth, depth);

  try {
    let pageToken: string | undefined;
    
    do {
      const query = [
        `'${folderId}' in parents`,
        includeTrashed ? '' : 'trashed = false'
      ].filter(Boolean).join(' and ');

      const response = await drive.files.list({
        q: query,
        fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, createdTime, parents, shared, permissions, webViewLink, thumbnailLink, fileExtension, md5Checksum, folderColorRgb, starred, trashed)',
        pageSize: 1000,
        pageToken,
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
      });

      const files = response.data.files || [];

      for (const file of files) {
        const filePath = `${folderPath}/${file.name}`;
        
        // Store file data
        allFiles.set(file.id!, {
          ...file,
          path: filePath,
          depth: depth + 1,
          parentPath: folderPath,
        });

        if (file.mimeType === 'application/vnd.google-apps.folder') {
          // Track folder structure
          if (!folderStructure[folderPath]) {
            folderStructure[folderPath] = { folders: [], files: [] };
          }
          folderStructure[folderPath].folders.push(file.name);

          progress.scannedFolders++;
          
          // Recursively scan subfolder
          await scanFolder(
            drive, 
            file.id!, 
            filePath, 
            depth + 1, 
            maxDepth, 
            progress, 
            allFiles, 
            folderStructure,
            includeTrashed
          );
        } else {
          // Track files in folder structure
          if (!folderStructure[folderPath]) {
            folderStructure[folderPath] = { folders: [], files: [] };
          }
          folderStructure[folderPath].files.push({
            name: file.name,
            id: file.id,
            size: file.size,
            type: file.mimeType,
          });

          progress.scannedFiles++;
        }

        // Log progress every 100 files
        if ((progress.scannedFiles + progress.scannedFolders) % 100 === 0) {
          logger.info('Scan progress', {
            scannedFiles: progress.scannedFiles,
            scannedFolders: progress.scannedFolders,
            currentDepth: progress.currentDepth,
            currentFolder: folderPath,
          });
        }
      }

      pageToken = response.data.nextPageToken;
    } while (pageToken);

  } catch (error) {
    const errorMsg = `Failed to scan folder ${folderPath}: ${error instanceof Error ? error.message : String(error)}`;
    progress.errors.push(errorMsg);
    logger.error('Folder scan error', error as Error, { folderPath, depth });
  }
}

function analyzeFiles(allFiles: Map<string, any>) {
  const fileTypes: Record<string, number> = {};
  let totalSize = 0;
  const largestFiles: any[] = [];
  const oldestFiles: any[] = [];
  const duplicateCandidates = new Map<string, any[]>();

  for (const [id, file] of allFiles) {
    if (file.mimeType === 'application/vnd.google-apps.folder') continue;

    // File type analysis
    const extension = file.fileExtension || file.mimeType?.split('/')[1] || 'unknown';
    fileTypes[extension] = (fileTypes[extension] || 0) + 1;

    // Size analysis
    const size = parseInt(file.size || '0');
    totalSize += size;
    
    // Track largest files
    largestFiles.push({ ...file, sizeNum: size });
    largestFiles.sort((a, b) => b.sizeNum - a.sizeNum);
    if (largestFiles.length > 10) largestFiles.pop();

    // Track oldest files
    if (file.modifiedTime) {
      oldestFiles.push({ ...file, modifiedDate: new Date(file.modifiedTime) });
      oldestFiles.sort((a, b) => a.modifiedDate.getTime() - b.modifiedDate.getTime());
      if (oldestFiles.length > 10) oldestFiles.pop();
    }

    // Duplicate detection by name and size
    if (file.name && file.size) {
      const key = `${file.name}_${file.size}`;
      if (!duplicateCandidates.has(key)) {
        duplicateCandidates.set(key, []);
      }
      duplicateCandidates.get(key)!.push(file);
    }
  }

  // Filter actual duplicates (2+ files with same name/size)
  const actualDuplicates = Array.from(duplicateCandidates.values())
    .filter(group => group.length > 1)
    .slice(0, 20); // Limit to first 20 duplicate groups

  return {
    fileTypes,
    totalSize,
    largestFiles: largestFiles.map(f => ({ ...f, sizeNum: undefined })),
    oldestFiles: oldestFiles.map(f => ({ ...f, modifiedDate: undefined })),
    duplicateCandidates: actualDuplicates,
  };
}

const driveScanFlow = ai.defineFlow(
  {
    name: 'driveScanFlow',
    inputSchema: DriveScanInputSchema,
    outputSchema: DriveScanOutputSchema,
  },
  async ({ auth, maxDepth, includeTrashed, scanSharedDrives }: DriveScanInput) => {
    const startTime = Date.now();
    const scanId = `scan_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    const user = getAuthenticatedUserSync(auth);
    logger.info('Starting comprehensive Drive scan', { 
      uid: user.uid, 
      scanId, 
      maxDepth,
      includeTrashed,
      scanSharedDrives 
    });

    try {
      const drive = await driveFor(user.uid);
      const allFiles = new Map<string, any>();
      const folderStructure: Record<string, any> = {};
      
      const progress: ScanProgress = {
        scannedFiles: 0,
        scannedFolders: 0,
        currentDepth: 0,
        errors: [],
      };

      // Start scan from root
      await scanFolder(
        drive,
        'root',
        '',
        0,
        maxDepth || 20,
        progress,
        allFiles,
        folderStructure,
        includeTrashed || false
      );

      // Analyze all collected files
      const analysis = analyzeFiles(allFiles);
      
      const scanDuration = Date.now() - startTime;
      
      const result: DriveScanOutput = {
        scanId,
        totalFiles: progress.scannedFiles,
        totalFolders: progress.scannedFolders,
        totalSize: analysis.totalSize,
        deepestLevel: progress.currentDepth,
        fileTypes: analysis.fileTypes,
        largestFiles: analysis.largestFiles,
        oldestFiles: analysis.oldestFiles,
        duplicateCandidates: analysis.duplicateCandidates,
        folderStructure,
        scanDuration,
        errors: progress.errors,
        completedAt: new Date(),
      };

      // Save scan results
      await saveAnalytics(user.uid, {
        type: 'drive_scan',
        ...result,
        timestamp: new Date().toISOString(),
      });

      logger.info('Drive scan completed', {
        uid: user.uid,
        scanId,
        totalFiles: result.totalFiles,
        totalFolders: result.totalFolders,
        totalSize: result.totalSize,
        duplicateGroups: result.duplicateCandidates.length,
        duration: scanDuration,
        errors: progress.errors.length,
      });

      return result;

    } catch (error) {
      logger.error('Drive scan failed', error as Error, { uid: user.uid, scanId });
      throw new Error(`Drive scan failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
);

export async function scanDriveComplete(input: DriveScanInput): Promise<DriveScanOutput> {
  return driveScanFlow(input);
}