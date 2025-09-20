/**
 * Security Headers Configuration
 * Implements comprehensive security headers for production deployment
 * Compliant with ALPHA-CODENAME v1.8 security requirements
 */

import { NextResponse } from 'next/server';

// Content Security Policy directives
const CSP_DIRECTIVES = {
  'default-src': ["'self'"],
  'script-src': [
    "'self'",
    "'unsafe-inline'", // Required for Next.js
    "'unsafe-eval'", // Remove in production if possible
    'https://apis.google.com',
    'https://www.googleapis.com',
    'https://www.gstatic.com',
    'https://*.firebaseapp.com',
    'https://*.firebaseio.com',
  ],
  'style-src': [
    "'self'",
    "'unsafe-inline'", // Required for styled components
    'https://fonts.googleapis.com',
  ],
  'img-src': [
    "'self'",
    'data:',
    'blob:',
    'https://*.googleusercontent.com',
    'https://*.googleapis.com',
    'https://*.gstatic.com',
  ],
  'font-src': [
    "'self'",
    'https://fonts.gstatic.com',
  ],
  'connect-src': [
    "'self'",
    'https://apis.google.com',
    'https://www.googleapis.com',
    'https://oauth2.googleapis.com',
    'https://securetoken.googleapis.com',
    'https://*.firebaseapp.com',
    'https://*.firebaseio.com',
    'https://identitytoolkit.googleapis.com',
    'wss://*.firebaseio.com',
  ],
  'media-src': ["'self'"],
  'object-src': ["'none'"],
  'frame-src': [
    "'self'",
    'https://accounts.google.com',
    'https://*.firebaseapp.com',
  ],
  'frame-ancestors': ["'self'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'manifest-src': ["'self'"],
  'worker-src': ["'self'", 'blob:'],
  'upgrade-insecure-requests': [],
};

// Build CSP string
function buildCSP(): string {
  return Object.entries(CSP_DIRECTIVES)
    .map(([directive, values]) => {
      if (values.length === 0) {
        return directive;
      }
      return `${directive} ${values.join(' ')}`;
    })
    .join('; ');
}

// Permissions Policy directives
const PERMISSIONS_POLICY = {
  'accelerometer': '()',
  'autoplay': '()',
  'camera': '()',
  'display-capture': '()',
  'encrypted-media': '()',
  'fullscreen': '(self)',
  'geolocation': '()',
  'gyroscope': '()',
  'magnetometer': '()',
  'microphone': '()',
  'midi': '()',
  'payment': '()',
  'picture-in-picture': '()',
  'publickey-credentials-get': '()',
  'screen-wake-lock': '()',
  'sync-xhr': '()',
  'usb': '()',
  'xr-spatial-tracking': '()',
};

// Build Permissions Policy string
function buildPermissionsPolicy(): string {
  return Object.entries(PERMISSIONS_POLICY)
    .map(([feature, policy]) => `${feature}=${policy}`)
    .join(', ');
}

// CORS configuration
export interface CORSConfig {
  allowedOrigins?: string[];
  allowedMethods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
}

const DEFAULT_CORS_CONFIG: CORSConfig = {
  allowedOrigins: [
    process.env.NEXT_PUBLIC_APP_URL || 'https://studio--drivemind-q69b7.us-central1.hosted.app',
  ],
  allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Request-ID',
    'X-Trace-ID',
  ],
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'X-Request-ID',
  ],
  credentials: true,
  maxAge: 86400, // 24 hours
};

/**
 * Apply security headers to response
 */
export function applySecurityHeaders(
  response: NextResponse,
  options?: {
    csp?: boolean;
    cors?: boolean | CORSConfig;
    nonce?: string;
  }
): NextResponse {
  const headers = new Headers(response.headers);
  
  // Basic security headers (always applied)
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  headers.set('X-XSS-Protection', '1; mode=block');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-DNS-Prefetch-Control', 'on');
  headers.set('X-Download-Options', 'noopen');
  headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  
  // Strict Transport Security (HSTS)
  if (process.env.NODE_ENV === 'production') {
    headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  }
  
  // Content Security Policy
  if (options?.csp !== false) {
    let cspString = buildCSP();
    
    // Add nonce if provided
    if (options?.nonce) {
      cspString = cspString.replace(
        "'unsafe-inline'",
        `'nonce-${options.nonce}' 'unsafe-inline'`
      );
    }
    
    headers.set('Content-Security-Policy', cspString);
    
    // Report-only CSP for monitoring
    if (process.env.CSP_REPORT_URI) {
      headers.set(
        'Content-Security-Policy-Report-Only',
        `${cspString}; report-uri ${process.env.CSP_REPORT_URI}`
      );
    }
  }
  
  // Permissions Policy
  headers.set('Permissions-Policy', buildPermissionsPolicy());
  
  // CORS headers
  if (options?.cors) {
    const corsConfig = typeof options.cors === 'object' 
      ? { ...DEFAULT_CORS_CONFIG, ...options.cors }
      : DEFAULT_CORS_CONFIG;
    
    applyCORSHeaders(headers, corsConfig);
  }
  
  // Additional security headers
  headers.set('X-Request-ID', crypto.randomUUID());
  headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  headers.set('Pragma', 'no-cache');
  headers.set('Expires', '0');
  
  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Apply CORS headers
 */
function applyCORSHeaders(headers: Headers, config: CORSConfig) {
  const origin = headers.get('origin') || '*';
  
  // Check if origin is allowed
  if (config.allowedOrigins && config.allowedOrigins.length > 0) {
    if (config.allowedOrigins.includes('*') || config.allowedOrigins.includes(origin)) {
      headers.set('Access-Control-Allow-Origin', origin);
    } else {
      // Origin not allowed, don't set CORS headers
      return;
    }
  } else {
    headers.set('Access-Control-Allow-Origin', '*');
  }
  
  // Set other CORS headers
  if (config.allowedMethods) {
    headers.set('Access-Control-Allow-Methods', config.allowedMethods.join(', '));
  }
  
  if (config.allowedHeaders) {
    headers.set('Access-Control-Allow-Headers', config.allowedHeaders.join(', '));
  }
  
  if (config.exposedHeaders) {
    headers.set('Access-Control-Expose-Headers', config.exposedHeaders.join(', '));
  }
  
  if (config.credentials) {
    headers.set('Access-Control-Allow-Credentials', 'true');
  }
  
  if (config.maxAge) {
    headers.set('Access-Control-Max-Age', String(config.maxAge));
  }
}

/**
 * Security headers middleware
 */
export function createSecurityMiddleware(options?: {
  csp?: boolean;
  cors?: boolean | CORSConfig;
  customHeaders?: Record<string, string>;
}) {
  return function securityMiddleware(response: NextResponse): NextResponse {
    const securedResponse = applySecurityHeaders(response, options);
    
    // Apply custom headers if provided
    if (options?.customHeaders) {
      const headers = new Headers(securedResponse.headers);
      Object.entries(options.customHeaders).forEach(([key, value]) => {
        headers.set(key, value);
      });
      
      return new NextResponse(securedResponse.body, {
        status: securedResponse.status,
        statusText: securedResponse.statusText,
        headers,
      });
    }
    
    return securedResponse;
  };
}

/**
 * Generate CSP nonce
 */
export function generateCSPNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString('base64');
}

/**
 * Validate origin against whitelist
 */
export function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  if (allowedOrigins.includes('*')) {
    return true;
  }
  
  return allowedOrigins.some(allowed => {
    if (allowed.startsWith('*.')) {
      // Wildcard subdomain matching
      const domain = allowed.slice(2);
      return origin.endsWith(domain);
    }
    return origin === allowed;
  });
}

/**
 * Sanitize user input for XSS prevention
 */
export function sanitizeInput(input: string): string {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .replace(/\\/g, '&#x5C;')
    .replace(/`/g, '&#x60;');
}

/**
 * Validate and sanitize URL
 */
export function sanitizeURL(url: string): string | null {
  try {
    const parsed = new URL(url);
    
    // Only allow http(s) protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }
    
    // Remove any potential XSS vectors from URL
    parsed.hash = '';
    
    // Validate hostname
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      // Block localhost in production
      if (process.env.NODE_ENV === 'production') {
        return null;
      }
    }
    
    return parsed.toString();
  } catch {
    return null;
  }
}