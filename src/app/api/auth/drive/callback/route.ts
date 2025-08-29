import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { cookies } from 'next/headers';
import { saveUserRefreshToken } from '@/lib/token-store';

// Handle both GET (direct redirects) and POST (from frontend) requests
export async function GET(request: NextRequest) {
  return handleCallback(request, 'GET');
}

export async function POST(request: NextRequest) {
  return handleCallback(request, 'POST');
}

async function handleCallback(request: NextRequest, method: string) {
  console.log(`OAuth callback invoked via ${method}:`, new Date().toISOString());
  try {
    let code: string | null;
    let state: string | null;
    let error: string | null;
    
    if (method === 'POST') {
      // Handle POST request from frontend
      const body = await request.json();
      code = body.code;
      state = body.state;
      error = body.error;
    } else {
      // Handle GET request (direct redirect from Google)
      const { searchParams } = new URL(request.url);
      code = searchParams.get('code');
      state = searchParams.get('state');
      error = searchParams.get('error');
    }
    
    console.log('OAuth callback params:', { hasCode: !!code, hasError: !!error, state });
    
    // Handle OAuth errors
    if (error) {
      console.error('OAuth callback error:', error);
      if (method === 'POST') {
        return NextResponse.json({ error: `oauth_${error}` }, { status: 400 });
      }
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/ai?error=oauth_${error}`);
    }
    
    if (!code) {
      console.error('No authorization code received');
      if (method === 'POST') {
        return NextResponse.json({ error: 'no_auth_code' }, { status: 400 });
      }
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/ai?error=no_auth_code`);
    }
    
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      console.error('Missing OAuth credentials in callback');
      if (method === 'POST') {
        return NextResponse.json({ error: 'oauth_config_missing' }, { status: 500 });
      }
      return NextResponse.redirect(`https://studio--drivemind-q69b7.us-central1.hosted.app/ai?error=oauth_config_missing`);
    }
    
    const redirectUri = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://studio--drivemind-q69b7.us-central1.hosted.app'}/api/auth/drive/callback`;
    
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
    
    // Create appropriate response based on request method
    let res: NextResponse;
    if (method === 'POST') {
      // For POST requests, return JSON response
      res = NextResponse.json({ success: true, message: 'Drive connected successfully' });
    } else {
      // For GET requests, redirect to AI page with success parameter
      const redirectUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/ai?drive_connected=true`;
      res = NextResponse.redirect(redirectUrl);
    }

    // Set cookies for both request types
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
        // Don't let Firestore errors break the OAuth flow
      }
    }

    return res;
    
  } catch (error: any) {
    console.error('OAuth callback processing error:', {
      error: error?.message,
      stack: error?.stack,
      name: error?.name,
      code: error?.code || 'unknown',
      timestamp: new Date().toISOString(),
      // Additional debugging info
      response: error?.response?.data,
      status: error?.response?.status,
      fullError: JSON.stringify(error, null, 2)
    });
    
    // More specific error handling
    let errorType = 'oauth_callback_failed';
    let errorDetails = '';
    
    if (error?.message?.includes('invalid_client')) {
      errorType = 'invalid_client_credentials';
      errorDetails = 'Client ID or secret mismatch with Google Console';
    } else if (error?.message?.includes('invalid_grant')) {
      errorType = 'invalid_authorization_code';
      errorDetails = 'Authorization code expired or invalid';
    } else if (error?.message?.includes('redirect_uri_mismatch')) {
      errorType = 'redirect_uri_mismatch';
      errorDetails = 'Redirect URI does not match Google Console configuration';
    } else {
      errorDetails = error?.message || 'Unknown OAuth error';
    }
    
    console.error(`OAuth Error Details: ${errorType} - ${errorDetails}`);
    
    if (method === 'POST') {
      return NextResponse.json({ error: errorType, details: errorDetails }, { status: 500 });
    }
    return NextResponse.redirect(`https://studio--drivemind-q69b7.us-central1.hosted.app/ai?error=${errorType}&details=${encodeURIComponent(errorDetails)}`);
  }
}
