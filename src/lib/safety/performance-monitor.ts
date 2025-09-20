/**
 * @fileoverview Performance Monitoring System
 * Tracks and reports performance metrics during migration
 * Ensures operations meet performance requirements
 */

import { PerformanceMetrics, SafetyEvent } from './types';
import { logger } from '@/lib/logger';
import { EventEmitter } from 'events';

interface MetricWindow {
  timestamp: Date;
  value: number;
}

interface PerformanceThresholds {
  maxLatencyP99: number; // milliseconds
  maxErrorRate: number; // percentage
  minThroughput: number; // operations per second
  maxMemoryUsage: number; // MB
  maxCpuUsage: number; // percentage
}

/**
 * Performance Monitor for tracking migration metrics
 */
export class PerformanceMonitor extends EventEmitter {
  private static instance: PerformanceMonitor;
  private metrics: PerformanceMetrics[] = [];
  private operationLatencies: MetricWindow[] = [];
  private errorCounts: MetricWindow[] = [];
  private throughputMetrics: MetricWindow[] = [];
  private resourceMetrics: MetricWindow[] = [];
  private monitoringInterval: NodeJS.Timeout | null = null;
  private startTime: Date;
  private operationCounts = {
    reads: 0,
    writes: 0,
    deletes: 0,
    updates: 0,
    errors: 0,
    total: 0
  };

  // Map operation types to property names (handle 'delete' -> 'deletes')
  private operationTypeMap: Record<string, keyof typeof this.operationCounts> = {
    'read': 'reads',
    'write': 'writes',
    'delete': 'deletes',
    'update': 'updates'
  };
  private thresholds: PerformanceThresholds;
  private windowSize = 60000; // 1 minute window for metrics

  private constructor() {
    super();
    this.startTime = new Date();
    this.thresholds = this.getDefaultThresholds();
    this.startMonitoring();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * Get default performance thresholds
   */
  private getDefaultThresholds(): PerformanceThresholds {
    return {
      maxLatencyP99: 1000, // 1 second
      maxErrorRate: 1, // 1%
      minThroughput: 10, // 10 ops/sec
      maxMemoryUsage: 500, // 500 MB
      maxCpuUsage: 80 // 80%
    };
  }

  /**
   * Start performance monitoring
   */
  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
      this.analyzeMetrics();
      this.cleanupOldMetrics();
    }, 5000); // Collect metrics every 5 seconds

    logger.info('Performance monitoring started');
  }

  /**
   * Stop performance monitoring
   */
  private stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    logger.info('Performance monitoring stopped');
  }

  /**
   * Collect current metrics
   */
  private collectMetrics(): void {
    const now = new Date();
    
    // Calculate latency percentiles
    const latencies = this.getRecentLatencies();
    const latencyMetrics = this.calculateLatencyPercentiles(latencies);
    
    // Calculate throughput
    const throughput = this.calculateThroughput();
    
    // Get resource usage (simulated for now, would use actual system metrics)
    const resources = this.getResourceUsage();
    
    // Calculate error rate
    const errorRate = this.calculateErrorRate();

    const metrics: PerformanceMetrics = {
      timestamp: now,
      operations: { ...this.operationCounts },
      latency: latencyMetrics,
      throughput,
      resources,
      errors: {
        count: this.operationCounts.errors,
        rate: errorRate
      }
    };

    this.metrics.push(metrics);
    this.emit('metricsCollected', metrics);
  }

  /**
   * Analyze metrics for threshold violations
   */
  private analyzeMetrics(): void {
    const latest = this.metrics[this.metrics.length - 1];
    if (!latest) return;

    const violations: string[] = [];

    // Check latency threshold
    if (latest.latency.p99 > this.thresholds.maxLatencyP99) {
      violations.push(`P99 latency (${latest.latency.p99}ms) exceeds threshold (${this.thresholds.maxLatencyP99}ms)`);
    }

    // Check error rate threshold
    if (latest.errors.rate > this.thresholds.maxErrorRate) {
      violations.push(`Error rate (${latest.errors.rate}%) exceeds threshold (${this.thresholds.maxErrorRate}%)`);
    }

    // Check throughput threshold
    if (latest.throughput.operationsPerSecond < this.thresholds.minThroughput) {
      violations.push(`Throughput (${latest.throughput.operationsPerSecond} ops/s) below threshold (${this.thresholds.minThroughput} ops/s)`);
    }

    // Check resource thresholds
    if (latest.resources.memoryUsageMB > this.thresholds.maxMemoryUsage) {
      violations.push(`Memory usage (${latest.resources.memoryUsageMB}MB) exceeds threshold (${this.thresholds.maxMemoryUsage}MB)`);
    }

    if (latest.resources.cpuUsage > this.thresholds.maxCpuUsage) {
      violations.push(`CPU usage (${latest.resources.cpuUsage}%) exceeds threshold (${this.thresholds.maxCpuUsage}%)`);
    }

    if (violations.length > 0) {
      const event: SafetyEvent = {
        timestamp: latest.timestamp,
        type: 'warning',
        component: 'PerformanceMonitor',
        action: 'threshold_violation',
        message: `Performance threshold violations detected: ${violations.join('; ')}`,
        context: { violations, metrics: latest }
      };

      logger.warn('Performance threshold violations', {
        violations,
        metrics: latest
      });

      this.emit('thresholdViolation', event);
    }
  }

  /**
   * Record an operation latency
   */
  public recordLatency(latencyMs: number): void {
    this.operationLatencies.push({
      timestamp: new Date(),
      value: latencyMs
    });
  }

  /**
   * Record an operation
   */
  public recordOperation(
    type: 'read' | 'write' | 'delete' | 'update',
    success: boolean,
    latencyMs?: number
  ): void {
    const countKey = this.operationTypeMap[type];
    if (countKey && countKey !== 'errors' && countKey !== 'total') {
      (this.operationCounts[countKey] as number)++;
    }
    this.operationCounts.total++;
    
    if (!success) {
      this.operationCounts.errors++;
      this.errorCounts.push({
        timestamp: new Date(),
        value: 1
      });
    }

    if (latencyMs !== undefined) {
      this.recordLatency(latencyMs);
    }

    // Record throughput metric
    this.throughputMetrics.push({
      timestamp: new Date(),
      value: 1
    });
  }

  /**
   * Record resource usage
   */
  public recordResourceUsage(cpuPercent: number, memoryMB: number): void {
    this.resourceMetrics.push({
      timestamp: new Date(),
      value: cpuPercent // Store CPU, we'll track memory separately
    });
  }

  /**
   * Get recent latencies within the time window
   */
  private getRecentLatencies(): number[] {
    const cutoff = Date.now() - this.windowSize;
    return this.operationLatencies
      .filter(m => m.timestamp.getTime() > cutoff)
      .map(m => m.value);
  }

  /**
   * Calculate latency percentiles
   */
  private calculateLatencyPercentiles(latencies: number[]): PerformanceMetrics['latency'] {
    if (latencies.length === 0) {
      return { p50: 0, p95: 0, p99: 0, max: 0 };
    }

    const sorted = [...latencies].sort((a, b) => a - b);
    const p50Index = Math.floor(sorted.length * 0.5);
    const p95Index = Math.floor(sorted.length * 0.95);
    const p99Index = Math.floor(sorted.length * 0.99);

    return {
      p50: sorted[p50Index] || 0,
      p95: sorted[p95Index] || 0,
      p99: sorted[p99Index] || 0,
      max: sorted[sorted.length - 1] || 0
    };
  }

  /**
   * Calculate throughput metrics
   */
  private calculateThroughput(): PerformanceMetrics['throughput'] {
    const cutoff = Date.now() - this.windowSize;
    const recentOps = this.throughputMetrics.filter(m => m.timestamp.getTime() > cutoff);
    
    const opsPerSecond = (recentOps.length / (this.windowSize / 1000));
    
    // Estimate bytes per second (using average of 1KB per operation)
    const bytesPerSecond = opsPerSecond * 1024;

    return {
      operationsPerSecond: Math.round(opsPerSecond),
      bytesPerSecond: Math.round(bytesPerSecond)
    };
  }

  /**
   * Get resource usage (simulated for now)
   */
  private getResourceUsage(): PerformanceMetrics['resources'] {
    // In a real implementation, this would use actual system metrics
    // For now, we'll use simulated values or values from recordResourceUsage
    
    const recentResources = this.resourceMetrics.slice(-10);
    const avgCpu = recentResources.length > 0
      ? recentResources.reduce((sum, m) => sum + m.value, 0) / recentResources.length
      : 20; // Default 20% CPU

    return {
      cpuUsage: Math.round(avgCpu),
      memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      networkBandwidthKBps: Math.round(this.calculateThroughput().bytesPerSecond / 1024)
    };
  }

  /**
   * Calculate error rate
   */
  private calculateErrorRate(): number {
    if (this.operationCounts.total === 0) {
      return 0;
    }
    return Math.round((this.operationCounts.errors / this.operationCounts.total) * 100 * 100) / 100;
  }

  /**
   * Clean up old metrics outside the window
   */
  private cleanupOldMetrics(): void {
    const cutoff = Date.now() - this.windowSize * 2; // Keep 2x window for history
    
    this.operationLatencies = this.operationLatencies.filter(
      m => m.timestamp.getTime() > cutoff
    );
    this.errorCounts = this.errorCounts.filter(
      m => m.timestamp.getTime() > cutoff
    );
    this.throughputMetrics = this.throughputMetrics.filter(
      m => m.timestamp.getTime() > cutoff
    );
    this.resourceMetrics = this.resourceMetrics.filter(
      m => m.timestamp.getTime() > cutoff
    );

    // Keep only last hour of full metrics
    const metricsCutoff = Date.now() - 3600000;
    this.metrics = this.metrics.filter(
      m => m.timestamp.getTime() > metricsCutoff
    );
  }

  /**
   * Get current metrics
   */
  public getCurrentMetrics(): PerformanceMetrics | null {
    return this.metrics[this.metrics.length - 1] || null;
  }

  /**
   * Get metrics history
   */
  public getMetricsHistory(duration?: number): PerformanceMetrics[] {
    if (!duration) {
      return [...this.metrics];
    }

    const cutoff = Date.now() - duration;
    return this.metrics.filter(m => m.timestamp.getTime() > cutoff);
  }

  /**
   * Get operation counts
   */
  public getOperationCounts(): typeof this.operationCounts {
    return { ...this.operationCounts };
  }

  /**
   * Reset metrics
   */
  public resetMetrics(): void {
    this.metrics = [];
    this.operationLatencies = [];
    this.errorCounts = [];
    this.throughputMetrics = [];
    this.resourceMetrics = [];
    this.operationCounts = {
      reads: 0,
      writes: 0,
      deletes: 0,
      updates: 0,
      errors: 0,
      total: 0
    };
    this.startTime = new Date();
    
    logger.info('Performance metrics reset');
  }

  /**
   * Set custom thresholds
   */
  public setThresholds(thresholds: Partial<PerformanceThresholds>): void {
    this.thresholds = {
      ...this.thresholds,
      ...thresholds
    };
    
    logger.info('Performance thresholds updated', { thresholds: this.thresholds });
  }

  /**
   * Get current thresholds
   */
  public getThresholds(): PerformanceThresholds {
    return { ...this.thresholds };
  }

  /**
   * Generate performance report
   */
  public generateReport(): {
    summary: {
      uptime: number;
      totalOperations: number;
      successRate: number;
      avgLatency: number;
      avgThroughput: number;
    };
    current: PerformanceMetrics | null;
    violations: number;
    health: 'healthy' | 'degraded' | 'unhealthy';
  } {
    const uptime = Date.now() - this.startTime.getTime();
    const successRate = this.operationCounts.total > 0
      ? ((this.operationCounts.total - this.operationCounts.errors) / this.operationCounts.total) * 100
      : 100;

    const recentMetrics = this.getMetricsHistory(300000); // Last 5 minutes
    const avgLatency = recentMetrics.length > 0
      ? recentMetrics.reduce((sum, m) => sum + m.latency.p50, 0) / recentMetrics.length
      : 0;
    const avgThroughput = recentMetrics.length > 0
      ? recentMetrics.reduce((sum, m) => sum + m.throughput.operationsPerSecond, 0) / recentMetrics.length
      : 0;

    // Count violations in recent metrics
    let violations = 0;
    for (const metric of recentMetrics) {
      if (metric.latency.p99 > this.thresholds.maxLatencyP99) violations++;
      if (metric.errors.rate > this.thresholds.maxErrorRate) violations++;
      if (metric.throughput.operationsPerSecond < this.thresholds.minThroughput) violations++;
    }

    // Determine health status
    let health: 'healthy' | 'degraded' | 'unhealthy';
    if (violations === 0) {
      health = 'healthy';
    } else if (violations < recentMetrics.length * 0.1) {
      health = 'degraded';
    } else {
      health = 'unhealthy';
    }

    return {
      summary: {
        uptime,
        totalOperations: this.operationCounts.total,
        successRate: Math.round(successRate * 100) / 100,
        avgLatency: Math.round(avgLatency),
        avgThroughput: Math.round(avgThroughput)
      },
      current: this.getCurrentMetrics(),
      violations,
      health
    };
  }

  /**
   * Export state for snapshots
   */
  public exportState(): Record<string, unknown> {
    return {
      metrics: this.metrics.slice(-10), // Last 10 metrics
      operationCounts: this.operationCounts,
      thresholds: this.thresholds,
      startTime: this.startTime.toISOString()
    };
  }

  /**
   * Import state from snapshot
   */
  public importState(state: Record<string, unknown>): void {
    if (state.operationCounts) {
      this.operationCounts = state.operationCounts as typeof this.operationCounts;
    }
    if (state.thresholds) {
      this.thresholds = state.thresholds as PerformanceThresholds;
    }
    if (state.startTime) {
      this.startTime = new Date(state.startTime as string);
    }
  }

  /**
   * Cleanup when shutting down
   */
  public destroy(): void {
    this.stopMonitoring();
    this.removeAllListeners();
  }
}

// Export singleton instance getter
export const getPerformanceMonitor = () => PerformanceMonitor.getInstance();