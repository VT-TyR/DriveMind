
import { google } from 'googleapis';
import * as dotenv from 'dotenv';
import * as path from 'path';

if (process.env.NODE_ENV === 'development') {
  dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
}

/**
 * Creates and a Google OAuth2 client.
 * In a production environment, you would fetch the client ID, secret, and
 * redirect URI from a secure location (like Secret Manager), not from

 * environment variables.
 */
export function getOAuthClient() {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

    if (!clientId || !clientSecret || !baseUrl) {
        console.error("Missing Google OAuth credentials or base URL:", {
            hasClientId: !!clientId,
            hasClientSecret: !!clientSecret,
            hasBaseUrl: !!baseUrl,
            timestamp: new Date().toISOString()
        });
        throw new Error("Missing Google OAuth credentials or base URL. Ensure GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and NEXT_PUBLIC_BASE_URL are set in your environment.");
    }

    const redirectUrl = `${baseUrl}/api/auth/drive/callback`;

    return new google.auth.OAuth2(
        clientId,
        clientSecret,
        redirectUrl
    );
}
