
'use server';
/**
 * @fileOverview A flow to run a saved rule against a set of files and create a simulated batch.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { FlowAuth, getAuthenticatedUser } from '@/lib/flow-auth';
import { 
    FileSchema, 
    ProposeRulesOutputSchema, 
    ActionBatchSchema,
    RulesRunInput,
    RulesRunInputSchema,
    RulesRunOutput,
    RulesRunOutputSchema
} from '@/lib/ai-types';

// In a real app, these would interact with a database like Firestore
const mockDb: Record<string, z.infer<typeof ActionBatchSchema>> = {};
const mockRulesDb: Record<string, z.infer<typeof ProposeRulesOutputSchema>> = {};

async function getRule(ruleId: string, uid: string) {
    // For demo, if a rule was just created on the frontend, it won't be in a real DB.
    // This mock allows the frontend to proceed.
    if (mockRulesDb[ruleId] && mockRulesDb[ruleId].uid === uid) {
        return mockRulesDb[ruleId];
    }
    // For demo
    return {
        uid,
        humanPrompt: 'Mock Rule',
        ruleId: ruleId,
        compiledRule: {
            filter: { 
                nameRegex: '.*invoice.*', 
                mimeTypes: [],
                olderThanDays: undefined,
                minSizeBytes: undefined,
            },
            action: { type: 'trash' as const, dest: [] }
        }
    }
}
async function saveActionBatch(batchId: string, batchData: any) {
    mockDb[batchId] = batchData;
}
async function updateRule(ruleId: string, ruleData: any) {
    // Add rule to mock DB for subsequent lookups
    if (ruleId in mockRulesDb) {
        mockRulesDb[ruleId] = { ...mockRulesDb[ruleId], ...ruleData };
    }
    return;
}

export async function rulesRun(input: RulesRunInput): Promise<RulesRunOutput> {
  return rulesRunFlow(input);
}

const rulesRunFlow = ai.defineFlow(
  {
    name: 'rulesRunFlow',
    inputSchema: RulesRunInputSchema,
    outputSchema: RulesRunOutputSchema,
  },
  async ({ ruleId, auth }) => {
    const user = getAuthenticatedUser(auth);

    const r = await getRule(ruleId, user.uid);
    const rule = r.compiledRule;
    
    // In a real application, you would fetch files for the authenticated user from Google Drive here.
    // For this example, we'll use a hardcoded mock list.
    const allFiles: z.infer<typeof FileSchema>[] = [
        { id: '1', name: 'invoice-2023.pdf', mimeType: 'application/pdf', size: 1024, lastModified: new Date('2023-01-15'), path: ['/'] },
        { id: '2', name: 'old_invoice.pdf', mimeType: 'application/pdf', size: 2048, lastModified: new Date('2022-03-20'), path: ['/'] },
        { id: '3', name: 'photo.jpg', mimeType: 'image/jpeg', size: 4096, lastModified: new Date(), path: ['/'] },
        { id: '4', name: 'project-notes.txt', mimeType: 'text/plain', size: 512, lastModified: new Date(), path: ['/'] },
    ];


    const matchingFiles = allFiles.filter((f:any) => {
        const nameOk = rule.filter?.nameRegex ? new RegExp(rule.filter.nameRegex, "i").test(f.name||"") : true;
        const mtOk = rule.filter?.mimeTypes?.length ? rule.filter.mimeTypes.includes(f.mimeType) : true;
        // Other filters from the schema would go here...
        return nameOk && mtOk;
      });

    const batchId = `${user.uid}_${Date.now()}`;
    
    const batch = ActionBatchSchema.parse({
        uid: user.uid,
        source: "userRule",
        proposals: matchingFiles.map((f:any)=>({ type: rule.action?.type||"move", fileId: f.id, name: f.name, destFolderId: null, reason: "Rule match", confidence: 0.7 })),
        status: "simulated",
        preflight: null,
        confirmation: null,
        execution: null,
        restorePlan: null,
        createdAt: new Date(),
        executedAt: null,
        error: null,
    });
    
    await saveActionBatch(batchId, batch);
    await updateRule(ruleId, { lastRunAt: new Date(), lastCreatedBatchId: batchId });

    return { batchId, count: matchingFiles.length };
  }
);
