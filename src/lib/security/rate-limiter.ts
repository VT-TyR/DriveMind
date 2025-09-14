/**
 * @fileoverview Rate limiting middleware for API endpoints
 * Implements token bucket algorithm with Redis/in-memory fallback
 * ALPHA-CODENAME v1.8 compliant
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: NextRequest) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  message?: string;
}

interface RateLimitStore {
  [key: string]: {
    requests: number;
    resetTime: number;
  };
}

// In-memory store for rate limiting (should use Redis in production)
const rateLimitStore: RateLimitStore = {};

// Cleanup expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const key in rateLimitStore) {
    if (rateLimitStore[key].resetTime < now) {
      delete rateLimitStore[key];
    }
  }
}, 60000); // Clean every minute

/**
 * Default key generator using IP address
 */
function defaultKeyGenerator(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown';
  return `ratelimit:${ip}`;
}

/**
 * Rate limiting middleware factory
 */
export function createRateLimiter(config: RateLimitConfig) {
  const {
    windowMs,
    maxRequests,
    keyGenerator = defaultKeyGenerator,
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    message = 'Too many requests, please try again later',
  } = config;

  return async function rateLimiter(
    req: NextRequest,
    handler: (req: NextRequest) => Promise<NextResponse>
  ): Promise<NextResponse> {
    const key = keyGenerator(req);
    const now = Date.now();
    const resetTime = now + windowMs;

    // Get or create rate limit entry
    if (!rateLimitStore[key] || rateLimitStore[key].resetTime < now) {
      rateLimitStore[key] = {
        requests: 0,
        resetTime,
      };
    }

    const entry = rateLimitStore[key];

    // Check if limit exceeded
    if (entry.requests >= maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      
      logger.warn(`Rate limit exceeded for ${key}: ${entry.requests}/${maxRequests}`);
      
      return NextResponse.json(
        { 
          error: message,
          retryAfter,
        },
        { 
          status: 429,
          headers: {
            'Retry-After': retryAfter.toString(),
            'X-RateLimit-Limit': maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': new Date(entry.resetTime).toISOString(),
          },
        }
      );
    }

    // Increment request count
    entry.requests++;

    // Execute handler
    try {
      const response = await handler(req);
      
      // Skip counting successful requests if configured
      if (skipSuccessfulRequests && response.status < 400) {
        entry.requests--;
      }

      // Add rate limit headers to response
      const remaining = Math.max(0, maxRequests - entry.requests);
      response.headers.set('X-RateLimit-Limit', maxRequests.toString());
      response.headers.set('X-RateLimit-Remaining', remaining.toString());
      response.headers.set('X-RateLimit-Reset', new Date(entry.resetTime).toISOString());

      return response;
    } catch (error) {
      // Skip counting failed requests if configured
      if (skipFailedRequests) {
        entry.requests--;
      }
      throw error;
    }
  };
}

/**
 * Pre-configured rate limiters for different endpoint types
 */
export const rateLimiters = {
  // Strict limit for authentication endpoints
  auth: createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5, // 5 requests per 15 minutes
    message: 'Too many authentication attempts, please try again later',
  }),

  // Moderate limit for API endpoints
  api: createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 60, // 60 requests per minute
    message: 'API rate limit exceeded, please slow down',
  }),

  // Relaxed limit for read operations
  read: createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100, // 100 requests per minute
    message: 'Read rate limit exceeded',
  }),

  // Strict limit for write operations
  write: createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 20, // 20 requests per minute
    message: 'Write rate limit exceeded',
  }),

  // Very strict limit for expensive operations
  expensive: createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 10, // 10 requests per hour
    message: 'Resource-intensive operation limit exceeded',
  }),
};

/**
 * Rate limit by user ID (for authenticated endpoints)
 */
export function createUserRateLimiter(config: Omit<RateLimitConfig, 'keyGenerator'>) {
  return createRateLimiter({
    ...config,
    keyGenerator: (req: NextRequest) => {
      // Extract user ID from authorization header or session
      const token = req.headers.get('authorization')?.replace('Bearer ', '');
      // In production, decode the token to get user ID
      return `ratelimit:user:${token?.substring(0, 16) || 'anonymous'}`;
    },
  });
}

/**
 * Distributed rate limiter interface for Redis/Firestore backing
 */
export interface DistributedRateLimiter {
  check(key: string, limit: number, windowMs: number): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: number;
  }>;
  reset(key: string): Promise<void>;
}

/**
 * Circuit breaker for rate limiting
 */
export class RateLimitCircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  constructor(
    private readonly threshold = 5,
    private readonly timeout = 60000, // 1 minute
    private readonly halfOpenRequests = 3
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'half-open';
        this.failures = 0;
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();
      
      if (this.state === 'half-open') {
        this.failures = 0;
        this.state = 'closed';
      }
      
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();
      
      if (this.failures >= this.threshold) {
        this.state = 'open';
        logger.error(`Circuit breaker opened after ${this.failures} failures`);
      }
      
      throw error;
    }
  }

  reset(): void {
    this.failures = 0;
    this.state = 'closed';
    this.lastFailureTime = 0;
  }

  getState(): string {
    return this.state;
  }
}