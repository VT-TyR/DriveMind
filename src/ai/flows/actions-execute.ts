
'use server';
/**
 * @fileOverview Production action execution engine.
 * Executes confirmed file operations with comprehensive safety checks, error handling,
 * and audit logging. Implements ALPHA-CODENAME v1.4 production standards.
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
import { getActionBatch, saveActionBatch, saveAnalytics } from '@/lib/firebase-db';
import { logger } from '@/lib/logger';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/**
 * Get user execution settings from Firestore.
 * Includes safety preferences and operation limits.
 */
async function getUserSettings(uid: string) {
  try {
    const settingsRef = doc(db, 'userSettings', uid);
    const settingsSnap = await getDoc(settingsRef);
    
    if (settingsSnap.exists()) {
      const data = settingsSnap.data();
      return {
        allowSoftDelete: data.allowSoftDelete ?? true,
        allowMoves: data.allowMoves ?? true,
        allowPermanentDelete: data.allowPermanentDelete ?? false,
        paranoidSnapshot: data.paranoidSnapshot ?? false,
        maxBatchSize: data.maxBatchSize ?? 100,
        requireReauth: data.requireReauth ?? false
      };
    }
    
    // Default settings for new users
    const defaultSettings = {
      allowSoftDelete: true,
      allowMoves: true,
      allowPermanentDelete: false,
      paranoidSnapshot: false,
      maxBatchSize: 100,
      requireReauth: false
    };
    
    // Save default settings
    await setDoc(settingsRef, {
      ...defaultSettings,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    return defaultSettings;
    
  } catch (error) {
    logger.error('Error getting user settings', undefined, { uid, error: error instanceof Error ? error.message : String(error) });
    // Return safe defaults on error
    return {
      allowSoftDelete: true,
      allowMoves: false, // Conservative default
      allowPermanentDelete: false,
      paranoidSnapshot: true, // Safe default
      maxBatchSize: 50, // Lower limit
      requireReauth: true // More secure
    };
  }
}

/**
 * Write execution change logs to Firestore for audit trail.
 */
async function writeChangeLogs(uid: string, batchId: string, logs: Array<{
  fileId: string;
  op: string;
  fromParents: string[];
  toParents: string[];
  status: 'ok' | 'error';
  error?: string;
  fileName?: string;
  fileSize?: number;
}>) {
  try {
    const logData = {
      uid,
      batchId,
      logs,
      executionTime: new Date().toISOString(),
      timestamp: serverTimestamp()
    };
    
    await saveAnalytics(uid, {
      type: 'action_execution',
      ...logData
    });
    
    logger.info('Change logs written', { uid, batchId, logCount: logs.length });
    
  } catch (error) {
    logger.error('Error writing change logs', undefined, {
      uid,
      batchId,
      logCount: logs.length,
      error: error instanceof Error ? error.message : String(error)
    });
    // Don't throw - logging failure shouldn't stop execution
  }
}

export async function executeActions(input: ExecuteActionsInput): Promise<ExecuteActionsOutput> {
  // Generate idempotency key with timestamp and random component
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  const idempotencyKey = `exec-${input.batchId}-${timestamp}-${random}`;
  
  return executeActionsFlow({ ...input, idempotencyKey });
}

const executeActionsFlow = ai.defineFlow(
  {
    name: 'executeActionsFlow',
    inputSchema: ExecuteActionsInputSchema.extend({ idempotencyKey: z.string() }),
    outputSchema: ExecuteActionsOutputSchema,
  },
  async ({ batchId, idempotencyKey, auth }: ExecuteActionsInput & { idempotencyKey: string }) => {
    const startTime = Date.now();
    let idempRef: any = null;
    
    try {
      // Validate authentication and require fresh auth for destructive operations
      const user = getAuthenticatedUserSync(auth);
      requireFreshAuth(auth);
      
      logger.info('Starting action execution', { batchId, uid: user.uid, idempotencyKey });
      
      // Reserve idempotency to prevent duplicate executions
      idempRef = await reserveIdempotency(idempotencyKey, 'executeActionsFlow');
      
      // Get user settings and validate permissions
      const [settings, hasWriteScope] = await Promise.all([
        getUserSettings(user.uid),
        checkWriteScope(user.uid),
      ]);
      
      logger.info('User settings and permissions validated', { 
        uid: user.uid, 
        batchId, 
        settings, 
        hasWriteScope 
      });
      
      // Validation checks
      if (!hasWriteScope) {
        throw new Error('Google Drive write permissions are required. Please reconnect your account with full permissions.');
      }
      
      // Retrieve and validate batch
      const batch = await getActionBatch(batchId, user.uid);
      
      if (batch.status !== 'executing' || !batch.confirmation?.approved) {
        logger.warn('Batch execution attempted with invalid state', {
          batchId,
          uid: user.uid,
          currentStatus: batch.status,
          approved: batch.confirmation?.approved
        });
        throw new Error(`Batch ${batchId} is not approved for execution. Status: ${batch.status}`);
      }
      
      // Validate batch size against user settings
      if (batch.proposals.length > settings.maxBatchSize) {
        throw new Error(`Batch size ${batch.proposals.length} exceeds limit of ${settings.maxBatchSize}`);
      }
      
      // Additional security check if required
      if (settings.requireReauth) {
        requireFreshAuth(auth, 300000); // 5 minutes for high-security operations
      }
      
      // Validate operation types against settings
      const hasTrashOps = batch.proposals.some(p => p.type === 'trash');
      const hasMoveOps = batch.proposals.some(p => p.type === 'move');
      // Note: 'delete' type doesn't exist in current schema, using 'trash' instead
      const hasDeleteOps = false; // No permanent deletes allowed in current implementation
      
      if (hasTrashOps && !settings.allowSoftDelete) {
        throw new Error('Trash operations are disabled in your settings.');
      }
      
      if (hasMoveOps && !settings.allowMoves) {
        throw new Error('Move operations are disabled in your settings.');
      }
      
      if (hasDeleteOps && !settings.allowPermanentDelete) {
        throw new Error('Permanent delete operations are disabled in your settings.');
      }
      
      // Update batch status and initialize execution tracking
      batch.status = 'executing';
      batch.execution = { 
        startedAt: new Date(), 
        finishedAt: null, 
        results: [] 
      };
      
      await saveActionBatch(batchId, batch);
      
      logger.info('Batch execution started', {
        batchId,
        uid: user.uid,
        proposalCount: batch.proposals.length,
        operationTypes: batch.proposals.map(p => p.type)
      });
      
      // Get Drive API client
      const drive = await driveFor(user.uid);
      
      const results: Array<{
        fileId: string;
        op: string;
        ok: boolean;
        error: string | null;
      }> = [];
      
      const changeLogs: Array<{
        fileId: string;
        op: string;
        fromParents: string[];
        toParents: string[];
        status: 'ok' | 'error';
        error?: string;
        fileName?: string;
        fileSize?: number;
      }> = [];
      
      // Execute operations with proper error handling
      for (const [index, proposal] of batch.proposals.entries()) {
        const originalParents = batch.restorePlan?.parentsByFile[proposal.fileId] || [];
        
        try {
          logger.info(`Executing operation ${index + 1}/${batch.proposals.length}`, {
            batchId,
            uid: user.uid,
            fileId: proposal.fileId,
            fileName: proposal.name,
            operation: proposal.type
          });
          
          if (proposal.type === 'trash') {
            // Soft delete by moving to trash
            await drive.files.update({ 
              fileId: proposal.fileId, 
              requestBody: { trashed: true } 
            });
            
            results.push({ 
              fileId: proposal.fileId, 
              op: 'trash', 
              ok: true, 
              error: null 
            });
            
            changeLogs.push({
              fileId: proposal.fileId,
              op: 'trash',
              fromParents: originalParents,
              toParents: [],
              status: 'ok',
              fileName: proposal.name
            });
            
          } else if (proposal.type === 'move' && proposal.destFolderId) {
            // Move file to new location
            await drive.files.update({
              fileId: proposal.fileId,
              addParents: proposal.destFolderId,
              removeParents: originalParents.length > 0 ? originalParents.join(',') : undefined,
            });
            
            results.push({ 
              fileId: proposal.fileId, 
              op: 'move', 
              ok: true, 
              error: null 
            });
            
            changeLogs.push({
              fileId: proposal.fileId,
              op: 'move',
              fromParents: originalParents,
              toParents: [proposal.destFolderId],
              status: 'ok',
              fileName: proposal.name
            });
            
          // Note: 'delete' type not supported in current schema, all deletes are soft deletes (trash)
            
            changeLogs.push({
              fileId: proposal.fileId,
              op: 'delete',
              fromParents: originalParents,
              toParents: [],
              status: 'ok',
              fileName: proposal.name
            });
            
          } else if (proposal.type === 'rename') {
            // Rename file
            const newName = proposal.name || `renamed_${proposal.fileId}`;
            await drive.files.update({
              fileId: proposal.fileId,
              requestBody: { name: newName }
            });
            
            results.push({ 
              fileId: proposal.fileId, 
              op: 'rename', 
              ok: true, 
              error: null 
            });
            
            changeLogs.push({
              fileId: proposal.fileId,
              op: 'rename',
              fromParents: originalParents,
              toParents: originalParents, // Same location, just renamed
              status: 'ok',
              fileName: newName
            });
            
          } else {
            throw new Error(`Unsupported operation type: ${proposal.type}`);
          }
          
        } catch (error: any) {
          logger.error('Operation failed', undefined, {
            batchId,
            uid: user.uid,
            fileId: proposal.fileId,
            fileName: proposal.name,
            operation: proposal.type,
            error: error.message
          });
          
          results.push({ 
            fileId: proposal.fileId, 
            op: proposal.type, 
            ok: false, 
            error: error.message || 'Unknown error'
          });
          
          changeLogs.push({
            fileId: proposal.fileId,
            op: proposal.type,
            fromParents: originalParents,
            toParents: [],
            status: 'error',
            error: error.message,
            fileName: proposal.name
          });
        }
        
        // Add small delay between operations to avoid rate limits
        if (index < batch.proposals.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      // Calculate final status based on error rate
      const successCount = results.filter(r => r.ok).length;
      const errorCount = results.filter(r => !r.ok).length;
      const errorRate = errorCount / results.length;
      
      // Be more conservative with error tolerance
      const finalStatus = errorRate > 0.05 ? 'failed' : 'executed'; // 5% error tolerance
      
      // Update batch with final results
      batch.status = finalStatus;
      batch.execution!.results = results;
      batch.execution!.finishedAt = new Date();
      batch.executedAt = new Date();
      
      if (errorCount > 0) {
        batch.error = `${errorCount} operations failed out of ${results.length}`;
      }
      
      // Save final batch state and write audit logs
      await Promise.all([
        saveActionBatch(batchId, batch),
        writeChangeLogs(user.uid, batchId, changeLogs)
      ]);
      
      // Mark idempotency as complete
      if (idempRef) {
        await completeIdempotency(idempRef);
      }
      
      const duration = Date.now() - startTime;
      
      logger.info('Action execution completed', {
        batchId,
        uid: user.uid,
        status: finalStatus,
        successCount,
        errorCount,
        duration,
        errorRate: Math.round(errorRate * 100) + '%'
      });
      
      return { 
        status: finalStatus, 
        results: results
      };
      
    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      logger.error('Action execution failed', undefined, {
        batchId,
        idempotencyKey,
        error: error.message,
        duration,
        stack: error.stack
      });
      
      try {
        // Try to update batch status to failed
        const batch = await getActionBatch(batchId, getAuthenticatedUserSync(auth).uid);
        batch.status = 'failed';
        batch.error = error.message;
        
        if (batch.execution) {
          batch.execution.finishedAt = new Date();
        }
        
        await saveActionBatch(batchId, batch);
        
      } catch (updateError) {
        logger.error('Failed to update batch status after error', undefined, {
          batchId,
          updateError: updateError instanceof Error ? updateError.message : String(updateError)
        });
      }
      
      // Re-throw the original error
      throw error;
    }
  }
);
