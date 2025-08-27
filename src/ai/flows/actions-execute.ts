
'use server';
/**
 * @fileOverview This flow executes a confirmed action batch.
 * It performs the safe Drive operations (trash/move) and records the results.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { driveFor } from '@/lib/google-drive';
import { FlowAuth, getAuthenticatedUserSync } from '@/lib/flow-auth';
import { requireFreshAuth, checkWriteScope, reserveIdempotency, completeIdempotency } from '@/lib/guards';
import {
  ExecuteActionsInputSchema,
  ExecuteActionsOutputSchema,
  ExecuteActionsInput,
  ExecuteActionsOutput,
} from '@/lib/ai-types';
import { getActionBatch, saveActionBatch } from '@/lib/mock-db';

// In a real app, these would interact with Firestore
async function getSettings(uid: string) {
    return {
        allowSoftDelete: true,
        allowMoves: true,
        paranoidSnapshot: false,
    };
}
async function writeChangeLogs(logs: any[]) {
    return;
}

export async function executeActions(input: ExecuteActionsInput): Promise<ExecuteActionsOutput> {
  // In a real app, you would pass the idempotency key from the client
  const idempotencyKey = `exec-${input.batchId}-${Date.now()}`;
  return executeActionsFlow({ ...input, idempotencyKey });
}

const executeActionsFlow = ai.defineFlow(
  {
    name: 'executeActionsFlow',
    inputSchema: ExecuteActionsInputSchema.extend({ idempotencyKey: z.string() }),
    outputSchema: ExecuteActionsOutputSchema,
  },
  async ({ batchId, idempotencyKey, auth }: ExecuteActionsInput & { idempotencyKey: string }) => {
    const user = getAuthenticatedUserSync(auth);
    requireFreshAuth(auth);

    const idempRef = await reserveIdempotency(idempotencyKey, 'executeActionsFlow');

    try {
        const [settings, hasWriteScope] = await Promise.all([
            getSettings(user.uid),
            checkWriteScope(user.uid),
        ]);

        if (!settings.allowSoftDelete) throw new Error("Soft delete is disabled by user settings.");
        if (!hasWriteScope) throw new Error("Drive write scope not granted.");

        const batch = await getActionBatch(batchId, user.uid);

        if (batch.status !== 'awaiting-confirm' || !batch.confirmation?.approved) {
          throw new Error(`Batch ${batchId} is not approved for execution.`);
        }

        batch.status = 'executing';
        batch.execution = { startedAt: new Date(), finishedAt: null, results: [] };
        await saveActionBatch(batchId, batch);

        const drive = await driveFor(user.uid);
        const results: any[] = [];
        const changeLogs: any[] = [];

        for (const proposal of batch.proposals) {
          const originalParents = batch.restorePlan!.parentsByFile[proposal.fileId] || [];
          try {
            if (proposal.type === 'trash') {
              await drive.files.update({ fileId: proposal.fileId, requestBody: { trashed: true } });
              results.push({ fileId: proposal.fileId, op: 'trash', ok: true, error: null });
              changeLogs.push({ uid: user.uid, batchId, fileId: proposal.fileId, op: 'trash', fromParents: originalParents, toParents: [], status: 'ok' });
            } else if (proposal.type === 'move' && proposal.destFolderId) {
                if (!settings.allowMoves) throw new Error("File moves are disabled by user settings.");
                await drive.files.update({
                    fileId: proposal.fileId,
                    addParents: proposal.destFolderId,
                    removeParents: originalParents.join(','),
                });
                results.push({ fileId: proposal.fileId, op: 'move', ok: true, error: null });
                changeLogs.push({ uid: user.uid, batchId, fileId: proposal.fileId, op: 'move', fromParents: originalParents, toParents: [proposal.destFolderId], status: 'ok' });
            }
          } catch (error: any) {
            results.push({ fileId: proposal.fileId, op: proposal.type, ok: false, error: error.message });
            changeLogs.push({ uid: user.uid, batchId, fileId: proposal.fileId, op: proposal.type, fromParents: originalParents, toParents: [], status: 'err', err: error.message });
          }
        }
        
        const errorRate = results.filter(r => !r.ok).length / results.length;
        const finalStatus = errorRate > 0.1 ? 'failed' : 'executed';
        
        batch.status = finalStatus;
        batch.execution.results = results;
        batch.execution.finishedAt = new Date();
        batch.executedAt = new Date();
        
        await Promise.all([
            saveActionBatch(batchId, batch),
            writeChangeLogs(changeLogs)
        ]);
        
        await completeIdempotency(idempRef);
        return { status: batch.status, results: batch.execution.results };

    } catch(e: any) {
        // Mark idempotency key as failed
        const existingBatch = await getActionBatch(idempRef.id, user.uid);
        await saveActionBatch(idempRef.id, { ...existingBatch, status: 'failed', error: e.message });
        throw e;
    }
  }
);
