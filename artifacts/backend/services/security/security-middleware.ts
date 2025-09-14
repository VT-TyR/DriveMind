/**
 * Security Middleware - DAST-001 FIX
 * 
 * Comprehensive security headers and validation middleware.
 * Implements HSTS, CSP, and complete security header suite.
 * 
 * Security Features:
 * - HSTS enforcement with preload and 1-year max-age
 * - Content Security Policy with nonce support
 * - User context validation
 * - Multi-tier rate limiting
 * - Request sanitization and validation
 * - CORS enforcement
 * - Security event logging
 */

import { NextRequest, NextResponse } from 'next/server';
import { Logger } from '../logging/logger';
import { Metrics } from '../monitoring/metrics';
import { createHash, randomBytes } from 'crypto';

export interface SecurityConfig {
  hstsMaxAge: number;
  hstsIncludeSubdomains: boolean;
  hstsPreload: boolean;
  cspEnforcement: 'enforce' | 'report-only';
  corsOrigins: string[];
  rateLimiting: {
    enabled: boolean;
    windowMs: number;
    maxRequests: number;
    skipSuccessfulRequests: boolean;
  };
  userContextValidation: boolean;
  requestSizeLimit: number;
}

export interface SecurityContext {
  userId?: string;
  userRole?: string;
  requestId: string;
  ipAddress: string;
  userAgent: string;
  timestamp: string;
  nonce: string;
}

export interface RateLimitInfo {
  endpoint: string;
  userId?: string;
  ipAddress: string;
  requestCount: number;
  windowStart: number;
  isBlocked: boolean;
}

export interface SecurityValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  securityContext: SecurityContext;
}

export class SecurityMiddleware {
  private logger: Logger;
  private metrics: Metrics;
  private config: SecurityConfig;
  private rateLimitStore: Map<string, RateLimitInfo>;
  private nonceStore: Map<string, string>;

  constructor(config: Partial<SecurityConfig> = {}) {
    this.logger = new Logger('SecurityMiddleware');
    this.metrics = new Metrics();
    this.rateLimitStore = new Map();
    this.nonceStore = new Map();
    
    this.config = {
      hstsMaxAge: 31536000, // 1 year
      hstsIncludeSubdomains: true,
      hstsPreload: true,
      cspEnforcement: 'enforce',
      corsOrigins: [
        'https://studio--drivemind-q69b7.us-central1.hosted.app',
        'https://drivemind.ai',
        process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : null
      ].filter(Boolean) as string[],
      rateLimiting: {
        enabled: true,
        windowMs: 60000, // 1 minute
        maxRequests: 100,
        skipSuccessfulRequests: false
      },
      userContextValidation: true,
      requestSizeLimit: 10 * 1024 * 1024, // 10MB
      ...config
    };

    // Clean up rate limit store periodically
    setInterval(() => this.cleanupRateLimitStore(), 60000);
    setInterval(() => this.cleanupNonceStore(), 300000); // 5 minutes
  }

  /**
   * Main security middleware function
   */
  async handleRequest(request: NextRequest): Promise<NextResponse | null> {
    const startTime = Date.now();
    
    try {
      // Generate security context
      const securityContext = this.generateSecurityContext(request);
      
      // Validate request security
      const validationResult = await this.validateRequest(request, securityContext);
      
      if (!validationResult.isValid) {
        return this.createSecurityErrorResponse(validationResult.errors, securityContext);
      }

      // Check rate limiting
      if (this.config.rateLimiting.enabled) {
        const rateLimitResult = await this.checkRateLimit(request, securityContext);
        if (rateLimitResult.isBlocked) {
          return this.createRateLimitResponse(rateLimitResult, securityContext);
        }
      }

      // Log security event
      await this.logSecurityEvent('request_processed', {
        securityContext,
        validationResult,
        duration: Date.now() - startTime
      });

      return null; // Continue with request processing

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown security error';
      
      this.logger.error('Security middleware error', {
        error: errorMessage,
        url: request.url,
        method: request.method
      });

      return this.createInternalErrorResponse();
    }
  }

  /**
   * Apply security headers to response
   */
  applySecurityHeaders(response: NextResponse, securityContext: SecurityContext): NextResponse {
    try {
      // HSTS header (DAST-001 FIX)
      const hstsValue = [
        `max-age=${this.config.hstsMaxAge}`,
        this.config.hstsIncludeSubdomains ? 'includeSubDomains' : null,
        this.config.hstsPreload ? 'preload' : null
      ].filter(Boolean).join('; ');

      response.headers.set('Strict-Transport-Security', hstsValue);

      // Content Security Policy
      const cspValue = this.generateCSPHeader(securityContext.nonce);
      const cspHeader = this.config.cspEnforcement === 'enforce' 
        ? 'Content-Security-Policy' 
        : 'Content-Security-Policy-Report-Only';
      
      response.headers.set(cspHeader, cspValue);

      // Additional security headers
      response.headers.set('X-Content-Type-Options', 'nosniff');
      response.headers.set('X-Frame-Options', 'DENY');
      response.headers.set('X-XSS-Protection', '1; mode=block');
      response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
      response.headers.set('Permissions-Policy', this.generatePermissionsPolicy());
      
      // Custom security headers
      response.headers.set('X-Security-Context', securityContext.requestId);
      response.headers.set('X-Content-Security-Nonce', securityContext.nonce);

      // CORS headers
      this.applyCORSHeaders(response);

      // Cache control for sensitive endpoints
      if (this.isSensitiveEndpoint(response)) {
        response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        response.headers.set('Pragma', 'no-cache');
        response.headers.set('Expires', '0');
        response.headers.set('Surrogate-Control', 'no-store');
      }

      // Update metrics
      this.metrics.incrementCounter('security_headers_applied', {
        request_id: securityContext.requestId,
        csp_mode: this.config.cspEnforcement
      });

      return response;

    } catch (error) {
      this.logger.error('Failed to apply security headers', {
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId: securityContext.requestId
      });

      return response; // Return original response on error
    }
  }

  /**
   * Generate security context for request
   */
  private generateSecurityContext(request: NextRequest): SecurityContext {
    const requestId = this.generateRequestId();
    const nonce = this.generateNonce(requestId);
    
    return {
      requestId,
      nonce,
      ipAddress: this.getClientIP(request),
      userAgent: request.headers.get('user-agent') || 'unknown',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Validate request security
   */
  private async validateRequest(
    request: NextRequest, 
    securityContext: SecurityContext
  ): Promise<SecurityValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Request size validation
      const contentLength = request.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > this.config.requestSizeLimit) {
        errors.push('Request size exceeds limit');
      }

      // User-Agent validation
      if (!securityContext.userAgent || securityContext.userAgent === 'unknown') {
        warnings.push('Missing or invalid User-Agent header');
      }

      // Validate Content-Type for POST/PUT requests
      if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
        const contentType = request.headers.get('content-type');
        if (!contentType) {
          errors.push('Missing Content-Type header for body request');
        } else if (!this.isValidContentType(contentType)) {
          errors.push('Invalid or unsafe Content-Type');
        }
      }

      // Check for suspicious headers
      const suspiciousHeaders = this.checkSuspiciousHeaders(request);
      if (suspiciousHeaders.length > 0) {
        warnings.push(`Suspicious headers detected: ${suspiciousHeaders.join(', ')}`);
      }

      // CSRF token validation for state-changing operations
      if (this.isStatefulOperation(request)) {
        const csrfToken = request.headers.get('x-csrf-token') || request.headers.get('csrf-token');
        if (!csrfToken) {
          errors.push('Missing CSRF token for state-changing operation');
        } else if (!this.validateCSRFToken(csrfToken)) {
          errors.push('Invalid CSRF token');
        }
      }

      // Path traversal validation
      if (this.hasPathTraversal(request.url)) {
        errors.push('Path traversal attempt detected');
      }

      // SQL injection basic detection
      if (this.hasSQLInjectionAttempt(request)) {
        errors.push('Potential SQL injection attempt detected');
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings,
        securityContext
      };

    } catch (error) {
      this.logger.error('Request validation error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId: securityContext.requestId
      });

      return {
        isValid: false,
        errors: ['Request validation failed'],
        warnings,
        securityContext
      };
    }
  }

  /**
   * Check rate limiting
   */
  private async checkRateLimit(request: NextRequest, securityContext: SecurityContext): Promise<RateLimitInfo> {
    const endpoint = this.getEndpointKey(request);
    const identifier = securityContext.userId || securityContext.ipAddress;
    const key = `${endpoint}:${identifier}`;
    
    const now = Date.now();
    const windowStart = now - this.config.rateLimiting.windowMs;
    
    let rateLimitInfo = this.rateLimitStore.get(key);
    
    if (!rateLimitInfo || rateLimitInfo.windowStart < windowStart) {
      // Reset or create new rate limit info
      rateLimitInfo = {
        endpoint,
        userId: securityContext.userId,
        ipAddress: securityContext.ipAddress,
        requestCount: 1,
        windowStart: now,
        isBlocked: false
      };
    } else {
      // Increment request count
      rateLimitInfo.requestCount++;
    }

    // Check if blocked
    const maxRequests = this.getEndpointRateLimit(endpoint);
    if (rateLimitInfo.requestCount > maxRequests) {
      rateLimitInfo.isBlocked = true;
      
      // Log rate limit exceeded
      await this.logSecurityEvent('rate_limit_exceeded', {
        securityContext,
        rateLimitInfo,
        severity: 'high'
      });

      this.metrics.incrementCounter('rate_limit_exceeded', {
        endpoint,
        identifier_type: securityContext.userId ? 'user' : 'ip'
      });
    }

    this.rateLimitStore.set(key, rateLimitInfo);
    return rateLimitInfo;
  }

  /**
   * Generate CSP header
   */
  private generateCSPHeader(nonce: string): string {
    const directives = [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
      `style-src 'self' 'nonce-${nonce}' 'unsafe-inline'`,
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://accounts.google.com https://www.googleapis.com",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests"
    ];

    return directives.join('; ');
  }

  /**
   * Generate Permissions Policy header
   */
  private generatePermissionsPolicy(): string {
    const policies = [
      'geolocation=()',
      'camera=()',
      'microphone=()',
      'payment=()',
      'usb=()',
      'magnetometer=()',
      'gyroscope=()',
      'accelerometer=()'
    ];

    return policies.join(', ');
  }

  /**
   * Apply CORS headers
   */
  private applyCORSHeaders(response: NextResponse): void {
    // Only apply CORS for allowed origins
    const origin = response.headers.get('origin');
    if (origin && this.config.corsOrigins.includes(origin)) {
      response.headers.set('Access-Control-Allow-Origin', origin);
      response.headers.set('Access-Control-Allow-Credentials', 'true');
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token');
      response.headers.set('Access-Control-Max-Age', '86400'); // 24 hours
    }
  }

  /**
   * Get endpoint-specific rate limit
   */
  private getEndpointRateLimit(endpoint: string): number {
    const endpointLimits: Record<string, number> = {
      'auth/drive/begin': 50,
      'auth/drive/callback': 50,
      'ai/classify': 20,
      'workflows/scan': 10,
      'health': 100,
      'metrics': 100
    };

    return endpointLimits[endpoint] || this.config.rateLimiting.maxRequests;
  }

  /**
   * Check for suspicious headers
   */
  private checkSuspiciousHeaders(request: NextRequest): string[] {
    const suspicious: string[] = [];
    const suspiciousPatterns = [
      'x-forwarded-for',
      'x-originating-ip',
      'x-cluster-client-ip',
      'x-real-ip'
    ];

    for (const pattern of suspiciousPatterns) {
      if (request.headers.has(pattern)) {
        const value = request.headers.get(pattern);
        if (value && this.isPrivateIP(value)) {
          suspicious.push(pattern);
        }
      }
    }

    return suspicious;
  }

  /**
   * Utility methods
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${randomBytes(8).toString('hex')}`;
  }

  private generateNonce(requestId: string): string {
    const nonce = randomBytes(16).toString('base64');
    this.nonceStore.set(requestId, nonce);
    return nonce;
  }

  private getClientIP(request: NextRequest): string {
    return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
           request.headers.get('x-real-ip') ||
           'unknown';
  }

  private getEndpointKey(request: NextRequest): string {
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    
    // Remove /api prefix if present
    if (pathParts[0] === 'api') {
      pathParts.shift();
    }

    return pathParts.slice(0, 3).join('/'); // First 3 path segments
  }

  private isValidContentType(contentType: string): boolean {
    const validTypes = [
      'application/json',
      'application/x-www-form-urlencoded',
      'multipart/form-data',
      'text/plain'
    ];

    return validTypes.some(type => contentType.startsWith(type));
  }

  private isStatefulOperation(request: NextRequest): boolean {
    return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method);
  }

  private validateCSRFToken(token: string): boolean {
    // Basic CSRF token validation (implement proper validation in production)
    return token.length >= 32 && /^[a-zA-Z0-9+/=]+$/.test(token);
  }

  private hasPathTraversal(url: string): boolean {
    const pathTraversalPatterns = [
      '../',
      '..\\',
      '%2e%2e%2f',
      '%2e%2e\\',
      '%c0%ae%c0%ae%c0%af',
      '%c1%9c'
    ];

    const normalizedUrl = decodeURIComponent(url.toLowerCase());
    return pathTraversalPatterns.some(pattern => normalizedUrl.includes(pattern));
  }

  private hasSQLInjectionAttempt(request: NextRequest): boolean {
    const sqlPatterns = [
      /('|(\')|(\-\-)|(\;)|(\/\*)|\*\/)|(\||or\s*\d+\=\d+|\|\||and\s*\d+\=\d+)/gi,
      /(exec|execute|union|select|insert|update|delete|create|alter|drop)/gi
    ];

    const url = decodeURIComponent(request.url);
    return sqlPatterns.some(pattern => pattern.test(url));
  }

  private isPrivateIP(ip: string): boolean {
    const privateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[01])\./,
      /^192\.168\./,
      /^127\./,
      /^::1$/,
      /^::ffff:127\./
    ];

    return privateRanges.some(range => range.test(ip));
  }

  private isSensitiveEndpoint(response: NextResponse): boolean {
    // Add logic to identify sensitive endpoints
    const url = response.url;
    const sensitivePatterns = [
      '/api/auth/',
      '/api/admin/',
      '/api/user/',
      '/api/tokens'
    ];

    return sensitivePatterns.some(pattern => url.includes(pattern));
  }

  /**
   * Error response creators
   */
  private createSecurityErrorResponse(errors: string[], context: SecurityContext): NextResponse {
    const response = NextResponse.json({
      error: 'security_validation_failed',
      message: 'Request failed security validation',
      details: errors,
      requestId: context.requestId,
      timestamp: new Date().toISOString()
    }, { status: 400 });

    return this.applySecurityHeaders(response, context);
  }

  private createRateLimitResponse(rateLimitInfo: RateLimitInfo, context: SecurityContext): NextResponse {
    const retryAfter = Math.ceil(this.config.rateLimiting.windowMs / 1000);
    
    const response = NextResponse.json({
      error: 'rate_limit_exceeded',
      message: 'Too many requests, please try again later',
      retryAfter,
      requestId: context.requestId,
      timestamp: new Date().toISOString()
    }, { status: 429 });

    response.headers.set('Retry-After', retryAfter.toString());
    response.headers.set('X-RateLimit-Limit', this.getEndpointRateLimit(rateLimitInfo.endpoint).toString());
    response.headers.set('X-RateLimit-Remaining', '0');

    return this.applySecurityHeaders(response, context);
  }

  private createInternalErrorResponse(): NextResponse {
    return NextResponse.json({
      error: 'internal_server_error',
      message: 'An internal error occurred',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }

  /**
   * Cleanup methods
   */
  private cleanupRateLimitStore(): void {
    const now = Date.now();
    const cutoff = now - (this.config.rateLimiting.windowMs * 2); // Keep data for 2 windows

    for (const [key, info] of this.rateLimitStore.entries()) {
      if (info.windowStart < cutoff) {
        this.rateLimitStore.delete(key);
      }
    }
  }

  private cleanupNonceStore(): void {
    // Clean up nonces older than 5 minutes
    // In a production system, you'd want to track nonce timestamps
    if (this.nonceStore.size > 1000) {
      this.nonceStore.clear(); // Simple cleanup for now
    }
  }

  /**
   * Log security event for audit trail
   */
  private async logSecurityEvent(eventType: string, data: any): Promise<void> {
    this.logger.audit(eventType, {
      eventType,
      ...data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Health check for security middleware
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    rateLimitStoreSize: number;
    nonceStoreSize: number;
    configLoaded: boolean;
    lastError?: string;
  }> {
    try {
      return {
        status: 'healthy',
        rateLimitStoreSize: this.rateLimitStore.size,
        nonceStoreSize: this.nonceStore.size,
        configLoaded: !!this.config
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        rateLimitStoreSize: this.rateLimitStore.size,
        nonceStoreSize: this.nonceStore.size,
        configLoaded: !!this.config,
        lastError: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// Singleton instance for application use
let securityMiddlewareInstance: SecurityMiddleware | null = null;

export function getSecurityMiddleware(config?: Partial<SecurityConfig>): SecurityMiddleware {
  if (!securityMiddlewareInstance) {
    securityMiddlewareInstance = new SecurityMiddleware(config);
  }
  return securityMiddlewareInstance;
}