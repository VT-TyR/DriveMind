# Rate Limiting Strategy

**Version**: 1.0.0  
**Project**: DriveMind  
**Last Updated**: 2025-01-12  

## Overview

This document defines the comprehensive rate limiting strategy for DriveMind's API endpoints and external service integrations. The strategy ensures system stability, fair resource allocation, and compliance with external API quotas.

## Rate Limiting Tiers

### 1. Public Endpoints (No Authentication)
```yaml
health:
  limit: 200 requests/minute per IP
  burst: 10 requests/second
  
metrics:
  limit: 100 requests/minute per IP
  burst: 5 requests/second
  
oauth/begin:
  limit: 100 requests/minute per IP
  burst: 3 requests/second
  
oauth/callback:
  limit: 50 requests/minute per IP
  burst: 2 requests/second
```

### 2. Authenticated User Endpoints
```yaml
auth/status:
  limit: 200 requests/minute per user
  burst: 10 requests/second
  
auth/sync:
  limit: 20 requests/minute per user
  burst: 1 request/second
  
workflows/scan:
  limit: 10 requests/hour per user
  burst: 1 request/minute
  
workflows/duplicates:
  limit: 30 requests/minute per user
  burst: 2 requests/second
  
workflows/organize:
  limit: 20 requests/minute per user
  burst: 1 request/second
```

### 3. AI Endpoints (Resource Intensive)
```yaml
ai/classify:
  limit: 30 requests/minute per user
  burst: 1 request/second
  batch_limit: 100 files per request
  
ai/propose-rule:
  limit: 10 requests/minute per user
  burst: 1 request/5seconds
  
ai/health-check:
  limit: 60 requests/minute per IP
  burst: 2 requests/second
```

### 4. Background Operations
```yaml
workflows/background-scan:
  limit: 5 requests/hour per user
  burst: 1 request/10minutes
  
workflows/background-scan/state:
  limit: 100 requests/minute per user
  burst: 5 requests/second
```

## Implementation Architecture

### 1. Multi-Layer Rate Limiting

```typescript
interface RateLimitConfig {
  // Layer 1: Infrastructure (Nginx/CloudFlare)
  infrastructure: {
    globalLimit: number;        // Requests per second globally
    ipLimit: number;           // Requests per minute per IP
    geoBased: boolean;         // Geographic restrictions
  };
  
  // Layer 2: Application Level
  application: {
    endpoint: string;
    userLimit: number;         // Per authenticated user
    ipLimit: number;          // Per IP address
    burstLimit: number;       // Burst capacity
    windowMs: number;         // Time window
  };
  
  // Layer 3: Resource Based
  resource: {
    concurrentOperations: number;  // Max concurrent operations
    queueSize: number;            // Queue depth for background tasks
    cpuThreshold: number;         // CPU-based throttling
  };
}
```

### 2. Rate Limiter Implementation

```typescript
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

class DriveMindRateLimiter {
  private redis: Redis;
  private limiters: Map<string, Ratelimit>;
  
  constructor() {
    this.redis = Redis.fromEnv();
    this.limiters = new Map();
    this.initializeLimiters();
  }
  
  private initializeLimiters() {
    // User-based sliding window
    this.limiters.set('user', new Ratelimit({
      redis: this.redis,
      limiter: Ratelimit.slidingWindow(50, "1 m"),
      analytics: true,
      prefix: "drivemind:user"
    }));
    
    // IP-based fixed window
    this.limiters.set('ip', new Ratelimit({
      redis: this.redis,
      limiter: Ratelimit.fixedWindow(100, "1 m"),
      analytics: true,
      prefix: "drivemind:ip"
    }));
    
    // AI operations - token bucket
    this.limiters.set('ai', new Ratelimit({
      redis: this.redis,
      limiter: Ratelimit.tokenBucket(30, "1 m", 5),
      analytics: true,
      prefix: "drivemind:ai"
    }));
    
    // Background operations - strict limit
    this.limiters.set('background', new Ratelimit({
      redis: this.redis,
      limiter: Ratelimit.fixedWindow(5, "1 h"),
      analytics: true,
      prefix: "drivemind:bg"
    }));
  }
  
  async checkLimit(
    type: 'user' | 'ip' | 'ai' | 'background',
    identifier: string,
    endpoint?: string
  ) {
    const limiter = this.limiters.get(type);
    if (!limiter) throw new Error(`Unknown rate limiter type: ${type}`);
    
    const key = endpoint ? `${identifier}:${endpoint}` : identifier;
    const result = await limiter.limit(key);
    
    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
      retryAfter: result.success ? 0 : Math.ceil((result.reset - Date.now()) / 1000)
    };
  }
  
  async getAnalytics(type: string, identifier: string) {
    const key = `${this.limiters.get(type)?.prefix}:${identifier}`;
    return await this.redis.hgetall(key);
  }
}
```

### 3. Middleware Implementation

```typescript
export async function rateLimitMiddleware(
  req: NextRequest,
  context: { params: any }
) {
  const rateLimiter = new DriveMindRateLimiter();
  const endpoint = req.nextUrl.pathname;
  const userAgent = req.headers.get('user-agent') || 'unknown';
  
  // Extract identifiers
  const ip = getClientIP(req);
  const userId = await extractUserId(req);
  
  // Apply multiple rate limits
  const checks = [];
  
  // 1. IP-based check (always applied)
  checks.push(rateLimiter.checkLimit('ip', ip, endpoint));
  
  // 2. User-based check (for authenticated endpoints)
  if (userId && requiresAuth(endpoint)) {
    checks.push(rateLimiter.checkLimit('user', userId, endpoint));
  }
  
  // 3. AI-specific limits
  if (endpoint.startsWith('/ai/')) {
    const aiId = userId || ip;
    checks.push(rateLimiter.checkLimit('ai', aiId, endpoint));
  }
  
  // 4. Background operation limits
  if (endpoint.includes('background-scan') && req.method === 'POST') {
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required for background operations' },
        { status: 401 }
      );
    }
    checks.push(rateLimiter.checkLimit('background', userId, endpoint));
  }
  
  const results = await Promise.all(checks);
  
  // Find most restrictive limit
  const blocked = results.find(result => !result.success);
  if (blocked) {
    return NextResponse.json(
      {
        error: 'rate_limit_exceeded',
        message: 'Too many requests, please try again later',
        retryAfter: blocked.retryAfter,
        endpoint: endpoint
      },
      {
        status: 429,
        headers: {
          'Retry-After': blocked.retryAfter.toString(),
          'X-RateLimit-Limit': blocked.limit.toString(),
          'X-RateLimit-Remaining': blocked.remaining.toString(),
          'X-RateLimit-Reset': blocked.reset.toString()
        }
      }
    );
  }
  
  // Add rate limit headers to successful responses
  const leastRemaining = Math.min(...results.map(r => r.remaining));
  const earliestReset = Math.min(...results.map(r => r.reset));
  
  const response = NextResponse.next();
  response.headers.set('X-RateLimit-Remaining', leastRemaining.toString());
  response.headers.set('X-RateLimit-Reset', earliestReset.toString());
  
  return response;
}
```

## External API Rate Limiting

### 1. Google Drive API Quotas

```typescript
class GoogleDriveRateLimiter {
  private quotas = {
    queries: {
      perUser: 1000,        // Per user per 100 seconds
      global: 100000000     // Global per day
    },
    uploads: {
      perUser: 750,         // Per user per 100 seconds  
      global: 20000000      // Global per day
    }
  };
  
  async executeWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries = 3
  ): Promise<T> {
    let attempt = 0;
    
    while (attempt < maxRetries) {
      try {
        return await operation();
      } catch (error: any) {
        if (error.code === 429 || error.message?.includes('quota')) {
          const retryAfter = error.retryAfter || Math.pow(2, attempt) * 1000;
          console.log(`Rate limited, retrying in ${retryAfter}ms (attempt ${attempt + 1})`);
          
          await new Promise(resolve => setTimeout(resolve, retryAfter));
          attempt++;
          continue;
        }
        throw error;
      }
    }
    
    throw new Error(`Max retries (${maxRetries}) exceeded`);
  }
  
  async batchRequest<T>(
    items: any[],
    batchOperation: (batch: any[]) => Promise<T[]>,
    batchSize = 100
  ): Promise<T[]> {
    const results: T[] = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      
      try {
        const batchResults = await this.executeWithBackoff(() =>
          batchOperation(batch)
        );
        results.push(...batchResults);
      } catch (error) {
        console.error(`Batch ${i / batchSize + 1} failed:`, error);
        throw error;
      }
      
      // Inter-batch delay to respect rate limits
      if (i + batchSize < items.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return results;
  }
}
```

### 2. Gemini AI Rate Limiting

```typescript
class GeminiRateLimiter {
  private quotas = {
    requestsPerMinute: 60,
    tokensPerMinute: 1000000,
    requestsPerDay: 1500
  };
  
  private tokenEstimator = {
    estimateTokens(text: string): number {
      // Rough estimation: 1 token = 4 characters
      return Math.ceil(text.length / 4);
    }
  };
  
  async processWithTokenLimit<T>(
    requests: Array<{ text: string; operation: () => Promise<T> }>,
    concurrency = 3
  ): Promise<T[]> {
    const results: T[] = [];
    const semaphore = new Semaphore(concurrency);
    
    for (const request of requests) {
      await semaphore.acquire();
      
      try {
        // Check token limit before processing
        const estimatedTokens = this.tokenEstimator.estimateTokens(request.text);
        
        if (estimatedTokens > 30000) {
          throw new Error('Request exceeds maximum token limit');
        }
        
        const result = await this.executeWithBackoff(request.operation);
        results.push(result);
        
      } finally {
        semaphore.release();
      }
      
      // Rate limiting delay
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second between requests
    }
    
    return results;
  }
}
```

## Adaptive Rate Limiting

### 1. System Load Based Adjustment

```typescript
class AdaptiveRateLimiter {
  private systemMetrics: SystemMetrics;
  private baseConfig: RateLimitConfig;
  
  constructor() {
    this.systemMetrics = new SystemMetrics();
    this.baseConfig = loadRateLimitConfig();
  }
  
  async getAdaptiveLimit(endpoint: string, baseLimit: number): Promise<number> {
    const metrics = await this.systemMetrics.getCurrent();
    
    // CPU-based adjustment
    let cpuMultiplier = 1.0;
    if (metrics.cpu > 80) cpuMultiplier = 0.5;
    else if (metrics.cpu > 60) cpuMultiplier = 0.7;
    else if (metrics.cpu < 30) cpuMultiplier = 1.3;
    
    // Memory-based adjustment
    let memoryMultiplier = 1.0;
    if (metrics.memory > 85) memoryMultiplier = 0.6;
    else if (metrics.memory > 70) memoryMultiplier = 0.8;
    
    // Response time-based adjustment
    let latencyMultiplier = 1.0;
    const avgLatency = await this.getAverageLatency(endpoint);
    if (avgLatency > 2000) latencyMultiplier = 0.5;  // 2s+
    else if (avgLatency > 1000) latencyMultiplier = 0.7; // 1s+
    
    // Error rate-based adjustment
    let errorMultiplier = 1.0;
    const errorRate = await this.getErrorRate(endpoint);
    if (errorRate > 0.1) errorMultiplier = 0.5;    // 10%+ errors
    else if (errorRate > 0.05) errorMultiplier = 0.7; // 5%+ errors
    
    const finalMultiplier = Math.min(
      cpuMultiplier,
      memoryMultiplier,
      latencyMultiplier,
      errorMultiplier
    );
    
    return Math.floor(baseLimit * finalMultiplier);
  }
  
  private async getAverageLatency(endpoint: string): Promise<number> {
    // Implementation to get P95 latency from metrics
    return 500; // placeholder
  }
  
  private async getErrorRate(endpoint: string): Promise<number> {
    // Implementation to get error rate from metrics
    return 0.02; // placeholder
  }
}
```

### 2. Circuit Breaker Integration

```typescript
class CircuitBreakerRateLimiter {
  private circuitBreaker: CircuitBreaker;
  private rateLimiter: RateLimiter;
  
  constructor(endpoint: string) {
    this.circuitBreaker = new CircuitBreaker({
      timeout: 30000,
      errorThresholdPercentage: 50,
      resetTimeout: 60000
    });
    
    this.rateLimiter = new RateLimiter({
      windowMs: 60000,
      max: 100
    });
  }
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Check rate limit first
    const rateLimitResult = await this.rateLimiter.check();
    if (!rateLimitResult.success) {
      throw new RateLimitError('Rate limit exceeded');
    }
    
    // Execute through circuit breaker
    return await this.circuitBreaker.fire(operation);
  }
}
```

## Monitoring and Alerting

### 1. Rate Limiting Metrics

```typescript
interface RateLimitMetrics {
  endpoint: string;
  timestamp: Date;
  
  // Request metrics
  totalRequests: number;
  blockedRequests: number;
  allowedRequests: number;
  
  // Rate limiting effectiveness
  falsePositives: number;    // Legitimate requests blocked
  falseNegatives: number;    // Malicious requests allowed
  
  // Performance impact
  processingLatency: number; // Time spent on rate limiting
  redisLatency: number;      // Redis operation latency
  
  // System metrics
  cpuUsage: number;
  memoryUsage: number;
  activeConnections: number;
}

class RateLimitMonitor {
  async recordMetrics(metrics: RateLimitMetrics) {
    // Send to monitoring system (Prometheus/Grafana)
    await this.prometheus.recordMetrics(metrics);
    
    // Check alert thresholds
    await this.checkAlertThresholds(metrics);
    
    // Store in time series database
    await this.influxdb.writeMetrics(metrics);
  }
  
  private async checkAlertThresholds(metrics: RateLimitMetrics) {
    const thresholds = {
      blockedRequestsRatio: 0.1,      // 10% blocked requests
      latencyThreshold: 100,           // 100ms rate limiting latency
      falsePositiveRatio: 0.05,       // 5% false positives
      redisLatencyThreshold: 50        // 50ms Redis latency
    };
    
    const blockedRatio = metrics.blockedRequests / metrics.totalRequests;
    const falsePositiveRatio = metrics.falsePositives / metrics.totalRequests;
    
    if (blockedRatio > thresholds.blockedRequestsRatio) {
      await this.sendAlert('HIGH_BLOCK_RATE', metrics);
    }
    
    if (metrics.processingLatency > thresholds.latencyThreshold) {
      await this.sendAlert('HIGH_RATE_LIMIT_LATENCY', metrics);
    }
    
    if (falsePositiveRatio > thresholds.falsePositiveRatio) {
      await this.sendAlert('HIGH_FALSE_POSITIVE_RATE', metrics);
    }
    
    if (metrics.redisLatency > thresholds.redisLatencyThreshold) {
      await this.sendAlert('REDIS_LATENCY_HIGH', metrics);
    }
  }
  
  private async sendAlert(type: string, metrics: RateLimitMetrics) {
    const alert = {
      type,
      severity: 'warning',
      endpoint: metrics.endpoint,
      timestamp: metrics.timestamp,
      metrics,
      runbook: `https://docs.drivemind.ai/runbooks/rate-limiting/${type.toLowerCase()}`
    };
    
    await this.alertManager.send(alert);
  }
}
```

### 2. Dashboard Configuration

```yaml
# Grafana Dashboard Configuration
dashboard:
  title: "DriveMind Rate Limiting"
  panels:
    - title: "Requests by Endpoint"
      type: "graph"
      targets:
        - expr: 'rate(drivemind_requests_total[5m]) by (endpoint)'
        - expr: 'rate(drivemind_requests_blocked_total[5m]) by (endpoint)'
    
    - title: "Rate Limit Effectiveness"
      type: "singlestat"
      targets:
        - expr: 'rate(drivemind_requests_blocked_total[1h]) / rate(drivemind_requests_total[1h])'
    
    - title: "Top Blocked IPs"
      type: "table"
      targets:
        - expr: 'topk(10, rate(drivemind_requests_blocked_total[1h]) by (client_ip))'
    
    - title: "Redis Performance"
      type: "graph"
      targets:
        - expr: 'histogram_quantile(0.95, drivemind_redis_duration_seconds_bucket)'
        - expr: 'histogram_quantile(0.99, drivemind_redis_duration_seconds_bucket)'

alerts:
  - alert: "HighRateLimitBlocks"
    expr: 'rate(drivemind_requests_blocked_total[5m]) / rate(drivemind_requests_total[5m]) > 0.1'
    for: "2m"
    labels:
      severity: "warning"
    annotations:
      summary: "High rate limit block rate detected"
      description: "{{ $value | humanizePercentage }} of requests are being rate limited"
  
  - alert: "RateLimitRedisDown"
    expr: 'up{job="redis"} == 0'
    for: "1m"
    labels:
      severity: "critical"
    annotations:
      summary: "Redis instance down"
      description: "Rate limiting Redis instance is not responding"
```

## Testing Strategy

### 1. Load Testing

```bash
#!/bin/bash
# Rate limiting load test

# Test burst capacity
echo "Testing burst capacity..."
ab -n 1000 -c 50 -H "Authorization: Bearer test-token" \
   http://localhost:3000/api/workflows/scan

# Test sustained load
echo "Testing sustained load..."
ab -n 10000 -c 10 -H "Authorization: Bearer test-token" \
   http://localhost:3000/api/auth/status

# Test rate limit recovery
echo "Testing rate limit recovery..."
for i in {1..5}; do
  echo "Round $i"
  ab -n 500 -c 25 http://localhost:3000/api/health
  sleep 60
done
```

### 2. Integration Tests

```typescript
describe('Rate Limiting Integration', () => {
  test('should enforce user rate limits', async () => {
    const userId = 'test-user-123';
    const endpoint = '/api/workflows/scan';
    
    // Make requests up to limit
    for (let i = 0; i < 10; i++) {
      const response = await request(app)
        .post(endpoint)
        .set('Authorization', `Bearer ${getTokenForUser(userId)}`)
        .expect(200);
    }
    
    // Next request should be rate limited
    await request(app)
      .post(endpoint)
      .set('Authorization', `Bearer ${getTokenForUser(userId)}`)
      .expect(429)
      .expect(res => {
        expect(res.body.error).toBe('rate_limit_exceeded');
        expect(res.headers['retry-after']).toBeDefined();
      });
  });
  
  test('should handle different rate limits for different endpoints', async () => {
    const userId = 'test-user-456';
    
    // High frequency endpoint should have higher limit
    for (let i = 0; i < 100; i++) {
      await request(app)
        .get('/api/auth/status')
        .set('Authorization', `Bearer ${getTokenForUser(userId)}`)
        .expect(200);
    }
    
    // Low frequency endpoint should have lower limit
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/workflows/background-scan')
        .set('Authorization', `Bearer ${getTokenForUser(userId)}`)
        .send({ userId })
        .expect(i < 5 ? 202 : 429);
    }
  });
  
  test('should reset rate limits after window expires', async () => {
    const userId = 'test-user-789';
    
    // Exceed rate limit
    for (let i = 0; i < 11; i++) {
      await request(app)
        .post('/api/workflows/scan')
        .set('Authorization', `Bearer ${getTokenForUser(userId)}`)
        .expect(i < 10 ? 200 : 429);
    }
    
    // Wait for window to reset (using shorter window for testing)
    await new Promise(resolve => setTimeout(resolve, 61000));
    
    // Should be able to make requests again
    await request(app)
      .post('/api/workflows/scan')
      .set('Authorization', `Bearer ${getTokenForUser(userId)}`)
      .expect(200);
  });
});
```

## Configuration Management

### 1. Environment-Based Configuration

```typescript
// config/rate-limits.ts
export const getRateLimitConfig = () => {
  const env = process.env.NODE_ENV || 'development';
  
  const baseConfig = {
    development: {
      multiplier: 10,         // 10x limits for development
      redis: 'localhost:6379',
      enableAnalytics: false
    },
    staging: {
      multiplier: 2,          // 2x limits for staging
      redis: process.env.REDIS_STAGING_URL,
      enableAnalytics: true
    },
    production: {
      multiplier: 1,          // Standard limits
      redis: process.env.REDIS_PRODUCTION_URL,
      enableAnalytics: true
    }
  };
  
  return baseConfig[env as keyof typeof baseConfig] || baseConfig.production;
};
```

### 2. Runtime Configuration Updates

```typescript
class ConfigurableRateLimiter {
  private config: RateLimitConfig;
  private configWatcher: ConfigWatcher;
  
  constructor() {
    this.config = loadRateLimitConfig();
    this.configWatcher = new ConfigWatcher();
    this.setupConfigReload();
  }
  
  private setupConfigReload() {
    this.configWatcher.on('config-updated', (newConfig: RateLimitConfig) => {
      console.log('Reloading rate limit configuration...');
      this.config = newConfig;
      this.recreateLimiters();
    });
  }
  
  async updateConfig(endpoint: string, newLimits: Partial<RateLimitConfig>) {
    const updatedConfig = { ...this.config };
    updatedConfig.endpoints[endpoint] = {
      ...updatedConfig.endpoints[endpoint],
      ...newLimits
    };
    
    await this.validateConfig(updatedConfig);
    await this.saveConfig(updatedConfig);
    
    this.config = updatedConfig;
    this.recreateLimiters();
  }
  
  private async validateConfig(config: RateLimitConfig): Promise<void> {
    // Validate configuration constraints
    for (const [endpoint, limits] of Object.entries(config.endpoints)) {
      if (limits.userLimit <= 0) {
        throw new Error(`Invalid user limit for ${endpoint}: ${limits.userLimit}`);
      }
      
      if (limits.windowMs < 1000) {
        throw new Error(`Window too small for ${endpoint}: ${limits.windowMs}ms`);
      }
      
      if (limits.burstLimit > limits.userLimit) {
        throw new Error(`Burst limit exceeds user limit for ${endpoint}`);
      }
    }
  }
}
```

## Production Deployment

### 1. Deployment Checklist

- [ ] Redis cluster configured with replication
- [ ] Rate limit configurations validated in staging
- [ ] Monitoring dashboards deployed
- [ ] Alert rules configured
- [ ] Load testing completed
- [ ] Circuit breaker thresholds set
- [ ] Backup rate limiter configured
- [ ] Documentation updated

### 2. Rollback Strategy

```typescript
class RateLimitRollback {
  private configVersions: ConfigVersion[] = [];
  
  async rollback(version?: string): Promise<void> {
    const targetVersion = version || this.getPreviousVersion();
    const config = await this.loadConfigVersion(targetVersion);
    
    console.log(`Rolling back rate limit config to version ${targetVersion}`);
    
    // Apply configuration
    await this.applyConfig(config);
    
    // Verify rollback
    await this.verifyConfig(config);
    
    console.log('Rate limit rollback completed successfully');
  }
  
  private getPreviousVersion(): string {
    if (this.configVersions.length < 2) {
      throw new Error('No previous version available for rollback');
    }
    return this.configVersions[this.configVersions.length - 2].version;
  }
}
```

## Security Considerations

### 1. Rate Limit Bypass Prevention

```typescript
class SecureRateLimiter {
  async checkBypass(req: NextRequest): Promise<boolean> {
    // Check for common bypass techniques
    
    // 1. X-Forwarded-For manipulation
    const forwardedIps = req.headers.get('x-forwarded-for')?.split(',') || [];
    if (forwardedIps.length > 10) {
      console.warn('Suspicious X-Forwarded-For header with many IPs');
      return false;
    }
    
    // 2. User-Agent rotation
    const userAgent = req.headers.get('user-agent') || '';
    if (await this.isRotatingUserAgent(userAgent)) {
      console.warn('Detected user agent rotation pattern');
      return false;
    }
    
    // 3. Distributed attack from single source
    const fingerprint = await this.generateFingerprint(req);
    if (await this.isDistributedAttack(fingerprint)) {
      console.warn('Detected distributed attack pattern');
      return false;
    }
    
    return true;
  }
  
  private async generateFingerprint(req: NextRequest): Promise<string> {
    const components = [
      req.headers.get('accept-language'),
      req.headers.get('accept-encoding'),
      req.headers.get('connection'),
      req.headers.get('upgrade-insecure-requests')
    ].filter(Boolean);
    
    return crypto.createHash('sha256')
      .update(components.join('|'))
      .digest('hex');
  }
}
```

### 2. Data Protection

```typescript
class PrivacyAwareRateLimiter {
  async hashIdentifier(identifier: string): Promise<string> {
    const salt = process.env.RATE_LIMIT_SALT || 'default-salt';
    return crypto.createHash('sha256')
      .update(identifier + salt)
      .digest('hex')
      .substring(0, 16); // Truncate for storage efficiency
  }
  
  async cleanupExpiredData(): Promise<void> {
    const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days
    
    await this.redis.eval(`
      local keys = redis.call('keys', ARGV[1])
      local deleted = 0
      for i=1,#keys do
        local ttl = redis.call('ttl', keys[i])
        if ttl == -1 then
          redis.call('expire', keys[i], 3600)
          deleted = deleted + 1
        end
      end
      return deleted
    `, 0, 'drivemind:*');
    
    console.log('Cleaned up expired rate limit data');
  }
}
```

This comprehensive rate limiting strategy ensures DriveMind operates efficiently while protecting against abuse and maintaining compliance with external service quotas.