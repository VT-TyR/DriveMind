/**
 * @fileOverview Batch Operations System
 * Executes bulk file operations with safety checks, progress tracking, and rollback capabilities
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { driveFor } from '@/lib/google-drive';
import { FlowAuth, getAuthenticatedUserSync } from '@/lib/flow-auth';
import { logger } from '@/lib/logger';
import { saveAnalytics, saveActionBatch, getActionBatch } from '@/lib/firebase-db';

const BatchOperationTypeSchema = z.enum([
  'move', 'copy', 'rename', 'delete', 'archive', 'organize', 'create_folder'
]);

const FileOperationSchema = z.object({
  fileId: z.string(),
  fileName: z.string(),
  currentPath: z.string().optional(),
  operation: BatchOperationTypeSchema,
  operationData: z.object({
    destinationFolderId: z.string().optional(),
    destinationPath: z.string().optional(),
    newName: z.string().optional(),
    createMissingFolders: z.boolean().optional(),
  }),
  priority: z.enum(['high', 'medium', 'low']).default('medium'),
  safetyChecks: z.object({
    isShared: z.boolean().default(false),
    hasCollaborators: z.boolean().default(false),
    isLargeFile: z.boolean().default(false),
    isSystemFile: z.boolean().default(false),
  }),
});

const BatchExecutionResultSchema = z.object({
  fileId: z.string(),
  fileName: z.string(),
  operation: BatchOperationTypeSchema,
  status: z.enum(['success', 'failed', 'skipped', 'needs_review']),
  message: z.string(),
  executedAt: z.date(),
  rollbackData: z.object({
    originalParents: z.array(z.string()),
    originalName: z.string(),
  }).optional(),
});

const BatchProgressSchema = z.object({
  batchId: z.string(),
  totalOperations: z.number(),
  completedOperations: z.number(),
  successfulOperations: z.number(),
  failedOperations: z.number(),
  skippedOperations: z.number(),
  currentOperation: z.string().optional(),
  estimatedTimeRemaining: z.number().optional(),
  startTime: z.date(),
  lastUpdateTime: z.date(),
});

export const BatchOperationsInputSchema = z.object({
  auth: z.object({
    uid: z.string(),
    email: z.string().optional(),
  }),
  operations: z.array(FileOperationSchema),
  batchName: z.string(),
  executionMode: z.enum(['immediate', 'scheduled', 'preview']).default('immediate'),
  safetyLevel: z.enum(['aggressive', 'normal', 'conservative']).default('normal'),
  continueOnError: z.boolean().default(true),
  createBackup: z.boolean().default(true),
  maxConcurrency: z.number().default(5),
});

export const BatchOperationsOutputSchema = z.object({
  batchId: z.string(),
  executionMode: z.enum(['immediate', 'scheduled', 'preview']),
  results: z.array(BatchExecutionResultSchema),
  progress: BatchProgressSchema,
  summary: z.object({
    totalOperations: z.number(),
    successfulOperations: z.number(),
    failedOperations: z.number(),
    skippedOperations: z.number(),
    spaceSaved: z.number(),
    foldersCreated: z.number(),
    filesOrganized: z.number(),
  }),
  rollbackPlan: z.object({
    canRollback: z.boolean(),
    rollbackOperations: z.array(z.object({
      type: z.string(),
      fileId: z.string(),
      data: z.record(z.any()),
    })),
  }),
  completedAt: z.date(),
  processingTime: z.number(),
});

export type BatchOperationsInput = z.infer<typeof BatchOperationsInputSchema>;
export type BatchOperationsOutput = z.infer<typeof BatchOperationsOutputSchema>;

// Safety check functions
async function performSafetyChecks(drive: any, operation: any, safetyLevel: string): Promise<{ safe: boolean; warnings: string[]; skipReasons: string[] }> {
  const warnings: string[] = [];
  const skipReasons: string[] = [];
  let safe = true;

  try {
    // Get detailed file information
    const fileResponse = await drive.files.get({
      fileId: operation.fileId,
      fields: 'id, name, parents, shared, permissions, size, mimeType, capabilities',
    });

    const file = fileResponse.data;

    // Check if file is shared
    if (file.shared && safetyLevel !== 'aggressive') {
      if (safetyLevel === 'conservative') {
        skipReasons.push('File is shared with others');
        safe = false;
      } else {
        warnings.push('File is shared - consider notifying collaborators');
      }
    }

    // Check permissions
    if (file.permissions && file.permissions.length > 1) {
      operation.safetyChecks.hasCollaborators = true;
      if (safetyLevel === 'conservative') {
        warnings.push('File has multiple collaborators');
      }
    }

    // Check file size
    const size = parseInt(file.size || '0');
    if (size > 100 * 1024 * 1024) { // 100MB
      operation.safetyChecks.isLargeFile = true;
      warnings.push('Large file detected');
    }

    // Check if it's a system/important file
    if (file.mimeType?.includes('vnd.google-apps') && 
        !file.capabilities?.canEdit &&
        safetyLevel === 'conservative') {
      skipReasons.push('System file or limited editing permissions');
      safe = false;
    }

    // Operation-specific checks
    if (operation.operation === 'delete' || operation.operation === 'archive') {
      if (file.shared && safetyLevel !== 'aggressive') {
        skipReasons.push('Cannot delete/archive shared files in safe mode');
        safe = false;
      }
    }

  } catch (error) {
    skipReasons.push(`Cannot access file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    safe = false;
  }

  return { safe, warnings, skipReasons };
}

// Create folder if it doesn't exist
async function ensureFolderExists(drive: any, folderPath: string): Promise<string> {
  const pathParts = folderPath.split('/').filter(part => part.length > 0);
  let currentFolderId = 'root';

  for (const folderName of pathParts) {
    // Check if folder exists
    const searchResponse = await drive.files.list({
      q: `name = '${folderName}' and '${currentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id)',
    });

    if (searchResponse.data.files && searchResponse.data.files.length > 0) {
      currentFolderId = searchResponse.data.files[0].id;
    } else {
      // Create folder
      const createResponse = await drive.files.create({
        requestBody: {
          name: folderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [currentFolderId],
        },
      });
      currentFolderId = createResponse.data.id;
      logger.info('Created folder', { folderName, folderId: currentFolderId });
    }
  }

  return currentFolderId;
}

// Execute individual operation
async function executeOperation(
  drive: any, 
  operation: any, 
  safetyLevel: string
): Promise<any> {
  const startTime = new Date();

  try {
    // Perform safety checks
    const safetyCheck = await performSafetyChecks(drive, operation, safetyLevel);
    
    if (!safetyCheck.safe) {
      return {
        fileId: operation.fileId,
        fileName: operation.fileName,
        operation: operation.operation,
        status: 'skipped',
        message: `Skipped: ${safetyCheck.skipReasons.join(', ')}`,
        executedAt: startTime,
      };
    }

    // Get original file data for rollback
    const fileResponse = await drive.files.get({
      fileId: operation.fileId,
      fields: 'id, name, parents',
    });

    const rollbackData = {
      originalParents: fileResponse.data.parents || [],
      originalName: fileResponse.data.name || operation.fileName,
    };

    let result: any = null;

    // Execute operation
    switch (operation.operation) {
      case 'move':
        if (operation.operationData.destinationFolderId) {
          result = await drive.files.update({
            fileId: operation.fileId,
            addParents: operation.operationData.destinationFolderId,
            removeParents: rollbackData.originalParents.join(','),
          });
        } else if (operation.operationData.destinationPath) {
          const folderId = await ensureFolderExists(drive, operation.operationData.destinationPath);
          result = await drive.files.update({
            fileId: operation.fileId,
            addParents: folderId,
            removeParents: rollbackData.originalParents.join(','),
          });
        }
        break;

      case 'copy':
        if (operation.operationData.destinationFolderId) {
          result = await drive.files.copy({
            fileId: operation.fileId,
            requestBody: {
              parents: [operation.operationData.destinationFolderId],
              name: operation.operationData.newName || operation.fileName,
            },
          });
        }
        break;

      case 'rename':
        if (operation.operationData.newName) {
          result = await drive.files.update({
            fileId: operation.fileId,
            requestBody: {
              name: operation.operationData.newName,
            },
          });
        }
        break;

      case 'delete':
        result = await drive.files.update({
          fileId: operation.fileId,
          requestBody: {
            trashed: true,
          },
        });
        break;

      case 'archive':
        // Create Archive folder if it doesn't exist and move file there
        const archiveFolderId = await ensureFolderExists(drive, '/Archive');
        result = await drive.files.update({
          fileId: operation.fileId,
          addParents: archiveFolderId,
          removeParents: rollbackData.originalParents.join(','),
        });
        break;

      case 'organize':
        // Use AI to determine best destination based on file content/name
        const organizeFolderId = await ensureFolderExists(drive, '/Organized');
        result = await drive.files.update({
          fileId: operation.fileId,
          addParents: organizeFolderId,
          removeParents: rollbackData.originalParents.join(','),
        });
        break;

      default:
        throw new Error(`Unsupported operation: ${operation.operation}`);
    }

    const message = safetyCheck.warnings.length > 0 ? 
      `Completed with warnings: ${safetyCheck.warnings.join(', ')}` :
      'Operation completed successfully';

    return {
      fileId: operation.fileId,
      fileName: operation.fileName,
      operation: operation.operation,
      status: 'success',
      message,
      executedAt: startTime,
      rollbackData,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Operation failed', error as Error, {
      fileId: operation.fileId,
      operation: operation.operation,
    });

    return {
      fileId: operation.fileId,
      fileName: operation.fileName,
      operation: operation.operation,
      status: 'failed',
      message: `Failed: ${errorMessage}`,
      executedAt: startTime,
    };
  }
}

// Progress update function
async function updateProgress(
  uid: string,
  batchId: string,
  progress: any
): Promise<void> {
  try {
    await saveAnalytics(uid, {
      type: 'batch_progress',
      ...progress,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.warn('Failed to save batch progress', { batchId, error: error instanceof Error ? error.message : String(error) });
  }
}

const batchOperationsFlow = ai.defineFlow(
  {
    name: 'batchOperationsFlow',
    inputSchema: BatchOperationsInputSchema,
    outputSchema: BatchOperationsOutputSchema,
  },
  async ({ 
    auth, 
    operations, 
    batchName, 
    executionMode, 
    safetyLevel, 
    continueOnError, 
    createBackup, 
    maxConcurrency 
  }: BatchOperationsInput) => {
    const startTime = Date.now();
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    const user = getAuthenticatedUserSync(auth);
    logger.info('Starting batch operations', { 
      uid: user.uid, 
      batchId, 
      batchName,
      operationCount: operations.length,
      executionMode,
      safetyLevel 
    });

    try {
      // Preview mode - don't execute, just validate
      if (executionMode === 'preview') {
        const drive = await driveFor(user.uid);
        const previewResults: any[] = [];

        for (const operation of operations.slice(0, 10)) { // Preview first 10
          const safetyCheck = await performSafetyChecks(drive, operation, safetyLevel);
          previewResults.push({
            fileId: operation.fileId,
            fileName: operation.fileName,
            operation: operation.operation,
            status: safetyCheck.safe ? 'ready' : 'needs_review',
            message: safetyCheck.safe ? 'Ready to execute' : safetyCheck.skipReasons.join(', '),
            executedAt: new Date(),
          });
        }

        return {
          batchId,
          executionMode,
          results: previewResults,
          progress: {
            batchId,
            totalOperations: operations.length,
            completedOperations: 0,
            successfulOperations: 0,
            failedOperations: 0,
            skippedOperations: 0,
            startTime: new Date(),
            lastUpdateTime: new Date(),
          },
          summary: {
            totalOperations: operations.length,
            successfulOperations: 0,
            failedOperations: 0,
            skippedOperations: 0,
            spaceSaved: 0,
            foldersCreated: 0,
            filesOrganized: 0,
          },
          rollbackPlan: {
            canRollback: false,
            rollbackOperations: [],
          },
          completedAt: new Date(),
          processingTime: Date.now() - startTime,
        };
      }

      const drive = await driveFor(user.uid);
      const results: any[] = [];
      let successfulOperations = 0;
      let failedOperations = 0;
      let skippedOperations = 0;
      let spaceSaved = 0;
      let foldersCreated = 0;
      const rollbackOperations: any[] = [];

      // Initialize progress tracking
      const progress: any = {
        batchId,
        totalOperations: operations.length,
        completedOperations: 0,
        successfulOperations: 0,
        failedOperations: 0,
        skippedOperations: 0,
        startTime: new Date(),
        lastUpdateTime: new Date(),
      };

      // Execute operations in controlled batches
      const batchSize = Math.min(maxConcurrency, 10);
      
      for (let i = 0; i < operations.length; i += batchSize) {
        const batch = operations.slice(i, i + batchSize);
        const batchPromises = batch.map(operation => executeOperation(drive, operation, safetyLevel));
        
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        // Update counters
        let shouldStop = false;
        for (const result of batchResults) {
          if (result.status === 'success') {
            successfulOperations++;
            if (result.rollbackData) {
              rollbackOperations.push({
                type: 'restore',
                fileId: result.fileId,
                data: result.rollbackData,
              });
            }
          } else if (result.status === 'failed') {
            failedOperations++;
            if (!continueOnError) {
              logger.warn('Stopping batch due to error', { batchId, error: result.message });
              shouldStop = true;
              break;
            }
          } else if (result.status === 'skipped') {
            skippedOperations++;
          }
        }
        
        if (shouldStop) {
          break;
        }

        // Update progress
        progress.completedOperations = results.length;
        progress.successfulOperations = successfulOperations;
        progress.failedOperations = failedOperations;
        progress.skippedOperations = skippedOperations;
        progress.lastUpdateTime = new Date();
        progress.currentOperation = i + batchSize < operations.length ? 
          operations[i + batchSize].fileName : undefined;
        
        const remainingOperations = operations.length - results.length;
        const avgTimePerOperation = (Date.now() - startTime) / results.length;
        progress.estimatedTimeRemaining = remainingOperations * avgTimePerOperation;

        // Save progress
        await updateProgress(user.uid, batchId, progress);

        logger.info('Batch progress update', {
          batchId,
          completed: results.length,
          total: operations.length,
          successful: successfulOperations,
          failed: failedOperations,
        });

        // Add small delay between batches to avoid rate limits
        if (i + batchSize < operations.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      const summary = {
        totalOperations: operations.length,
        successfulOperations,
        failedOperations,
        skippedOperations,
        spaceSaved,
        foldersCreated,
        filesOrganized: results.filter(r => 
          r.operation === 'move' || r.operation === 'organize'
        ).length,
      };

      const result: BatchOperationsOutput = {
        batchId,
        executionMode,
        results,
        progress: {
          ...progress,
          completedOperations: results.length,
        },
        summary,
        rollbackPlan: {
          canRollback: rollbackOperations.length > 0,
          rollbackOperations,
        },
        completedAt: new Date(),
        processingTime: Date.now() - startTime,
      };

      // Save final batch results
      await saveActionBatch(batchId, {
        uid: user.uid,
        source: `batch_${batchId}`,
        proposals: operations.map(op => ({
          type: op.operation === 'move' ? 'move' : 
                op.operation === 'delete' ? 'trash' : 
                op.operation === 'archive' ? 'archive' : 
                op.operation === 'rename' ? 'rename' : 'move',
          fileId: op.fileId,
          name: op.fileName,
          confidence: 0.8,
          reason: `Batch operation: ${op.operation}`,
          destFolderId: null
        })),
        status: failedOperations > successfulOperations ? 'failed' : 'executed',
        preflight: null,
        confirmation: null,
        restorePlan: null,
        execution: null,
        createdAt: new Date(),
        executedAt: new Date(),
        error: failedOperations > 0 ? `${failedOperations} operations failed` : null,
      });

      logger.info('Batch operations completed', {
        uid: user.uid,
        batchId,
        batchName,
        totalOperations: operations.length,
        successful: successfulOperations,
        failed: failedOperations,
        skipped: skippedOperations,
        processingTime: result.processingTime,
      });

      return result;

    } catch (error) {
      logger.error('Batch operations failed', error as Error, { uid: user.uid, batchId });
      throw new Error(`Batch operations failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
);

export async function executeBatchOperations(input: BatchOperationsInput): Promise<BatchOperationsOutput> {
  return batchOperationsFlow(input);
}