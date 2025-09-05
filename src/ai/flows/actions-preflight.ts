
'use server';
/**
 * @fileOverview Production action preflight engine.
 * Performs comprehensive safety checks, risk analysis, and metadata validation
 * before allowing destructive operations. Implements ALPHA-CODENAME v1.4 standards.
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
import { getActionBatch, saveActionBatch } from '@/lib/firebase-db';
import { logger } from '@/lib/logger';
import { requireFreshAuth } from '@/lib/guards';
import crypto from 'crypto';


/**
 * Analyze file metadata for security and sharing risks.
 */
function analyzeFileRisks(fileMetadata: any): string[] {
  const risks: string[] = [];
  
  // Check if file is shared publicly
  if (fileMetadata.shared) {
    risks.push('shared_public');
  }
  
  // Check if file has permissions that make it risky
  if (fileMetadata.permissions && Array.isArray(fileMetadata.permissions)) {
    const hasPublicPermission = fileMetadata.permissions.some((perm: any) => 
      perm.type === 'anyone' || perm.type === 'domain'
    );
    if (hasPublicPermission) {
      risks.push('public_permissions');
    }
  }
  
  // Check for large files that might be important
  const sizeBytes = Number(fileMetadata.size || 0);
  if (sizeBytes > 100 * 1024 * 1024) { // > 100MB
    risks.push('large_file');
  }
  
  // Check if file was recently modified
  if (fileMetadata.modifiedTime) {
    const modifiedDate = new Date(fileMetadata.modifiedTime);
    const daysSinceModified = (Date.now() - modifiedDate.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysSinceModified < 7) {
      risks.push('recently_modified');
    }
  }
  
  return risks;
}

/**
 * Generate a secure challenge string for user confirmation.
 */
function generateSecureChallenge(operationType: string, fileCount: number, totalBytes: number): string {
  const random = crypto.randomBytes(8).toString('hex').toUpperCase();
  const sizeStr = totalBytes > 1024 * 1024 * 1024 
    ? `${Math.round(totalBytes / (1024 * 1024 * 1024) * 100) / 100}GB`
    : totalBytes > 1024 * 1024
    ? `${Math.round(totalBytes / (1024 * 1024) * 100) / 100}MB`
    : `${Math.round(totalBytes / 1024)}KB`;
    
  return `CONFIRM ${operationType.toUpperCase()} ${fileCount} FILES (${sizeStr}) CODE: ${random}`;
}

export async function preflightActions(input: PreflightActionsInput): Promise<PreflightActionsOutput> {
  return preflightActionsFlow(input);
}

const preflightActionsFlow = ai.defineFlow(
  {
    name: 'preflightActionsFlow',
    inputSchema: PreflightActionsInputSchema,
    outputSchema: PreflightActionsOutputSchema,
  },
  async ({ batchId, auth }: PreflightActionsInput) => {
    const startTime = Date.now();
    
    try {
      // Validate authentication
      const user = getAuthenticatedUserSync(auth);
      requireFreshAuth(auth); // Ensure fresh auth for safety checks
      
      logger.info('Starting action preflight', { batchId, uid: user.uid });
      
      // Retrieve and validate batch
      const batch = await getActionBatch(batchId, user.uid);
      
      if (batch.status !== 'simulated') {
        logger.warn('Preflight attempted on non-simulated batch', {
          batchId,
          uid: user.uid,
          currentStatus: batch.status
        });
        throw new Error(`Batch ${batchId} is not in simulated state. Current status: ${batch.status}`);
      }
      
      if (!batch.proposals || batch.proposals.length === 0) {
        throw new Error(`Batch ${batchId} has no proposals to preflight`);
      }
      
      // Validate batch size limits
      const MAX_BATCH_SIZE = 1000;
      if (batch.proposals.length > MAX_BATCH_SIZE) {
        throw new Error(`Batch size ${batch.proposals.length} exceeds maximum of ${MAX_BATCH_SIZE}`);
      }
      
      logger.info('Batch validation passed', {
        batchId,
        uid: user.uid,
        proposalCount: batch.proposals.length,
        operationTypes: batch.proposals.map(p => p.type)
      });
      
      // Get Drive API client
      const drive = await driveFor(user.uid);
      const fileIds = batch.proposals.map(p => p.fileId);
      
      logger.info('Fetching file metadata for preflight', {
        batchId,
        uid: user.uid,
        fileCount: fileIds.length
      });
      
      // Fetch detailed file metadata with error handling
      const fileMetadataPromises = fileIds.map(async (fileId, index) => {
        try {
          const response = await drive.files.get({ 
            fileId, 
            fields: 'id, name, size, parents, shared, permissions, mimeType, modifiedTime, createdTime, owners'
          });
          return { fileId, response, index };
        } catch (error: any) {
          logger.warn('Failed to fetch file metadata', {
            batchId,
            uid: user.uid,
            fileId,
            error: error.message
          });
          return { fileId, response: null, index, error: error.message };
        }
      });
      
      const fileMetadataResults = await Promise.all(fileMetadataPromises);
      
      // Process metadata and identify issues
      let totalBytes = 0;
      const preflightFiles: Array<{
        fileId: string;
        name: string;
        size: number;
        currentParents: string[];
        suggestedParents: string[];
      }> = [];
      
      const allRisks = new Set<string>();
      const inaccessibleFiles: string[] = [];
      const fileRiskDetails: Record<string, string[]> = {};
      
      for (const result of fileMetadataResults) {
        if (!result.response) {
          inaccessibleFiles.push(result.fileId);
          continue;
        }
        
        const file = result.response.data;
        const fileSize = Number(file.size || 0);
        totalBytes += fileSize;
        
        // Analyze risks for this file
        const fileRisks = analyzeFileRisks(file);
        fileRiskDetails[result.fileId] = fileRisks;
        fileRisks.forEach(risk => allRisks.add(risk));
        
        // Find the corresponding proposal
        const proposal = batch.proposals.find(p => p.fileId === result.fileId);
        
        preflightFiles.push({
          fileId: file.id!,
          name: file.name!,
          size: fileSize,
          currentParents: file.parents || [],
          suggestedParents: proposal?.destFolderId ? [proposal.destFolderId] : [],
        });
      }
      
      // Check for critical safety issues
      if (inaccessibleFiles.length > 0) {
        logger.warn('Some files are inaccessible', {
          batchId,
          uid: user.uid,
          inaccessibleCount: inaccessibleFiles.length,
          inaccessibleFiles: inaccessibleFiles.slice(0, 10) // Log first 10
        });
        
        // If too many files are inaccessible, it might indicate a permissions issue
        const inaccessibleRate = inaccessibleFiles.length / fileIds.length;
        if (inaccessibleRate > 0.1) { // More than 10% inaccessible
          throw new Error(`${inaccessibleFiles.length} files are inaccessible. This may indicate insufficient permissions.`);
        }
      }
      
      // Validate total size limits
      const MAX_TOTAL_SIZE = 50 * 1024 * 1024 * 1024; // 50GB
      if (totalBytes > MAX_TOTAL_SIZE) {
        const totalGB = Math.round(totalBytes / (1024 * 1024 * 1024) * 100) / 100;
        throw new Error(`Total batch size (${totalGB}GB) exceeds safety limit of 50GB`);
      }
      
      // Check for high-risk operations
      if (allRisks.has('shared_public') && batch.proposals.some(p => p.type === 'delete')) {
        allRisks.add('deleting_shared_files');
      }
      
      if (allRisks.has('recently_modified') && batch.proposals.length > 100) {
        allRisks.add('bulk_operation_on_recent_files');
      }
      
      // Build preflight data
      batch.preflight = {
        files: preflightFiles,
        tallies: { 
          count: preflightFiles.length, 
          bytes: totalBytes 
        },
        risks: Array.from(allRisks) as any[],
        createdAt: new Date(),
      };
      
      // Generate secure challenge
      const primaryOperationType = batch.proposals[0]?.type || 'OPERATION';
      const challenge = generateSecureChallenge(primaryOperationType, preflightFiles.length, totalBytes);
      
      // Determine if reauth is required based on risk level
      const isHighRisk = allRisks.has('shared_public') || 
                        allRisks.has('large_file') || 
                        allRisks.has('deleting_shared_files') ||
                        totalBytes > 1024 * 1024 * 1024 || // > 1GB
                        preflightFiles.length > 100;
      
      batch.confirmation = {
        required: true,
        challenge: challenge,
        approved: false,
        approvedBy: null,
        approvedAt: null,
        reauthRequired: isHighRisk,
      };
      
      // Build restore plan with proper expiration
      const restoreDuration = isHighRisk ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000; // 7 days for high risk, 30 days for normal
      
      batch.restorePlan = {
        mode: batch.proposals.some(p => p.type === 'delete') ? 'full_backup' : 'trash_only',
        parentsByFile: preflightFiles.reduce((acc, f) => ({ 
          ...acc, 
          [f.fileId]: f.currentParents 
        }), {}),
        expiresAt: new Date(Date.now() + restoreDuration),
      };
      
      // Update batch status
      batch.status = 'awaiting-confirm';
      
      // Save updated batch
      await saveActionBatch(batchId, batch);
      
      const duration = Date.now() - startTime;
      
      logger.info('Action preflight completed', {
        batchId,
        uid: user.uid,
        fileCount: preflightFiles.length,
        totalBytes,
        riskCount: allRisks.size,
        risks: Array.from(allRisks),
        inaccessibleCount: inaccessibleFiles.length,
        isHighRisk,
        duration
      });
      
      return { 
        status: batch.status, 
        challenge 
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Action preflight failed', undefined, {
        batchId,
        error: error instanceof Error ? error.message : String(error),
        duration,
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // Re-throw with more context
      if (error instanceof Error) {
        throw error;
      }
      
      throw new Error('An unexpected error occurred during preflight checks.');
    }
  }
);

    
