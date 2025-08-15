
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
    
    // Determine redirect URL based on environment
    // Check multiple conditions to ensure we're truly in development
    const isDevelopment = process.env.NODE_ENV === 'development' || 
                         process.env.VERCEL_ENV === 'development' ||
                         !process.env.NODE_ENV; // fallback for undefined NODE_ENV
    
    // Use base URL from environment if available, otherwise determine from NODE_ENV
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
                   (isDevelopment ? 'http://localhost:3000' : 'https://studio--drivemind-q69b7.us-central1.hosted.app');
    
    const redirectUrl = baseUrl;
    
    // Debug logging
    console.log('OAuth Debug:', {
        NODE_ENV: process.env.NODE_ENV,
        NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
        isDevelopment,
        baseUrl,
        redirectUrl
    });

    return new google.auth.OAuth2(
        clientId,
        clientSecret,
        redirectUrl
    );
}
