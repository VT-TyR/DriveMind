import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');
    
    // Handle OAuth errors
    if (error) {
      console.error('OAuth callback error:', error);
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/ai?error=oauth_${error}`);
    }
    
    if (!code) {
      console.error('No authorization code received');
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/ai?error=no_auth_code`);
    }
    
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      console.error('Missing OAuth credentials in callback');
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/ai?error=oauth_config_missing`);
    }
    
    const redirectUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/drive/callback`;
    
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );
    
    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    
    console.log('OAuth callback - tokens received:', {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiryDate: tokens.expiry_date
    });
    
    // Store tokens in httpOnly cookies (more secure than localStorage)
    const cookieStore = cookies();
    
    if (tokens.access_token) {
      cookieStore.set('google_access_token', tokens.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 3600 // 1 hour
      });
    }
    
    if (tokens.refresh_token) {
      cookieStore.set('google_refresh_token', tokens.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 24 * 30 // 30 days
      });
    }
    
    // Redirect to success page
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/ai?drive_connected=true`);
    
  } catch (error) {
    console.error('OAuth callback processing error:', error);
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/ai?error=oauth_callback_failed`);
  }
}