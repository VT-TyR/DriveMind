
'use server';

/**
 * @fileOverview A test flow to list a few sample files from the user's Google Drive
 * to confirm that the OAuth flow was successful.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { driveFor } from '@/lib/google-drive';
import { FlowAuth, getAuthenticatedUserSync } from '@/lib/flow-auth';
import { ListSampleFilesOutput, ListSampleFilesOutputSchema, ListSampleFilesInputSchema, ListSampleFilesInput } from '@/lib/ai-types';

export async function listSampleFiles(input: ListSampleFilesInput): Promise<ListSampleFilesOutput> {
  return listSampleFilesFlow(input);
}

const listSampleFilesFlow = ai.defineFlow(
  {
    name: 'listSampleFilesFlow',
    inputSchema: ListSampleFilesInputSchema,
    outputSchema: ListSampleFilesOutputSchema,
  },
  async (input: ListSampleFilesInput) => {
    const user = getAuthenticatedUserSync(input.auth);
    const drive = await driveFor(user.uid);
    const resp = await drive.files.list({
      pageSize: 10,
      q: 'trashed = false',
      fields: 'files(id,name,mimeType,size,modifiedTime)',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });
    
    const files = resp.data.files || [];
    // Filter out any files that might be missing critical data to conform to the schema.
    const validFiles = files
        .filter(f => f.id && f.name)
        .map(f => ({
            id: f.id!,
            name: f.name!,
            mimeType: f.mimeType,
            size: f.size,
            modifiedTime: f.modifiedTime,
        }));

    return { files: validFiles };
  }
);

    
