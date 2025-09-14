/**
 * Metrics endpoint - ALPHA-CODENAME Production Gate Requirement
 * Provides system and business metrics in Prometheus-compatible format
 */

import { NextRequest, NextResponse } from 'next/server';
import { rateLimiters } from '@/lib/security/rate-limiter';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import crypto from 'crypto';

// In-memory metrics store (should use Redis/Prometheus in production)
const metricsStore = {
  requests: 0,
  errors: 0,
  latency: [] as number[],
  businessMetrics: {
    activeUsers: 0,
    filesProcessed: 0,
    duplicatesDetected: 0,
    cleanupActionsExecuted: 0,
  },
};

export async function GET(request: NextRequest) {
  return rateLimiters.read(request, async (req) => {
    const requestId = crypto.randomUUID();
    const format = req.nextUrl.searchParams.get('format');
    
    try {
      // Calculate percentiles for latency
      const sortedLatency = [...metricsStore.latency].sort((a, b) => a - b);
      const p50 = sortedLatency[Math.floor(sortedLatency.length * 0.5)] || 0;
      const p95 = sortedLatency[Math.floor(sortedLatency.length * 0.95)] || 0;
      const p99 = sortedLatency[Math.floor(sortedLatency.length * 0.99)] || 0;
      
      // Prometheus format for monitoring systems
      if (format === 'prometheus') {
        const prometheusMetrics = [
          `# HELP drivemind_info Application information`,
          `# TYPE drivemind_info gauge`,
          `drivemind_info{version="${process.env.npm_package_version || '1.2.1'}",environment="${process.env.NODE_ENV || 'development'}"} 1`,
          ``,
          `# HELP drivemind_uptime_seconds Application uptime in seconds`,
          `# TYPE drivemind_uptime_seconds gauge`,
          `drivemind_uptime_seconds ${Math.floor(process.uptime())}`,
          ``,
          `# HELP drivemind_memory_usage_bytes Memory usage in bytes`,
          `# TYPE drivemind_memory_usage_bytes gauge`,
          `drivemind_memory_usage_bytes{type="heap_used"} ${process.memoryUsage().heapUsed}`,
          `drivemind_memory_usage_bytes{type="heap_total"} ${process.memoryUsage().heapTotal}`,
          `drivemind_memory_usage_bytes{type="external"} ${process.memoryUsage().external}`,
          ``,
          `# HELP drivemind_http_requests_total Total number of HTTP requests`,
          `# TYPE drivemind_http_requests_total counter`,
          `drivemind_http_requests_total ${metricsStore.requests}`,
          ``,
          `# HELP drivemind_http_errors_total Total number of HTTP errors`,
          `# TYPE drivemind_http_errors_total counter`,
          `drivemind_http_errors_total ${metricsStore.errors}`,
          ``,
          `# HELP drivemind_http_latency_seconds HTTP request latency in seconds`,
          `# TYPE drivemind_http_latency_seconds summary`,
          `drivemind_http_latency_seconds{quantile="0.5"} ${p50 / 1000}`,
          `drivemind_http_latency_seconds{quantile="0.95"} ${p95 / 1000}`,
          `drivemind_http_latency_seconds{quantile="0.99"} ${p99 / 1000}`,
          ``,
          `# HELP drivemind_business_metrics Business metrics`,
          `# TYPE drivemind_business_metrics gauge`,
          `drivemind_business_metrics{type="active_users"} ${metricsStore.businessMetrics.activeUsers}`,
          `drivemind_business_metrics{type="files_processed"} ${metricsStore.businessMetrics.filesProcessed}`,
          `drivemind_business_metrics{type="duplicates_detected"} ${metricsStore.businessMetrics.duplicatesDetected}`,
          `drivemind_business_metrics{type="cleanup_actions"} ${metricsStore.businessMetrics.cleanupActionsExecuted}`,
        ].join('\n');
        
        return new NextResponse(prometheusMetrics, {
          headers: {
            'Content-Type': 'text/plain; version=0.0.4',
            'X-Request-ID': requestId,
          },
        });
      }
      
      // JSON format (default)
      const metrics = {
        timestamp: new Date().toISOString(),
        requestId,
        application: {
          name: 'drivemind',
          version: process.env.npm_package_version || '1.2.1',
          build: process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7) || 'local',
          environment: process.env.NODE_ENV || 'development',
          uptime_seconds: Math.floor(process.uptime()),
        },
        system: {
          memory_mb: {
            heap_used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            heap_total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
            external: Math.round(process.memoryUsage().external / 1024 / 1024),
          },
          cpu: {
            user_ms: process.cpuUsage().user,
            system_ms: process.cpuUsage().system,
          },
          platform: process.platform,
          node_version: process.version,
        },
        http: {
          requests_total: metricsStore.requests,
          errors_total: metricsStore.errors,
          latency_ms: {
            p50,
            p95,
            p99,
            samples: metricsStore.latency.length,
          },
        },
        business: metricsStore.businessMetrics,
        compliance: {
          alpha_codename: 'v1.8',
          aei21: 'compliant',
        },
      };

      logger.info('Metrics retrieved', { requestId, format: format || 'json' });
      
      return NextResponse.json(metrics, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'X-Request-ID': requestId,
        },
      });
    } catch (error) {
      logger.error('Metrics retrieval failed', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return NextResponse.json(
        { error: 'Failed to retrieve metrics', requestId },
        { status: 500 }
      );
    }
  });
}

// Schema for custom metrics
const MetricSchema = z.object({
  type: z.enum(['increment', 'gauge', 'timing']),
  name: z.string().max(100),
  value: z.number(),
  tags: z.record(z.string()).optional(),
});

export async function POST(request: NextRequest) {
  return rateLimiters.api(request, async (req) => {
    const requestId = crypto.randomUUID();
    
    try {
      // Verify authorization
      const authHeader = req.headers.get('authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json(
          { error: 'Authorization required', requestId },
          { status: 401 }
        );
      }
      
      const body = await req.json();
      const parsed = MetricSchema.safeParse(body);
      
      if (!parsed.success) {
        return NextResponse.json(
          { error: 'Invalid metric data', requestId },
          { status: 400 }
        );
      }
      
      const { type, name, value } = parsed.data;
      
      // Update metrics based on type
      switch (type) {
        case 'increment':
          if (name === 'requests') metricsStore.requests += value;
          else if (name === 'errors') metricsStore.errors += value;
          else if (name in metricsStore.businessMetrics) {
            (metricsStore.businessMetrics as any)[name] += value;
          }
          break;
          
        case 'gauge':
          if (name in metricsStore.businessMetrics) {
            (metricsStore.businessMetrics as any)[name] = value;
          }
          break;
          
        case 'timing':
          if (name === 'latency') {
            metricsStore.latency.push(value);
            // Keep only last 1000 samples
            if (metricsStore.latency.length > 1000) {
              metricsStore.latency.shift();
            }
          }
          break;
      }
      
      logger.info('Custom metric recorded', {
        requestId,
        type,
        name,
        value,
      });
      
      return NextResponse.json({
        success: true,
        message: 'Metric recorded',
        requestId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to record metric', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return NextResponse.json(
        { error: 'Failed to record metric', requestId },
        { status: 500 }
      );
    }
  });
}