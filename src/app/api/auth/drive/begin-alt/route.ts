import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

// Alternative begin endpoint that uses /ai/callback as redirect URI
// This is for testing if Google Console is configured with /ai/callback
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({} as any));
    const userId: string | undefined = body?.userId;

    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      console.error('Missing OAuth credentials in begin-alt:', { 
        hasClientId: !!clientId, 
        hasClientSecret: !!clientSecret 
      });
      
      return NextResponse.json(
        { error: 'OAuth configuration incomplete. Missing client credentials.' },
        { status: 500 }
      );
    }
    
    // Use /ai/callback as redirect URI instead of /api/auth/drive/callback
    const redirectUri = `${process.env.NEXT_PUBLIC_BASE_URL}/ai/callback`;
    
    console.log('OAuth begin-alt - redirect URI:', redirectUri, 'state set:', !!userId);
    
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
      // Pass state so callback can associate token with a userId when available
      state: userId || undefined,
    });

    return NextResponse.json({ 
      url: authUrl,
      redirectUri: redirectUri,
      note: 'Using /ai/callback as redirect URI'
    });
  } catch (error) {
    console.error('OAuth begin-alt error:', error);
    return NextResponse.json(
      { error: 'Failed to start OAuth flow with alternative redirect URI' },
      { status: 500 }
    );
  }
}