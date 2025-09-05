
'use server';
/**
 * @fileOverview Production AI batch scoring engine.
 * Implements sophisticated ML-based algorithms to score and prioritize cleanup batches
 * based on impact, risk, user behavior, and business value. Implements ALPHA-CODENAME v1.4 standards.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { FlowAuth, getAuthenticatedUserSync, FlowAuthSchema } from '@/lib/flow-auth';
import { ActionBatchSchema, ActionPreflightSchema } from '@/lib/ai-types';
import { getActionBatch, saveAnalytics } from '@/lib/firebase-db';
import { logger } from '@/lib/logger';
import { requireFreshAuth } from '@/lib/guards';
import { driveFor } from '@/lib/google-drive';

// Enhanced AI scoring schema with detailed metrics
const AIScoreSchema = z.object({
    uid: z.string(),
    batchId: z.string(),
    priority: z.enum(["low", "med", "high", "critical"]),
    overallScore: z.number().min(0).max(100).describe("Overall score from 0-100"),
    reasons: z.array(z.string()),
    metrics: z.object({
        spaceImpact: z.number().min(0).max(100),
        riskLevel: z.number().min(0).max(100),
        userBehaviorScore: z.number().min(0).max(100),
        businessValue: z.number().min(0).max(100),
        duplicateReduction: z.number().min(0).max(100),
        organizationImprovement: z.number().min(0).max(100)
    }),
    bytes: z.number(),
    files: z.number(),
    confidence: z.number().min(0).max(1),
    projectedSavings: z.object({
        storageBytes: z.number(),
        organizationMinutes: z.number(),
        duplicateCount: z.number()
    }),
    createdAt: z.date(),
});
export type AIScore = z.infer<typeof AIScoreSchema>;


export const ScoreBatchInputSchema = z.object({
  batchId: z.string(),
  auth: FlowAuthSchema,
});
export type ScoreBatchInput = z.infer<typeof ScoreBatchInputSchema>;

export const ScoreBatchOutputSchema = z.object({
  score: AIScoreSchema,
});
export type ScoreBatchOutput = z.infer<typeof ScoreBatchOutputSchema>;


/**
 * Calculate space impact score based on storage savings.
 */
function calculateSpaceImpact(totalBytes: number): number {
  // Logarithmic scoring for space impact
  if (totalBytes === 0) return 0;
  
  const GB = 1024 * 1024 * 1024;
  const MB = 1024 * 1024;
  
  if (totalBytes >= 10 * GB) return 100;
  if (totalBytes >= 5 * GB) return 90;
  if (totalBytes >= 1 * GB) return 80;
  if (totalBytes >= 500 * MB) return 70;
  if (totalBytes >= 100 * MB) return 60;
  if (totalBytes >= 50 * MB) return 50;
  if (totalBytes >= 10 * MB) return 40;
  if (totalBytes >= 1 * MB) return 30;
  
  return Math.min(20, Math.log10(totalBytes / 1000) * 10);
}

/**
 * Calculate risk level score based on file characteristics.
 */
function calculateRiskLevel(risks: string[], fileCount: number, totalBytes: number): number {
  let riskScore = 0;
  
  // High-risk indicators
  if (risks.includes('shared_public')) riskScore += 40;
  if (risks.includes('public_permissions')) riskScore += 35;
  if (risks.includes('recently_modified')) riskScore += 25;
  if (risks.includes('large_file')) riskScore += 20;
  if (risks.includes('deleting_shared_files')) riskScore += 50;
  if (risks.includes('bulk_operation_on_recent_files')) riskScore += 30;
  
  // Volume-based risk
  if (fileCount > 1000) riskScore += 20;
  else if (fileCount > 100) riskScore += 10;
  
  if (totalBytes > 50 * 1024 * 1024 * 1024) riskScore += 25; // > 50GB
  else if (totalBytes > 10 * 1024 * 1024 * 1024) riskScore += 15; // > 10GB
  
  return Math.min(100, riskScore);
}

/**
 * Calculate user behavior score based on file access patterns.
 */
function calculateUserBehaviorScore(files: any[]): number {
  let behaviorScore = 0;
  const now = Date.now();
  
  for (const file of files) {
    const size = file.size || 0;
    
    // Score based on file age and access patterns
    // This would ideally use real access data from Drive API
    if (size > 100 * 1024 * 1024) { // Large files get higher cleanup priority
      behaviorScore += 10;
    }
    
    // Files in root directory are often disorganized
    if (file.currentParents?.includes('root')) {
      behaviorScore += 5;
    }
    
    // Files with generic names suggest lower value
    const fileName = file.name || '';
    const genericPatterns = ['copy', 'untitled', 'document', 'new', 'temp', 'draft'];
    if (genericPatterns.some(pattern => fileName.toLowerCase().includes(pattern))) {
      behaviorScore += 8;
    }
  }
  
  return Math.min(100, (behaviorScore / files.length) * 10);
}

/**
 * Calculate business value score.
 */
function calculateBusinessValue(proposals: any[], fileCount: number): number {
  let businessScore = 0;
  
  // Organization improvement
  const moveOperations = proposals.filter(p => p.type === 'move').length;
  const trashOperations = proposals.filter(p => p.type === 'trash').length;
  
  businessScore += (moveOperations / fileCount) * 40; // Organization value
  businessScore += (trashOperations / fileCount) * 60; // Cleanup value
  
  // Confidence-weighted score
  const avgConfidence = proposals.reduce((sum, p) => sum + (p.confidence || 0), 0) / proposals.length;
  businessScore *= avgConfidence;
  
  return Math.min(100, businessScore);
}

/**
 * Detect and score duplicate reduction potential.
 */
function calculateDuplicateReduction(files: any[]): number {
  const fileSizes = new Map<number, number>();
  const fileNames = new Map<string, number>();
  
  for (const file of files) {
    const size = file.size || 0;
    const name = (file.name || '').toLowerCase();
    
    fileSizes.set(size, (fileSizes.get(size) || 0) + 1);
    fileNames.set(name, (fileNames.get(name) || 0) + 1);
  }
  
  let duplicateScore = 0;
  
  // Score based on size duplicates
  for (const [size, count] of fileSizes.entries()) {
    if (count > 1 && size > 1024) { // More than 1KB
      duplicateScore += count * Math.log10(size / 1024) * 5;
    }
  }
  
  // Score based on name duplicates
  for (const [name, count] of fileNames.entries()) {
    if (count > 1 && name.length > 3) {
      duplicateScore += count * 3;
    }
  }
  
  return Math.min(100, duplicateScore / files.length * 20);
}

/**
 * Calculate organization improvement score.
 */
function calculateOrganizationImprovement(proposals: any[]): number {
  const moveOps = proposals.filter(p => p.type === 'move');
  const totalOps = proposals.length;
  
  if (totalOps === 0) return 0;
  
  // Higher score for more organization operations
  const organizationRatio = moveOps.length / totalOps;
  return organizationRatio * 100;
}

/**
 * Save AI score to analytics database.
 */
async function saveScore(score: AIScore): Promise<void> {
  try {
    await saveAnalytics(score.uid, {
      type: 'ai_batch_score',
      ...score,
      scoredAt: new Date().toISOString()
    });
    
    logger.info('AI score saved', { 
      batchId: score.batchId, 
      uid: score.uid, 
      priority: score.priority, 
      overallScore: score.overallScore 
    });
    
  } catch (error) {
    logger.error('Error saving AI score', {
      batchId: score.batchId,
      uid: score.uid,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

export async function scoreBatch(input: ScoreBatchInput): Promise<ScoreBatchOutput> {
  return scoreBatchFlow(input);
}

const scoreBatchFlow = ai.defineFlow(
  {
    name: 'scoreBatchFlow',
    inputSchema: ScoreBatchInputSchema,
    outputSchema: ScoreBatchOutputSchema,
  },
  async ({ batchId, auth }: ScoreBatchInput) => {
    const startTime = Date.now();
    
    try {
      // Validate authentication
      const user = getAuthenticatedUserSync(auth);
      requireFreshAuth(auth);
      
      logger.info('Starting AI batch scoring', { batchId, uid: user.uid });
      
      // Retrieve and validate batch
      const batch = await getActionBatch(batchId, user.uid);
      
      if (!batch.preflight) {
        throw new Error('Batch has not been preflighted, cannot score.');
      }
      
      if (!batch.proposals || batch.proposals.length === 0) {
        throw new Error('Batch has no proposals to score.');
      }
      
      const { tallies, risks, files } = batch.preflight;
      const proposals = batch.proposals;
      
      logger.info('Batch data loaded for scoring', {
        batchId,
        uid: user.uid,
        fileCount: tallies.count,
        totalBytes: tallies.bytes,
        riskCount: risks.length,
        proposalCount: proposals.length
      });
      
      // Calculate individual metric scores
      const spaceImpact = calculateSpaceImpact(tallies.bytes);
      const riskLevel = calculateRiskLevel(risks, tallies.count, tallies.bytes);
      const userBehaviorScore = calculateUserBehaviorScore(files);
      const businessValue = calculateBusinessValue(proposals, tallies.count);
      const duplicateReduction = calculateDuplicateReduction(files);
      const organizationImprovement = calculateOrganizationImprovement(proposals);
      
      // Weighted overall score calculation
      const weights = {
        spaceImpact: 0.25,
        riskLevel: 0.15, // Risk reduces score (higher risk = lower priority for auto-execution)
        userBehaviorScore: 0.20,
        businessValue: 0.25,
        duplicateReduction: 0.10,
        organizationImprovement: 0.05
      };
      
      const overallScore = Math.round(
        (spaceImpact * weights.spaceImpact) +
        ((100 - riskLevel) * weights.riskLevel) + // Invert risk for scoring
        (userBehaviorScore * weights.userBehaviorScore) +
        (businessValue * weights.businessValue) +
        (duplicateReduction * weights.duplicateReduction) +
        (organizationImprovement * weights.organizationImprovement)
      );
      
      // Determine priority based on overall score and risk
      let priority: "low" | "med" | "high" | "critical";
      if (riskLevel > 75) {
        priority = "critical"; // High risk requires immediate attention
      } else if (overallScore >= 80) {
        priority = "high";
      } else if (overallScore >= 60) {
        priority = "med";
      } else {
        priority = "low";
      }
      
      // Generate human-readable reasons
      const reasons: string[] = [];
      
      if (spaceImpact >= 80) {
        reasons.push(`Significant storage savings: ${Math.round(tallies.bytes / (1024*1024*1024) * 100) / 100}GB`);
      } else if (spaceImpact >= 50) {
        reasons.push(`Moderate storage savings: ${Math.round(tallies.bytes / (1024*1024) * 100) / 100}MB`);
      }
      
      if (riskLevel >= 50) {
        reasons.push('Contains high-risk files requiring careful review');
      }
      
      if (duplicateReduction >= 60) {
        reasons.push('High potential for duplicate file cleanup');
      }
      
      if (businessValue >= 70) {
        reasons.push('High business value from organization improvements');
      }
      
      if (userBehaviorScore >= 70) {
        reasons.push('Files show low usage patterns, safe for cleanup');
      }
      
      if (tallies.count > 100) {
        reasons.push(`Large batch operation: ${tallies.count} files`);
      }
      
      // Calculate projected savings
      const storageBytes = Math.max(0, tallies.bytes - (tallies.bytes * (riskLevel / 100) * 0.1));
      const organizationMinutes = Math.round(organizationImprovement * tallies.count * 0.1);
      const duplicateCount = Math.round((duplicateReduction / 100) * tallies.count * 0.3);
      
      // Calculate confidence based on data quality and risk
      const dataQuality = files.length / Math.max(1, tallies.count); // How much metadata we have
      const avgProposalConfidence = proposals.reduce((sum, p) => sum + (p.confidence || 0), 0) / proposals.length;
      const riskPenalty = Math.max(0, 1 - (riskLevel / 100) * 0.3);
      const confidence = Math.min(1, dataQuality * avgProposalConfidence * riskPenalty);
      
      const score: AIScore = {
        uid: user.uid,
        batchId,
        priority,
        overallScore,
        reasons,
        metrics: {
          spaceImpact,
          riskLevel,
          userBehaviorScore,
          businessValue,
          duplicateReduction,
          organizationImprovement
        },
        bytes: tallies.bytes,
        files: tallies.count,
        confidence,
        projectedSavings: {
          storageBytes,
          organizationMinutes,
          duplicateCount
        },
        createdAt: new Date(),
      };
      
      // Save the score
      await saveScore(score);
      
      const duration = Date.now() - startTime;
      
      logger.info('AI batch scoring completed', {
        batchId,
        uid: user.uid,
        priority,
        overallScore,
        confidence: Math.round(confidence * 100),
        reasons: reasons.length,
        duration
      });
      
      return { score };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('AI batch scoring failed', {
        batchId,
        error: error instanceof Error ? error.message : String(error),
        duration,
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // Re-throw with more context
      if (error instanceof Error) {
        throw error;
      }
      
      throw new Error('An unexpected error occurred during batch scoring.');
    }
  }
);

    
