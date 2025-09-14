/**
 * Production Metrics Collection Service - ALPHA Standards
 * Comprehensive metrics for performance monitoring, business intelligence, and alerting
 */

interface MetricEvent {
  name: string;
  value: number;
  timestamp: number;
  tags: Record<string, string>;
  type: 'counter' | 'gauge' | 'histogram' | 'timer';
}

interface BusinessMetric {
  event: string;
  data: Record<string, any>;
  timestamp: number;
  userId?: string;
}

interface SystemMetrics {
  memory: NodeJS.MemoryUsage;
  cpu: NodeJS.CpuUsage;
  uptime: number;
  platform: string;
  nodeVersion: string;
  timestamp: number;
}

interface PerformanceMetric {
  operation: string;
  duration: number;
  success: boolean;
  statusCode?: number;
  timestamp: number;
}

class MetricsService {
  private metrics: MetricEvent[] = [];
  private businessMetrics: BusinessMetric[] = [];
  private performanceMetrics: PerformanceMetric[] = [];
  private readonly MAX_STORED_METRICS = 1000;

  // API Performance Tracking
  recordApiCall(endpoint: string, status: 'success' | 'error', duration: number, statusCode?: number): void {
    const metric: MetricEvent = {
      name: 'api_request',
      value: duration,
      timestamp: Date.now(),
      tags: {
        endpoint,
        status,
        status_code: statusCode?.toString() || 'unknown'
      },
      type: 'timer'
    };

    this.addMetric(metric);

    // Track performance metrics
    const perfMetric: PerformanceMetric = {
      operation: endpoint,
      duration,
      success: status === 'success',
      statusCode,
      timestamp: Date.now()
    };

    this.addPerformanceMetric(perfMetric);
  }

  // External Service Performance
  recordExternalServiceCall(service: string, operation: string, duration: number, success: boolean): void {
    const metric: MetricEvent = {
      name: 'external_service_call',
      value: duration,
      timestamp: Date.now(),
      tags: {
        service,
        operation,
        status: success ? 'success' : 'error'
      },
      type: 'timer'
    };

    this.addMetric(metric);
  }

  // Business Intelligence Metrics
  recordBusinessEvent(event: string, data: Record<string, any>, userId?: string): void {
    const businessMetric: BusinessMetric = {
      event,
      data: this.sanitizeBusinessData(data),
      timestamp: Date.now(),
      userId: userId ? this.hashUserId(userId) : undefined
    };

    this.addBusinessMetric(businessMetric);

    // Also record as regular metric for alerting
    const metric: MetricEvent = {
      name: `business_${event}`,
      value: 1,
      timestamp: Date.now(),
      tags: {
        event,
        ...this.extractTagsFromData(data)
      },
      type: 'counter'
    };

    this.addMetric(metric);
  }

  // Authentication Events
  recordAuthEvent(event: 'oauth_begin' | 'oauth_callback' | 'token_refresh' | 'auth_failure', userId?: string): void {
    this.recordBusinessEvent('auth_event', { 
      authEvent: event,
      timestamp: Date.now()
    }, userId);
  }

  // File Processing Metrics
  recordFileProcessing(operation: 'scan' | 'duplicate_detection' | 'classification', 
                      fileCount: number, duration: number, success: boolean): void {
    this.recordBusinessEvent('file_processing', {
      operation,
      fileCount,
      duration,
      success,
      throughput: fileCount / (duration / 1000) // files per second
    });
  }

  // Error Tracking
  recordError(errorType: string, errorCode: string, endpoint?: string): void {
    const metric: MetricEvent = {
      name: 'error',
      value: 1,
      timestamp: Date.now(),
      tags: {
        error_type: errorType,
        error_code: errorCode,
        endpoint: endpoint || 'unknown'
      },
      type: 'counter'
    };

    this.addMetric(metric);
  }

  // System Health Metrics
  recordSystemHealth(): SystemMetrics {
    const metrics: SystemMetrics = {
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      uptime: process.uptime(),
      platform: process.platform,
      nodeVersion: process.version,
      timestamp: Date.now()
    };

    // Record key system metrics
    this.addMetric({
      name: 'memory_usage',
      value: metrics.memory.heapUsed,
      timestamp: metrics.timestamp,
      tags: { type: 'heap_used' },
      type: 'gauge'
    });

    this.addMetric({
      name: 'memory_usage',
      value: metrics.memory.rss,
      timestamp: metrics.timestamp,
      tags: { type: 'rss' },
      type: 'gauge'
    });

    this.addMetric({
      name: 'uptime',
      value: metrics.uptime,
      timestamp: metrics.timestamp,
      tags: {},
      type: 'gauge'
    });

    return metrics;
  }

  // Circuit Breaker Metrics
  recordCircuitBreakerEvent(service: string, event: 'open' | 'close' | 'half_open' | 'success' | 'failure'): void {
    const metric: MetricEvent = {
      name: 'circuit_breaker',
      value: 1,
      timestamp: Date.now(),
      tags: {
        service,
        event
      },
      type: 'counter'
    };

    this.addMetric(metric);
  }

  // Rate Limiting Metrics
  recordRateLimit(endpoint: string, userId: string, allowed: boolean): void {
    const metric: MetricEvent = {
      name: 'rate_limit',
      value: 1,
      timestamp: Date.now(),
      tags: {
        endpoint,
        status: allowed ? 'allowed' : 'denied'
      },
      type: 'counter'
    };

    this.addMetric(metric);
  }

  // Get Current Metrics
  getMetrics(): {
    application: Record<string, any>;
    system: SystemMetrics;
    business: Record<string, any>;
    performance: Record<string, any>;
  } {
    const systemMetrics = this.recordSystemHealth();
    
    return {
      application: {
        name: 'drivemind',
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      },
      system: systemMetrics,
      business: this.calculateBusinessMetrics(),
      performance: this.calculatePerformanceMetrics()
    };
  }

  // Performance Analysis
  getPerformanceStats(timeWindow: number = 300000): { // 5 minutes default
    p50: number;
    p95: number;
    p99: number;
    avgResponseTime: number;
    errorRate: number;
    throughput: number;
  } {
    const cutoff = Date.now() - timeWindow;
    const recentMetrics = this.performanceMetrics.filter(m => m.timestamp >= cutoff);
    
    if (recentMetrics.length === 0) {
      return {
        p50: 0, p95: 0, p99: 0,
        avgResponseTime: 0, errorRate: 0, throughput: 0
      };
    }

    const durations = recentMetrics.map(m => m.duration).sort((a, b) => a - b);
    const successCount = recentMetrics.filter(m => m.success).length;
    
    return {
      p50: this.percentile(durations, 50),
      p95: this.percentile(durations, 95),
      p99: this.percentile(durations, 99),
      avgResponseTime: durations.reduce((a, b) => a + b, 0) / durations.length,
      errorRate: ((recentMetrics.length - successCount) / recentMetrics.length) * 100,
      throughput: recentMetrics.length / (timeWindow / 1000) // requests per second
    };
  }

  // Export metrics for external monitoring
  exportPrometheusMetrics(): string {
    // Convert internal metrics to Prometheus format
    const prometheusMetrics: string[] = [];
    
    // Group metrics by name
    const metricGroups = this.groupMetricsByName();
    
    for (const [name, metrics] of metricGroups) {
      prometheusMetrics.push(`# HELP ${name} ${this.getMetricHelp(name)}`);
      prometheusMetrics.push(`# TYPE ${name} ${metrics[0].type}`);
      
      for (const metric of metrics) {
        const tags = Object.entries(metric.tags)
          .map(([k, v]) => `${k}="${v}"`)
          .join(',');
        
        prometheusMetrics.push(`${name}{${tags}} ${metric.value} ${metric.timestamp}`);
      }
      
      prometheusMetrics.push('');
    }
    
    return prometheusMetrics.join('\n');
  }

  private addMetric(metric: MetricEvent): void {
    this.metrics.push(metric);
    
    // Maintain size limit
    if (this.metrics.length > this.MAX_STORED_METRICS) {
      this.metrics = this.metrics.slice(-this.MAX_STORED_METRICS);
    }
  }

  private addBusinessMetric(metric: BusinessMetric): void {
    this.businessMetrics.push(metric);
    
    if (this.businessMetrics.length > this.MAX_STORED_METRICS) {
      this.businessMetrics = this.businessMetrics.slice(-this.MAX_STORED_METRICS);
    }
  }

  private addPerformanceMetric(metric: PerformanceMetric): void {
    this.performanceMetrics.push(metric);
    
    if (this.performanceMetrics.length > this.MAX_STORED_METRICS) {
      this.performanceMetrics = this.performanceMetrics.slice(-this.MAX_STORED_METRICS);
    }
  }

  private calculateBusinessMetrics(): Record<string, any> {
    const recent = this.businessMetrics.filter(m => 
      Date.now() - m.timestamp < 3600000 // Last hour
    );

    const eventCounts = recent.reduce((acc, metric) => {
      acc[metric.event] = (acc[metric.event] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalEvents: recent.length,
      eventCounts,
      uniqueUsers: new Set(recent.map(m => m.userId).filter(Boolean)).size
    };
  }

  private calculatePerformanceMetrics(): Record<string, any> {
    const stats = this.getPerformanceStats();
    
    return {
      ...stats,
      healthStatus: stats.p95 < 250 ? 'healthy' : stats.p95 < 500 ? 'degraded' : 'unhealthy',
      alertsTriggered: this.checkPerformanceAlerts(stats)
    };
  }

  private checkPerformanceAlerts(stats: any): string[] {
    const alerts: string[] = [];
    
    if (stats.p95 > 500) alerts.push('P95_LATENCY_HIGH');
    if (stats.errorRate > 5) alerts.push('ERROR_RATE_HIGH');
    if (stats.throughput < 1) alerts.push('THROUGHPUT_LOW');
    
    return alerts;
  }

  private percentile(values: number[], p: number): number {
    const index = Math.ceil((values.length * p) / 100) - 1;
    return values[Math.max(0, Math.min(index, values.length - 1))];
  }

  private groupMetricsByName(): Map<string, MetricEvent[]> {
    return this.metrics.reduce((groups, metric) => {
      if (!groups.has(metric.name)) {
        groups.set(metric.name, []);
      }
      groups.get(metric.name)!.push(metric);
      return groups;
    }, new Map<string, MetricEvent[]>());
  }

  private getMetricHelp(name: string): string {
    const helpTexts: Record<string, string> = {
      api_request: 'API request duration in milliseconds',
      external_service_call: 'External service call duration',
      error: 'Error counter by type and code',
      memory_usage: 'Memory usage in bytes',
      uptime: 'Process uptime in seconds',
      circuit_breaker: 'Circuit breaker state changes',
      rate_limit: 'Rate limiting decisions'
    };
    
    return helpTexts[name] || 'Custom metric';
  }

  private sanitizeBusinessData(data: Record<string, any>): Record<string, any> {
    const sanitized = { ...data };
    
    // Remove PII and sensitive data
    const sensitiveKeys = ['email', 'name', 'phone', 'address', 'token', 'secret'];
    
    for (const key in sanitized) {
      if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
        delete sanitized[key];
      }
    }
    
    return sanitized;
  }

  private extractTagsFromData(data: Record<string, any>): Record<string, string> {
    const tags: Record<string, string> = {};
    
    // Extract useful tags for monitoring
    if (data.operation) tags.operation = String(data.operation);
    if (data.success !== undefined) tags.success = String(data.success);
    if (data.type) tags.type = String(data.type);
    
    return tags;
  }

  private hashUserId(userId: string): string {
    // Simple hash for privacy - in production use proper hashing
    return userId.length > 8 ? 
      `${userId.slice(0, 4)}****${userId.slice(-4)}` : 
      '****';
  }
}

export const metrics = new MetricsService();