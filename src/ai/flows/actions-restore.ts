
'use server';
/**
 * @fileOverview Production action restore engine.
 * Provides comprehensive rollback functionality for executed file operations
 * with proper parent restoration and audit logging. Implements ALPHA-CODENAME v1.4 standards.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { driveFor } from '@/lib/google-drive';
import { FlowAuth, getAuthenticatedUserSync } from '@/lib/flow-auth';
import { requireFreshAuth } from '@/lib/guards';
import {
  RestoreActionsInputSchema,
  RestoreActionsOutputSchema,
  RestoreActionsInput,
  RestoreActionsOutput,
} from '@/lib/ai-types';
import { getActionBatch, saveAnalytics } from '@/lib/firebase-db';
import { logger } from '@/lib/logger';

/**
 * Write restore operation logs to Firebase for audit trail.
 */
async function writeRestoreLogs(uid: string, batchId: string, logs: Array<{
  fileId: string;
  op: string;
  fromParents: string[];
  toParents: string[];
  status: 'ok' | 'error';
  error?: string;
  fileName?: string;
}>) {
  try {
    await saveAnalytics(uid, {
      type: 'action_restore',
      uid,
      batchId,
      logs,
      restoreTime: new Date().toISOString()
    });
    
    logger.info('Restore logs written', { uid, batchId, logCount: logs.length });
    
  } catch (error) {
    logger.error('Error writing restore logs', undefined, {
      uid,
      batchId,
      logCount: logs.length,
      error: error instanceof Error ? error.message : String(error)
    });
    // Don't throw - logging failure shouldn't stop restore
  }
}

/**
 * Restore a file from trash and optionally restore its parent folders.
 */
async function restoreFileWithParents(
  drive: any, 
  fileId: string, 
  originalParents: string[], 
  fileName?: string
): Promise<{ success: boolean; error?: string; restoredParents?: string[] }> {
  try {
    // First, untrash the file
    await drive.files.update({ 
      fileId, 
      requestBody: { trashed: false } 
    });
    
    // Get current parents after untrashing
    const currentResponse = await drive.files.get({
      fileId,
      fields: 'parents'
    });
    
    const currentParents = currentResponse.data.parents || [];
    const restoredParents: string[] = [];
    
    // If we have original parents and they're different from current parents, restore them
    if (originalParents.length > 0) {
      try {
        // Validate that original parents still exist
        const validParents: string[] = [];
        
        for (const parentId of originalParents) {
          if (parentId === 'root') {
            validParents.push(parentId);
            continue;
          }
          
          try {
            await drive.files.get({ fileId: parentId, fields: 'id' });
            validParents.push(parentId);
          } catch (parentError) {
            logger.warn('Original parent no longer exists', {
              fileId,
              fileName,
              parentId,
              error: parentError instanceof Error ? parentError.message : String(parentError)
            });
          }
        }
        
        // If we have valid parents different from current, update them
        if (validParents.length > 0 && JSON.stringify(validParents.sort()) !== JSON.stringify(currentParents.sort())) {
          await drive.files.update({
            fileId,
            addParents: validParents.join(','),
            removeParents: currentParents.join(',')
          });
          
          restoredParents.push(...validParents);
        }
        
      } catch (parentError) {
        logger.warn('Failed to restore original parents, but file was untrashed', {
          fileId,
          fileName,
          originalParents,
          error: parentError instanceof Error ? parentError.message : String(parentError)
        });
      }
    }
    
    return { success: true, restoredParents };
    
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
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
  async ({ batchId, fileIds, auth }: RestoreActionsInput) => {
    const startTime = Date.now();
    
    try {
      // Validate authentication
      const user = getAuthenticatedUserSync(auth);
      requireFreshAuth(auth); // Restore operations need fresh auth for security
      
      logger.info('Starting action restore', { 
        batchId, 
        uid: user.uid, 
        requestedFileIds: fileIds?.length || 'all' 
      });
      
      // Retrieve and validate batch
      const batch = await getActionBatch(batchId, user.uid);
      
      if (batch.status !== 'executed' && batch.status !== 'failed') {
        logger.warn('Restore attempted on batch with invalid status', {
          batchId,
          uid: user.uid,
          currentStatus: batch.status
        });
        throw new Error(`Batch ${batchId} has not been executed. Status: ${batch.status}`);
      }
      
      if (!batch.execution || !batch.execution.results) {
        throw new Error(`Batch ${batchId} has no execution results to restore from.`);
      }
      
      // Check if restore plan has expired
      if (batch.restorePlan?.expiresAt && batch.restorePlan.expiresAt < new Date()) {
        logger.warn('Restore attempted on expired restore plan', {
          batchId,
          uid: user.uid,
          expiredAt: batch.restorePlan.expiresAt,
          currentTime: new Date()
        });
        throw new Error('Restore plan has expired. Files may no longer be recoverable.');
      }
      
      // Determine which files to restore
      let filesToRestore: Array<{ fileId: string; fileName?: string; operation: string }>;
      
      if (fileIds && fileIds.length > 0) {
        // Restore specific subset of files
        filesToRestore = batch.execution.results
          .filter(r => (r.op === 'trash' || r.op === 'move') && r.ok && fileIds.includes(r.fileId))
          .map(r => {
            const proposal = batch.proposals.find(p => p.fileId === r.fileId);
            return {
              fileId: r.fileId,
              fileName: proposal?.name,
              operation: r.op
            };
          });
      } else {
        // Restore all restorable files from the batch
        filesToRestore = batch.execution.results
          .filter(r => (r.op === 'trash' || r.op === 'move') && r.ok)
          .map(r => {
            const proposal = batch.proposals.find(p => p.fileId === r.fileId);
            return {
              fileId: r.fileId,
              fileName: proposal?.name,
              operation: r.op
            };
          });
      }
      
      if (filesToRestore.length === 0) {
        logger.info('No files to restore', { batchId, uid: user.uid });
        return { status: 'restored', restored: [] };
      }
      
      logger.info('Files identified for restore', {
        batchId,
        uid: user.uid,
        restoreCount: filesToRestore.length,
        operations: filesToRestore.map(f => f.operation)
      });
      
      // Get Drive API client
      const drive = await driveFor(user.uid);
      
      const restored: string[] = [];
      const changeLogs: Array<{
        fileId: string;
        op: string;
        fromParents: string[];
        toParents: string[];
        status: 'ok' | 'error';
        error?: string;
        fileName?: string;
      }> = [];
      
      const restorePlan = batch.restorePlan?.parentsByFile || {};
      
      // Process each file restore with proper error handling
      for (const [index, fileInfo] of filesToRestore.entries()) {
        const { fileId, fileName, operation } = fileInfo;
        const originalParents = restorePlan[fileId] || [];
        
        logger.info(`Restoring file ${index + 1}/${filesToRestore.length}`, {
          batchId,
          uid: user.uid,
          fileId,
          fileName,
          operation,
          originalParents
        });
        
        try {
          if (operation === 'trash') {
            // Restore from trash with parent restoration
            const result = await restoreFileWithParents(drive, fileId, originalParents, fileName);
            
            if (result.success) {
              restored.push(fileId);
              changeLogs.push({
                fileId,
                op: 'restore_from_trash',
                fromParents: [], // Was in trash
                toParents: result.restoredParents || originalParents,
                status: 'ok',
                fileName
              });
            } else {
              changeLogs.push({
                fileId,
                op: 'restore_from_trash',
                fromParents: [],
                toParents: originalParents,
                status: 'error',
                error: result.error,
                fileName
              });
            }
            
          } else if (operation === 'move') {
            // Restore original location for moved files
            if (originalParents.length > 0) {
              // Get current parents
              const currentResponse = await drive.files.get({
                fileId,
                fields: 'parents'
              });
              const currentParents = currentResponse.data.parents || [];
              
              // Validate original parents still exist
              const validOriginalParents: string[] = [];
              for (const parentId of originalParents) {
                if (parentId === 'root') {
                  validOriginalParents.push(parentId);
                  continue;
                }
                
                try {
                  await drive.files.get({ fileId: parentId, fields: 'id' });
                  validOriginalParents.push(parentId);
                } catch {
                  logger.warn('Original parent no longer exists', {
                    fileId,
                    fileName,
                    parentId
                  });
                }
              }
              
              if (validOriginalParents.length > 0) {
                await drive.files.update({
                  fileId,
                  addParents: validOriginalParents.join(','),
                  removeParents: currentParents.join(',')
                });
                
                restored.push(fileId);
                changeLogs.push({
                  fileId,
                  op: 'restore_move',
                  fromParents: currentParents,
                  toParents: validOriginalParents,
                  status: 'ok',
                  fileName
                });
              } else {
                changeLogs.push({
                  fileId,
                  op: 'restore_move',
                  fromParents: currentParents,
                  toParents: originalParents,
                  status: 'error',
                  error: 'No valid original parents found',
                  fileName
                });
              }
            } else {
              changeLogs.push({
                fileId,
                op: 'restore_move',
                fromParents: [],
                toParents: [],
                status: 'error',
                error: 'No original parents recorded',
                fileName
              });
            }
          }
          
        } catch (error: any) {
          logger.error('Failed to restore file', undefined, {
            batchId,
            uid: user.uid,
            fileId,
            fileName,
            operation,
            error: error.message
          });
          
          changeLogs.push({
            fileId,
            op: `restore_${operation}`,
            fromParents: [],
            toParents: originalParents,
            status: 'error',
            error: error.message,
            fileName
          });
        }
        
        // Add small delay between operations to avoid rate limits
        if (index < filesToRestore.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      // Write audit logs
      await writeRestoreLogs(user.uid, batchId, changeLogs);
      
      const duration = Date.now() - startTime;
      const successCount = restored.length;
      const failureCount = filesToRestore.length - successCount;
      
      logger.info('Action restore completed', {
        batchId,
        uid: user.uid,
        successCount,
        failureCount,
        restoredFiles: restored,
        duration
      });
      
      return { 
        status: 'restored', 
        restored 
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Action restore failed', undefined, {
        batchId,
        error: error instanceof Error ? error.message : String(error),
        duration,
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // Re-throw with more context
      if (error instanceof Error) {
        throw error;
      }
      
      throw new Error('An unexpected error occurred during restore operation.');
    }
  }
);

    
