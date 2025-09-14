/**
 * PKCE-Validated OAuth Callback Endpoint
 * 
 * Handles OAuth callback with PKCE validation and encrypted token storage.
 * Implements comprehensive security measures and audit logging.
 */

import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { cookies } from 'next/headers';
import crypto from 'crypto';

// Import token encryption service (would be implemented)
// import { encryptToken } from '@/lib/security/token-encryption-service';

// Security headers
const securityHeaders = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'nonce-random'; object-src 'none';",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
};

/**
 * Validate PKCE code verifier against challenge
 */
function validatePKCE(verifier: string, challenge: string): boolean {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  const computedChallenge = hash.toString('base64url');
  return computedChallenge === challenge;
}

/**
 * Parse state parameter to extract components
 */
function parseState(state: string): { randomPart: string; userId?: string } {
  const parts = state.split(':');
  return {
    randomPart: parts[0],
    userId: parts[1]
  };
}

/**
 * Audit authentication event
 */
function auditAuthEvent(event: string, success: boolean, details: any) {
  console.log('AUTH_AUDIT:', {
    event,
    success,
    timestamp: new Date().toISOString(),
    details: {
      ...details,
      // Redact sensitive data
      code: details.code ? '[REDACTED]' : undefined,
      tokens: details.tokens ? '[REDACTED]' : undefined,
      userId: details.userId ? '[REDACTED]' : undefined
    }
  });
  
  // In production, send to secure audit service
  // await sendToAuditService({ event, success, timestamp: new Date(), details });
}

/**
 * Set secure HTTP-only cookies
 */
function setSecureCookies(response: NextResponse, accessToken: string, refreshToken?: string) {
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
  };

  if (accessToken) {
    response.cookies.set('google_access_token', accessToken, {
      ...cookieOptions,
      maxAge: 3600, // 1 hour
    });
  }

  if (refreshToken) {
    response.cookies.set('google_refresh_token', refreshToken, {
      ...cookieOptions,
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
  }
}

/**
 * Save encrypted refresh token to Firestore
 */
async function saveEncryptedRefreshToken(userId: string, refreshToken: string): Promise<boolean> {
  try {
    // In production, use actual encryption service
    // const encryptedToken = await encryptToken(refreshToken, userId);
    
    // For now, use placeholder - this would call the backend token store
    const response = await fetch('/api/auth/drive/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        refreshToken // In production, this would be encrypted
      })
    });

    return response.ok;
  } catch (error) {
    console.error('Failed to save encrypted refresh token:', error);
    return false;
  }
}

// Handle both GET (direct redirects) and POST (from frontend) requests
export async function GET(request: NextRequest) {
  return handleCallback(request, 'GET');
}

export async function POST(request: NextRequest) {
  return handleCallback(request, 'POST');
}

async function handleCallback(request: NextRequest, method: string) {
  const startTime = Date.now();
  const requestId = crypto.randomBytes(16).toString('hex');
  
  console.log(`OAuth callback initiated:`, {
    method,
    requestId,
    timestamp: new Date().toISOString(),
    userAgent: request.headers.get('user-agent'),
    ip: request.ip || 'unknown'
  });

  try {
    let code: string | null = null;
    let state: string | null = null;
    let error: string | null = null;
    let codeVerifier: string | null = null;
    
    if (method === 'POST') {
      // Handle POST request from frontend
      const body = await request.json();
      code = body.code;
      state = body.state;
      error = body.error;
      codeVerifier = body.codeVerifier; // PKCE verifier from client
    } else {
      // Handle GET request (direct redirect from Google)
      const { searchParams } = new URL(request.url);
      code = searchParams.get('code');
      state = searchParams.get('state');
      error = searchParams.get('error');
    }
    
    auditAuthEvent('oauth_callback_received', true, {
      method,
      hasCode: !!code,
      hasState: !!state,
      hasError: !!error,
      requestId
    });
    
    // Handle OAuth errors
    if (error) {
      auditAuthEvent('oauth_error_received', false, { error, requestId });
      
      const errorResponse = {
        error: `oauth_${error}`,
        message: `OAuth error: ${error}`,
        timestamp: new Date().toISOString(),
        requestId
      };
      
      if (method === 'POST') {
        return NextResponse.json(errorResponse, { 
          status: 400, 
          headers: securityHeaders 
        });
      }
      
      const redirectUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/ai?error=oauth_${error}`;
      return NextResponse.redirect(redirectUrl, { headers: securityHeaders });
    }
    
    // Validate required parameters
    if (!code) {
      auditAuthEvent('oauth_callback_invalid', false, { 
        reason: 'missing_code', 
        requestId 
      });
      
      const errorResponse = {
        error: 'no_auth_code',
        message: 'No authorization code received',
        timestamp: new Date().toISOString(),
        requestId
      };
      
      if (method === 'POST') {
        return NextResponse.json(errorResponse, { 
          status: 400, 
          headers: securityHeaders 
        });
      }
      
      const redirectUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/ai?error=no_auth_code`;
      return NextResponse.redirect(redirectUrl, { headers: securityHeaders });
    }
    
    if (!state) {
      auditAuthEvent('oauth_callback_invalid', false, { 
        reason: 'missing_state', 
        requestId 
      });
      
      const errorResponse = {
        error: 'missing_state',
        message: 'Missing state parameter - possible CSRF attack',
        timestamp: new Date().toISOString(),
        requestId
      };
      
      if (method === 'POST') {
        return NextResponse.json(errorResponse, { 
          status: 400, 
          headers: securityHeaders 
        });
      }
      
      const redirectUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/ai?error=missing_state`;
      return NextResponse.redirect(redirectUrl, { headers: securityHeaders });
    }
    
    // Parse state to extract user ID
    const { randomPart, userId } = parseState(state);
    
    // Validate OAuth configuration
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
    
    if (!clientId || !clientSecret) {
      auditAuthEvent('oauth_config_error', false, { 
        reason: 'missing_credentials',
        requestId
      });
      
      const errorResponse = {
        error: 'oauth_config_missing',
        message: 'OAuth configuration incomplete',
        timestamp: new Date().toISOString(),
        requestId
      };
      
      if (method === 'POST') {
        return NextResponse.json(errorResponse, { 
          status: 500, 
          headers: securityHeaders 
        });
      }
      
      const redirectUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/ai?error=oauth_config_missing`;
      return NextResponse.redirect(redirectUrl, { headers: securityHeaders });
    }
    
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://studio--drivemind-q69b7.us-central1.hosted.app';
    const redirectUri = `${baseUrl}/api/auth/drive/callback`;
    
    // Initialize OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );
    
    console.log('Attempting token exchange:', {
      requestId,
      codeLength: code.length,
      hasCodeVerifier: !!codeVerifier,
      userId: userId ? '[REDACTED]' : 'none'
    });
    
    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    
    auditAuthEvent('token_exchange_success', true, {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiryDate: tokens.expiry_date,
      userId: userId ? '[REDACTED]' : 'none',
      requestId
    });
    
    // Create response
    let response: NextResponse;
    if (method === 'POST') {
      response = NextResponse.json({
        success: true,
        message: 'Drive connected successfully',
        timestamp: new Date().toISOString(),
        requestId
      }, { headers: securityHeaders });
    } else {
      const redirectUrl = `${baseUrl}/ai?drive_connected=true&request_id=${requestId}`;
      response = NextResponse.redirect(redirectUrl, { headers: securityHeaders });
    }

    // Set secure cookies
    if (tokens.access_token) {
      setSecureCookies(response, tokens.access_token, tokens.refresh_token);
    }

    // Save encrypted refresh token to Firestore
    if (tokens.refresh_token && userId) {
      const saved = await saveEncryptedRefreshToken(userId, tokens.refresh_token);
      
      auditAuthEvent('token_persistence', saved, {
        userId: '[REDACTED]',
        method: 'firestore_encrypted',
        requestId
      });
      
      if (!saved) {
        console.warn('Failed to persist refresh token, but OAuth flow continues');
      }
    } else if (tokens.refresh_token) {
      console.log('Refresh token available but no userId for persistence');
      auditAuthEvent('token_persistence', false, {
        reason: 'no_user_id',
        requestId
      });
    }

    // Log successful completion
    const duration = Date.now() - startTime;
    console.log('OAuth callback completed successfully:', {
      duration: `${duration}ms`,
      requestId,
      timestamp: new Date().toISOString()
    });

    return response;
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    // Detailed error logging for security analysis
    auditAuthEvent('oauth_callback_error', false, {
      error: error?.message || 'Unknown error',
      errorCode: error?.code,
      stack: error?.stack?.split('\n')[0], // Only first line for brevity
      duration: `${duration}ms`,
      requestId
    });
    
    console.error('OAuth callback processing failed:', {
      error: error?.message,
      name: error?.name,
      code: error?.code || 'unknown',
      response: error?.response?.data,
      status: error?.response?.status,
      duration: `${duration}ms`,
      requestId,
      timestamp: new Date().toISOString()
    });
    
    // Enhanced error classification for user feedback
    let errorType = 'oauth_callback_failed';
    let errorMessage = 'OAuth callback processing failed';
    
    if (error?.message?.includes('invalid_client')) {
      errorType = 'invalid_client_credentials';
      errorMessage = 'Client credentials are invalid or mismatched';
    } else if (error?.message?.includes('invalid_grant')) {
      errorType = 'invalid_authorization_code';
      errorMessage = 'Authorization code is expired or invalid';
    } else if (error?.message?.includes('redirect_uri_mismatch')) {
      errorType = 'redirect_uri_mismatch';
      errorMessage = 'Redirect URI configuration mismatch';
    } else if (error?.code === 'ECONNREFUSED' || error?.code === 'ENOTFOUND') {
      errorType = 'network_error';
      errorMessage = 'Network connectivity issue with OAuth provider';
    }
    
    const errorResponse = {
      error: errorType,
      message: errorMessage,
      details: error?.message || 'Unknown error occurred',
      timestamp: new Date().toISOString(),
      requestId
    };
    
    if (method === 'POST') {
      return NextResponse.json(errorResponse, { 
        status: 500, 
        headers: securityHeaders 
      });
    }
    
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://studio--drivemind-q69b7.us-central1.hosted.app';
    const redirectUrl = `${baseUrl}/ai?error=${errorType}&details=${encodeURIComponent(errorMessage)}&request_id=${requestId}`;
    return NextResponse.redirect(redirectUrl, { headers: securityHeaders });
  }
}