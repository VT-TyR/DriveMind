
'use server';
/**
 * @fileOverview A flow to detect version chains in files (e.g. file.txt, file (1).txt).
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { FlowAuth, getAuthenticatedUserSync } from '@/lib/flow-auth';
import { VersionsLinkInputSchema, VersionsLinkInput, VersionsLinkOutputSchema, VersionsLinkOutput } from '@/lib/ai-types';
import { FileSchema } from '@/lib/ai-types';

// Mock datastore write
async function saveVersionChain(chainId: string, chainData: any) {
    console.log(`Faking save for version chain ${chainId}`, chainData);
    return;
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
          const members: VersionMember[] = group.map(file => ({
            fileId: file.id,
            name: file.name,
            size: file.size,
            lastModified: file.lastModified,
            path: file.path || [],
            versionNumber: file.versionInfo.versionNumber,
            versionType: file.versionInfo.versionType,
            confidence: file.versionInfo.confidence
          }));
          
          // Sort by modification time (newest first)
          members.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
          
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
              createdAt: new Date()
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

/**
 * Calculate variance in file sizes (normalized).
 */
function calculateSizeVariance(sizes: number[]): number {
  if (sizes.length <= 1) return 0;
  
  const mean = sizes.reduce((sum, size) => sum + size, 0) / sizes.length;
  const variance = sizes.reduce((sum, size) => sum + Math.pow(size - mean, 2), 0) / sizes.length;
  
  // Normalize by mean to get coefficient of variation
  return mean > 0 ? Math.sqrt(variance) / mean : 0;
}

/**
 * Calculate variance in modification times.
 */
function calculateTimeVariance(times: number[]): number {
  if (times.length <= 1) return 0;
  
  const sortedTimes = times.sort((a, b) => a - b);
  const timeRange = sortedTimes[sortedTimes.length - 1] - sortedTimes[0];
  
  // Return normalized time spread (higher values indicate versions created over time)
  return timeRange > 0 ? 1 : 0;
}

    
