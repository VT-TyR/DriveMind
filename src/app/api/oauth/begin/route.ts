import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    console.log('API OAuth begin called');
    
    // Get user ID from request body
    const { userId } = await request.json();
    console.log('User ID:', userId);
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }
    
    // Check if OAuth credentials are available
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      console.error("Missing Google OAuth credentials:", { 
        hasClientId: !!clientId, 
        hasClientSecret: !!clientSecret 
      });
      return NextResponse.json({ 
        error: 'OAuth configuration not available. Please check server configuration.' 
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
    
    // Generate the authentication URL
    const url = oauth.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/drive.file'
      ],
      state: userId,
    });
    
    console.log('Generated OAuth URL:', url);
    
    return NextResponse.json({ url });
  } catch (error) {
    console.error('OAuth API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate OAuth URL' }, 
      { status: 500 }
    );
  }
}