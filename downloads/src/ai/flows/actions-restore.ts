
'use server';
/**
 * @fileOverview This flow restores trashed files from an executed action batch.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { driveFor } from '@/lib/google-drive';
import { FlowAuth, getAuthenticatedUser } from '@/lib/flow-auth';
import { requireFreshAuth } from '@/lib/guards';
import {
  RestoreActionsInputSchema,
  RestoreActionsOutputSchema,
  RestoreActionsInput,
  RestoreActionsOutput,
} from '@/lib/ai-types';
import { getActionBatch } from '@/lib/mock-db';

// In a real app, this would interact with Firestore
async function writeChangeLogs(logs: any[]) {
    return;
}

export async function restoreActions(input: RestoreActionsInput): Promise<RestoreActionsOutput> {
  return restoreActionsFlow(input);
}

const restoreActionsFlow = ai.defineFlow(
  {
    name: 'restoreActionsFlow',
    inputSchema: RestoreActionsInputSchema,
    outputSchema: RestoreActionsOutputSchema,
  },
  async ({ batchId, fileIds, auth }) => {
    const user = getAuthenticatedUser(auth);
    requireFreshAuth(auth);
    
    const batch = await getActionBatch(batchId, user.uid);

    if (batch.status !== 'executed' && batch.status !== 'failed') {
      throw new Error(`Batch ${batchId} has not been executed.`);
    }
    
    if (!batch.execution) {
      throw new Error(`Batch ${batchId} has no execution results to restore from.`);
    }

    // Determine which files to restore
    let filesToRestore: string[];
    if (fileIds && fileIds.length > 0) {
        // Restore a specific subset of files from the batch
        filesToRestore = batch.execution.results
            .filter(r => r.op === 'trash' && r.ok && fileIds.includes(r.fileId))
            .map(r => r.fileId);
    } else {
        // Restore all restorable files from the batch
        filesToRestore = batch.execution.results
            .filter(r => r.op === 'trash' && r.ok)
            .map(r => r.fileId);
    }
    
    if (filesToRestore.length === 0) {
        return { status: 'restored', restored: [] };
    }
    
    const drive = await driveFor(user.uid);
    const restored: string[] = [];
    const changeLogs: any[] = [];
    
    const restorePlan = batch.restorePlan?.parentsByFile || {};

    for (const fileId of filesToRestore) {
        const originalParents = restorePlan[fileId] || [];
        try {
            await drive.files.update({ fileId, requestBody: { trashed: false } });
            // Note: Restoring parents is complex and omitted in this simplified version,
            // but the restorePlan has the necessary data.
            restored.push(fileId);
            changeLogs.push({ uid: user.uid, batchId, fileId: fileId, op: 'restore', fromParents: [], toParents: originalParents, status: 'ok' });
        } catch (error: any) {
            console.error(`Failed to restore file ${fileId}:`, error.message);
            changeLogs.push({ uid: user.uid, batchId, fileId: fileId, op: 'restore', fromParents: [], toParents: originalParents, status: 'err', err: error.message });
        }
    }
    
    await writeChangeLogs(changeLogs);

    return { status: 'restored', restored };
  }
);

    
