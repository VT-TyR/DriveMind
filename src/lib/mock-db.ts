/**
 * @fileoverview A centralized in-memory mock database for testing action flows.
 * This should NOT be used in production. It helps simulate a persistent state
 * for action batches across different flow executions during a single server
 * session in development.
 */
import { z } from 'zod';
import { ActionBatchSchema } from '@/lib/ai-types';

const mockActionDb: Record<string, z.infer<typeof ActionBatchSchema>> = {};

/**
 * Retrieves a mock action batch for a given user.
 * If the batch doesn't exist, it creates a default one for testing purposes.
 * @param batchId The ID of the batch to retrieve.
 * @param uid The user ID.
 * @returns The action batch.
 */
export async function getActionBatch(batchId: string, uid: string): Promise<z.infer<typeof ActionBatchSchema>> {
  if (mockActionDb[batchId] && mockActionDb[batchId].uid === uid) {
    return mockActionDb[batchId];
  }

  // For the demo, if not in memory, create a mock one. This is a common case
  // when starting a test flow from the AI/Dev page.
  const fakeProposals = [
      { type: 'trash' as const, fileId: '1-mock-file-id', name: 'Test File 1.txt', destFolderId: null, reason: 'test', confidence: 0.9 },
      { type: 'trash' as const, fileId: '2-mock-file-id', name: 'Test File 2.jpg', destFolderId: null, reason: 'test', confidence: 0.9 },
  ];

  const batch = ActionBatchSchema.parse({
    uid: uid,
    source: 'userRule',
    proposals: fakeProposals,
    status: 'simulated',
    preflight: null,
    confirmation: null,
    execution: null,
    restorePlan: null,
    createdAt: new Date(),
    executedAt: null,
    error: null,
  });
  mockActionDb[batchId] = batch;
  return batch;
}

/**
 * Saves or updates a mock action batch in the in-memory store.
 * @param batchId The ID of the batch to save.
 * @param batchData The full batch data object.
 */
export async function saveActionBatch(batchId: string, batchData: z.infer<typeof ActionBatchSchema>) {
    mockActionDb[batchId] = batchData;
}
