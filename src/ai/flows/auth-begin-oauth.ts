
'use server';

/**
 * @fileOverview This file defines the flow for starting the Google Drive OAuth process.
 * It returns a consent URL for the user to authorize the application.
 */

import { ai } from '@/ai/genkit';
import { WRITE_SCOPES, saveRefreshToken } from '@/lib/google-drive';
import { z } from 'zod';
import { FlowAuth, getAuthenticatedUserSync } from '@/lib/flow-auth';
import { 
    BeginOAuthInputSchema,
    BeginOAuthOutputSchema,
    BeginOAuthInput
} from '@/lib/ai-types';
import { getOAuthClient } from '@/lib/google-auth';


export async function beginOAuth(input: BeginOAuthInput) {
  return beginOAuthFlow(input);
}

const beginOAuthFlow = ai.defineFlow(
  {
    name: 'beginOAuthFlow',
    inputSchema: BeginOAuthInputSchema,
    outputSchema: BeginOAuthOutputSchema,
  },
  async (input) => {
    try {
      console.log('beginOAuth input:', input);
      
      const user = getAuthenticatedUserSync(input.auth);
      console.log('User authenticated:', user.uid);
      
      // Create a new OAuth2 client with the correct redirect URI for this specific request.
      const client = getOAuthClient();
      console.log('OAuth client created successfully');

      // Generate the authentication URL. The user will be redirected to this URL
      // to grant consent. After consent, Google redirects to our callback handler
      // with an authorization code, which is then exchanged for tokens.
      const url = client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent', // Force consent screen to get a refresh token every time.
        scope: WRITE_SCOPES,
        state: user.uid, // Tie the callback to this user
      });
      
      console.log('Generated OAuth URL:', url);
      return { url };
    } catch (error) {
      console.error('OAuth flow error:', error);
      throw error;
    }
  }
);
