
'use server';

/**
 * @fileOverview This file defines a Genkit flow for proposing cleanup actions (delete, move, archive) for files, using AI to suggest safe and smart recommendations.
 *
 * @exports `proposeCleanupActions` - A function that takes a file description and proposes cleanup actions.
 */

import {ai} from '@/ai/genkit';
import { 
    ProposeCleanupActionsInput,
    ProposeCleanupActionsInputSchema,
    ProposeCleanupActionsOutput,
    ProposeCleanupActionsOutputSchema,
} from '@/lib/ai-types';


export async function proposeCleanupActions(input: ProposeCleanupActionsInput): Promise<ProposeCleanupActionsOutput> {
  return proposeCleanupActionsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'proposeCleanupActionsPrompt',
  input: {schema: ProposeCleanupActionsInputSchema},
  output: {schema: ProposeCleanupActionsOutputSchema},
  prompt: `You are an AI assistant that analyzes file descriptions and suggests cleanup actions.

  Based on the provided file description, suggest one of the following actions:
  - trash: If the file is clearly redundant, outdated, or of no value (e.g. temporary file, old draft). This is a soft-delete.
  - move: If the file should be moved to a different folder for better organization (provide a suggested folder).
  - archive: If the file is no longer actively used but might be needed for future reference (e.g. completed project).
  - no_action: If the file appears to be actively used or no clear action is appropriate.

  Provide a confidence score (0 to 1) indicating how sure you are about the suggested action.
  Explain your reasoning for the suggested action in a concise sentence.

  File Description: {{{fileDescription}}}
  `,config: {
    safetySettings: [
      {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: 'BLOCK_ONLY_HIGH',
      },
    ],
  },
});

const proposeCleanupActionsFlow = ai.defineFlow(
  {
    name: 'proposeCleanupActionsFlow',
    inputSchema: ProposeCleanupActionsInputSchema,
    outputSchema: ProposeCleanupActionsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
