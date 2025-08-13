'use server';

/**
 * @fileOverview A flow to score files in Google Drive based on their relevance as 'vault candidates'.
 *
 * - vaultCandidateScoring - A function that analyzes files and scores them based on their relevance as 'vault candidates'.
 */

import {ai} from '@/ai/genkit';
import { 
    VaultCandidateScoringInput,
    VaultCandidateScoringInputSchema,
    VaultCandidateScoringOutput,
    VaultCandidateScoringOutputSchema
} from '@/lib/ai-types';

export async function vaultCandidateScoring(
  input: VaultCandidateScoringInput
): Promise<VaultCandidateScoringOutput> {
  return vaultCandidateScoringFlow(input);
}

const prompt = ai.definePrompt({
  name: 'vaultCandidateScoringPrompt',
  input: {schema: VaultCandidateScoringInputSchema},
  output: {schema: VaultCandidateScoringOutputSchema},
  prompt: `You are an AI assistant that scores files based on their relevance as vault candidates.

You will receive a file description and scoring criteria, and you will output a score and reasoning.

File Description: {{{fileDescription}}}
Scoring Criteria: {{{scoringCriteria}}}

Score (0-100): The score of the file as a vault candidate.
Reasoning: The reasoning behind the score assigned to the file.`,
});

const vaultCandidateScoringFlow = ai.defineFlow(
  {
    name: 'vaultCandidateScoringFlow',
    inputSchema: VaultCandidateScoringInputSchema,
    outputSchema: VaultCandidateScoringOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
