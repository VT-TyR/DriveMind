

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


const simulateActionsFlow = ai.defineFlow(
  {
    name: 'simulateActionsFlow',
    inputSchema: SimulateActionsInputSchema,
    outputSchema: SimulateActionsOutputSchema,
  },
  async ({ rule, limit }) => {
    // This flow does not require an LLM call. It's a business logic flow.
    
    // In a real application, you would fetch files for the authenticated user from Google Drive here.
    // For this example, we'll use a hardcoded mock list.
    const files: z.infer<typeof FileSchema>[] = [
        { id: '1', name: 'invoice-2023.pdf', mimeType: 'application/pdf', size: 1024, lastModified: new Date('2023-01-15'), path: ['/'] },
        { id: '2', name: 'old_invoice.pdf', mimeType: 'application/pdf', size: 2048, lastModified: new Date('2022-03-20'), path: ['/'] },
        { id: '3', name: 'photo.jpg', mimeType: 'image/jpeg', size: 4096, lastModified: new Date(), path: ['/'] },
    ];
    
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

    const batchId = `batch_${Date.now()}`;
    // In a real app, this would be saved to Firestore:
    // const actionBatch: ActionBatch = { ... }
    // await db.collection("aiActions").doc(batchId).set(actionBatch)

    return {
      batchId,
      proposals,
    };
  }
);

export async function simulateActions(input: SimulateActionsInput): Promise<SimulateActionsOutput> {
  return await simulateActionsFlow(input);
}
