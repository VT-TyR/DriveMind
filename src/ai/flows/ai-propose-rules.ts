
'use server';
/**
 * @fileOverview A flow to propose file organization rules from a natural language prompt.
 *
 * - proposeRules - A function that converts a human-readable prompt into a structured rule.
 */

import { ai } from '@/ai/genkit';
import {
    ProposeRulesInput,
    ProposeRulesInputSchema,
    ProposeRulesOutput,
    ProposeRulesOutputSchema,
    ProposeRulesOutputSchema as CompiledRuleSchema
} from '@/lib/ai-types';
import { FlowAuth, getAuthenticatedUser } from '@/lib/flow-auth';


const proposeRulesFlow = ai.defineFlow(
  {
    name: 'proposeRulesFlow',
    inputSchema: ProposeRulesInputSchema,
    outputSchema: ProposeRulesOutputSchema,
  },
  async (input) => {
    const user = getAuthenticatedUser(input.auth);
    // In a real scenario, you would first check user settings for aiMode.
    const prompt = ai.definePrompt({
      name: 'proposeRulesPrompt',
      input: { schema: ProposeRulesInputSchema },
      output: { schema: CompiledRuleSchema.shape.compiledRule },
      prompt: `You are an expert at converting natural language instructions into JSON rules for file organization.
    Convert the instruction below into a strict JSON object with "filter" and "action" keys.
    
    Instruction: "{{{prompt}}}"
    
    - nameRegex: A JavaScript-compatible regex string.
    - mimeTypes: An array of strings.
    - olderThanDays: A number.
    - minSizeBytes: A number.
    - action.type: one of "move", "trash", "archive", "rename".
    - action.dest: An array of strings representing the folder path.
    
    Return only the JSON object.`,
    });
    
    const { output } = await prompt(input);

    const compiledRule = output || {
        // Stub response if LLM fails
        filter: {
            nameRegex: "(?i).*invoice.*",
            mimeTypes: ["application/pdf"],
            olderThanDays: 180,
        },
        action: { type: "move", dest: ["Finance", "Invoices", "Archive"] }
    };

    const ruleId = `rule_${Date.now()}`;
    // In a real app, this would be saved to Firestore:
    // await db.collection("aiRules").doc(ruleId).set(...)
    
    return {
      ruleId,
      humanPrompt: input.prompt,
      compiledRule,
      uid: user.uid,
    };
  }
);

export async function proposeRules(input: ProposeRulesInput): Promise<ProposeRulesOutput> {
  return await proposeRulesFlow(input);
}

    
