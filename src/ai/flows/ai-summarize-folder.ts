'use server';

/**
 * @fileOverview A flow to summarize the contents of a folder based on file metadata.
 *
 * - summarizeFolder - A function that generates a summary for a collection of files.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { 
    SummarizeFolderInput,
    SummarizeFolderInputSchema,
    SummarizeFolderOutput,
    SummarizeFolderOutputSchema
} from '@/lib/ai-types';


const summarizeFolderFlow = ai.defineFlow(
  {
    name: 'summarizeFolderFlow',
    inputSchema: SummarizeFolderInputSchema,
    outputSchema: SummarizeFolderOutputSchema,
  },
  async (input: SummarizeFolderInput) => {
    const filesJson = JSON.stringify(input.files.slice(0, input.limit), null, 2);

    const prompt = ai.definePrompt({
        name: 'summarizeFolderPrompt',
        input: { schema: z.object({ filesJson: z.string() }) },
        output: { schema: z.object({ summary: z.string() }) },
        prompt: `Given the following metadata for up to 200 items in a folder, produce a 2-sentence summary and a 3-bullet recommendation list. Do not suggest deletions, only organization tips.
      
      File Metadata:
      {{{filesJson}}}
      `,
      });

    const { output } = await prompt({ filesJson });

    if (!output?.summary) {
        const fileCount = input.files.length;
        const oldestFile = input.files.reduce((oldest, file) => {
            const fileDate = file.lastModified ? new Date(file.lastModified) : new Date();
            return fileDate < oldest ? fileDate : oldest;
        }, new Date());
        const daysOld = Math.round((Date.now() - oldestFile.getTime()) / (1000 * 60 * 60 * 24));

        return {
            folderId: input.folderId,
            summary: `This folder contains ${fileCount} items. The oldest file is approximately ${daysOld} days old.`
        };
    }
    
    return {
      folderId: input.folderId,
      summary: output.summary,
    };
  }
);


export async function summarizeFolder(input: SummarizeFolderInput): Promise<SummarizeFolderOutput> {
    return await summarizeFolderFlow(input);
}
