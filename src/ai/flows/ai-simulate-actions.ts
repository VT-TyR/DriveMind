

'use server';

/**
 * @fileOverview A flow to simulate cleanup actions based on a compiled rule.
 *
 * - simulateActions - A function that finds files matching a rule and proposes actions.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { 
    SimulateActionsInput, 
    SimulateActionsInputSchema, 
    SimulateActionsOutput, 
    SimulateActionsOutputSchema,
    FileSchema
} from '@/lib/ai-types';
import { listSampleFiles } from './drive-list-sample';
import { logger } from '@/lib/logger';


const simulateActionsFlow = ai.defineFlow(
  {
    name: 'simulateActionsFlow',
    inputSchema: SimulateActionsInputSchema,
    outputSchema: SimulateActionsOutputSchema,
  },
  async ({ rule, limit, auth }: SimulateActionsInput) => {
    logger.info('Starting action simulation', { ruleId: rule.id, limit });
    
    try {
      // Fetch real files from Google Drive
      const { files: driveFiles } = await listSampleFiles({ auth });
      
      const files: z.infer<typeof FileSchema>[] = driveFiles.map((f: any) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType || 'application/octet-stream',
        size: Number(f.size) || 0,
        lastModified: f.modifiedTime ? new Date(f.modifiedTime) : new Date(),
        path: ['/'],
      }));

      logger.info('Retrieved files for simulation', { fileCount: files.length });
    } catch (error) {
      logger.error('Failed to fetch files for simulation', error as Error);
      // Return empty result on failure
      return {
        batchId: `batch_empty_${Date.now()}`,
        proposals: [],
      };
    }
    
    const matchingFiles = files.filter(f => {
      const { filter } = rule;
      const nameOk = filter.nameRegex ? new RegExp(filter.nameRegex, 'i').test(f.name || "") : true;
      const sizeOk = filter.minSizeBytes ? (f.size || 0) >= filter.minSizeBytes : true;
      const olderOk = filter.olderThanDays ? 
        (Date.now() - new Date(f.lastModified).getTime()) / (1000 * 60 * 60 * 24) >= filter.olderThanDays
        : true;
      const mtOk = filter.mimeTypes?.length ? filter.mimeTypes.includes(f.mimeType) : true;
      return nameOk && sizeOk && olderOk && mtOk;
    });

    const proposals = matchingFiles.slice(0, limit).map(f => {
      let actionType: 'move' | 'trash' | 'archive' | 'rename';
      const ruleActionType = rule.action.type;
      
      if (ruleActionType === 'delete' || ruleActionType === 'trash') {
        actionType = 'trash'; // Never propose hard delete, always trash
      } else {
        actionType = ruleActionType;
      }
      
      return {
        type: actionType,
        fileId: f.id,
        name: f.name,
        destFolderId: null, // Would be resolved at execution time
        reason: "Matched AI rule",
        confidence: 0.7,
      };
    });

    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    
    logger.info('Action simulation completed', { 
      batchId, 
      totalFiles: files.length,
      matchingFiles: matchingFiles.length,
      proposalCount: proposals.length 
    });

    return {
      batchId,
      proposals,
    };
  }
);

export async function simulateActions(input: SimulateActionsInput): Promise<SimulateActionsOutput> {
  return await simulateActionsFlow(input);
}
