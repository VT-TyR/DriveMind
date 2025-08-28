import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { cookies } from 'next/headers';
import { saveUserRefreshToken } from '@/lib/token-store';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state'); // user id when provided
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
      expiryDate: tokens.expiry_date,
      hasState: !!state,
    });
    
    // Build redirect response and attach cookies explicitly
    const redirectUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/ai?drive_connected=true`;
    const res = NextResponse.redirect(redirectUrl);

    if (tokens.access_token) {
      res.cookies.set('google_access_token', tokens.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 3600, // 1 hour
        path: '/',
      });
    }

    if (tokens.refresh_token) {
      res.cookies.set('google_refresh_token', tokens.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: '/',
      });
    }

    // Persist refresh token to Firestore so server flows can use it
    if (state && tokens.refresh_token) {
      try {
        await saveUserRefreshToken(state, tokens.refresh_token);
      } catch (e) {
        console.error('Failed to persist refresh token for user', state, e);
      }
    }

    return res;
    
  } catch (error) {
    console.error('OAuth callback processing error:', error);
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/ai?error=oauth_callback_failed`);
  }
}
