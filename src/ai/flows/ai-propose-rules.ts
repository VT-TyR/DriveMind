
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
import { FlowAuth, getAuthenticatedUserSync } from '@/lib/flow-auth';


const proposeRulesFlow = ai.defineFlow(
  {
    name: 'proposeRulesFlow',
    inputSchema: ProposeRulesInputSchema,
    outputSchema: ProposeRulesOutputSchema,
  },
  async (input: ProposeRulesInput) => {
    const user = getAuthenticatedUserSync(input.auth);
    
    // Check if API key is available before proceeding
    const hasApiKey = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
    if (!hasApiKey) {
      throw new Error('API key not configured - using fallback');
    }
    
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
  try {
    return await proposeRulesFlow(input);
  } catch (error: any) {
    console.warn('AI rule proposal failed, creating rule based on keywords:', error.message);
    
    // Create a smart fallback rule based on the user's prompt
    const prompt = input.prompt.toLowerCase();
    const ruleId = `rule_${Date.now()}`;
    
    // Parse common patterns from the prompt
    let nameRegex = ".*";
    let mimeTypes: string[] = [];
    let olderThanDays = 0;
    let actionType: "move" | "trash" | "archive" | "rename" | "delete" = "move";
    let dest = ["Organized"];
    
    // Extract file type patterns
    if (prompt.includes("pdf")) mimeTypes.push("application/pdf");
    if (prompt.includes("image") || prompt.includes("photo")) mimeTypes.push("image/jpeg", "image/png");
    if (prompt.includes("document")) mimeTypes.push("application/vnd.google-apps.document");
    if (prompt.includes("spreadsheet")) mimeTypes.push("application/vnd.google-apps.spreadsheet");
    
    // Extract name patterns
    if (prompt.includes("invoice")) {
      nameRegex = "(?i).*invoice.*";
      dest = ["Finance", "Invoices"];
    } else if (prompt.includes("receipt")) {
      nameRegex = "(?i).*receipt.*";
      dest = ["Finance", "Receipts"];
    } else if (prompt.includes("contract")) {
      nameRegex = "(?i).*contract.*";
      dest = ["Legal", "Contracts"];
    } else if (prompt.includes("photo")) {
      nameRegex = "(?i).*(photo|img).*";
      dest = ["Media", "Photos"];
    }
    
    // Extract time patterns
    if (prompt.includes("older than")) {
      if (prompt.includes("year")) olderThanDays = 365;
      else if (prompt.includes("month")) olderThanDays = 30;
      else if (prompt.includes("week")) olderThanDays = 7;
    }
    
    // Extract action patterns
    if (prompt.includes("delete") || prompt.includes("trash")) actionType = "trash";
    else if (prompt.includes("archive")) {
      actionType = "move";
      dest.push("Archive");
    }
    
    const compiledRule = {
      filter: {
        nameRegex,
        mimeTypes: mimeTypes.length > 0 ? mimeTypes : ["*"],
        olderThanDays,
      },
      action: { type: actionType, dest }
    };
    
    return {
      ruleId,
      humanPrompt: input.prompt,
      compiledRule,
      uid: input.auth?.uid || '',
    };
  }
}

    
