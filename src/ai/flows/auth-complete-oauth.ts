'use server';

/**
 * @fileOverview Complete the OAuth flow after user authorization.
 * This exchanges the authorization code for access and refresh tokens.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { getOAuthClient } from '@/lib/google-auth';
import { saveRefreshToken } from '@/lib/google-drive';
import { CompleteOAuthInput, CompleteOAuthInputSchema, CompleteOAuthOutput, CompleteOAuthOutputSchema } from '@/lib/ai-types';

export async function completeOAuth(input: CompleteOAuthInput): Promise<CompleteOAuthOutput> {
  return completeOAuthFlow(input);
}

const completeOAuthFlow = ai.defineFlow(
  {
    name: 'completeOAuthFlow',
    inputSchema: CompleteOAuthInputSchema,
    outputSchema: CompleteOAuthOutputSchema,
  },
  async (input) => {
    try {
      const client = getOAuthClient();
      const { tokens } = await client.getToken(input.code);
      
      // Store the refresh token for future use
      await saveRefreshToken(input.state, tokens.refresh_token);
      
      return {
        ok: true,
        message: 'Google Drive connected successfully!'
      };
    } catch (error) {
      console.error('OAuth completion error:', error);
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Failed to complete OAuth'
      };
    }
  }
);