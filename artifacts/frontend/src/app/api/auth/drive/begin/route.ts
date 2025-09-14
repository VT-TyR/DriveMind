/**
 * PKCE-Enhanced OAuth Initiation Endpoint
 * 
 * Implements RFC 7636 PKCE for enhanced OAuth 2.0 security.
 * Generates secure authorization URLs with code challenges.
 */

import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import crypto from 'crypto';

// Security headers for all responses
const securityHeaders = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'nonce-random'; object-src 'none';",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
};

/**
 * Generate cryptographically secure random string
 */
function generateSecureRandom(length: number): string {
  return crypto.randomBytes(length).toString('base64url');
}

/**
 * Generate PKCE code challenge from verifier
 */
function generateCodeChallenge(verifier: string): string {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return hash.toString('base64url');
}

/**
 * Generate secure state parameter
 */
function generateState(userId?: string): string {
  const randomPart = generateSecureRandom(32);
  return userId ? `${randomPart}:${userId}` : randomPart;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Parse request body safely
    let body: any = {};
    try {
      body = await request.json();
    } catch (parseError) {
      console.warn('Failed to parse request body, using defaults');
    }
    
    const userId: string | undefined = body?.userId;
    
    // Validate environment variables
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
    
    if (!clientId || !clientSecret) {
      console.error('OAuth credentials missing:', { 
        hasClientId: !!clientId, 
        hasClientSecret: !!clientSecret,
        timestamp: new Date().toISOString()
      });
      
      return NextResponse.json(
        { 
          error: 'oauth_config_incomplete',
          message: 'OAuth configuration incomplete. Missing client credentials.',
          timestamp: new Date().toISOString()
        },
        { 
          status: 500,
          headers: securityHeaders
        }
      );
    }
    
    // Determine redirect URI with fallback
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://studio--drivemind-q69b7.us-central1.hosted.app';
    const redirectUri = `${baseUrl}/api/auth/drive/callback`;
    
    // Generate PKCE parameters
    const codeVerifier = generateSecureRandom(128);
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateState(userId);
    
    // Log security event
    console.log('OAuth initiation:', {
      timestamp: new Date().toISOString(),
      userId: userId ? '[REDACTED]' : 'anonymous',
      redirectUri,
      codeChallenge: codeChallenge.substring(0, 8) + '...',
      state: state.substring(0, 8) + '...',
      userAgent: request.headers.get('user-agent'),
      ip: request.ip || 'unknown'
    });
    
    // Initialize OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );
    
    // Generate authorization URL with PKCE
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent', // Force consent to ensure refresh token
      scope: [
        'https://www.googleapis.com/auth/drive'
      ],
      include_granted_scopes: true,
      state,
      // PKCE parameters
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });
    
    // Audit successful request
    const duration = Date.now() - startTime;
    console.log('OAuth URL generated successfully:', {
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
      urlLength: authUrl.length
    });

    return NextResponse.json(
      { 
        url: authUrl,
        state,
        codeChallenge,
        timestamp: new Date().toISOString()
      },
      { headers: securityHeaders }
    );
    
  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    // Log security incident
    console.error('OAuth initiation failed:', {
      error: error?.message || 'Unknown error',
      stack: error?.stack,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
      userAgent: request.headers.get('user-agent'),
      ip: request.ip || 'unknown'
    });
    
    return NextResponse.json(
      { 
        error: 'oauth_init_failed',
        message: 'Failed to start OAuth flow',
        timestamp: new Date().toISOString()
      },
      { 
        status: 500,
        headers: securityHeaders
      }
    );
  }
}

// Rate limiting (in production, use Redis or similar)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

/**
 * Simple rate limiting implementation
 */
function checkRateLimit(ip: string, limit: number = 50, windowMs: number = 60000): boolean {
  const now = Date.now();
  const key = ip;
  
  if (!rateLimitMap.has(key)) {
    rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  const entry = rateLimitMap.get(key)!;
  
  if (now > entry.resetTime) {
    entry.count = 1;
    entry.resetTime = now + windowMs;
    return true;
  }
  
  if (entry.count >= limit) {
    return false;
  }
  
  entry.count++;
  return true;
}

// Add rate limiting middleware
export async function middleware(request: NextRequest) {
  const ip = request.ip || request.headers.get('x-forwarded-for') || 'unknown';
  
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { 
        error: 'rate_limit_exceeded',
        message: 'Too many requests. Please try again later.',
        retryAfter: 60
      },
      { 
        status: 429,
        headers: {
          ...securityHeaders,
          'Retry-After': '60',
          'X-RateLimit-Limit': '50',
          'X-RateLimit-Remaining': '0'
        }
      }
    );
  }
  
  return NextResponse.next();
}