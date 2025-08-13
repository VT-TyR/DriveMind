'use server';

/**
 * @fileOverview A flow to detect near-duplicate files using hashing and fuzzy matching.
 *
 * - detectNearDuplicateFiles - A function that analyzes files and identifies near-duplicates.
 * - DetectNearDuplicateFilesInput - The input type for the detectNearDuplicateFiles function.
 * - DetectNearDuplicateFilesOutput - The return type for the detectNearDuplicateFiles function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const DetectNearDuplicateFilesInputSchema = z.object({
  fileMetadatas: z.array(z.object({
    name: z.string(),
    size: z.number(),
    hash: z.string().optional(),
  })).describe('An array of file metadata to check for near-duplicates.'),
});
export type DetectNearDuplicateFilesInput = z.infer<typeof DetectNearDuplicateFilesInputSchema>;

const DetectNearDuplicateFilesOutputSchema = z.object({
  nearDuplicateGroups: z.array(z.array(z.string())).describe('Groups of file names that are near-duplicates.'),
});
export type DetectNearDuplicateFilesOutput = z.infer<typeof DetectNearDuplicateFilesOutputSchema>;

export async function detectNearDuplicateFiles(
  input: DetectNearDuplicateFilesInput
): Promise<DetectNearDuplicateFilesOutput> {
  return detectNearDuplicateFilesFlow(input);
}

const prompt = ai.definePrompt({
  name: 'detectNearDuplicateFilesPrompt',
  input: {schema: DetectNearDuplicateFilesInputSchema},
  output: {schema: DetectNearDuplicateFilesOutputSchema},
  prompt: `You are an AI assistant that detects near-duplicate files.

You will receive a list of file metadata. Identify groups of files that are near-duplicates based on a combination of file name similarity (fuzzy matching), and size. Exact hash matches should also be considered duplicates.

Return groups of file names that are considered near-duplicates.

File Metadatas:
{{#each fileMetadatas}}
- Name: {{name}}, Size: {{size}}{{#if hash}}, Hash: {{hash}}{{/if}}
{{/each}}
`,
});

const detectNearDuplicateFilesFlow = ai.defineFlow(
  {
    name: 'detectNearDuplicateFilesFlow',
    inputSchema: DetectNearDuplicateFilesInputSchema,
    outputSchema: DetectNearDuplicateFilesOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
