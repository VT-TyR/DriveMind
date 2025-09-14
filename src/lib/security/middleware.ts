/**
 * @fileoverview Security middleware for Next.js application
 * Implements OWASP best practices and ALPHA-CODENAME v1.8 compliance
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

/**
 * Security headers configuration
 */
const SECURITY_HEADERS = {
  // Content Security Policy - strict by default
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://apis.google.com https://www.gstatic.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://firebaseapp.com https://firebaseio.com https://googleapis.com wss://*.firebaseio.com",
    "frame-src 'self' https://accounts.google.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join('; '),
  
  // Prevent clickjacking
  'X-Frame-Options': 'DENY',
  
  // Prevent MIME type sniffing
  'X-Content-Type-Options': 'nosniff',
  
  // Enable XSS protection
  'X-XSS-Protection': '1; mode=block',
  
  // Referrer policy
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  
  // Permissions policy
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  
  // Strict transport security (HSTS)
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
};

/**
 * CORS configuration
 */
const CORS_CONFIG = {
  allowedOrigins: [
    'https://studio--drivemind-q69b7.us-central1.hosted.app',
    'https://drivemind-q69b7.firebaseapp.com',
    'https://drivemind-q69b7.web.app',
  ],
  allowedMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-CSRF-Token'],
  credentials: true,
  maxAge: 86400, // 24 hours
};

/**
 * Request size limits by content type
 */
const SIZE_LIMITS = {
  'application/json': 1024 * 1024, // 1MB
  'application/x-www-form-urlencoded': 512 * 1024, // 512KB
  'multipart/form-data': 10 * 1024 * 1024, // 10MB
  'text/plain': 256 * 1024, // 256KB
  default: 512 * 1024, // 512KB
};

/**
 * Sanitize user input to prevent XSS
 */
export function sanitizeInput(input: unknown): unknown {
  if (typeof input === 'string') {
    // Remove dangerous characters and scripts
    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .replace(/<iframe/gi, '')
      .replace(/<object/gi, '')
      .replace(/<embed/gi, '')
      .trim();
  }
  
  if (Array.isArray(input)) {
    return input.map(sanitizeInput);
  }
  
  if (input && typeof input === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[sanitizeInput(key) as string] = sanitizeInput(value);
    }
    return sanitized;
  }
  
  return input;
}

/**
 * Validate Content-Type header
 */
export function validateContentType(
  req: NextRequest,
  allowedTypes: string[] = ['application/json']
): NextResponse | null {
  const contentType = req.headers.get('content-type');
  
  if (!contentType) {
    return NextResponse.json(
      { error: 'Content-Type header is required' },
      { status: 400 }
    );
  }
  
  const type = contentType.split(';')[0].trim();
  
  if (!allowedTypes.some(allowed => type === allowed)) {
    return NextResponse.json(
      { error: `Invalid Content-Type. Allowed: ${allowedTypes.join(', ')}` },
      { status: 415 }
    );
  }
  
  return null;
}

/**
 * Check request size
 */
export async function checkRequestSize(
  req: NextRequest
): Promise<NextResponse | null> {
  const contentType = req.headers.get('content-type')?.split(';')[0].trim() || 'default';
  const contentLength = parseInt(req.headers.get('content-length') || '0');
  const limit = SIZE_LIMITS[contentType as keyof typeof SIZE_LIMITS] || SIZE_LIMITS.default;
  
  if (contentLength > limit) {
    logger.warn(`Request size exceeded: ${contentLength} > ${limit}`);
    return NextResponse.json(
      { error: `Request size exceeds limit of ${limit} bytes` },
      { status: 413 }
    );
  }
  
  return null;
}

/**
 * Apply security headers to response
 */
export function applySecurityHeaders(response: NextResponse): NextResponse {
  for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(header, value);
  }
  
  // Add request ID for tracing
  const requestId = crypto.randomUUID();
  response.headers.set('X-Request-ID', requestId);
  
  return response;
}

/**
 * CORS middleware
 */
export function corsMiddleware(req: NextRequest): NextResponse | null {
  const origin = req.headers.get('origin');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    const response = new NextResponse(null, { status: 204 });
    
    if (origin && CORS_CONFIG.allowedOrigins.includes(origin)) {
      response.headers.set('Access-Control-Allow-Origin', origin);
      response.headers.set('Access-Control-Allow-Methods', CORS_CONFIG.allowedMethods.join(', '));
      response.headers.set('Access-Control-Allow-Headers', CORS_CONFIG.allowedHeaders.join(', '));
      response.headers.set('Access-Control-Max-Age', CORS_CONFIG.maxAge.toString());
      
      if (CORS_CONFIG.credentials) {
        response.headers.set('Access-Control-Allow-Credentials', 'true');
      }
    }
    
    return response;
  }
  
  // Validate origin for actual requests
  if (origin && !CORS_CONFIG.allowedOrigins.includes(origin)) {
    logger.warn(`CORS violation from origin: ${origin}`);
    return NextResponse.json(
      { error: 'CORS policy violation' },
      { status: 403 }
    );
  }
  
  return null;
}

/**
 * CSRF token validation
 */
const CSRF_TOKEN_LENGTH = 32;
const csrfTokens = new Map<string, number>(); // token -> expiry

// Cleanup expired tokens periodically
setInterval(() => {
  const now = Date.now();
  for (const [token, expiry] of csrfTokens.entries()) {
    if (expiry < now) {
      csrfTokens.delete(token);
    }
  }
}, 60000); // Clean every minute

export function generateCSRFToken(): string {
  const token = crypto.randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
  const expiry = Date.now() + 3600000; // 1 hour
  csrfTokens.set(token, expiry);
  return token;
}

export function validateCSRFToken(token: string | null): boolean {
  if (!token) return false;
  
  const expiry = csrfTokens.get(token);
  if (!expiry) return false;
  
  if (expiry < Date.now()) {
    csrfTokens.delete(token);
    return false;
  }
  
  // Single use - delete after validation
  csrfTokens.delete(token);
  return true;
}

/**
 * SQL injection prevention
 */
export function sanitizeSQLInput(input: string): string {
  // Basic SQL injection patterns
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|FROM|WHERE|JOIN|ORDER\s+BY|GROUP\s+BY)\b)/gi,
    /(--|\||;|\/\*|\*\/|xp_|sp_|0x)/gi,
    /(\bOR\b\s*\d+\s*=\s*\d+)/gi,
    /(\bAND\b\s*\d+\s*=\s*\d+)/gi,
  ];
  
  let sanitized = input;
  for (const pattern of sqlPatterns) {
    sanitized = sanitized.replace(pattern, '');
  }
  
  return sanitized;
}

/**
 * Path traversal prevention
 */
export function sanitizePath(path: string): string {
  // Remove path traversal attempts
  return path
    .replace(/\.\./g, '')
    .replace(/~\//g, '')
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\//, '');
}

/**
 * Main security middleware
 */
export async function securityMiddleware(
  req: NextRequest,
  handler: (req: NextRequest) => Promise<NextResponse>
): Promise<NextResponse> {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();
  
  // Log request
  logger.info(`[${requestId}] ${req.method} ${req.url}`);
  
  try {
    // Check CORS
    const corsResponse = corsMiddleware(req);
    if (corsResponse) return corsResponse;
    
    // Check request size
    const sizeResponse = await checkRequestSize(req);
    if (sizeResponse) return sizeResponse;
    
    // Validate Content-Type for POST/PUT/PATCH
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      const contentTypeResponse = validateContentType(req);
      if (contentTypeResponse) return contentTypeResponse;
    }
    
    // Execute handler
    const response = await handler(req);
    
    // Apply security headers
    applySecurityHeaders(response);
    
    // Add CORS headers for allowed origins
    const origin = req.headers.get('origin');
    if (origin && CORS_CONFIG.allowedOrigins.includes(origin)) {
      response.headers.set('Access-Control-Allow-Origin', origin);
      if (CORS_CONFIG.credentials) {
        response.headers.set('Access-Control-Allow-Credentials', 'true');
      }
    }
    
    // Add request ID and timing
    response.headers.set('X-Request-ID', requestId);
    response.headers.set('X-Response-Time', `${Date.now() - startTime}ms`);
    
    // Log response
    logger.info(`[${requestId}] Response: ${response.status} in ${Date.now() - startTime}ms`);
    
    return response;
  } catch (error) {
    // Log error securely (no stack traces in production)
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    logger.error(`[${requestId}] Error: ${errorMessage}`);
    
    // Return sanitized error response
    return NextResponse.json(
      {
        error: 'An error occurred processing your request',
        requestId,
      },
      { status: 500 }
    );
  }
}

/**
 * Input validation schemas for common patterns
 */
export const ValidationSchemas = {
  email: z.string().email().max(255),
  
  uuid: z.string().uuid(),
  
  url: z.string().url().max(2048),
  
  phoneNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/),
  
  alphanumeric: z.string().regex(/^[a-zA-Z0-9]+$/),
  
  filename: z.string().regex(/^[a-zA-Z0-9_\-\.]+$/).max(255),
  
  pagination: z.object({
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(100).default(20),
  }),
  
  dateRange: z.object({
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
  }),
};