
'use server';
/**
 * @fileOverview This flow confirms a preflighted action batch.
 * It validates a user-provided challenge and marks the batch as approved.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { FlowAuth, getAuthenticatedUser } from '@/lib/flow-auth';
import { requireFreshAuth } from '@/lib/guards';
import {
  ConfirmActionsInputSchema,
  ConfirmActionsOutputSchema,
  ConfirmActionsInput,
  ConfirmActionsOutput,
} from '@/lib/ai-types';
import { getActionBatch, saveActionBatch } from '@/lib/mock-db';


export async function confirmActions(input: ConfirmActionsInput): Promise<ConfirmActionsOutput> {
  return confirmActionsFlow(input);
}

const confirmActionsFlow = ai.defineFlow(
  {
    name: 'confirmActionsFlow',
    inputSchema: ConfirmActionsInputSchema,
    outputSchema: ConfirmActionsOutputSchema,
  },
  async ({ batchId, challengeResponse, auth }) => {
    const user = getAuthenticatedUser(auth);
    requireFreshAuth(auth); // Ensure user has recently authenticated

    const batch = await getActionBatch(batchId, user.uid);

    if (batch.status !== 'awaiting-confirm') {
      throw new Error(`Batch ${batchId} is not awaiting confirmation.`);
    }
    if (batch.confirmation!.challenge !== challengeResponse) {
      throw new Error('Challenge response does not match.');
    }

    batch.confirmation!.approved = true;
    batch.confirmation!.approvedBy = user.uid;
    batch.confirmation!.approvedAt = new Date();

    await saveActionBatch(batchId, batch);

    return { status: 'confirmed', message: 'Action batch confirmed and ready for execution.' };
  }
);

    
