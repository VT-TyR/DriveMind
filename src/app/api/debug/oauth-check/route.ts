import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function GET() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    return NextResponse.json({
      error: 'Missing credentials',
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      envCheck: {
        GOOGLE_OAUTH_CLIENT_ID: clientId ? `${clientId.substring(0, 10)}...` : 'missing',
        GOOGLE_OAUTH_CLIENT_SECRET: clientSecret ? `${clientSecret.substring(0, 10)}...` : 'missing'
      }
    });
  }

  // Test with both redirect URIs to see which one works
  const redirectUris = [
    'https://studio--drivemind-q69b7.us-central1.hosted.app/ai',
    'https://studio--drivemind-q69b7.us-central1.hosted.app/api/auth/drive/callback'
  ];
  
  const results = [];
  
  for (const redirectUri of redirectUris) {
    try {
      const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
      
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: ['https://www.googleapis.com/auth/drive'],
        state: 'oauth-check-test',
      });

      results.push({
        redirectUri,
        status: 'success',
        authUrlGenerated: !!authUrl,
        authUrlLength: authUrl.length
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
    status: 'OAuth configuration check',
    credentials: {
      clientIdLength: clientId.length,
      clientSecretLength: clientSecret.length,
      clientIdPrefix: clientId.substring(0, 15) + '...'
    },
    redirectUriTests: results,
    timestamp: new Date().toISOString()
  });
}