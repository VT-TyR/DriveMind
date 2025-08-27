import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function POST(request: NextRequest) {
  try {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      console.error('Missing OAuth credentials:', { 
        hasClientId: !!clientId, 
        hasClientSecret: !!clientSecret 
      });
      
      return NextResponse.json(
        { error: 'OAuth configuration incomplete. Missing client credentials.' },
        { status: 500 }
      );
    }
    
    // Use the deployed URL for redirect
    const redirectUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/drive/callback`;
    
    console.log('OAuth begin - redirect URI:', redirectUri);
    
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );
    
    // Generate the auth URL
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent', // Force consent to get refresh token
      scope: [
        'https://www.googleapis.com/auth/drive.metadata.readonly',
        'https://www.googleapis.com/auth/drive.readonly'
      ],
      include_granted_scopes: true,
    });
    
    return NextResponse.json({ url: authUrl });
  } catch (error) {
    console.error('OAuth begin error:', error);
    return NextResponse.json(
      { error: 'Failed to start OAuth flow' },
      { status: 500 }
    );
  }
}