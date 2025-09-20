/**
 * Metrics Endpoint
 * Production-grade metrics collection and reporting
 * Compliant with ALPHA-CODENAME v1.8 requirements
 */

import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { initAdmin } from '@/lib/firebase-admin';
import os from 'os';

interface Metrics {
  timestamp: string;
  service: string;
  version: string;
  environment: string;
  system: {
    uptime: number;
    platform: string;
    arch: string;
    nodeVersion: string;
    hostname: string;
  };
  process: {
    pid: number;
    uptime: number;
    memory: {
      rss: number;
      heapTotal: number;
      heapUsed: number;
      external: number;
      arrayBuffers: number;
    };
    cpu: {
      user: number;
      system: number;
    };
  };
  resources: {
    cpu: {
      cores: number;
      loadAverage: [number, number, number];
      utilizationPercent: number;
    };
    memory: {
      total: number;
      free: number;
      used: number;
      usagePercent: number;
    };
  };
  application: {
    requests: {
      total: number;
      success: number;
      error: number;
      rate: number; // requests per second
    };
    responseTime: {
      p50: number;
      p95: number;
      p99: number;
      mean: number;
    };
    activeConnections: number;
    errors: {
      total: number;
      rate: number; // errors per minute
      recent: Array<{
        timestamp: string;
        type: string;
        message: string;
      }>;
    };
  };
  database?: {
    connections: {
      active: number;
      idle: number;
      total: number;
    };
    operations: {
      reads: number;
      writes: number;
      deletes: number;
    };
    responseTime: {
      p50: number;
      p95: number;
      p99: number;
    };
  };
  custom?: Record<string, any>;
}

// In-memory metrics storage (consider Redis for production)
class MetricsCollector {
  private static instance: MetricsCollector;
  private requestCount = 0;
  private successCount = 0;
  private errorCount = 0;
  private responseTimes: number[] = [];
  private errors: Array<{ timestamp: string; type: string; message: string }> = [];
  private startTime = Date.now();
  private dbOperations = {
    reads: 0,
    writes: 0,
    deletes: 0,
  };
  private dbResponseTimes: number[] = [];
  
  private constructor() {
    // Clean up old data periodically
    setInterval(() => this.cleanup(), 60000); // Every minute
  }
  
  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }
  
  recordRequest(success: boolean, responseTime: number) {
    this.requestCount++;
    if (success) {
      this.successCount++;
    } else {
      this.errorCount++;
    }
    this.responseTimes.push(responseTime);
    
    // Keep only last 1000 response times
    if (this.responseTimes.length > 1000) {
      this.responseTimes.shift();
    }
  }
  
  recordError(type: string, message: string) {
    this.errors.push({
      timestamp: new Date().toISOString(),
      type,
      message,
    });
    
    // Keep only last 100 errors
    if (this.errors.length > 100) {
      this.errors.shift();
    }
  }
  
  recordDatabaseOperation(operation: 'read' | 'write' | 'delete', responseTime: number) {
    if (operation === 'read') this.dbOperations.reads++;
    else if (operation === 'write') this.dbOperations.writes++;
    else if (operation === 'delete') this.dbOperations.deletes++;
    
    this.dbResponseTimes.push(responseTime);
    
    // Keep only last 1000 response times
    if (this.dbResponseTimes.length > 1000) {
      this.dbResponseTimes.shift();
    }
  }
  
  getMetrics(): Metrics['application'] {
    const uptime = (Date.now() - this.startTime) / 1000; // seconds
    const requestRate = this.requestCount / uptime;
    const errorRate = (this.errorCount / uptime) * 60; // errors per minute
    
    return {
      requests: {
        total: this.requestCount,
        success: this.successCount,
        error: this.errorCount,
        rate: Math.round(requestRate * 100) / 100,
      },
      responseTime: this.calculatePercentiles(this.responseTimes),
      activeConnections: 0, // Will be set from shutdown manager
      errors: {
        total: this.errorCount,
        rate: Math.round(errorRate * 100) / 100,
        recent: this.errors.slice(-10), // Last 10 errors
      },
    };
  }
  
  getDatabaseMetrics(): Metrics['database'] {
    return {
      connections: {
        active: 0, // Would need to track from connection pool
        idle: 0,
        total: 0,
      },
      operations: this.dbOperations,
      responseTime: this.calculatePercentiles(this.dbResponseTimes),
    };
  }
  
  private calculatePercentiles(times: number[]): { p50: number; p95: number; p99: number; mean: number } {
    if (times.length === 0) {
      return { p50: 0, p95: 0, p99: 0, mean: 0 };
    }
    
    const sorted = [...times].sort((a, b) => a - b);
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    
    return {
      p50: sorted[Math.floor(sorted.length * 0.5)] || 0,
      p95: sorted[Math.floor(sorted.length * 0.95)] || 0,
      p99: sorted[Math.floor(sorted.length * 0.99)] || 0,
      mean: Math.round(mean * 100) / 100,
    };
  }
  
  private cleanup() {
    // Clean up old data to prevent memory leaks
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    this.errors = this.errors.filter(e => e.timestamp > oneHourAgo);
  }
}

// Singleton instance (not exported as Next.js route field)
const metricsCollector = MetricsCollector.getInstance();

/**
 * Get system metrics
 */
function getSystemMetrics(): Metrics['system'] {
  return {
    uptime: os.uptime(),
    platform: os.platform(),
    arch: os.arch(),
    nodeVersion: process.version,
    hostname: os.hostname(),
  };
}

/**
 * Get process metrics
 */
function getProcessMetrics(): Metrics['process'] {
  const memoryUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  
  return {
    pid: process.pid,
    uptime: process.uptime(),
    memory: {
      rss: memoryUsage.rss,
      heapTotal: memoryUsage.heapTotal,
      heapUsed: memoryUsage.heapUsed,
      external: memoryUsage.external,
      arrayBuffers: memoryUsage.arrayBuffers || 0,
    },
    cpu: {
      user: cpuUsage.user,
      system: cpuUsage.system,
    },
  };
}

/**
 * Get resource metrics
 */
function getResourceMetrics(): Metrics['resources'] {
  const cpus = os.cpus();
  const loadAvg = os.loadavg();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  
  return {
    cpu: {
      cores: cpus.length,
      loadAverage: loadAvg as [number, number, number],
      utilizationPercent: Math.round((loadAvg[0] / cpus.length) * 100),
    },
    memory: {
      total: totalMem,
      free: freeMem,
      used: usedMem,
      usagePercent: Math.round((usedMem / totalMem) * 100),
    },
  };
}

/**
 * Metrics endpoint handler
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  // Check format parameter
  const format = request.nextUrl.searchParams.get('format');
  const includeDatabase = request.nextUrl.searchParams.get('database') === 'true';
  
  // Get active connections from shutdown manager
  let activeConnections = 0;
  try {
    const { getShutdownStatus } = await import('@/lib/graceful-shutdown');
    activeConnections = getShutdownStatus().activeConnections;
  } catch (error) {
    console.error('Failed to get shutdown status:', error);
  }
  
  // Collect metrics
  const applicationMetrics = metricsCollector.getMetrics();
  applicationMetrics.activeConnections = activeConnections;
  
  const metrics: Metrics = {
    timestamp: new Date().toISOString(),
    service: 'drivemind',
    version: process.env.NEXT_PUBLIC_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    system: getSystemMetrics(),
    process: getProcessMetrics(),
    resources: getResourceMetrics(),
    application: applicationMetrics,
  };
  
  // Add database metrics if requested
  if (includeDatabase) {
    metrics.database = metricsCollector.getDatabaseMetrics();
  }
  
  // Add custom metrics
  metrics.custom = {
    buildTime: process.env.BUILD_TIME || 'unknown',
    commit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT || 'unknown',
    responseTime: Date.now() - startTime,
  };
  
  // Format response based on format parameter
  if (format === 'prometheus') {
    // Prometheus format
    const prometheusMetrics = formatPrometheus(metrics);
    return new NextResponse(prometheusMetrics, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; version=0.0.4',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  }
  
  // Default JSON format
  return NextResponse.json(metrics, {
    status: 200,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Response-Time': `${Date.now() - startTime}ms`,
    },
  });
}

/**
 * Format metrics for Prometheus
 */
function formatPrometheus(metrics: Metrics): string {
  const lines: string[] = [];
  
  // System metrics
  lines.push(`# HELP system_uptime_seconds System uptime in seconds`);
  lines.push(`# TYPE system_uptime_seconds gauge`);
  lines.push(`system_uptime_seconds ${metrics.system.uptime}`);
  
  // Process metrics
  lines.push(`# HELP process_uptime_seconds Process uptime in seconds`);
  lines.push(`# TYPE process_uptime_seconds gauge`);
  lines.push(`process_uptime_seconds ${metrics.process.uptime}`);
  
  lines.push(`# HELP process_memory_bytes Process memory usage in bytes`);
  lines.push(`# TYPE process_memory_bytes gauge`);
  lines.push(`process_memory_bytes{type="rss"} ${metrics.process.memory.rss}`);
  lines.push(`process_memory_bytes{type="heap_total"} ${metrics.process.memory.heapTotal}`);
  lines.push(`process_memory_bytes{type="heap_used"} ${metrics.process.memory.heapUsed}`);
  
  // Resource metrics
  lines.push(`# HELP cpu_cores_total Number of CPU cores`);
  lines.push(`# TYPE cpu_cores_total gauge`);
  lines.push(`cpu_cores_total ${metrics.resources.cpu.cores}`);
  
  lines.push(`# HELP cpu_utilization_percent CPU utilization percentage`);
  lines.push(`# TYPE cpu_utilization_percent gauge`);
  lines.push(`cpu_utilization_percent ${metrics.resources.cpu.utilizationPercent}`);
  
  lines.push(`# HELP memory_usage_percent Memory usage percentage`);
  lines.push(`# TYPE memory_usage_percent gauge`);
  lines.push(`memory_usage_percent ${metrics.resources.memory.usagePercent}`);
  
  // Application metrics
  lines.push(`# HELP http_requests_total Total number of HTTP requests`);
  lines.push(`# TYPE http_requests_total counter`);
  lines.push(`http_requests_total ${metrics.application.requests.total}`);
  
  lines.push(`# HELP http_requests_success_total Total number of successful HTTP requests`);
  lines.push(`# TYPE http_requests_success_total counter`);
  lines.push(`http_requests_success_total ${metrics.application.requests.success}`);
  
  lines.push(`# HELP http_requests_error_total Total number of failed HTTP requests`);
  lines.push(`# TYPE http_requests_error_total counter`);
  lines.push(`http_requests_error_total ${metrics.application.requests.error}`);
  
  lines.push(`# HELP http_request_duration_milliseconds HTTP request duration in milliseconds`);
  lines.push(`# TYPE http_request_duration_milliseconds summary`);
  lines.push(`http_request_duration_milliseconds{quantile="0.5"} ${metrics.application.responseTime.p50}`);
  lines.push(`http_request_duration_milliseconds{quantile="0.95"} ${metrics.application.responseTime.p95}`);
  lines.push(`http_request_duration_milliseconds{quantile="0.99"} ${metrics.application.responseTime.p99}`);
  
  lines.push(`# HELP active_connections Number of active connections`);
  lines.push(`# TYPE active_connections gauge`);
  lines.push(`active_connections ${metrics.application.activeConnections}`);
  
  // Database metrics if available
  if (metrics.database) {
    lines.push(`# HELP database_operations_total Total database operations`);
    lines.push(`# TYPE database_operations_total counter`);
    lines.push(`database_operations_total{operation="read"} ${metrics.database.operations.reads}`);
    lines.push(`database_operations_total{operation="write"} ${metrics.database.operations.writes}`);
    lines.push(`database_operations_total{operation="delete"} ${metrics.database.operations.deletes}`);
  }
  
  return lines.join('\n') + '\n';
}