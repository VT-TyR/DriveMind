import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    console.log('API OAuth complete called');
    
    // Get code and state from request body
    const { code, state } = await request.json();
    console.log('OAuth complete params:', { hasCode: !!code, state });
    
    if (!code || !state) {
      return NextResponse.json({ error: 'Missing code or state' }, { status: 400 });
    }
    
    // Use the DriveMind OAuth client for Drive access
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || '687330755440-1ebgu9smaba5fkhgplqdard2nuaofnt6.apps.googleusercontent.com';
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    
    console.log('Environment check:', {
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      nodeEnv: process.env.NODE_ENV
    });
    
    if (!clientSecret) {
      console.error("Missing Google OAuth client secret in environment");
      return NextResponse.json({ 
        error: 'OAuth configuration incomplete. Missing client secret.' 
      }, { status: 500 });
    }
    
    // Import google auth here to avoid issues
    const { google } = await import('googleapis');
    
    // Determine redirect URL
    const isDevelopment = process.env.NODE_ENV === 'development';
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
                   (isDevelopment ? 'http://localhost:3000' : 'https://studio--drivemind-q69b7.us-central1.hosted.app');
    
    const redirectUrl = `${baseUrl}/ai`;
    
    // Create OAuth client
    const oauth = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUrl
    );
    
    // Exchange code for tokens
    const { tokens } = await oauth.getToken(code);
    console.log('OAuth tokens received:', { 
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token 
    });
    
    // TODO: Store refresh token for the user (state = user ID)
    // For now, we'll just return success
    
    return NextResponse.json({
      ok: true,
      message: 'Google Drive connected successfully!'
    });
    
  } catch (error) {
    console.error('OAuth complete error:', error);
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to complete OAuth'
      }, 
      { status: 500 }
    );
  }
}