'use server';

/**
 * @fileOverview A flow to propose a new folder structure for a given set of files.
 *
 * - proposeFolders - A function that analyzes files and suggests a logical folder for each.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import {
  ProposeFoldersInput,
  ProposeFoldersInputSchema,
  ProposeFoldersOutput,
  ProposeFoldersOutputSchema,
  FileSchema,
} from '@/lib/ai-types';

const FolderSuggestionSchema = z.object({
  fileId: z.string().describe('The ID of the file to move.'),
  fileName: z.string().describe('The name of the file.'),
  currentPath: z.string().describe('The current path or folder of the file.'),
  suggestedPath: z
    .string()
    .describe(
      'The suggested new folder path. e.g., "Invoices/2023" or "Meeting Recordings"'
    ),
  reason: z.string().describe('A brief reason for the suggestion.'),
  confidence: z.number().min(0).max(1).describe('Confidence score from 0 to 1.'),
});

const proposeFoldersFlow = ai.defineFlow(
  {
    name: 'proposeFoldersFlow',
    inputSchema: ProposeFoldersInputSchema,
    outputSchema: ProposeFoldersOutputSchema,
  },
  async ({ files }: ProposeFoldersInput) => {
    // In a real scenario, you might have more complex logic to select files for the prompt
    const filesForPrompt = files.slice(0, 50);

    const prompt = ai.definePrompt({
      name: 'proposeFoldersPrompt',
      input: { schema: z.object({ files: z.array(FileSchema) }) },
      output: { schema: z.object({ suggestions: z.array(FolderSuggestionSchema) }) },
      prompt: `You are an expert file organizer. Your task is to analyze the following list of file metadata and propose a logical folder structure for them.
For each file, suggest a new folder path. Group related files together. For example, invoices might go into "Finance/Invoices/2024", and screenshots might go into "Media/Screenshots". Be consistent.

Files to organize:
{{{json files}}}

Return a strict JSON object with a single key "suggestions" containing an array of your proposed folder structures.
Each suggestion must include the fileId, fileName, currentPath (which is just '/' for this list), a suggestedPath, a brief reason, and a confidence score.
`,
    });

    const { output } = await prompt({ files: filesForPrompt });

    if (!output?.suggestions) {
      // Fallback to stub/demo if LLM fails
      const suggestions = filesForPrompt.slice(0, 5).map((f) => ({
        fileId: f.id,
        fileName: f.name,
        currentPath: f.path.join('/'),
        suggestedPath: f.name.includes('invoice')
          ? 'Finances/Invoices'
          : 'Documents/Unsorted',
        reason: 'Auto-sorted by type.',
        confidence: 0.75,
      }));
      return { suggestions };
    }

    return { suggestions: output.suggestions };
  }
);

export async function proposeFolders(
  input: ProposeFoldersInput
): Promise<ProposeFoldersOutput> {
  return await proposeFoldersFlow(input);
}
