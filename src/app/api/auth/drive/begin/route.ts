import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { rateLimiters } from '@/lib/security/rate-limiter';
import { securityMiddleware, validateCSRFToken } from '@/lib/security/middleware';
import { z } from 'zod';
import { logger } from '@/lib/logger';

const RequestSchema = z.object({
  userId: z.string().optional(),
  csrfToken: z.string().optional(),
});

export async function POST(request: NextRequest) {
  // Apply rate limiting for auth endpoints
  return rateLimiters.auth(request, async (req) => {
    // Apply security middleware
    return securityMiddleware(req, async (req) => {
      try {
        const body = await req.json().catch(() => ({}));
        const parsed = RequestSchema.safeParse(body);
        
        if (!parsed.success) {
          logger.warn('Invalid OAuth begin request:', parsed.error.flatten());
          return NextResponse.json(
            { error: 'Invalid request parameters' },
            { status: 400 }
          );
        }
        
        const { userId, csrfToken } = parsed.data;
        
        // Validate CSRF token if provided
        if (csrfToken && !validateCSRFToken(csrfToken)) {
          logger.warn('Invalid CSRF token in OAuth begin request');
          return NextResponse.json(
            { error: 'Invalid security token' },
            { status: 403 }
          );
        }

        const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
        const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
        
        if (!clientId || !clientSecret) {
          // Log without exposing sensitive information
          logger.error('OAuth configuration incomplete', {
            hasClientId: !!clientId,
            hasClientSecret: !!clientSecret,
          });
          
          return NextResponse.json(
            { error: 'Service configuration error' },
            { status: 500 }
          );
        }
    
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://studio--drivemind-q69b7.us-central1.hosted.app';
        const redirectUri = `${baseUrl}/api/auth/drive/callback`;
        
        logger.info('OAuth flow initiated', {
          hasUserId: !!userId,
          redirectUri: redirectUri.replace(/https?:\/\/[^\/]+/, '[REDACTED]'),
        });
    
        const oauth2Client = new google.auth.OAuth2(
          clientId,
          clientSecret,
          redirectUri
        );
        
        // Generate state parameter with additional security
        const state = userId ? Buffer.from(JSON.stringify({
          userId,
          timestamp: Date.now(),
          nonce: Math.random().toString(36).substring(2),
        })).toString('base64') : undefined;
        
        // Generate the auth URL with secure parameters
        const authUrl = oauth2Client.generateAuthUrl({
          access_type: 'offline',
          prompt: 'consent', // Force consent to get refresh token
          scope: [
            'https://www.googleapis.com/auth/drive'
          ],
          include_granted_scopes: true,
          state,
        });

        return NextResponse.json({ url: authUrl });
      } catch (error) {
        // Log error securely without exposing stack traces
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('OAuth begin failed', { error: errorMessage });
        
        return NextResponse.json(
          { error: 'Authentication service unavailable' },
          { status: 500 }
        );
      }
    });
  });
}
