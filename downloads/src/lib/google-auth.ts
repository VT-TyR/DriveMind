
import { google } from 'googleapis';

/**
 * Creates and a Google OAuth2 client.
 * In a production environment, you would fetch the client ID, secret, and
 * redirect URI from a secure location (like Secret Manager), not from

 * environment variables.
 */
export function getOAuthClient() {
    // These should be securely managed in a real application.
    // For this demonstration, we pull from environment variables
    // which are set by the hosting environment.
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
        throw new Error("Missing Google OAuth credentials. Ensure GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET are set in your environment.");
    }
    
    // IMPORTANT: For this to work, you MUST add 'http://localhost:3000' to your
    // "Authorized redirect URIs" in the Google Cloud Console for your OAuth Client ID.
    const redirectUrl = 'http://localhost:3000/ai';


    return new google.auth.OAuth2(
        clientId,
        clientSecret,
        redirectUrl
    );
}
