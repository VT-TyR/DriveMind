/**
 * Next.js Edge Middleware for global security enforcement
 * ALPHA-CODENAME v1.8 compliant
 */

import { NextRequest, NextResponse } from 'next/server';
import { rateLimiters } from '@/lib/security/rate-limiter';

// Define public routes that don't require authentication
const PUBLIC_ROUTES = [
  '/',
  '/about',
  '/health',
  '/api/health',
  '/api/metrics',
  '/api/auth/drive/begin',
  '/api/auth/drive/callback',
];

// Define API routes that need rate limiting
const RATE_LIMITED_ROUTES = {
  '/api/auth': 'auth',
  '/api/workflows': 'expensive',
  '/api/ai': 'expensive',
  '/api': 'api',
} as const;

/**
 * Security headers to apply to all responses
 */
const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestId = crypto.randomUUID();
  
  // Clone the response to modify headers
  const response = NextResponse.next();
  
  // Add security headers to all responses
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  
  // Add CSP header (relaxed for development)
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Content-Security-Policy', CSP_DIRECTIVES.join('; '));
  }
  
  // Add HSTS header for production
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  }
  
  // Add request ID for tracing
  response.headers.set('X-Request-ID', requestId);
  
  // CORS handling for API routes
  if (pathname.startsWith('/api')) {
    const origin = request.headers.get('origin');
    const allowedOrigins = [
      'https://studio--drivemind-q69b7.us-central1.hosted.app',
      'https://drivemind-q69b7.firebaseapp.com',
      'https://drivemind-q69b7.web.app',
      'http://localhost:3000', // Development
    ];
    
    if (origin && allowedOrigins.includes(origin)) {
      response.headers.set('Access-Control-Allow-Origin', origin);
      response.headers.set('Access-Control-Allow-Credentials', 'true');
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-ID');
    }
    
    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, { status: 204, headers: response.headers });
    }
  }
  
  // Authentication check for protected routes
  if (!PUBLIC_ROUTES.some(route => pathname === route || pathname.startsWith(`${route}/`))) {
    const token = request.cookies.get('auth-token') || 
                  request.headers.get('authorization')?.replace('Bearer ', '');
    
    if (!token && pathname.startsWith('/api')) {
      return NextResponse.json(
        { error: 'Authentication required', requestId },
        { status: 401, headers: response.headers }
      );
    }
  }
  
  // Request size limit check
  const contentLength = request.headers.get('content-length');
  if (contentLength) {
    const size = parseInt(contentLength);
    const maxSize = pathname.startsWith('/api/upload') ? 10485760 : 1048576; // 10MB for uploads, 1MB for others
    
    if (size > maxSize) {
      return NextResponse.json(
        { error: 'Request body too large', requestId },
        { status: 413, headers: response.headers }
      );
    }
  }
  
  // Log the request (without PII)
  if (process.env.NODE_ENV === 'production') {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      requestId,
      method: request.method,
      path: pathname,
      userAgent: request.headers.get('user-agent'),
      referer: request.headers.get('referer'),
    }));
  }
  
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