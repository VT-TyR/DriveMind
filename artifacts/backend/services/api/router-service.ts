/**
 * Router Service - Production Implementation
 * Centralized API routing with middleware integration and security
 */

import { z } from 'zod';
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../logging/logger';
import { metrics } from '../monitoring/metrics';
import { securityMiddleware } from '../security/security-middleware';
import { AuthService } from '../auth/auth-service';
import { DriveService } from '../drive/drive-service';
import { AIService } from '../ai/ai-service';
import { healthService } from '../system/health-service';
import { 
  ValidationError, 
  AuthError, 
  NotFoundError, 
  RateLimitError,
  APIError 
} from '../errors/error-types';

// Request context interface
export interface RequestContext {
  userId?: string;
  userAgent?: string;
  ip?: string;
  correlationId: string;
  startTime: number;
  route: string;
  method: string;
  authenticated: boolean;
  rateLimited: boolean;
}

// Route configuration
interface RouteConfig {
  path: string;
  method: string;
  handler: (req: NextRequest, context: RequestContext) => Promise<NextResponse>;
  authentication?: 'required' | 'optional' | 'none';
  rateLimit?: {
    requests: number;
    window: number; // seconds
    key: 'ip' | 'user' | 'combined';
  };
  validation?: {
    body?: z.ZodSchema;
    query?: z.ZodSchema;
    headers?: z.ZodSchema;
  };
  security?: {
    requireConsent?: boolean;
    requireAdmin?: boolean;
    allowedOrigins?: string[];
  };
}

/**
 * API Router Service with comprehensive middleware
 */
export class RouterService {
  private static instance: RouterService;
  private routes = new Map<string, RouteConfig>();
  private authService: AuthService;
  private driveService: DriveService;
  private aiService: AIService;
  private rateLimiter = new Map<string, { count: number; resetTime: number }>();

  private constructor() {
    this.authService = AuthService.getInstance();
    this.driveService = DriveService.getInstance();
    this.aiService = AIService.getInstance();
    
    this.registerRoutes();
    this.startRateLimitCleanup();
  }

  public static getInstance(): RouterService {
    if (!RouterService.instance) {
      RouterService.instance = new RouterService();
    }
    return RouterService.instance;
  }

  /**
   * Handle incoming API request with full middleware stack
   */
  async handleRequest(req: NextRequest): Promise<NextResponse> {
    const startTime = Date.now();
    const correlationId = this.generateCorrelationId();
    const route = this.extractRoute(req.url);
    const method = req.method;

    // Create request context
    const context: RequestContext = {
      correlationId,
      startTime,
      route,
      method,
      ip: this.extractClientIP(req),
      userAgent: req.headers.get('user-agent') || undefined,
      authenticated: false,
      rateLimited: false,
    };

    try {
      logger.info('API request received', {
        correlationId,
        method,
        route,
        ip: context.ip,
        userAgent: context.userAgent,
      });

      // Apply security middleware first
      const securityResponse = await securityMiddleware.process(req, context);
      if (securityResponse) {
        return securityResponse;
      }

      // Find matching route
      const routeConfig = this.findRoute(route, method);
      if (!routeConfig) {
        throw new NotFoundError(`Route not found: ${method} ${route}`);
      }

      // Apply rate limiting
      await this.applyRateLimit(req, context, routeConfig);

      // Apply authentication
      if (routeConfig.authentication === 'required') {
        await this.authenticateRequest(req, context);
      } else if (routeConfig.authentication === 'optional') {
        try {
          await this.authenticateRequest(req, context);
        } catch (error) {
          // Optional auth failure is not fatal
          logger.debug('Optional authentication failed', {
            correlationId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Apply request validation
      if (routeConfig.validation) {
        await this.validateRequest(req, routeConfig.validation, context);
      }

      // Apply security checks
      if (routeConfig.security) {
        await this.applySecurityChecks(req, context, routeConfig.security);
      }

      // Execute route handler
      const response = await routeConfig.handler(req, context);

      // Apply response security headers
      this.applyResponseSecurity(response, routeConfig);

      // Record successful request metrics
      const duration = Date.now() - startTime;
      this.recordRequestMetrics(context, response.status, duration);

      logger.info('API request completed', {
        correlationId,
        method,
        route,
        status: response.status,
        duration,
        authenticated: context.authenticated,
      });

      return response;

    } catch (error) {
      return this.handleError(error, context);
    }
  }

  // Private helper methods

  private registerRoutes() {
    // Health and System Routes
    this.addRoute({
      path: '/health',
      method: 'GET',
      handler: this.healthCheckHandler.bind(this),
      authentication: 'none',
      rateLimit: { requests: 100, window: 60, key: 'ip' },
    });

    this.addRoute({
      path: '/metrics',
      method: 'GET',
      handler: this.metricsHandler.bind(this),
      authentication: 'none',
      rateLimit: { requests: 100, window: 60, key: 'ip' },
    });

    this.addRoute({
      path: '/metrics',
      method: 'POST',
      handler: this.logMetricsHandler.bind(this),
      authentication: 'none',
      rateLimit: { requests: 50, window: 60, key: 'ip' },
      validation: {
        body: z.object({
          event: z.string(),
          data: z.record(z.unknown()).optional(),
          timestamp: z.string().optional(),
        }),
      },
    });

    // Authentication Routes
    this.addRoute({
      path: '/auth/drive/begin',
      method: 'POST',
      handler: this.authBeginHandler.bind(this),
      authentication: 'none',
      rateLimit: { requests: 50, window: 60, key: 'ip' },
      validation: {
        body: z.object({
          userId: z.string().optional(),
        }).optional(),
      },
    });

    this.addRoute({
      path: '/auth/drive/callback',
      method: 'GET',
      handler: this.authCallbackHandler.bind(this),
      authentication: 'none',
      rateLimit: { requests: 100, window: 60, key: 'ip' },
    });

    this.addRoute({
      path: '/auth/drive/callback',
      method: 'POST',
      handler: this.authCallbackPostHandler.bind(this),
      authentication: 'none',
      rateLimit: { requests: 100, window: 60, key: 'ip' },
      validation: {
        body: z.object({
          code: z.string(),
          state: z.string().optional(),
          error: z.string().optional(),
        }),
      },
    });

    this.addRoute({
      path: '/auth/drive/status',
      method: 'GET',
      handler: this.authStatusHandler.bind(this),
      authentication: 'required',
      rateLimit: { requests: 60, window: 60, key: 'user' },
    });

    this.addRoute({
      path: '/auth/drive/sync',
      method: 'POST',
      handler: this.authSyncHandler.bind(this),
      authentication: 'required',
      rateLimit: { requests: 30, window: 60, key: 'user' },
      validation: {
        body: z.object({
          userId: z.string(),
        }),
      },
    });

    // Workflow Routes
    this.addRoute({
      path: '/workflows/scan',
      method: 'POST',
      handler: this.scanHandler.bind(this),
      authentication: 'required',
      rateLimit: { requests: 10, window: 60, key: 'user' },
      validation: {
        body: z.object({
          maxDepth: z.number().int().min(1).max(50).default(20),
          includeTrashed: z.boolean().default(false),
          scanSharedDrives: z.boolean().default(false),
        }).optional(),
      },
    });

    this.addRoute({
      path: '/workflows/duplicates',
      method: 'POST',
      handler: this.duplicatesHandler.bind(this),
      authentication: 'required',
      rateLimit: { requests: 5, window: 60, key: 'user' },
      validation: {
        body: z.object({
          algorithm: z.enum(['content_hash', 'fuzzy_match', 'combined']).default('combined'),
          threshold: z.number().min(0.1).max(1.0).default(0.85),
          includeVersions: z.boolean().default(true),
        }).optional(),
      },
    });

    // AI Routes
    this.addRoute({
      path: '/ai/classify',
      method: 'POST',
      handler: this.aiClassifyHandler.bind(this),
      authentication: 'required',
      rateLimit: { requests: 20, window: 60, key: 'user' },
      validation: {
        body: z.object({
          userId: z.string(),
          fileIds: z.array(z.string()).min(1).max(50),
          categories: z.array(z.string()).optional(),
          includeContent: z.boolean().default(false),
          redactionLevel: z.enum(['basic', 'comprehensive', 'strict']).default('comprehensive'),
          consentConfirmed: z.boolean(),
        }),
      },
      security: {
        requireConsent: true,
      },
    });

    this.addRoute({
      path: '/ai/health-check',
      method: 'GET',
      handler: this.aiHealthHandler.bind(this),
      authentication: 'none',
      rateLimit: { requests: 60, window: 60, key: 'ip' },
    });
  }

  private addRoute(config: RouteConfig) {
    const key = `${config.method}:${config.path}`;
    this.routes.set(key, config);
    
    logger.debug('Route registered', {
      method: config.method,
      path: config.path,
      authentication: config.authentication || 'none',
      rateLimit: config.rateLimit ? 'enabled' : 'disabled',
    });
  }

  private findRoute(path: string, method: string): RouteConfig | null {
    const exactKey = `${method}:${path}`;
    const exactMatch = this.routes.get(exactKey);
    
    if (exactMatch) {
      return exactMatch;
    }

    // Try pattern matching for dynamic routes
    for (const [key, config] of this.routes.entries()) {
      if (key.startsWith(`${method}:`)) {
        const routePath = key.substring(method.length + 1);
        if (this.matchPath(routePath, path)) {
          return config;
        }
      }
    }

    return null;
  }

  private matchPath(pattern: string, path: string): boolean {
    // Simple pattern matching - can be enhanced for complex patterns
    if (pattern === path) return true;
    
    // Handle wildcard patterns
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(path);
    }
    
    return false;
  }

  private extractRoute(url: string): string {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    
    // Remove /api prefix if present
    return pathname.startsWith('/api') ? pathname.substring(4) : pathname;
  }

  private extractClientIP(req: NextRequest): string {
    return (
      req.headers.get('x-forwarded-for')?.split(',')[0] ||
      req.headers.get('x-real-ip') ||
      req.headers.get('cf-connecting-ip') ||
      '127.0.0.1'
    );
  }

  private generateCorrelationId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private async applyRateLimit(
    req: NextRequest,
    context: RequestContext,
    config: RouteConfig
  ): Promise<void> {
    if (!config.rateLimit) return;

    const key = this.getRateLimitKey(context, config.rateLimit.key);
    const now = Date.now();
    const windowStart = now - (config.rateLimit.window * 1000);

    const current = this.rateLimiter.get(key);
    
    if (current && current.resetTime > now) {
      if (current.count >= config.rateLimit.requests) {
        context.rateLimited = true;
        
        logger.warn('Rate limit exceeded', {
          correlationId: context.correlationId,
          key,
          count: current.count,
          limit: config.rateLimit.requests,
        });

        throw new RateLimitError('Rate limit exceeded', {
          limit: config.rateLimit.requests,
          window: config.rateLimit.window,
          resetTime: current.resetTime,
        });
      }
      
      this.rateLimiter.set(key, {
        count: current.count + 1,
        resetTime: current.resetTime,
      });
    } else {
      this.rateLimiter.set(key, {
        count: 1,
        resetTime: now + (config.rateLimit.window * 1000),
      });
    }
  }

  private getRateLimitKey(context: RequestContext, keyType: 'ip' | 'user' | 'combined'): string {
    switch (keyType) {
      case 'ip':
        return `ip:${context.ip}`;
      case 'user':
        return `user:${context.userId || context.ip}`;
      case 'combined':
        return `combined:${context.userId || 'anon'}:${context.ip}`;
      default:
        return `default:${context.ip}`;
    }
  }

  private async authenticateRequest(req: NextRequest, context: RequestContext): Promise<void> {
    try {
      const authHeader = req.headers.get('authorization');
      const cookieHeader = req.headers.get('cookie');

      let token: string | null = null;

      // Try Bearer token first
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
      
      // Fall back to cookies
      if (!token && cookieHeader) {
        const cookies = this.parseCookies(cookieHeader);
        token = cookies.access_token || cookies.google_access_token;
      }

      if (!token) {
        throw new AuthError('No authentication token provided');
      }

      // Validate token and get user ID
      const userId = await this.authService.validateToken(token);
      context.userId = userId;
      context.authenticated = true;

      logger.debug('Request authenticated', {
        correlationId: context.correlationId,
        userId: userId.substring(0, 8) + '...',
      });

    } catch (error) {
      logger.warn('Authentication failed', {
        correlationId: context.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      throw new AuthError('Invalid or expired authentication token');
    }
  }

  private async validateRequest(
    req: NextRequest,
    validation: NonNullable<RouteConfig['validation']>,
    context: RequestContext
  ): Promise<void> {
    try {
      // Validate body
      if (validation.body) {
        const body = await req.json().catch(() => ({}));
        validation.body.parse(body);
      }

      // Validate query parameters
      if (validation.query) {
        const url = new URL(req.url);
        const queryParams = Object.fromEntries(url.searchParams.entries());
        validation.query.parse(queryParams);
      }

      // Validate headers
      if (validation.headers) {
        const headers = Object.fromEntries(req.headers.entries());
        validation.headers.parse(headers);
      }

    } catch (error) {
      if (error instanceof z.ZodError) {
        const message = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
        throw new ValidationError(`Request validation failed: ${message}`);
      }
      throw error;
    }
  }

  private async applySecurityChecks(
    req: NextRequest,
    context: RequestContext,
    security: NonNullable<RouteConfig['security']>
  ): Promise<void> {
    // Check consent requirement
    if (security.requireConsent && context.userId) {
      // This would integrate with consent service
      logger.debug('Consent check required', {
        correlationId: context.correlationId,
        userId: context.userId,
      });
    }

    // Check admin requirement
    if (security.requireAdmin) {
      // This would check admin role
      logger.debug('Admin access required', {
        correlationId: context.correlationId,
        userId: context.userId,
      });
    }

    // Check allowed origins
    if (security.allowedOrigins) {
      const origin = req.headers.get('origin');
      if (origin && !security.allowedOrigins.includes(origin)) {
        throw new AuthError(`Origin not allowed: ${origin}`);
      }
    }
  }

  private applyResponseSecurity(response: NextResponse, config: RouteConfig) {
    // Apply standard security headers
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-XSS-Protection', '1; mode=block');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Apply HSTS for HTTPS
    if (process.env.NODE_ENV === 'production') {
      response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    // Add correlation ID header
    const correlationId = response.headers.get('x-correlation-id');
    if (correlationId) {
      response.headers.set('X-Correlation-ID', correlationId);
    }
  }

  private recordRequestMetrics(context: RequestContext, status: number, duration: number) {
    metrics.recordEvent('api_request_completed', {
      method: context.method,
      route: context.route,
      status,
      duration,
      authenticated: context.authenticated,
      rateLimited: context.rateLimited,
      correlationId: context.correlationId,
    });

    // Record specific metrics
    metrics.recordLatency(context.route, duration);
    metrics.recordStatusCode(status);
    
    if (context.rateLimited) {
      metrics.recordEvent('rate_limit_applied', {
        route: context.route,
        correlationId: context.correlationId,
      });
    }
  }

  private handleError(error: unknown, context: RequestContext): NextResponse {
    const duration = Date.now() - context.startTime;
    
    let status = 500;
    let code = 'internal_server_error';
    let message = 'An unexpected error occurred';

    if (error instanceof ValidationError) {
      status = 400;
      code = 'validation_error';
      message = error.message;
    } else if (error instanceof AuthError) {
      status = 401;
      code = 'unauthorized';
      message = error.message;
    } else if (error instanceof NotFoundError) {
      status = 404;
      code = 'not_found';
      message = error.message;
    } else if (error instanceof RateLimitError) {
      status = 429;
      code = 'rate_limit_exceeded';
      message = error.message;
    } else if (error instanceof APIError) {
      status = error.statusCode || 500;
      code = error.code || 'api_error';
      message = error.message;
    }

    const errorResponse = {
      error: code,
      message,
      timestamp: new Date().toISOString(),
      correlationId: context.correlationId,
    };

    logger.error('API request failed', {
      correlationId: context.correlationId,
      method: context.method,
      route: context.route,
      status,
      duration,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });

    metrics.recordEvent('api_request_failed', {
      method: context.method,
      route: context.route,
      status,
      duration,
      errorType: error instanceof Error ? error.constructor.name : 'UnknownError',
      correlationId: context.correlationId,
    });

    const response = NextResponse.json(errorResponse, { status });
    this.applyResponseSecurity(response, { path: context.route, method: context.method, handler: async () => response });
    
    return response;
  }

  private parseCookies(cookieHeader: string): Record<string, string> {
    return cookieHeader
      .split(';')
      .map(cookie => cookie.trim().split('='))
      .reduce((acc, [key, value]) => {
        if (key && value) {
          acc[key] = decodeURIComponent(value);
        }
        return acc;
      }, {} as Record<string, string>);
  }

  private startRateLimitCleanup() {
    // Clean up expired rate limit entries every minute
    setInterval(() => {
      const now = Date.now();
      for (const [key, data] of this.rateLimiter.entries()) {
        if (data.resetTime <= now) {
          this.rateLimiter.delete(key);
        }
      }
    }, 60000);
  }

  // Route Handlers

  private async healthCheckHandler(req: NextRequest, context: RequestContext): Promise<NextResponse> {
    const health = await healthService.checkHealth();
    return NextResponse.json(health, { 
      status: health.status === 'healthy' ? 200 : 503,
      headers: { 'Cache-Control': 'no-cache' },
    });
  }

  private async metricsHandler(req: NextRequest, context: RequestContext): Promise<NextResponse> {
    const metricsData = await metrics.getSystemMetrics();
    return NextResponse.json(metricsData, {
      headers: { 'Cache-Control': 'no-cache' },
    });
  }

  private async logMetricsHandler(req: NextRequest, context: RequestContext): Promise<NextResponse> {
    const body = await req.json();
    await metrics.recordCustomEvent(body.event, body.data, body.timestamp);
    
    return NextResponse.json({
      success: true,
      message: 'Metric recorded',
      timestamp: new Date().toISOString(),
    });
  }

  private async authBeginHandler(req: NextRequest, context: RequestContext): Promise<NextResponse> {
    const body = await req.json().catch(() => ({}));
    const result = await this.authService.beginOAuth(body);
    
    return NextResponse.json(result);
  }

  private async authCallbackHandler(req: NextRequest, context: RequestContext): Promise<NextResponse> {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    const result = await this.authService.handleCallback({ code, state, error });
    
    if (result.success) {
      const redirectUrl = process.env.NEXT_PUBLIC_BASE_URL + '/dashboard?drive_connected=true';
      return NextResponse.redirect(redirectUrl, {
        headers: result.cookies ? { 'Set-Cookie': result.cookies } : {},
      });
    } else {
      const errorUrl = process.env.NEXT_PUBLIC_BASE_URL + '/auth/error?error=' + encodeURIComponent(result.error || 'Unknown error');
      return NextResponse.redirect(errorUrl);
    }
  }

  private async authCallbackPostHandler(req: NextRequest, context: RequestContext): Promise<NextResponse> {
    const body = await req.json();
    const result = await this.authService.handleCallback(body);
    
    return NextResponse.json(result, {
      headers: result.cookies ? { 'Set-Cookie': result.cookies } : {},
    });
  }

  private async authStatusHandler(req: NextRequest, context: RequestContext): Promise<NextResponse> {
    const status = await this.authService.getStatus(context.userId!);
    return NextResponse.json(status);
  }

  private async authSyncHandler(req: NextRequest, context: RequestContext): Promise<NextResponse> {
    const body = await req.json();
    const result = await this.authService.syncTokens(body.userId);
    return NextResponse.json(result);
  }

  private async scanHandler(req: NextRequest, context: RequestContext): Promise<NextResponse> {
    const body = await req.json().catch(() => ({}));
    const result = await this.driveService.scanDrive(context.userId!, body);
    
    if (result.async) {
      return NextResponse.json(result, { status: 202 });
    } else {
      return NextResponse.json(result);
    }
  }

  private async duplicatesHandler(req: NextRequest, context: RequestContext): Promise<NextResponse> {
    const body = await req.json().catch(() => ({}));
    const result = await this.driveService.detectDuplicates(context.userId!, body);
    return NextResponse.json(result);
  }

  private async aiClassifyHandler(req: NextRequest, context: RequestContext): Promise<NextResponse> {
    const body = await req.json();
    const result = await this.aiService.classifyFiles(body);
    return NextResponse.json(result);
  }

  private async aiHealthHandler(req: NextRequest, context: RequestContext): Promise<NextResponse> {
    const health = await this.aiService.healthCheck();
    return NextResponse.json(health, {
      status: health.status === 'healthy' ? 200 : 503,
    });
  }
}

// Export singleton instance
export const routerService = RouterService.getInstance();