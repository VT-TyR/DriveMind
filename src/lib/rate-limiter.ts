/**
 * Rate Limiter Implementation
 * Production-grade rate limiting with circuit breaker pattern
 * Compliant with ALPHA-CODENAME v1.8 security requirements
 */

import { NextRequest, NextResponse } from 'next/server';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
  keyGenerator?: (req: NextRequest) => string;
}

interface RateLimitStore {
  requests: number;
  resetTime: number;
}

// In-memory store for rate limiting (consider Redis for production scaling)
const rateLimitStore = new Map<string, RateLimitStore>();

// Circuit breaker state
interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  nextRetryTime: number;
}

const circuitBreakerStore = new Map<string, CircuitBreakerState>();

// Default configurations
export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100, // 100 requests per minute
  message: 'Too many requests, please try again later',
};

export const STRICT_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000,
  maxRequests: 20, // Strict limit for sensitive endpoints
  message: 'Rate limit exceeded for sensitive operation',
};

export const AUTH_RATE_LIMIT: RateLimitConfig = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5, // 5 auth attempts per 15 minutes
  message: 'Too many authentication attempts',
};

// Circuit breaker configuration
const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5,
  resetTimeout: 60000, // 1 minute
  halfOpenRequests: 3,
};

/**
 * Clean up expired entries to prevent memory leaks
 */
function cleanupExpiredEntries() {
  const now = Date.now();
  
  // Cleanup rate limit store
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.resetTime <= now) {
      rateLimitStore.delete(key);
    }
  }
  
  // Cleanup circuit breaker store
  for (const [key, state] of circuitBreakerStore.entries()) {
    if (state.state === 'CLOSED' && 
        now - state.lastFailureTime > CIRCUIT_BREAKER_CONFIG.resetTimeout * 2) {
      circuitBreakerStore.delete(key);
    }
  }
}

// Run cleanup every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupExpiredEntries, 5 * 60 * 1000);
}

/**
 * Generate a unique key for rate limiting
 */
function generateKey(req: NextRequest, keyGenerator?: (req: NextRequest) => string): string {
  if (keyGenerator) {
    return keyGenerator(req);
  }
  
  // Default: Use IP address or fallback to a header
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : 
             req.headers.get('x-real-ip') || 
             'unknown';
  
  return `${req.nextUrl.pathname}:${ip}`;
}

/**
 * Check circuit breaker state
 */
function checkCircuitBreaker(key: string): boolean {
  const state = circuitBreakerStore.get(key);
  if (!state) return true; // Circuit closed, allow request
  
  const now = Date.now();
  
  switch (state.state) {
    case 'OPEN':
      if (now >= state.nextRetryTime) {
        // Transition to half-open
        state.state = 'HALF_OPEN';
        state.failures = 0;
        return true;
      }
      return false; // Circuit open, reject request
      
    case 'HALF_OPEN':
      return state.failures < CIRCUIT_BREAKER_CONFIG.halfOpenRequests;
      
    case 'CLOSED':
    default:
      return true;
  }
}

/**
 * Record circuit breaker success
 */
function recordSuccess(key: string) {
  const state = circuitBreakerStore.get(key);
  if (state && state.state === 'HALF_OPEN') {
    state.state = 'CLOSED';
    state.failures = 0;
  }
}

/**
 * Record circuit breaker failure
 */
function recordFailure(key: string) {
  let state = circuitBreakerStore.get(key);
  
  if (!state) {
    state = {
      failures: 1,
      lastFailureTime: Date.now(),
      state: 'CLOSED',
      nextRetryTime: 0,
    };
    circuitBreakerStore.set(key, state);
  } else {
    state.failures++;
    state.lastFailureTime = Date.now();
    
    if (state.failures >= CIRCUIT_BREAKER_CONFIG.failureThreshold) {
      state.state = 'OPEN';
      state.nextRetryTime = Date.now() + CIRCUIT_BREAKER_CONFIG.resetTimeout;
    }
  }
}

/**
 * Rate limiter middleware
 */
export function createRateLimiter(config: RateLimitConfig = DEFAULT_RATE_LIMIT) {
  return async function rateLimiter(
    req: NextRequest,
    next?: () => Promise<NextResponse>
  ): Promise<NextResponse> {
    const key = generateKey(req, config.keyGenerator);
    const now = Date.now();
    
    // Check circuit breaker first
    if (!checkCircuitBreaker(key)) {
      return NextResponse.json(
        { 
          error: 'Service temporarily unavailable', 
          message: 'Circuit breaker is open due to high failure rate',
          retryAfter: Math.ceil(CIRCUIT_BREAKER_CONFIG.resetTimeout / 1000),
        },
        { 
          status: 503,
          headers: {
            'Retry-After': String(Math.ceil(CIRCUIT_BREAKER_CONFIG.resetTimeout / 1000)),
            'X-RateLimit-Policy': 'circuit-breaker',
          },
        }
      );
    }
    
    // Get or create rate limit entry
    let limitData = rateLimitStore.get(key);
    
    if (!limitData || limitData.resetTime <= now) {
      limitData = {
        requests: 0,
        resetTime: now + config.windowMs,
      };
      rateLimitStore.set(key, limitData);
    }
    
    // Check rate limit
    if (limitData.requests >= config.maxRequests) {
      recordFailure(key);
      
      const retryAfter = Math.ceil((limitData.resetTime - now) / 1000);
      
      return NextResponse.json(
        { 
          error: 'Too Many Requests',
          message: config.message,
          retryAfter,
        },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': String(config.maxRequests),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': new Date(limitData.resetTime).toISOString(),
            'Retry-After': String(retryAfter),
          },
        }
      );
    }
    
    // Increment request count
    limitData.requests++;
    
    // Process request
    let response: NextResponse;
    try {
      if (next) {
        response = await next();
      } else {
        response = NextResponse.next();
      }
      
      // Record success if not skipping successful requests
      if (!config.skipSuccessfulRequests || response.status >= 400) {
        recordSuccess(key);
      }
    } catch (error) {
      recordFailure(key);
      throw error;
    }
    
    // Add rate limit headers to response
    const headers = new Headers(response.headers);
    headers.set('X-RateLimit-Limit', String(config.maxRequests));
    headers.set('X-RateLimit-Remaining', String(Math.max(0, config.maxRequests - limitData.requests)));
    headers.set('X-RateLimit-Reset', new Date(limitData.resetTime).toISOString());
    
    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}

/**
 * Compose multiple rate limiters
 */
export function composeRateLimiters(...limiters: ReturnType<typeof createRateLimiter>[]) {
  return async function composedRateLimiter(
    req: NextRequest,
    next?: () => Promise<NextResponse>
  ): Promise<NextResponse> {
    for (const limiter of limiters) {
      const result = await limiter(req, next);
      if (result.status === 429 || result.status === 503) {
        return result;
      }
    }
    return next ? await next() : NextResponse.next();
  };
}

/**
 * Get current rate limit status
 */
export function getRateLimitStatus(req: NextRequest, config: RateLimitConfig = DEFAULT_RATE_LIMIT) {
  const key = generateKey(req, config.keyGenerator);
  const now = Date.now();
  const limitData = rateLimitStore.get(key);
  
  if (!limitData || limitData.resetTime <= now) {
    return {
      limit: config.maxRequests,
      remaining: config.maxRequests,
      reset: new Date(now + config.windowMs),
      requests: 0,
    };
  }
  
  return {
    limit: config.maxRequests,
    remaining: Math.max(0, config.maxRequests - limitData.requests),
    reset: new Date(limitData.resetTime),
    requests: limitData.requests,
  };
}

/**
 * Reset rate limit for a specific key
 */
export function resetRateLimit(req: NextRequest, config: RateLimitConfig = DEFAULT_RATE_LIMIT) {
  const key = generateKey(req, config.keyGenerator);
  rateLimitStore.delete(key);
  circuitBreakerStore.delete(key);
}