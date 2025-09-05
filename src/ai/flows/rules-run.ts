
'use server';
/**
 * @fileOverview Production rule execution engine.
 * Executes user-defined rules against Drive files with comprehensive filtering,
 * validation, and batch creation. Implements ALPHA-CODENAME v1.4 standards.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { FlowAuth, getAuthenticatedUserSync } from '@/lib/flow-auth';
import { 
    FileSchema, 
    ProposeRulesOutputSchema, 
    ActionBatchSchema,
    RulesRunInput,
    RulesRunInputSchema,
    RulesRunOutput,
    RulesRunOutputSchema
} from '@/lib/ai-types';
import { getRule, saveRule, createActionBatch } from '@/lib/firebase-db';
import { logger } from '@/lib/logger';
import { requireFreshAuth } from '@/lib/guards';
import { driveFor, listFiles } from '@/lib/google-drive';
import crypto from 'crypto';

/**
 * Enhanced rule matching engine.
 */
class RuleEngine {
  /**
   * Test if a file matches the given rule filters.
   */
  static matchesRule(file: any, rule: any): { matches: boolean; score: number; reasons: string[] } {
    const reasons: string[] = [];
    let score = 1.0;
    
    const filter = rule.filter || {};
    
    // Name regex filter
    if (filter.nameRegex) {
      try {
        const regex = new RegExp(filter.nameRegex, 'i');
        if (!regex.test(file.name || '')) {
          return { matches: false, score: 0, reasons: ['Name does not match pattern'] };
        }
        reasons.push('Name matches pattern');
      } catch (error) {
        logger.warn('Invalid regex in rule', { regex: filter.nameRegex, error: error instanceof Error ? error.message : String(error) });
        return { matches: false, score: 0, reasons: ['Invalid regex pattern'] };
      }
    }
    
    // MIME type filter
    if (filter.mimeTypes && filter.mimeTypes.length > 0) {
      if (!filter.mimeTypes.includes(file.mimeType)) {
        return { matches: false, score: 0, reasons: ['MIME type not in allowed list'] };
      }
      reasons.push('MIME type matches');
    }
    
    // Age filter
    if (filter.olderThanDays !== undefined) {
      const fileAge = file.lastModified ? Date.now() - file.lastModified.getTime() : 0;
      const fileAgeDays = fileAge / (1000 * 60 * 60 * 24);
      
      if (fileAgeDays < filter.olderThanDays) {
        return { matches: false, score: 0, reasons: [`File is too recent (${Math.round(fileAgeDays)} days old)`] };
      }
      reasons.push(`File age matches (${Math.round(fileAgeDays)} days old)`);
      
      // Bonus score for older files when age filtering is used
      score *= Math.min(2.0, 1 + (fileAgeDays - filter.olderThanDays) / 365);
    }
    
    // Size filter
    if (filter.minSizeBytes !== undefined) {
      if ((file.size || 0) < filter.minSizeBytes) {
        return { matches: false, score: 0, reasons: ['File too small'] };
      }
      reasons.push('File size matches');
      
      // Bonus score for larger files when size filtering is used
      score *= Math.min(2.0, 1 + Math.log10((file.size || 1) / filter.minSizeBytes) * 0.1);
    }
    
    // Max size filter (anti-pattern - avoid accidentally processing huge files)
    const MAX_FILE_SIZE = 1024 * 1024 * 1024; // 1GB safety limit
    if ((file.size || 0) > MAX_FILE_SIZE) {
      return { matches: false, score: 0, reasons: ['File too large for safety'] };
    }
    
    // Path-based filters
    const path = (file.path || []).join('/');
    
    // Skip shared drives for safety
    if (path.includes('/shared-drives/') || path.includes('/team-drives/')) {
      return { matches: false, score: 0, reasons: ['File in shared drive (safety)'] };
    }
    
    // Skip system folders
    const systemFolders = ['/trash', '/spam', '/.tmp'];
    if (systemFolders.some(folder => path.includes(folder))) {
      return { matches: false, score: 0, reasons: ['File in system folder'] };
    }
    
    return { matches: true, score: Math.min(1.0, score), reasons };
  }
  
  /**
   * Apply rule to a collection of files.
   */
  static applyRule(files: any[], rule: any): Array<{
    file: any;
    matches: boolean;
    score: number;
    reasons: string[];
  }> {
    return files.map(file => {
      const result = RuleEngine.matchesRule(file, rule);
      return {
        file,
        ...result
      };
    });
  }
}

/**
 * Fetch user's files from Google Drive with pagination and filtering.
 */
async function getUserFiles(uid: string, limit: number = 1000): Promise<any[]> {
  try {
    const drive = await driveFor(uid);
    const files: any[] = [];
    let pageToken: string | undefined;
    
    while (files.length < limit) {
      const batchSize = Math.min(100, limit - files.length);
      const result = await listFiles(uid, pageToken, batchSize);
      
      files.push(...result.files);
      
      if (!result.nextPageToken) break;
      pageToken = result.nextPageToken;
    }
    
    logger.info('Fetched user files for rule execution', {
      uid,
      fileCount: files.length,
      requestedLimit: limit
    });
    
    return files;
    
  } catch (error) {
    logger.error('Failed to fetch user files', {
      uid,
      limit,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

/**
 * Update rule execution statistics.
 */
async function updateRuleStats(ruleId: string, uid: string, stats: {
  lastRunAt: Date;
  lastCreatedBatchId: string;
  filesProcessed: number;
  filesMatched: number;
  avgScore: number;
}) {
  try {
    const rule = await getRule(ruleId, uid);
    const updatedRule = {
      ...rule,
      ...stats,
      totalRuns: (rule.totalRuns || 0) + 1
    };
    
    await saveRule(ruleId, updatedRule);
    
    logger.info('Rule statistics updated', {
      ruleId,
      uid,
      totalRuns: updatedRule.totalRuns,
      ...stats
    });
    
  } catch (error) {
    logger.error('Failed to update rule statistics', {
      ruleId,
      uid,
      stats,
      error: error instanceof Error ? error.message : String(error)
    });
    // Don't throw - stats update failure shouldn't stop rule execution
  }
}

export async function rulesRun(input: RulesRunInput): Promise<RulesRunOutput> {
  return rulesRunFlow(input);
}

const rulesRunFlow = ai.defineFlow(
  {
    name: 'rulesRunFlow',
    inputSchema: RulesRunInputSchema,
    outputSchema: RulesRunOutputSchema,
  },
  async ({ ruleId, auth }: RulesRunInput) => {
    const startTime = Date.now();
    
    try {
      // Validate authentication
      const user = getAuthenticatedUserSync(auth);
      requireFreshAuth(auth);
      
      logger.info('Starting rule execution', { ruleId, uid: user.uid });
      
      // Retrieve rule definition
      const ruleDefinition = await getRule(ruleId, user.uid);
      const rule = ruleDefinition.compiledRule;
      
      if (!rule) {
        throw new Error(`Rule ${ruleId} has no compiled rule definition`);
      }
      
      logger.info('Rule definition loaded', {
        ruleId,
        uid: user.uid,
        humanPrompt: ruleDefinition.humanPrompt,
        filter: rule.filter,
        action: rule.action
      });
      
      // Validate rule configuration
      if (!rule.action || !rule.action.type) {
        throw new Error(`Rule ${ruleId} has no action defined`);
      }
      
      const validActionTypes = ['move', 'trash', 'archive', 'rename', 'delete'];
      if (!validActionTypes.includes(rule.action.type)) {
        throw new Error(`Rule ${ruleId} has invalid action type: ${rule.action.type}`);
      }
      
      // For move actions, validate destination
      if (rule.action.type === 'move' && (!rule.action.dest || rule.action.dest.length === 0)) {
        throw new Error(`Rule ${ruleId} requires destination for move action`);
      }
      
      // Fetch user's files from Google Drive
      const RULE_FILE_LIMIT = 10000; // Safety limit
      let allFiles: any[];
      
      try {
        allFiles = await getUserFiles(user.uid, RULE_FILE_LIMIT);
      } catch (driveError) {
        logger.error('Failed to fetch files from Drive for rule execution', {
          ruleId,
          uid: user.uid,
          error: driveError instanceof Error ? driveError.message : String(driveError)
        });
        throw new Error('Could not access your Google Drive files. Please check your connection and permissions.');
      }
      
      if (allFiles.length === 0) {
        logger.info('No files found for rule execution', { ruleId, uid: user.uid });
        return { batchId: '', count: 0 };
      }
      
      logger.info('Files fetched for rule execution', {
        ruleId,
        uid: user.uid,
        totalFiles: allFiles.length
      });
      
      // Apply rule to files using the rule engine
      const ruleResults = RuleEngine.applyRule(allFiles, rule);
      const matchingResults = ruleResults.filter(result => result.matches);
      
      logger.info('Rule matching completed', {
        ruleId,
        uid: user.uid,
        totalFiles: allFiles.length,
        matchingFiles: matchingResults.length,
        matchRate: allFiles.length > 0 ? (matchingResults.length / allFiles.length * 100).toFixed(1) + '%' : '0%'
      });
      
      if (matchingResults.length === 0) {
        logger.info('No files matched the rule', { ruleId, uid: user.uid });
        
        // Still update rule stats even if no matches
        await updateRuleStats(ruleId, user.uid, {
          lastRunAt: new Date(),
          lastCreatedBatchId: '',
          filesProcessed: allFiles.length,
          filesMatched: 0,
          avgScore: 0
        });
        
        return { batchId: '', count: 0 };
      }
      
      // Limit batch size for safety
      const MAX_BATCH_SIZE = 1000;
      const limitedResults = matchingResults.slice(0, MAX_BATCH_SIZE);
      
      if (limitedResults.length < matchingResults.length) {
        logger.warn('Rule batch size limited for safety', {
          ruleId,
          uid: user.uid,
          originalCount: matchingResults.length,
          limitedCount: limitedResults.length
        });
      }
      
      // Calculate average confidence score
      const avgScore = limitedResults.reduce((sum, r) => sum + r.score, 0) / limitedResults.length;
      
      // Create proposals from matching files
      const proposals = limitedResults.map(result => {
        const destFolderId = rule.action.type === 'move' && rule.action.dest && rule.action.dest.length > 0
          ? rule.action.dest[0] // Use first destination
          : null;
        
        return {
          type: rule.action.type as any,
          fileId: result.file.id,
          name: result.file.name,
          destFolderId,
          reason: `Rule match: ${result.reasons.join(', ')}`,
          confidence: result.score
        };
      });
      
      // Generate unique batch ID
      const timestamp = Date.now();
      const hash = crypto.createHash('md5')
        .update(`${user.uid}:${ruleId}:${timestamp}`)
        .digest('hex')
        .substring(0, 8);
      const batchId = `rule-${ruleId}-${timestamp}-${hash}`;
      
      // Create action batch
      const batch = ActionBatchSchema.parse({
        uid: user.uid,
        source: `userRule:${ruleId}`,
        proposals,
        status: 'simulated',
        preflight: null,
        confirmation: null,
        execution: null,
        restorePlan: null,
        createdAt: new Date(),
        executedAt: null,
        error: null,
      });
      
      // Save the batch
      const savedBatchId = await createActionBatch(batch);
      
      // Update rule execution statistics
      await updateRuleStats(ruleId, user.uid, {
        lastRunAt: new Date(),
        lastCreatedBatchId: savedBatchId,
        filesProcessed: allFiles.length,
        filesMatched: matchingResults.length,
        avgScore: avgScore
      });
      
      const duration = Date.now() - startTime;
      
      logger.info('Rule execution completed successfully', {
        ruleId,
        uid: user.uid,
        batchId: savedBatchId,
        filesProcessed: allFiles.length,
        filesMatched: limitedResults.length,
        avgConfidence: Math.round(avgScore * 100) / 100,
        duration
      });
      
      return { 
        batchId: savedBatchId, 
        count: limitedResults.length 
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Rule execution failed', {
        ruleId,
        error: error instanceof Error ? error.message : String(error),
        duration,
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // Re-throw with more context
      if (error instanceof Error) {
        if (error.message.includes('not found') || error.message.includes('does not belong')) {
          throw new Error(`Rule ${ruleId} not found or access denied.`);
        }
        throw error;
      }
      
      throw new Error('An unexpected error occurred during rule execution.');
    }
  }
);
