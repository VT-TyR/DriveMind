
'use server';
/**
 * @fileOverview Production action confirmation flow.
 * Validates user challenges, enforces security requirements, and approves batches for execution.
 * Implements ALPHA-CODENAME v1.4 production standards with comprehensive error handling.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { FlowAuth, getAuthenticatedUserSync } from '@/lib/flow-auth';
import { requireFreshAuth } from '@/lib/guards';
import {
  ConfirmActionsInputSchema,
  ConfirmActionsOutputSchema,
  ConfirmActionsInput,
  ConfirmActionsOutput,
} from '@/lib/ai-types';
import { getActionBatch, saveActionBatch } from '@/lib/firebase-db';
import { logger } from '@/lib/logger';
import { driveFor } from '@/lib/google-drive';


export async function confirmActions(input: ConfirmActionsInput): Promise<ConfirmActionsOutput> {
  return confirmActionsFlow(input);
}

const confirmActionsFlow = ai.defineFlow(
  {
    name: 'confirmActionsFlow',
    inputSchema: ConfirmActionsInputSchema,
    outputSchema: ConfirmActionsOutputSchema,
  },
  async ({ batchId, challengeResponse, auth }: ConfirmActionsInput) => {
    const startTime = Date.now();
    
    try {
      // Validate authentication and require fresh auth for security
      const user = getAuthenticatedUserSync(auth);
      requireFreshAuth(auth);
      
      logger.info('Starting action confirmation', { batchId, uid: user.uid });
      
      // Retrieve and validate batch
      const batch = await getActionBatch(batchId, user.uid);
      
      // Security validations
      if (batch.status !== 'awaiting-confirm') {
        logger.warn('Batch confirmation attempted with invalid status', { 
          batchId, 
          uid: user.uid, 
          currentStatus: batch.status 
        });
        throw new Error(`Batch ${batchId} is not awaiting confirmation. Current status: ${batch.status}`);
      }
      
      if (!batch.confirmation) {
        logger.error('Batch missing confirmation object', undefined, { batchId, uid: user.uid });
        throw new Error(`Batch ${batchId} has no confirmation object`);
      }
      
      if (!batch.confirmation.challenge) {
        logger.error('Batch missing challenge', undefined, { batchId, uid: user.uid });
        throw new Error(`Batch ${batchId} has no challenge`);
      }
      
      // Validate challenge response
      if (batch.confirmation.challenge !== challengeResponse) {
        logger.warn('Invalid challenge response', { 
          batchId, 
          uid: user.uid, 
          expectedLength: batch.confirmation.challenge.length,
          actualLength: challengeResponse.length
        });
        throw new Error('Challenge response does not match. Please try again.');
      }
      
      // Validate Drive access before approving
      try {
        const drive = await driveFor(user.uid);
        await drive.files.list({ pageSize: 1 }); // Test Drive access
      } catch (driveError) {
        logger.error('Drive access validation failed during confirmation', driveError as Error, {
          batchId,
          uid: user.uid
        });
        throw new Error('Google Drive access is required. Please reconnect your account.');
      }
      
      // Additional security check: validate batch age
      const batchAge = Date.now() - batch.createdAt.getTime();
      const MAX_BATCH_AGE = 24 * 60 * 60 * 1000; // 24 hours
      
      if (batchAge > MAX_BATCH_AGE) {
        logger.warn('Batch too old for confirmation', { 
          batchId, 
          uid: user.uid, 
          ageHours: batchAge / (60 * 60 * 1000) 
        });
        throw new Error('This action batch has expired. Please create a new one.');
      }
      
      // Approve the batch
      batch.confirmation.approved = true;
      batch.confirmation.approvedBy = user.uid;
      batch.confirmation.approvedAt = new Date();
      
      // Update batch status
      batch.status = 'executing';
      
      // Save the approved batch
      await saveActionBatch(batchId, batch);
      
      const duration = Date.now() - startTime;
      
      logger.info('Action batch confirmed successfully', {
        batchId,
        uid: user.uid,
        proposalCount: batch.proposals.length,
        duration
      });
      
      return { 
        status: 'confirmed', 
        message: `Action batch confirmed successfully. ${batch.proposals.length} actions ready for execution.` 
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Action confirmation failed', error as Error, {
        batchId,
        duration
      });
      
      // Re-throw with more context if it's a generic error
      if (error instanceof Error) {
        if (error.message.includes('not found') || error.message.includes('does not belong')) {
          throw new Error('Action batch not found or access denied.');
        }
        throw error;
      }
      
      throw new Error('An unexpected error occurred during confirmation.');
    }
  }
);

    
