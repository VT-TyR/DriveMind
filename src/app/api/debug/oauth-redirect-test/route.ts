import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function GET() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    return NextResponse.json({
      error: 'Missing OAuth credentials',
    });
  }

  const baseUrl = 'https://studio--drivemind-q69b7.us-central1.hosted.app';
  
  // Test different possible redirect URIs
  const testRedirectUris = [
    `${baseUrl}/ai`,
    `${baseUrl}/api/auth/drive/callback`,
    `${baseUrl}/ai/callback`,
    `${baseUrl}/callback`,
    `${baseUrl}/oauth/callback`,
  ];

  const results: any[] = [];

  for (const redirectUri of testRedirectUris) {
    try {
      const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
      
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: ['https://www.googleapis.com/auth/drive.read'],
        state: 'test',
      });

      results.push({
        redirectUri,
        status: 'success',
        authUrl: authUrl.substring(0, 150) + '...',  // Truncate for readability
        testUrl: `${authUrl}&redirect_uri=${encodeURIComponent(redirectUri)}`
      });
    } catch (error: any) {
      results.push({
        redirectUri,
        status: 'error',
        error: error.message
      });
    }
  }

  return NextResponse.json({
    message: 'OAuth Redirect URI Test Results',
    clientIdLength: clientId.length,
    results,
    instructions: [
      '1. Try each testUrl in a browser',
      '2. The one that does NOT show "redirect_uri_mismatch" error is correct',
      '3. If all show redirect_uri_mismatch, check Google Console configuration',
    ],
    timestamp: new Date().toISOString()
  });
}