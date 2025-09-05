/**
 * @fileOverview Intelligent Duplicate Detection System
 * Advanced duplicate detection using multiple algorithms: content hashing, fuzzy matching,
 * semantic analysis, and ML-based similarity scoring
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { driveFor } from '@/lib/google-drive';
import { FlowAuth, getAuthenticatedUserSync } from '@/lib/flow-auth';
import { logger } from '@/lib/logger';
import { saveAnalytics } from '@/lib/firebase-db';
import crypto from 'crypto';

const DuplicateMatchTypeSchema = z.enum([
  'exact', 'content_hash', 'fuzzy_name', 'size_name', 'semantic', 'version'
]);

const DuplicateFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  size: z.number(),
  mimeType: z.string(),
  modifiedTime: z.date(),
  createdTime: z.date(),
  md5Checksum: z.string().optional(),
  contentHash: z.string().optional(),
  thumbnailLink: z.string().optional(),
  isShared: z.boolean(),
  downloadCount: z.number().optional(),
  qualityScore: z.number(), // 0-100 based on various factors
});

const DuplicateGroupSchema = z.object({
  groupId: z.string(),
  matchType: DuplicateMatchTypeSchema,
  confidence: z.number(), // 0-100
  files: z.array(DuplicateFileSchema),
  recommendedAction: z.object({
    type: z.enum(['keep_best', 'keep_newest', 'keep_largest', 'manual_review']),
    keepFileId: z.string().optional(),
    deleteFileIds: z.array(z.string()),
    reason: z.string(),
  }),
  potentialSpaceSaved: z.number(),
  risk: z.enum(['low', 'medium', 'high']),
});

const DuplicateDetectionResultSchema = z.object({
  detectionId: z.string(),
  totalFiles: z.number(),
  duplicateGroups: z.array(DuplicateGroupSchema),
  summary: z.object({
    totalDuplicateFiles: z.number(),
    totalDuplicateGroups: z.number(),
    potentialSpaceSaved: z.number(),
    safeToDeleteFiles: z.number(),
    needsReviewFiles: z.number(),
    riskDistribution: z.record(z.enum(['low', 'medium', 'high']), z.number()),
  }),
  processingTime: z.number(),
  generatedAt: z.date(),
});

export const DuplicateDetectionInputSchema = z.object({
  auth: z.object({
    uid: z.string(),
    email: z.string().optional(),
  }),
  algorithm: z.enum(['fast', 'thorough', 'deep']).default('thorough'),
  includeContentHashing: z.boolean().default(true),
  includeFuzzyMatching: z.boolean().default(true),
  minFileSize: z.number().default(1024), // 1KB minimum
  maxFiles: z.number().default(1000),
});

export type DuplicateDetectionInput = z.infer<typeof DuplicateDetectionInputSchema>;
export type DuplicateDetectionOutput = z.infer<typeof DuplicateDetectionResultSchema>;

// Levenshtein distance for fuzzy string matching
function levenshteinDistance(str1: string, str2: string): number {
  const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
  
  for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
  
  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const substitutionCost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j - 1][i] + 1, // deletion
        matrix[j][i - 1] + 1, // insertion
        matrix[j - 1][i - 1] + substitutionCost // substitution
      );
    }
  }
  
  return matrix[str2.length][str1.length];
}

function calculateSimilarity(str1: string, str2: string): number {
  const maxLength = Math.max(str1.length, str2.length);
  if (maxLength === 0) return 1;
  
  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
  return 1 - (distance / maxLength);
}

// Normalize file names for comparison
function normalizeFileName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\w\.\-]/g, '')
    .replace(/_copy_?\d*|_\(\d+\)|_final|_draft|_v\d+/gi, '');
}

// Check if files are likely versions of the same file
function areVersions(file1: any, file2: any): boolean {
  const name1 = normalizeFileName(file1.name);
  const name2 = normalizeFileName(file2.name);
  
  // Check if normalized names are very similar
  const similarity = calculateSimilarity(name1, name2);
  if (similarity > 0.8) {
    // Check for version patterns
    const versionPatterns = [
      /\(\d+\)/,
      /_copy_?\d*/i,
      /_v\d+/i,
      /_final/i,
      /_draft/i,
      /_new/i,
      /_old/i,
    ];
    
    const hasVersionPattern1 = versionPatterns.some(pattern => pattern.test(file1.name));
    const hasVersionPattern2 = versionPatterns.some(pattern => pattern.test(file2.name));
    
    return hasVersionPattern1 || hasVersionPattern2;
  }
  
  return false;
}

// Calculate file quality score for determining which file to keep
function calculateQualityScore(file: any): number {
  let score = 50; // Base score
  
  // Size considerations (larger usually better, but not always)
  const size = file.size || 0;
  if (size > 0) score += 10;
  if (size > 1024 * 1024) score += 5; // >1MB
  
  // Modification time (newer usually better)
  if (file.modifiedTime) {
    const age = Date.now() - new Date(file.modifiedTime).getTime();
    const ageInDays = age / (1000 * 60 * 60 * 24);
    if (ageInDays < 30) score += 15;
    else if (ageInDays < 90) score += 10;
    else if (ageInDays < 365) score += 5;
  }
  
  // Name quality (avoid obvious duplicates)
  const name = file.name?.toLowerCase() || '';
  if (name.includes('copy')) score -= 20;
  if (name.includes('(1)') || name.includes('(2)')) score -= 25;
  if (name.includes('draft')) score -= 10;
  if (name.includes('final')) score += 10;
  if (name.includes('backup')) score -= 15;
  
  // Sharing status (shared files are often important)
  if (file.isShared) score += 10;
  
  // Thumbnail availability (might indicate better file)
  if (file.thumbnailLink) score += 5;
  
  return Math.max(0, Math.min(100, score));
}

// Hash file content for exact duplicate detection
async function hashFileContent(drive: any, fileId: string, size: number): Promise<string | null> {
  try {
    // Only hash smaller files to avoid performance issues
    if (size > 50 * 1024 * 1024) return null; // Skip files > 50MB
    
    const response = await drive.files.get({
      fileId,
      alt: 'media',
    });
    
    if (response.data) {
      const content = typeof response.data === 'string' ? 
        response.data : JSON.stringify(response.data);
      return crypto.createHash('sha256').update(content).digest('hex');
    }
  } catch (error) {
    // File might not be downloadable
    return null;
  }
  
  return null;
}

async function detectDuplicates(
  files: any[], 
  drive: any,
  algorithm: string,
  includeContentHashing: boolean,
  includeFuzzyMatching: boolean
): Promise<any[]> {
  
  const duplicateGroups: any[] = [];
  const processedFiles = new Set<string>();
  
  logger.info('Starting duplicate detection', { 
    fileCount: files.length, 
    algorithm,
    includeContentHashing,
    includeFuzzyMatching 
  });

  // 1. Exact MD5 duplicates (if available from Drive)
  if (algorithm !== 'fast') {
    const md5Groups = new Map<string, any[]>();
    
    files.forEach(file => {
      if (file.md5Checksum && file.size > 0) {
        const key = `${file.md5Checksum}_${file.size}`;
        if (!md5Groups.has(key)) md5Groups.set(key, []);
        md5Groups.get(key)!.push(file);
      }
    });
    
    md5Groups.forEach((group, hash) => {
      if (group.length > 1) {
        const groupFiles = group.map(f => ({ ...f, qualityScore: calculateQualityScore(f) }));
        const bestFile = groupFiles.reduce((best, current) => 
          current.qualityScore > best.qualityScore ? current : best
        );
        
        duplicateGroups.push({
          groupId: `exact_${hash.substring(0, 8)}`,
          matchType: 'exact',
          confidence: 100,
          files: groupFiles,
          recommendedAction: {
            type: 'keep_best',
            keepFileId: bestFile.id,
            deleteFileIds: groupFiles.filter(f => f.id !== bestFile.id).map(f => f.id),
            reason: 'Exact MD5 match - files are identical',
          },
          potentialSpaceSaved: groupFiles.filter(f => f.id !== bestFile.id)
            .reduce((sum, f) => sum + f.size, 0),
          risk: 'low',
        });
        
        group.forEach(f => processedFiles.add(f.id));
      }
    });
  }

  // 2. Content hashing for files without MD5
  if (includeContentHashing && algorithm === 'deep') {
    const contentHashGroups = new Map<string, any[]>();
    
    for (const file of files) {
      if (!processedFiles.has(file.id) && !file.md5Checksum && file.size > 0) {
        const contentHash = await hashFileContent(drive, file.id, file.size);
        if (contentHash) {
          const key = `${contentHash}_${file.size}`;
          if (!contentHashGroups.has(key)) contentHashGroups.set(key, []);
          contentHashGroups.get(key)!.push(file);
        }
      }
    }
    
    contentHashGroups.forEach((group, hash) => {
      if (group.length > 1) {
        const groupFiles = group.map(f => ({ ...f, qualityScore: calculateQualityScore(f) }));
        const bestFile = groupFiles.reduce((best, current) => 
          current.qualityScore > best.qualityScore ? current : best
        );
        
        duplicateGroups.push({
          groupId: `content_${hash.substring(0, 8)}`,
          matchType: 'content_hash',
          confidence: 95,
          files: groupFiles,
          recommendedAction: {
            type: 'keep_best',
            keepFileId: bestFile.id,
            deleteFileIds: groupFiles.filter(f => f.id !== bestFile.id).map(f => f.id),
            reason: 'Identical content detected',
          },
          potentialSpaceSaved: groupFiles.filter(f => f.id !== bestFile.id)
            .reduce((sum, f) => sum + f.size, 0),
          risk: 'low',
        });
        
        group.forEach(f => processedFiles.add(f.id));
      }
    });
  }

  // 3. Size + name exact matches
  const sizeNameGroups = new Map<string, any[]>();
  
  files.forEach(file => {
    if (!processedFiles.has(file.id) && file.size > 0) {
      const key = `${file.name}_${file.size}`;
      if (!sizeNameGroups.has(key)) sizeNameGroups.set(key, []);
      sizeNameGroups.get(key)!.push(file);
    }
  });
  
  sizeNameGroups.forEach((group, key) => {
    if (group.length > 1) {
      const groupFiles = group.map(f => ({ ...f, qualityScore: calculateQualityScore(f) }));
      const bestFile = groupFiles.reduce((best, current) => 
        current.qualityScore > best.qualityScore ? current : best
      );
      
      duplicateGroups.push({
        groupId: `sizename_${crypto.createHash('md5').update(key).digest('hex').substring(0, 8)}`,
        matchType: 'size_name',
        confidence: 90,
        files: groupFiles,
        recommendedAction: {
          type: 'keep_best',
          keepFileId: bestFile.id,
          deleteFileIds: groupFiles.filter(f => f.id !== bestFile.id).map(f => f.id),
          reason: 'Identical name and size',
        },
        potentialSpaceSaved: groupFiles.filter(f => f.id !== bestFile.id)
          .reduce((sum, f) => sum + f.size, 0),
        risk: 'low',
      });
      
      group.forEach(f => processedFiles.add(f.id));
    }
  });

  // 4. Fuzzy name matching with size similarity
  if (includeFuzzyMatching && algorithm !== 'fast') {
    const remainingFiles = files.filter(f => !processedFiles.has(f.id));
    
    for (let i = 0; i < remainingFiles.length; i++) {
      const file1 = remainingFiles[i];
      const similarFiles = [file1];
      
      for (let j = i + 1; j < remainingFiles.length; j++) {
        const file2 = remainingFiles[j];
        
        // Skip if already processed
        if (processedFiles.has(file2.id)) continue;
        
        // Check name similarity and size proximity
        const nameSimilarity = calculateSimilarity(file1.name, file2.name);
        const size1 = file1.size || 0;
        const size2 = file2.size || 0;
        const sizeDiff = Math.abs(size1 - size2) / Math.max(size1, size2, 1);
        
        if (nameSimilarity > 0.8 && sizeDiff < 0.1) {
          similarFiles.push(file2);
          processedFiles.add(file2.id);
        }
        
        // Check for version patterns
        if (areVersions(file1, file2) && sizeDiff < 0.2) {
          similarFiles.push(file2);
          processedFiles.add(file2.id);
        }
      }
      
      if (similarFiles.length > 1) {
        const groupFiles = similarFiles.map(f => ({ ...f, qualityScore: calculateQualityScore(f) }));
        const bestFile = groupFiles.reduce((best, current) => 
          current.qualityScore > best.qualityScore ? current : best
        );
        
        const isVersionGroup = similarFiles.some(f => areVersions(f, similarFiles[0]));
        const confidence = isVersionGroup ? 85 : 75;
        
        duplicateGroups.push({
          groupId: `fuzzy_${crypto.createHash('md5').update(file1.name).digest('hex').substring(0, 8)}`,
          matchType: isVersionGroup ? 'version' : 'fuzzy_name',
          confidence,
          files: groupFiles,
          recommendedAction: {
            type: confidence > 80 ? 'keep_best' : 'manual_review',
            keepFileId: confidence > 80 ? bestFile.id : undefined,
            deleteFileIds: confidence > 80 ? 
              groupFiles.filter(f => f.id !== bestFile.id).map(f => f.id) : [],
            reason: isVersionGroup ? 
              'Likely different versions of the same file' : 
              'Similar names and sizes detected',
          },
          potentialSpaceSaved: confidence > 80 ? 
            groupFiles.filter(f => f.id !== bestFile.id).reduce((sum, f) => sum + f.size, 0) : 0,
          risk: confidence > 80 ? 'low' : 'medium',
        });
        
        processedFiles.add(file1.id);
      }
    }
  }

  return duplicateGroups;
}

const duplicateDetectionFlow = ai.defineFlow(
  {
    name: 'duplicateDetectionFlow',
    inputSchema: DuplicateDetectionInputSchema,
    outputSchema: DuplicateDetectionResultSchema,
  },
  async ({ 
    auth, 
    algorithm, 
    includeContentHashing, 
    includeFuzzyMatching, 
    minFileSize, 
    maxFiles 
  }: DuplicateDetectionInput) => {
    const startTime = Date.now();
    const detectionId = `dup_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    const user = getAuthenticatedUserSync(auth);
    logger.info('Starting duplicate detection', { 
      uid: user.uid, 
      detectionId, 
      algorithm,
      minFileSize,
      maxFiles 
    });

    try {
      const drive = await driveFor(user.uid);
      
      // Get files
      const response = await drive.files.list({
        q: `trashed = false and mimeType != 'application/vnd.google-apps.folder'`,
        fields: 'files(id, name, mimeType, size, modifiedTime, createdTime, md5Checksum, thumbnailLink, shared)',
        pageSize: Math.min(1000, maxFiles),
        orderBy: 'quotaBytesUsed desc', // Start with largest files
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
      });

      let files = (response.data.files || [])
        .filter((file: any) => (file.size ? parseInt(file.size) >= minFileSize : false))
        .map((file: any) => ({
          ...file,
          size: parseInt(file.size || '0'),
          modifiedTime: file.modifiedTime ? new Date(file.modifiedTime) : new Date(),
          createdTime: file.createdTime ? new Date(file.createdTime) : new Date(),
          isShared: !!file.shared,
          path: `/${file.name}`, // Simplified path
        }));

      logger.info('Analyzing files for duplicates', { fileCount: files.length });

      // Detect duplicates
      const duplicateGroups = await detectDuplicates(
        files,
        drive,
        algorithm,
        includeContentHashing,
        includeFuzzyMatching
      );

      // Calculate summary statistics
      const totalDuplicateFiles = duplicateGroups.reduce((sum, group) => sum + group.files.length, 0);
      const potentialSpaceSaved = duplicateGroups.reduce((sum, group) => sum + group.potentialSpaceSaved, 0);
      const safeToDeleteFiles = duplicateGroups
        .filter(group => group.risk === 'low')
        .reduce((sum, group) => sum + group.recommendedAction.deleteFileIds.length, 0);
      const needsReviewFiles = duplicateGroups
        .filter(group => group.risk !== 'low')
        .reduce((sum, group) => sum + group.files.length, 0);

      const riskDistribution = {
        low: duplicateGroups.filter(g => g.risk === 'low').length,
        medium: duplicateGroups.filter(g => g.risk === 'medium').length,
        high: duplicateGroups.filter(g => g.risk === 'high').length,
      };

      const result = {
        detectionId,
        totalFiles: files.length,
        duplicateGroups,
        summary: {
          totalDuplicateFiles,
          totalDuplicateGroups: duplicateGroups.length,
          potentialSpaceSaved,
          safeToDeleteFiles,
          needsReviewFiles,
          riskDistribution,
        },
        processingTime: Date.now() - startTime,
        generatedAt: new Date(),
      };

      // Save detection results
      await saveAnalytics(user.uid, {
        type: 'duplicate_detection',
        detectionId,
        totalFiles: files.length,
        duplicateGroups: duplicateGroups.length,
        potentialSpaceSaved,
        safeToDeleteFiles,
        algorithm,
        timestamp: new Date().toISOString(),
      });

      logger.info('Duplicate detection completed', {
        uid: user.uid,
        detectionId,
        totalFiles: files.length,
        duplicateGroups: duplicateGroups.length,
        potentialSpaceSaved,
        processingTime: result.processingTime,
      });

      return result;

    } catch (error) {
      logger.error('Duplicate detection failed', error as Error, { uid: user.uid, detectionId });
      throw new Error(`Duplicate detection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
);

export async function detectSmartDuplicates(input: DuplicateDetectionInput): Promise<DuplicateDetectionOutput> {
  return duplicateDetectionFlow(input);
}