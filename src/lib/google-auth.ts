
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
        console.error("Missing Google OAuth credentials:", { 
            hasClientId: !!clientId, 
            hasClientSecret: !!clientSecret 
        });
        throw new Error("Missing Google OAuth credentials. Ensure GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET are set in your environment.");
    }
    
    // Determine redirect URL based on environment - this runs server-side only
    const isDevelopment = process.env.NODE_ENV === 'development';
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
                   (isDevelopment ? 'http://localhost:3000' : 'https://studio--drivemind-q69b7.us-central1.hosted.app');
    
    const redirectUrl = `${baseUrl}/ai`;
    
    // Debug logging (server-side only)
    console.log('OAuth Debug (Server):', {
        NODE_ENV: process.env.NODE_ENV,
        NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
        isDevelopment,
        baseUrl,
        redirectUrl,
        clientIdLength: clientId.length,
        secretLength: clientSecret.length
    });

    return new google.auth.OAuth2(
        clientId,
        clientSecret,
        redirectUrl
    );
}
