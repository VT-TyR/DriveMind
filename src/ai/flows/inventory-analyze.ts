/**
 * @fileOverview File Inventory Analysis System
 * Creates comprehensive inventory with metadata analysis, classification, and insights
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { driveFor } from '@/lib/google-drive';
import { FlowAuth, getAuthenticatedUserSync } from '@/lib/flow-auth';
import { logger } from '@/lib/logger';
import { saveAnalytics } from '@/lib/firebase-db';

const FileClassification = z.enum([
  'document', 'spreadsheet', 'presentation', 'image', 'video', 'audio',
  'archive', 'code', 'design', 'data', 'executable', 'font', 'other'
]);

const FileMetadataSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  mimeType: z.string(),
  size: z.number(),
  classification: FileClassification,
  extension: z.string().optional(),
  modifiedTime: z.date(),
  createdTime: z.date(),
  isShared: z.boolean(),
  isStarred: z.boolean(),
  permissions: z.array(z.string()),
  thumbnailAvailable: z.boolean(),
  contentHints: z.object({
    isLikelyDuplicate: z.boolean(),
    isOrganizable: z.boolean(),
    isArchiveCandidate: z.boolean(),
    isLargeFile: z.boolean(),
    isOldFile: z.boolean(),
    hasVersionSuffix: z.boolean(),
    qualityScore: z.number(), // 0-100
  }),
});

const FolderAnalysisSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  depth: z.number(),
  fileCount: z.number(),
  totalSize: z.number(),
  subfolderCount: z.number(),
  isEmpty: z.boolean(),
  isOverloaded: z.boolean(), // >50 files
  isDisorganized: z.boolean(), // Mix of many file types
  organizationScore: z.number(), // 0-100
  recommendedActions: z.array(z.string()),
});

const InventoryInsightsSchema = z.object({
  totalFiles: z.number(),
  totalSize: z.number(),
  fileClassifications: z.record(FileClassification, z.number()),
  folderAnalysis: z.array(FolderAnalysisSchema),
  duplicateGroups: z.number(),
  organizationOpportunities: z.number(),
  archiveCandidates: z.number(),
  largeFolders: z.array(z.string()),
  emptyFolders: z.array(z.string()),
  qualityScore: z.number(), // Overall drive organization score 0-100
  recommendedActions: z.array(z.object({
    type: z.string(),
    priority: z.enum(['high', 'medium', 'low']),
    description: z.string(),
    fileCount: z.number(),
    potentialSpaceSaved: z.number(),
  })),
});

export const InventoryAnalyzeInputSchema = z.object({
  auth: z.object({
    uid: z.string(),
    email: z.string().optional(),
  }),
  scanId: z.string().optional(),
  reuseRecentScan: z.boolean().optional().default(true),
});

export const InventoryAnalyzeOutputSchema = z.object({
  inventoryId: z.string(),
  files: z.array(FileMetadataSchema),
  insights: InventoryInsightsSchema,
  generatedAt: z.date(),
  processingTime: z.number(),
});

export type InventoryAnalyzeInput = z.infer<typeof InventoryAnalyzeInputSchema>;
export type InventoryAnalyzeOutput = z.infer<typeof InventoryAnalyzeOutputSchema>;

function classifyFile(mimeType: string, name: string, size: number): typeof FileClassification._type {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  
  // Document types
  if (mimeType.includes('document') || 
      ['doc', 'docx', 'txt', 'rtf', 'odt', 'pdf'].includes(ext)) {
    return 'document';
  }
  
  // Spreadsheet types
  if (mimeType.includes('spreadsheet') || 
      ['xls', 'xlsx', 'csv', 'ods'].includes(ext)) {
    return 'spreadsheet';
  }
  
  // Presentation types
  if (mimeType.includes('presentation') || 
      ['ppt', 'pptx', 'odp'].includes(ext)) {
    return 'presentation';
  }
  
  // Image types
  if (mimeType.startsWith('image/') || 
      ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'tiff'].includes(ext)) {
    return 'image';
  }
  
  // Video types
  if (mimeType.startsWith('video/') || 
      ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm'].includes(ext)) {
    return 'video';
  }
  
  // Audio types
  if (mimeType.startsWith('audio/') || 
      ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'].includes(ext)) {
    return 'audio';
  }
  
  // Archive types
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(ext)) {
    return 'archive';
  }
  
  // Code types
  if (['js', 'ts', 'py', 'java', 'cpp', 'c', 'php', 'rb', 'go', 'rs', 'swift', 'kt', 'cs', 'html', 'css', 'sql'].includes(ext)) {
    return 'code';
  }
  
  // Design types
  if (['psd', 'ai', 'sketch', 'fig', 'xd', 'indd'].includes(ext)) {
    return 'design';
  }
  
  // Data types
  if (['json', 'xml', 'yaml', 'yml', 'csv', 'tsv', 'db', 'sqlite'].includes(ext)) {
    return 'data';
  }
  
  // Executable types
  if (['exe', 'msi', 'app', 'dmg', 'deb', 'rpm', 'pkg'].includes(ext)) {
    return 'executable';
  }
  
  // Font types
  if (['ttf', 'otf', 'woff', 'woff2', 'eot'].includes(ext)) {
    return 'font';
  }
  
  return 'other';
}

function generateContentHints(file: any, allFiles: any[]): any {
  const size = parseInt(file.size || '0');
  const age = file.modifiedTime ? Date.now() - new Date(file.modifiedTime).getTime() : 0;
  const ageInDays = age / (1000 * 60 * 60 * 24);
  
  // Check for duplicates (same name, similar size)
  const potentialDuplicates = allFiles.filter(other => 
    other.id !== file.id &&
    other.name === file.name &&
    Math.abs(parseInt(other.size || '0') - size) < 1000
  );
  
  // Version detection
  const versionPatterns = /\([\d]+\)|\s*v[\d]+|\s*version\s*[\d]+|\s*copy|\s*final|\s*draft/i;
  const hasVersionSuffix = versionPatterns.test(file.name);
  
  // Quality scoring
  let qualityScore = 100;
  if (hasVersionSuffix) qualityScore -= 20;
  if (potentialDuplicates.length > 0) qualityScore -= 30;
  if (size === 0) qualityScore -= 40;
  if (ageInDays > 365) qualityScore -= 10;
  if (!file.name || file.name.length < 3) qualityScore -= 25;
  
  return {
    isLikelyDuplicate: potentialDuplicates.length > 0,
    isOrganizable: file.mimeType !== 'application/vnd.google-apps.folder',
    isArchiveCandidate: ageInDays > 365 && size > 0,
    isLargeFile: size > 100 * 1024 * 1024, // >100MB
    isOldFile: ageInDays > 365,
    hasVersionSuffix,
    qualityScore: Math.max(0, qualityScore),
  };
}

function analyzeFolders(files: any[]): any[] {
  const folderMap = new Map<string, any>();
  
  // Group files by folder
  files.forEach(file => {
    const folderPath = file.path.split('/').slice(0, -1).join('/') || '/';
    
    if (!folderMap.has(folderPath)) {
      folderMap.set(folderPath, {
        path: folderPath,
        name: folderPath.split('/').pop() || 'Root',
        files: [],
        totalSize: 0,
        fileTypes: new Set(),
      });
    }
    
    const folder = folderMap.get(folderPath)!;
    folder.files.push(file);
    folder.totalSize += file.size;
    folder.fileTypes.add(file.classification);
  });
  
  // Analyze each folder
  return Array.from(folderMap.entries()).map(([path, data]) => {
    const fileCount = data.files.length;
    const uniqueTypes = data.fileTypes.size;
    const depth = path.split('/').length - 1;
    
    let organizationScore = 100;
    let recommendedActions: string[] = [];
    
    // Penalty for too many files
    if (fileCount > 50) {
      organizationScore -= 20;
      recommendedActions.push('Create subfolders to organize files');
    }
    
    // Penalty for too many different file types
    if (uniqueTypes > 5) {
      organizationScore -= 15;
      recommendedActions.push('Separate different file types into folders');
    }
    
    // Penalty for deep nesting
    if (depth > 5) {
      organizationScore -= 10;
      recommendedActions.push('Consider flattening folder structure');
    }
    
    return {
      id: path,
      name: data.name,
      path: path,
      depth: depth,
      fileCount: fileCount,
      totalSize: data.totalSize,
      subfolderCount: 0, // Would need recursive analysis
      isEmpty: fileCount === 0,
      isOverloaded: fileCount > 50,
      isDisorganized: uniqueTypes > 5,
      organizationScore: Math.max(0, organizationScore),
      recommendedActions,
    };
  });
}

function generateInsights(files: any[], folders: any[]): any {
  const totalFiles = files.length;
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  
  // Classification counts
  const classifications: Record<string, number> = {};
  files.forEach(f => {
    classifications[f.classification] = (classifications[f.classification] || 0) + 1;
  });
  
  // Duplicate detection
  const nameGroups = new Map<string, any[]>();
  files.forEach(f => {
    if (!nameGroups.has(f.name)) nameGroups.set(f.name, []);
    nameGroups.get(f.name)!.push(f);
  });
  const duplicateGroups = Array.from(nameGroups.values()).filter(g => g.length > 1).length;
  
  // Organization opportunities
  const organizationOpportunities = files.filter(f => 
    f.contentHints.hasVersionSuffix || 
    f.contentHints.isLikelyDuplicate
  ).length;
  
  // Archive candidates
  const archiveCandidates = files.filter(f => f.contentHints.isArchiveCandidate).length;
  
  // Quality score
  const avgQualityScore = files.reduce((sum, f) => sum + f.contentHints.qualityScore, 0) / totalFiles;
  const avgOrganizationScore = folders.reduce((sum, f) => sum + f.organizationScore, 0) / folders.length;
  const qualityScore = (avgQualityScore + avgOrganizationScore) / 2;
  
  // Recommended actions
  const recommendedActions = [
    {
      type: 'remove_duplicates',
      priority: 'high' as const,
      description: `Remove ${duplicateGroups} groups of duplicate files`,
      fileCount: duplicateGroups * 2, // Estimate
      potentialSpaceSaved: Math.round(totalSize * 0.1), // Estimate 10%
    },
    {
      type: 'archive_old_files',
      priority: 'medium' as const,
      description: `Archive ${archiveCandidates} old files`,
      fileCount: archiveCandidates,
      potentialSpaceSaved: files.filter(f => f.contentHints.isArchiveCandidate).reduce((sum, f) => sum + f.size, 0),
    },
    {
      type: 'organize_folders',
      priority: 'medium' as const,
      description: `Reorganize ${folders.filter(f => f.isDisorganized).length} disorganized folders`,
      fileCount: folders.filter(f => f.isDisorganized).reduce((sum, f) => sum + f.fileCount, 0),
      potentialSpaceSaved: 0,
    },
  ].filter(action => action.fileCount > 0);
  
  return {
    totalFiles,
    totalSize,
    fileClassifications: classifications,
    folderAnalysis: folders,
    duplicateGroups,
    organizationOpportunities,
    archiveCandidates,
    largeFolders: folders.filter(f => f.fileCount > 50).map(f => f.path),
    emptyFolders: folders.filter(f => f.isEmpty).map(f => f.path),
    qualityScore: Math.round(qualityScore),
    recommendedActions,
  };
}

const inventoryAnalyzeFlow = ai.defineFlow(
  {
    name: 'inventoryAnalyzeFlow',
    inputSchema: InventoryAnalyzeInputSchema,
    outputSchema: InventoryAnalyzeOutputSchema,
  },
  async ({ auth, scanId, reuseRecentScan }: InventoryAnalyzeInput) => {
    const startTime = Date.now();
    const inventoryId = `inventory_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    const user = getAuthenticatedUserSync(auth);
    logger.info('Starting inventory analysis', { uid: user.uid, inventoryId, scanId });

    try {
      const drive = await driveFor(user.uid);
      
      // For now, we'll do a simplified scan to get file data
      // In practice, this would integrate with the drive-scan-complete results
      const response = await drive.files.list({
        q: 'trashed = false',
        fields: 'files(id, name, mimeType, size, modifiedTime, createdTime, parents, shared, starred, permissions, thumbnailLink)',
        pageSize: 1000,
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
      });

      const rawFiles = response.data.files || [];
      
      // Process files into inventory format
      const files = rawFiles.map((rawFile: any) => {
        const size = parseInt(rawFile.size || '0');
        const classification = classifyFile(rawFile.mimeType, rawFile.name, size);
        const contentHints = generateContentHints(rawFile, rawFiles);
        
        return {
          id: rawFile.id,
          name: rawFile.name,
          path: `/${rawFile.name}`, // Simplified path
          mimeType: rawFile.mimeType,
          size,
          classification,
          extension: rawFile.name?.split('.').pop()?.toLowerCase(),
          modifiedTime: rawFile.modifiedTime ? new Date(rawFile.modifiedTime) : new Date(),
          createdTime: rawFile.createdTime ? new Date(rawFile.createdTime) : new Date(),
          isShared: !!rawFile.shared,
          isStarred: !!rawFile.starred,
          permissions: rawFile.permissions?.map((p: any) => p.type) || [],
          thumbnailAvailable: !!rawFile.thumbnailLink,
          contentHints,
        };
      });
      
      // Analyze folders
      const folders = analyzeFolders(files);
      
      // Generate insights
      const insights = generateInsights(files, folders);
      
      const result: InventoryAnalyzeOutput = {
        inventoryId,
        files,
        insights,
        generatedAt: new Date(),
        processingTime: Date.now() - startTime,
      };

      // Save inventory results
      await saveAnalytics(user.uid, {
        type: 'inventory_analysis',
        inventoryId,
        totalFiles: insights.totalFiles,
        totalSize: insights.totalSize,
        qualityScore: insights.qualityScore,
        duplicateGroups: insights.duplicateGroups,
        recommendedActions: insights.recommendedActions.length,
        timestamp: new Date().toISOString(),
      });

      logger.info('Inventory analysis completed', {
        uid: user.uid,
        inventoryId,
        totalFiles: insights.totalFiles,
        totalSize: insights.totalSize,
        qualityScore: insights.qualityScore,
        processingTime: result.processingTime,
      });

      return result;

    } catch (error) {
      logger.error('Inventory analysis failed', error as Error, { uid: user.uid, inventoryId });
      throw new Error(`Inventory analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
);

export async function analyzeInventory(input: InventoryAnalyzeInput): Promise<InventoryAnalyzeOutput> {
  return inventoryAnalyzeFlow(input);
}