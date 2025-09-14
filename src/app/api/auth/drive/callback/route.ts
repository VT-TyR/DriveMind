import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { cookies } from 'next/headers';
import { saveUserRefreshToken } from '@/lib/token-store';
import { rateLimiters } from '@/lib/security/rate-limiter';
import { securityMiddleware, sanitizeInput } from '@/lib/security/middleware';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

// Schema for callback validation
const CallbackSchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});

// Handle both GET (direct redirects) and POST (from frontend) requests
export async function GET(request: NextRequest) {
  return rateLimiters.auth(request, async (req) => {
    return securityMiddleware(req, async (req) => {
      return handleCallback(req, 'GET');
    });
  });
}

export async function POST(request: NextRequest) {
  return rateLimiters.auth(request, async (req) => {
    return securityMiddleware(req, async (req) => {
      return handleCallback(req, 'POST');
    });
  });
}

async function handleCallback(request: NextRequest, method: string) {
  const requestId = crypto.randomUUID();
  logger.info(`OAuth callback via ${method}`, { requestId });
  
  try {
    let code: string | null;
    let state: string | null;
    let error: string | null;
    
    if (method === 'POST') {
      // Handle POST request from frontend
      const body = await request.json();
      const parsed = CallbackSchema.safeParse(body);
      
      if (!parsed.success) {
        logger.warn('Invalid callback parameters', { requestId });
        return NextResponse.json(
          { error: 'Invalid request parameters' },
          { status: 400 }
        );
      }
      
      code = parsed.data.code || null;
      state = parsed.data.state || null;
      error = parsed.data.error || null;
    } else {
      // Handle GET request (direct redirect from Google)
      const { searchParams } = new URL(request.url);
      code = searchParams.get('code');
      state = searchParams.get('state');
      error = searchParams.get('error');
    }
    
    // Validate and decode state parameter
    let userId: string | undefined;
    if (state) {
      try {
        const decoded = JSON.parse(Buffer.from(state, 'base64').toString());
        // Validate state freshness (5 minute window)
        if (decoded.timestamp && Date.now() - decoded.timestamp > 300000) {
          logger.warn('Expired state parameter', { requestId });
          if (method === 'POST') {
            return NextResponse.json({ error: 'expired_state' }, { status: 400 });
          }
          return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/ai?error=expired_state`);
        }
        userId = decoded.userId;
      } catch (e) {
        // Legacy state format (just userId)
        userId = state;
      }
    }
    
    logger.info('OAuth callback parameters', {
      requestId,
      hasCode: !!code,
      hasError: !!error,
      hasUserId: !!userId,
    });
    
    // Handle OAuth errors
    if (error) {
      logger.error('OAuth error received', { requestId, error });
      const sanitizedError = sanitizeInput(error) as string;
      if (method === 'POST') {
        return NextResponse.json({ error: `oauth_${sanitizedError}` }, { status: 400 });
      }
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/ai?error=oauth_${sanitizedError}`);
    }
    
    if (!code) {
      logger.error('No authorization code received', { requestId });
      if (method === 'POST') {
        return NextResponse.json({ error: 'no_auth_code' }, { status: 400 });
      }
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/ai?error=no_auth_code`);
    }
    
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
    
    if (!clientId || !clientSecret) {
      logger.error('OAuth configuration incomplete', { requestId });
      if (method === 'POST') {
        return NextResponse.json({ error: 'service_configuration_error' }, { status: 500 });
      }
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/ai?error=service_configuration_error`);
    }
    
    const redirectUri = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://studio--drivemind-q69b7.us-central1.hosted.app'}/api/auth/drive/callback`;
    
    // Log without exposing sensitive credentials
    logger.debug('OAuth credential validation', {
      requestId,
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      redirectUri: redirectUri.replace(/https?:\/\/[^\/]+/, '[REDACTED]'),
    });
    
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );
    
    logger.info('Attempting token exchange', { requestId });
    
    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    
    logger.info('Tokens received successfully', {
      requestId,
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiryDate: tokens.expiry_date,
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
    if (tokens.refresh_token && userId) {
      try {
        await saveUserRefreshToken(userId, tokens.refresh_token);
        // Hash userId for logging
        const hashedUserId = crypto.createHash('sha256').update(userId).digest('hex').substring(0, 8);
        logger.info('Refresh token persisted', { requestId, userHash: hashedUserId });
      } catch (e) {
        logger.error('Failed to persist refresh token', {
          requestId,
          error: e instanceof Error ? e.message : 'Unknown error',
        });
        // Don't let Firestore errors break the OAuth flow
      }
    } else if (!userId) {
      logger.info('No userId available - token saved in cookies only', { requestId });
    }

    return res;
    
  } catch (error: any) {
    // Log error securely without exposing sensitive information
    const errorMessage = error?.message || 'Unknown error';
    logger.error('OAuth callback failed', {
      requestId,
      error: errorMessage,
      code: error?.code || 'unknown',
    });
    
    // Map error to user-friendly message
    let errorType = 'authentication_failed';
    
    if (errorMessage.includes('invalid_client')) {
      errorType = 'configuration_error';
    } else if (errorMessage.includes('invalid_grant')) {
      errorType = 'expired_authorization';
    } else if (errorMessage.includes('redirect_uri_mismatch')) {
      errorType = 'configuration_error';
    }
    
    if (method === 'POST') {
      return NextResponse.json({ error: errorType }, { status: 500 });
    }
    
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://studio--drivemind-q69b7.us-central1.hosted.app';
    return NextResponse.redirect(`${baseUrl}/ai?error=${errorType}`);
  }
}
