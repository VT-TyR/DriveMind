'use server';

/**
 * @fileOverview Begin the OAuth flow for Google Drive access.
 * This redirects the user to Google's OAuth consent screen.
 * After the user grants permission, Google redirects back to the app.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { getOAuthClient } from '@/lib/google-auth';
import { getAuthenticatedUserSync } from '@/lib/flow-auth';
import { BeginOAuthInput, BeginOAuthInputSchema, BeginOAuthOutput, BeginOAuthOutputSchema } from '@/lib/ai-types';

export async function beginOAuth(input: BeginOAuthInput): Promise<BeginOAuthOutput> {
  return beginOAuthFlow(input);
}

const beginOAuthFlow = ai.defineFlow(
  {
    name: 'beginOAuthFlow',
    inputSchema: BeginOAuthInputSchema,
    outputSchema: BeginOAuthOutputSchema,
  },
  async (input: BeginOAuthInput) => {
    const user = getAuthenticatedUserSync(input.auth);
    
    try {
      const client = getOAuthClient();
      
      const url = client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: [
          'https://www.googleapis.com/auth/drive.readonly',
          'https://www.googleapis.com/auth/drive.file'
        ],
        state: user.uid, // Pass user ID as state
      });
      
      return { url };
    } catch (error) {
      throw new Error('OAuth configuration not available. Please check server configuration.');
    }
  }
);