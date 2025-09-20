/**
 * Next.js Edge Middleware for global security enforcement
 * ALPHA-CODENAME v1.8 compliant with comprehensive security gates
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRateLimiter, DEFAULT_RATE_LIMIT, AUTH_RATE_LIMIT, STRICT_RATE_LIMIT } from '@/lib/rate-limiter';
import { applySecurityHeaders } from '@/lib/security-headers';

// Define public routes that don't require authentication
const PUBLIC_ROUTES = [
  '/',
  '/about',
  '/health',
  '/api/health',
  '/api/metrics',
  '/api/about',
  '/api/auth/drive/begin',
  '/api/auth/drive/callback',
];

// Define sensitive routes that need strict rate limiting
const SENSITIVE_ROUTES = [
  '/api/auth',
  '/api/workflows/background-scan',
  '/api/ai',
  '/api/exports',
];

// Rate limiters for different route types
const defaultRateLimiter = createRateLimiter(DEFAULT_RATE_LIMIT);
const authRateLimiter = createRateLimiter(AUTH_RATE_LIMIT);
const strictRateLimiter = createRateLimiter(STRICT_RATE_LIMIT);

/**
 * Security headers to apply to all responses
 */
const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  // Opt-in to stronger isolation to mitigate cross-origin risks
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

/**
 * Content Security Policy configuration
 */
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://www.gstatic.com https://www.googletagmanager.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: https: blob:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://*.firebaseapp.com https://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com wss://*.firebaseio.com",
  "frame-src 'self' https://accounts.google.com https://*.firebaseapp.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  
  // Apply rate limiting based on route type
  let rateLimitResponse: NextResponse | null = null;
  
  if (pathname.startsWith('/api/auth')) {
    // Strict rate limiting for auth endpoints
    rateLimitResponse = await authRateLimiter(request);
  } else if (SENSITIVE_ROUTES.some(route => pathname.startsWith(route))) {
    // Strict rate limiting for sensitive endpoints
    rateLimitResponse = await strictRateLimiter(request);
  } else if (pathname.startsWith('/api')) {
    // Default rate limiting for other API endpoints
    rateLimitResponse = await defaultRateLimiter(request);
  }
  
  // Return rate limit response if triggered
  if (rateLimitResponse && (rateLimitResponse.status === 429 || rateLimitResponse.status === 503)) {
    return rateLimitResponse;
  }
  
  // Continue with regular processing
  let response = NextResponse.next();
  
  // Apply comprehensive security headers
  response = applySecurityHeaders(response, {
    csp: process.env.NODE_ENV === 'production',
    cors: pathname.startsWith('/api') ? {
      allowedOrigins: [
        'https://studio--drivemind-q69b7.us-central1.hosted.app',
        'https://drivemind-q69b7.firebaseapp.com',
        'https://drivemind-q69b7.web.app',
        process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : '',
      ].filter(Boolean),
      credentials: true,
    } : false,
  });
  
  // Add request tracking headers
  response.headers.set('X-Request-ID', requestId);
  response.headers.set('X-Response-Time', `${Date.now() - startTime}ms`);
  
  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: response.headers });
  }
  
  // Authentication check for protected routes
  const isPublicRoute = PUBLIC_ROUTES.some(route => 
    pathname === route || pathname.startsWith(`${route}/`)
  );
  
  if (!isPublicRoute) {
    const token = request.cookies.get('auth-token')?.value || 
                  request.headers.get('authorization')?.replace('Bearer ', '');
    
    if (!token && pathname.startsWith('/api')) {
      return NextResponse.json(
        { 
          error: 'Authentication required',
          message: 'Please provide a valid authentication token',
          requestId 
        },
        { 
          status: 401, 
          headers: response.headers 
        }
      );
    }
  }
  
  // Request size limit check with circuit breaker
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const size = parseInt(contentLength);
    const maxSize = pathname.startsWith('/api/upload') ? 10485760 : 1048576; // 10MB for uploads, 1MB for others
    
    if (size > maxSize) {
      return NextResponse.json(
        { 
          error: 'Request body too large',
          message: `Request size ${size} bytes exceeds maximum allowed size of ${maxSize} bytes`,
          requestId 
        },
        { 
          status: 413, 
          headers: response.headers 
        }
      );
    }
  }
  
  // Security logging (without PII)
  if (process.env.NODE_ENV === 'production') {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      requestId,
      method: request.method,
      path: pathname,
      responseTime: Date.now() - startTime,
      userAgent: request.headers.get('user-agent')?.substring(0, 100), // Truncate for security
      referer: request.headers.get('referer')?.replace(/[?#].*$/, ''), // Strip query/hash
    }));
  }
  
  // Metrics recording removed from middleware due to Edge Runtime limitations
  // Metrics will be recorded in individual API routes instead
  
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
};
