
'use server';

/**
 * @fileOverview This file defines the flow for completing the Google Drive OAuth process.
 * It exchanges an authorization code for a refresh token and saves it.
 */

import { ai } from '@/ai/genkit';
import { saveRefreshToken } from '@/lib/google-drive';
import { getOAuthClient } from '@/lib/google-auth';
import { getAuthenticatedUser } from '@/lib/flow-auth';
import { 
    CompleteOAuthInputSchema,
    CompleteOAuthOutputSchema,
    CompleteOAuthInput,
    CompleteOAuthOutput
} from '@/lib/ai-types';


export async function completeOAuth(input: CompleteOAuthInput): Promise<CompleteOAuthOutput> {
  return completeOAuthFlow(input);
}

const completeOAuthFlow = ai.defineFlow(
  {
    name: 'completeOAuthFlow',
    inputSchema: CompleteOAuthInputSchema,
    outputSchema: CompleteOAuthOutputSchema,
  },
  async ({ code, state, auth }) => {
    
    // In a real app, you would validate that `state` matches the user who
    // initiated the flow. The UID is passed in the state parameter.
    const user = getAuthenticatedUser({ uid: state });
    
    const client = getOAuthClient();
    try {
        const { tokens } = await client.getToken(code);
        
        if (!tokens.refresh_token) {
            return {
                ok: false,
                message: "A refresh token was not provided. Please ensure you are forcing the consent screen.",
            }
        }

        // In a real app, these tokens should be encrypted and stored securely in a database.
        await saveRefreshToken(user.uid, tokens.refresh_token);

        return { 
            ok: true,
            message: "Successfully connected to Google Drive and saved credentials."
        };
    } catch(e: any) {
        console.error("Failed to exchange token:", e.message);
        return {
            ok: false,
            message: `Failed to exchange authorization code for token: ${e.message}`,
        }
    }
  }
);
