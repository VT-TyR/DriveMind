import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { testCode } = body;
    
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      return NextResponse.json({
        error: 'Missing credentials',
        hasClientId: !!clientId,
        hasClientSecret: !!clientSecret,
        clientIdLength: clientId?.length || 0
      }, { status: 500 });
    }
    
    // Test token exchange with the provided code
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      'https://studio--drivemind-q69b7.us-central1.hosted.app/ai' // Use /ai as redirect URI
    );
    
    console.log('Testing token exchange with redirect URI: /ai');
    
    try {
      const { tokens } = await oauth2Client.getToken(testCode);
      
      return NextResponse.json({
        success: true,
        message: 'Token exchange successful!',
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        tokenType: tokens.token_type
      });
      
    } catch (tokenError: any) {
      console.error('Token exchange failed:', tokenError.message);
      
      return NextResponse.json({
        error: 'Token exchange failed',
        message: tokenError.message,
        code: tokenError.code,
        details: tokenError.response?.data || tokenError.details || 'Unknown error',
        redirectUriUsed: 'https://studio--drivemind-q69b7.us-central1.hosted.app/ai'
      }, { status: 400 });
    }
    
  } catch (error: any) {
    return NextResponse.json({
      error: 'Request failed',
      message: error.message
    }, { status: 500 });
  }
}