import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function GET() {
  try {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      return NextResponse.json({
        error: 'Missing OAuth credentials',
        hasClientId: !!clientId,
        hasClientSecret: !!clientSecret
      });
    }
    
    const redirectUri = 'https://studio--drivemind-q69b7.us-central1.hosted.app/api/auth/drive/callback';
    
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );
    
    // Test generating auth URL - this will validate client credentials without requiring user interaction
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/drive.read'
      ],
      include_granted_scopes: true,
      state: 'debug-test',
    });
    
    return NextResponse.json({
      status: 'OAuth credentials valid',
      clientIdLength: clientId.length,
      redirectUri: redirectUri,
      authUrl: authUrl,
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    return NextResponse.json({
      error: 'OAuth test failed',
      message: error?.message,
      stack: error?.stack?.split('\n').slice(0, 3) // First 3 lines only
    });
  }
}