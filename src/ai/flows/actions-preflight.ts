
'use server';
/**
 * @fileOverview This flow builds the "awaiting-confirm" state for a batch of actions.
 * It fetches file metadata, checks for risks, and generates a confirmation challenge.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { driveFor } from '@/lib/google-drive';
import { FlowAuth, getAuthenticatedUserSync } from '@/lib/flow-auth';
import {
  PreflightActionsInputSchema,
  PreflightActionsOutputSchema,
  PreflightActionsInput,
  PreflightActionsOutput,
  ActionBatchSchema,
} from '@/lib/ai-types';
import { getActionBatch, saveActionBatch } from '@/lib/mock-db';


export async function preflightActions(input: PreflightActionsInput): Promise<PreflightActionsOutput> {
  return preflightActionsFlow(input);
}

const preflightActionsFlow = ai.defineFlow(
  {
    name: 'preflightActionsFlow',
    inputSchema: PreflightActionsInputSchema,
    outputSchema: PreflightActionsOutputSchema,
  },
  async ({ batchId, auth }) => {
    const user = getAuthenticatedUserSync(auth);
    const batch = await getActionBatch(batchId, user.uid);

    if (batch.status !== 'simulated') {
      throw new Error(`Batch ${batchId} is not in a simulated state.`);
    }

    const drive = await driveFor(user.uid);
    const fileIds = batch.proposals.map(p => p.fileId);

    const fileMetadatas = await Promise.all(
        fileIds.map(fileId => drive.files.get({ fileId, fields: 'id, name, size, parents, shared' }).catch(() => null))
    );
    
    let totalBytes = 0;
    const preflightFiles = fileMetadatas.filter(res => res?.data).map(res => {
        const file = res!.data;
        totalBytes += Number(file.size || 0);
        return {
            fileId: file.id!,
            name: file.name!,
            size: Number(file.size || 0),
            currentParents: file.parents || [],
            suggestedParents: batch.proposals.find(p => p.fileId === file.id)?.destFolderId ? [batch.proposals.find(p => p.fileId === file.id)!.destFolderId!] : [],
        };
    });

    const risks = fileMetadatas.some(res => res?.data.shared) ? ['shared_public' as const] : [];

    batch.preflight = {
        files: preflightFiles,
        tallies: { count: preflightFiles.length, bytes: totalBytes },
        risks,
        createdAt: new Date(),
    };
    
    const challenge = `CONFIRM ${batch.proposals[0].type.toUpperCase()} ${preflightFiles.length} FILES`;
    batch.confirmation = {
        required: true,
        challenge: challenge,
        approved: false,
        approvedBy: null,
        approvedAt: null,
        reauthRequired: true,
    };
    
    batch.restorePlan = {
        mode: 'trash_only', // for now
        parentsByFile: preflightFiles.reduce((acc, f) => ({ ...acc, [f.fileId]: f.currentParents }), {}),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    };

    batch.status = 'awaiting-confirm';

    await saveActionBatch(batchId, batch);
    
    return { status: batch.status, challenge };
  }
);

    
