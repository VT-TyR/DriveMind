
'use server';
/**
 * @fileOverview A flow to detect version chains in files (e.g. file.txt, file (1).txt).
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { FlowAuth, getAuthenticatedUserSync } from '@/lib/flow-auth';
import { requireFreshAuth } from '@/lib/guards';
import { VersionsLinkInputSchema, VersionsLinkInput, VersionsLinkOutputSchema, VersionsLinkOutput } from '@/lib/ai-types';
import { FileSchema } from '@/lib/ai-types';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

/**
 * Version member data structure
 */
interface VersionMember {
    fileId: string;
    name: string;
    size: number;
    versionNumber: number;
    versionType: string;
    isLatest: boolean;
    confidence: number;
    lastModified: Date;
}

/**
 * Version pattern data structure
 */
interface VersionPattern {
    pattern: string;
    type: string;
    count: number;
    matches: number;
    confidence: number;
}

/**
 * Version chain data structure
 */
interface VersionChain {
    chainId: string;
    uid: string;
    baseKey: string;
    baseName: string;
    mimeType: string;
    members: VersionMember[];
    winner: VersionMember;
    totalSize: number;
    potentialSavings: number;
    confidence: number;
    patterns: VersionPattern[];
    createdAt: Date;
    files: Array<{
        id: string;
        name: string;
        version: number;
        isLatest: boolean;
    }>;
}

/**
 * Extracts base name and version info from a file name
 */
function extractBaseName(fileName: string): { baseName: string; versionInfo: { version: number; isVersioned: boolean } } {
    // Handle patterns like "file (1).txt", "file_v2.txt", "file-copy.txt", etc.
    const patterns = [
        /^(.+?)\s*\((\d+)\)(\.[^.]*)?$/, // "file (1).txt"
        /^(.+?)[-_]?(?:copy|v|version)[-_]?(\d+)(\.[^.]*)?$/i, // "file_v2.txt", "file-copy2.txt"
        /^(.+?)[-_](?:copy)(\.[^.]*)?$/i, // "file-copy.txt" (no number)
    ];
    
    for (const pattern of patterns) {
        const match = fileName.match(pattern);
        if (match) {
            const baseName = match[1];
            const version = match[2] ? parseInt(match[2], 10) : 1;
            return {
                baseName: baseName.trim(),
                versionInfo: { version, isVersioned: true }
            };
        }
    }
    
    // No version pattern found
    const nameWithoutExt = fileName.replace(/\.[^.]*$/, '');
    return {
        baseName: nameWithoutExt,
        versionInfo: { version: 0, isVersioned: false }
    };
}

// Mock datastore write
async function saveVersionChain(chainId: string, chainData: any) {
    console.log(`Faking save for version chain ${chainId}`, chainData);
    return;
}

/**
 * Calculate similarity between two file names using string distance
 */
function calculateNameSimilarity(name1: string, name2: string): number {
    // Simple Levenshtein distance-based similarity
    const getDistance = (str1: string, str2: string): number => {
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
    };
    
    const maxLength = Math.max(name1.length, name2.length);
    if (maxLength === 0) return 1;
    
    const distance = getDistance(name1.toLowerCase(), name2.toLowerCase());
    return 1 - (distance / maxLength);
}

/**
 * Determine the "winner" (latest version) in a version chain
 */
function determineChainWinner(members: VersionMember[]): VersionMember {
    // Find the member with the highest version number
    const winner = members.reduce((best, current) => 
        current.versionNumber > best.versionNumber ? current : best
    );
    
    // Mark as latest
    winner.isLatest = true;
    
    return winner;
}

/**
 * Calculate variance in file sizes
 */
function calculateSizeVariance(sizes: number[]): number {
    if (sizes.length <= 1) return 0;
    const mean = sizes.reduce((sum, size) => sum + size, 0) / sizes.length;
    const variance = sizes.reduce((sum, size) => sum + Math.pow(size - mean, 2), 0) / sizes.length;
    return Math.sqrt(variance) / mean; // Normalized standard deviation
}

/**
 * Calculate variance in modification times
 */
function calculateTimeVariance(timestamps: number[]): number {
    if (timestamps.length <= 1) return 0;
    const mean = timestamps.reduce((sum, ts) => sum + ts, 0) / timestamps.length;
    const variance = timestamps.reduce((sum, ts) => sum + Math.pow(ts - mean, 2), 0) / timestamps.length;
    return Math.sqrt(variance) / (24 * 60 * 60 * 1000); // Normalized to days
}

/**
 * Save version chains to database
 */
async function saveVersionChains(uid: string, versionChains: VersionChain[]) {
    try {
        for (const chain of versionChains) {
            await saveVersionChain(chain.chainId, {
                ...chain,
                createdAt: new Date().toISOString()
            });
        }
        logger.info('Version chains saved', { uid, count: versionChains.length });
    } catch (error) {
        logger.error('Failed to save version chains', error as Error, { uid, count: versionChains.length });
        throw error;
    }
}

export async function versionsLink(input: VersionsLinkInput): Promise<VersionsLinkOutput> {
  return versionsLinkFlow(input);
}

const versionsLinkFlow = ai.defineFlow(
  {
    name: 'versionsLinkFlow',
    inputSchema: VersionsLinkInputSchema,
    outputSchema: VersionsLinkOutputSchema,
  },
  async ({ files, auth }: VersionsLinkInput) => {
    const startTime = Date.now();
    
    try {
      // Validate authentication
      const user = getAuthenticatedUserSync(auth);
      requireFreshAuth(auth);
      
      logger.info('Starting version linking analysis', { 
        uid: user.uid, 
        fileCount: files.length 
      });
      
      if (files.length === 0) {
        return { chains: 0 };
      }
      
      // Step 1: Extract base names and group similar files
      const baseGroups: Record<string, any[]> = {};
      const processedFiles = files.map(file => {
        const { baseName, versionInfo } = extractBaseName(file.name);
        const key = `${baseName}|${file.mimeType || 'any'}`;
        
        return {
          ...file,
          baseName,
          versionInfo,
          groupKey: key
        };
      });
      
      // Group files by base name and mime type
      processedFiles.forEach(file => {
        if (!baseGroups[file.groupKey]) {
          baseGroups[file.groupKey] = [];
        }
        baseGroups[file.groupKey].push(file);
      });
      
      logger.info('Files grouped by base name', { 
        uid: user.uid, 
        groupCount: Object.keys(baseGroups).length,
        potentialChains: Object.values(baseGroups).filter(group => group.length > 1).length
      });
      
      // Step 2: Analyze groups for version chains with fuzzy matching
      const versionChains: VersionChain[] = [];
      const SIMILARITY_THRESHOLD = 0.8;
      
      for (const [groupKey, groupFiles] of Object.entries(baseGroups)) {
        if (groupFiles.length < 2) continue;
        
        // Further refine groups using similarity matching
        const refinedGroups: any[][] = [];
        
        for (const file of groupFiles) {
          let addedToGroup = false;
          
          for (const group of refinedGroups) {
            // Check if file is similar to any file in this group
            const similarity = Math.max(...group.map(gFile => 
              calculateNameSimilarity(file.name, gFile.name)
            ));
            
            if (similarity >= SIMILARITY_THRESHOLD) {
              group.push(file);
              addedToGroup = true;
              break;
            }
          }
          
          if (!addedToGroup) {
            refinedGroups.push([file]);
          }
        }
        
        // Process each refined group as a potential version chain
        for (const group of refinedGroups) {
          if (group.length < 2) continue;
          
          // Convert to VersionMember format
          const members: VersionMember[] = group.map((file, index) => ({
            fileId: file.id,
            name: file.name,
            size: file.size,
            versionNumber: file.versionInfo.version || 0,
            versionType: file.versionInfo.isVersioned ? 'versioned' : 'original',
            isLatest: false, // Will be updated after sorting
            confidence: file.versionInfo.isVersioned ? 0.8 : 0.9, // Higher confidence for original files
            lastModified: file.lastModified
          }));
          
          // Sort by version number (highest first)
          members.sort((a, b) => b.versionNumber - a.versionNumber);
          
          // Determine winner
          const winner = determineChainWinner(members);
          
          // Calculate metrics
          const totalSize = members.reduce((sum, m) => sum + m.size, 0);
          const potentialSavings = totalSize - winner.size;
          
          // Analyze patterns
          const patterns: VersionPattern[] = [];
          const patternCounts = new Map<string, { count: number; type: string }>();
          
          members.forEach(member => {
            const type = member.versionType;
            if (type !== 'original') {
              const key = type;
              const existing = patternCounts.get(key) || { count: 0, type };
              existing.count++;
              patternCounts.set(key, existing);
            }
          });
          
          patternCounts.forEach(({ count, type }, pattern) => {
            patterns.push({
              pattern,
              type: type as any,
              count,
              matches: count,
              confidence: Math.min(1, count / members.length)
            });
          });
          
          // Calculate overall confidence
          const avgMemberConfidence = members.reduce((sum, m) => sum + m.confidence, 0) / members.length;
          const sizeVariance = calculateSizeVariance(members.map(m => m.size));
          const timeVariance = calculateTimeVariance(members.map(m => m.lastModified.getTime()));
          
          // Higher confidence for more consistent patterns
          const confidence = Math.min(1, 
            avgMemberConfidence * 0.4 +
            (patterns.length > 0 ? 0.3 : 0.1) +
            (sizeVariance < 0.5 ? 0.2 : 0.1) +
            (timeVariance > 0 ? 0.1 : 0.0)
          );
          
          // Only create chains with reasonable confidence
          if (confidence >= 0.5) {
            const chainId = crypto.createHash('md5')
              .update(`${user.uid}:${groupKey}:${members.map(m => m.fileId).sort().join(',')}`) 
              .digest('hex')
              .substring(0, 16);
            
            const versionChain: VersionChain = {
              chainId,
              uid: user.uid,
              baseKey: groupKey,
              baseName: group[0].baseName,
              mimeType: group[0].mimeType || 'unknown',
              members,
              winner,
              totalSize,
              potentialSavings: Math.max(0, potentialSavings),
              confidence,
              patterns,
              createdAt: new Date(),
              files: members.map(m => ({
                id: m.fileId,
                name: m.name,
                version: m.versionNumber,
                isLatest: m.isLatest
              }))
            };
            
            versionChains.push(versionChain);
          }
        }
      }
      
      // Step 3: Save version chains to database
      if (versionChains.length > 0) {
        await saveVersionChains(user.uid, versionChains);
      }
      
      const duration = Date.now() - startTime;
      
      logger.info('Version linking analysis completed', {
        uid: user.uid,
        inputFiles: files.length,
        chainsCreated: versionChains.length,
        totalPotentialSavings: versionChains.reduce((sum, c) => sum + c.potentialSavings, 0),
        avgConfidence: versionChains.length > 0 
          ? versionChains.reduce((sum, c) => sum + c.confidence, 0) / versionChains.length 
          : 0,
        duration
      });
      
      return { chains: versionChains.length };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Version linking analysis failed', undefined, {
        error: error instanceof Error ? error.message : String(error),
        duration,
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // Re-throw with more context
      if (error instanceof Error) {
        throw error;
      }
      
      throw new Error('An unexpected error occurred during version analysis.');
    }
  }
);

    
