
'use server';
/**
 * @fileOverview A flow to score a batch of proposed actions based on impact.
 * This helps prioritize which cleanup operations to show to the user first.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { FlowAuth, getAuthenticatedUserSync, FlowAuthSchema } from '@/lib/flow-auth';
import { ActionBatchSchema, ActionPreflightSchema } from '@/lib/ai-types';

// In a real app, this would be defined in a shared types file.
const AIScoreSchema = z.object({
    uid: z.string(),
    batchId: z.string(),
    priority: z.enum(["low", "med", "high"]),
    reasons: z.array(z.string()),
    bytes: z.number(),
    files: z.number(),
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


// Mock datastore access
async function getActionBatch(batchId: string, uid: string) {
  console.log(`Faking fetch for action batch '${batchId}' for user '${uid}'`);
  // This mock has a preflight, which is needed for scoring.
  return ActionBatchSchema.parse({
    uid: uid,
    source: 'userRule',
    proposals: [{ type: 'trash' as const, fileId: '1', name: 'Huge File.zip', destFolderId: null, reason: 'test', confidence: 0.9 }],
    status: 'awaiting-confirm',
    preflight: {
        files: [{ fileId: '1', name: 'Huge File.zip', size: 1000000000, currentParents: ['root'], suggestedParents: [] }],
        tallies: { count: 1, bytes: 1000000000 }, // 1 GB
        risks: [],
        createdAt: new Date(),
    },
    confirmation: null,
    execution: null,
    restorePlan: null,
    createdAt: new Date(),
    executedAt: null,
    error: null,
  });
}

async function saveScore(score: AIScore) {
    console.log(`Faking save for score for batch '${score.batchId}'`);
    return;
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
  async ({ batchId, auth }) => {
    const user = getAuthenticatedUserSync(auth);
    const batch = await getActionBatch(batchId, user.uid);

    if (!batch.preflight) {
        throw new Error('Batch has not been preflighted, cannot score.');
    }

    const { tallies, risks } = batch.preflight;
    let priority: "low" | "med" | "high" = "low";
    const reasons: string[] = [];

    if (tallies.bytes > 1_000_000_000) { // > 1GB
        priority = "high";
        reasons.push("Significant space savings");
    } else if (tallies.bytes > 100_000_000) { // > 100MB
        priority = "med";
        reasons.push("Moderate space savings");
    }

    if (risks.length > 0) {
        priority = "high";
        reasons.push("Contains risks like shared files");
    }
    
    const score: AIScore = {
        uid: user.uid,
        batchId,
        priority,
        reasons,
        bytes: tallies.bytes,
        files: tallies.count,
        createdAt: new Date(),
    };

    await saveScore(score);

    return { score };
  }
);

    
