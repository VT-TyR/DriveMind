/**
 * Analytics Service for Dashboard Metrics
 * ALPHA-CODENAME Production Gate Requirement
 * Tracks user events and system metrics for dashboard insights
 */

import { getAdminFirestore } from './admin';
import { logger } from './logger';

export interface AnalyticsEvent {
  event: string;
  userId?: string; // Hashed for privacy
  sessionId?: string;
  timestamp: Date;
  properties?: Record<string, any>;
  userAgent?: string;
  ip?: string; // Hashed for privacy
  duration?: number;
  success?: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export interface UserJourney {
  sessionId: string;
  userId?: string; // Hashed
  startTime: Date;
  endTime?: Date;
  events: AnalyticsEvent[];
  outcome: 'completed' | 'abandoned' | 'error';
  conversionFunnel: string[];
  totalDuration?: number;
}

export interface PerformanceMetric {
  timestamp: Date;
  metric: string;
  value: number;
  tags?: Record<string, string>;
  source: 'client' | 'server' | 'infrastructure';
}

export interface SecurityEvent {
  timestamp: Date;
  eventType: 'auth_attempt' | 'auth_success' | 'auth_failure' | 'suspicious_activity' | 'rate_limit_hit' | 'token_refresh';
  userId?: string; // Hashed
  ip?: string; // Hashed
  userAgent?: string;
  details?: Record<string, any>;
  riskLevel: 'low' | 'medium' | 'high';
  blocked?: boolean;
}

export class AnalyticsService {
  private db = getAdminFirestore();
  private batchSize = 50;
  private eventQueue: AnalyticsEvent[] = [];
  private performanceQueue: PerformanceMetric[] = [];
  private securityQueue: SecurityEvent[] = [];
  private flushInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startPeriodicFlush();
  }

  /**
   * Track user event for analytics
   */
  async trackEvent(event: Omit<AnalyticsEvent, 'timestamp'>): Promise<void> {
    try {
      const analyticsEvent: AnalyticsEvent = {
        ...event,
        timestamp: new Date(),
        userId: event.userId ? this.hashUserId(event.userId) : undefined,
        ip: event.ip ? this.hashIP(event.ip) : undefined
      };

      this.eventQueue.push(analyticsEvent);

      // Flush immediately for high-priority events
      if (this.isHighPriorityEvent(event.event)) {
        await this.flushEvents();
      }

      // Auto-flush when queue is full
      if (this.eventQueue.length >= this.batchSize) {
        await this.flushEvents();
      }

    } catch (error) {
      logger.error('Failed to track analytics event', {
        event: event.event,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Track authentication events
   */
  async trackAuthEvent(
    eventType: 'attempt' | 'success' | 'failure' | 'token_refresh',
    userId?: string,
    details?: Record<string, any>
  ): Promise<void> {
    await this.trackEvent({
      event: `auth_${eventType}`,
      userId,
      properties: details,
      success: eventType === 'success'
    });

    // Also track as security event
    await this.trackSecurityEvent({
      eventType: eventType === 'attempt' ? 'auth_attempt' :
                eventType === 'success' ? 'auth_success' :
                eventType === 'failure' ? 'auth_failure' : 'token_refresh',
      userId: userId ? this.hashUserId(userId) : undefined,
      details,
      riskLevel: eventType === 'failure' ? 'medium' : 'low',
      blocked: eventType === 'failure'
    });
  }

  /**
   * Track file operation events
   */
  async trackFileOperation(
    operation: 'upload' | 'delete' | 'move' | 'rename' | 'scan',
    userId: string,
    success: boolean,
    duration?: number,
    details?: Record<string, any>
  ): Promise<void> {
    await this.trackEvent({
      event: `file_${operation}${success ? '_success' : '_error'}`,
      userId,
      duration,
      success,
      properties: {
        operation,
        ...details
      }
    });
  }

  /**
   * Track user journey through application
   */
  async trackUserJourney(journey: Omit<UserJourney, 'userId'> & { userId?: string }): Promise<void> {
    try {
      const hashedJourney: UserJourney = {
        ...journey,
        userId: journey.userId ? this.hashUserId(journey.userId) : undefined,
        totalDuration: journey.endTime ? 
          journey.endTime.getTime() - journey.startTime.getTime() : undefined
      };

      if (this.db) {
        await this.db.collection('user_journeys').add({
          ...hashedJourney,
          createdAt: new Date()
        });
      }

      logger.info('User journey tracked', {
        sessionId: journey.sessionId,
        outcome: journey.outcome,
        duration: hashedJourney.totalDuration,
        events: journey.events.length
      });

    } catch (error) {
      logger.error('Failed to track user journey', {
        sessionId: journey.sessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Track performance metrics
   */
  async trackPerformance(metric: Omit<PerformanceMetric, 'timestamp'>): Promise<void> {
    try {
      const performanceMetric: PerformanceMetric = {
        ...metric,
        timestamp: new Date()
      };

      this.performanceQueue.push(performanceMetric);

      // Auto-flush when queue is full
      if (this.performanceQueue.length >= this.batchSize) {
        await this.flushPerformanceMetrics();
      }

    } catch (error) {
      logger.error('Failed to track performance metric', {
        metric: metric.metric,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Track security events
   */
  async trackSecurityEvent(event: Omit<SecurityEvent, 'timestamp'>): Promise<void> {
    try {
      const securityEvent: SecurityEvent = {
        ...event,
        timestamp: new Date(),
        userId: event.userId ? this.hashUserId(event.userId) : undefined,
        ip: event.ip ? this.hashIP(event.ip) : undefined
      };

      this.securityQueue.push(securityEvent);

      // Flush immediately for high-risk events
      if (event.riskLevel === 'high') {
        await this.flushSecurityEvents();
      }

      // Auto-flush when queue is full
      if (this.securityQueue.length >= this.batchSize) {
        await this.flushSecurityEvents();
      }

    } catch (error) {
      logger.error('Failed to track security event', {
        eventType: event.eventType,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get analytics summary for dashboard
   */
  async getAnalyticsSummary(timeRange: 'hour' | 'day' | 'week' = 'day'): Promise<{
    totalEvents: number;
    uniqueUsers: number;
    topEvents: Array<{ event: string; count: number }>;
    averageSessionDuration: number;
    conversionRate: number;
    errorRate: number;
  }> {
    try {
      const timeStart = this.getTimeRangeStart(timeRange);
      
      // Get events in time range
      if (!this.db) return {
        totalEvents: 0,
        uniqueUsers: 0,
        topEvents: [],
        averageSessionDuration: 0,
        conversionRate: 0,
        errorRate: 0
      };
      const eventsSnapshot = await this.db.collection('analytics')
        .where('timestamp', '>=', timeStart)
        .get();

      const events = eventsSnapshot.docs.map(doc => doc.data() as AnalyticsEvent);
      
      // Calculate metrics
      const totalEvents = events.length;
      const uniqueUsers = new Set(events.map(e => e.userId).filter(Boolean)).size;
      
      // Top events
      const eventCounts = events.reduce((acc, event) => {
        acc[event.event] = (acc[event.event] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      const topEvents = Object.entries(eventCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .map(([event, count]) => ({ event, count }));

      // Get user journeys for session duration
      if (!this.db) return {
        totalEvents: 0,
        uniqueUsers: 0,
        topEvents: [],
        averageSessionDuration: 0,
        conversionRate: 0,
        errorRate: 0
      };
      const journeysSnapshot = await this.db.collection('user_journeys')
        .where('startTime', '>=', timeStart)
        .get();

      const journeys = journeysSnapshot.docs.map(doc => doc.data() as UserJourney);
      const completedJourneys = journeys.filter(j => j.outcome === 'completed' && j.totalDuration);
      
      const averageSessionDuration = completedJourneys.length > 0
        ? completedJourneys.reduce((sum, j) => sum + (j.totalDuration || 0), 0) / completedJourneys.length
        : 0;

      const conversionRate = journeys.length > 0
        ? (completedJourneys.length / journeys.length) * 100
        : 0;

      const errorEvents = events.filter(e => e.success === false || e.errorCode);
      const errorRate = events.length > 0 ? (errorEvents.length / events.length) * 100 : 0;

      return {
        totalEvents,
        uniqueUsers,
        topEvents,
        averageSessionDuration: Math.round(averageSessionDuration / 1000), // Convert to seconds
        conversionRate,
        errorRate
      };

    } catch (error) {
      logger.error('Failed to get analytics summary', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Return empty summary on error
      return {
        totalEvents: 0,
        uniqueUsers: 0,
        topEvents: [],
        averageSessionDuration: 0,
        conversionRate: 0,
        errorRate: 0
      };
    }
  }

  /**
   * Get security metrics for dashboard
   */
  async getSecurityMetrics(timeRange: 'hour' | 'day' | 'week' = 'day'): Promise<{
    totalSecurityEvents: number;
    authAttempts: number;
    authFailures: number;
    suspiciousActivity: number;
    rateLimitHits: number;
    riskDistribution: Record<string, number>;
  }> {
    try {
      const timeStart = this.getTimeRangeStart(timeRange);
      
      if (!this.db) return {
        totalSecurityEvents: 0,
        authAttempts: 0,
        authFailures: 0,
        suspiciousActivity: 0,
        rateLimitHits: 0,
        riskDistribution: {}
      };
      const securitySnapshot = await this.db.collection('security_events')
        .where('timestamp', '>=', timeStart)
        .get();

      const events = securitySnapshot.docs.map(doc => doc.data() as SecurityEvent);
      
      const metrics = {
        totalSecurityEvents: events.length,
        authAttempts: events.filter(e => e.eventType === 'auth_attempt').length,
        authFailures: events.filter(e => e.eventType === 'auth_failure').length,
        suspiciousActivity: events.filter(e => e.eventType === 'suspicious_activity').length,
        rateLimitHits: events.filter(e => e.eventType === 'rate_limit_hit').length,
        riskDistribution: events.reduce((acc, event) => {
          acc[event.riskLevel] = (acc[event.riskLevel] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      };

      return metrics;

    } catch (error) {
      logger.error('Failed to get security metrics', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return {
        totalSecurityEvents: 0,
        authAttempts: 0,
        authFailures: 0,
        suspiciousActivity: 0,
        rateLimitHits: 0,
        riskDistribution: {}
      };
    }
  }

  /**
   * Flush events to database
   */
  private async flushEvents(): Promise<void> {
    if (this.eventQueue.length === 0) return;

    try {
      if (!this.db) return;
      const batch = this.db.batch();
      const events = this.eventQueue.splice(0, this.batchSize);

      events.forEach(event => {
        const docRef = this.db!.collection('analytics').doc();
        batch.set(docRef, event);
      });

      await batch.commit();

      logger.debug('Analytics events flushed', { count: events.length });

    } catch (error) {
      logger.error('Failed to flush analytics events', {
        error: error instanceof Error ? error.message : 'Unknown error',
        queueSize: this.eventQueue.length
      });
    }
  }

  /**
   * Flush performance metrics to database
   */
  private async flushPerformanceMetrics(): Promise<void> {
    if (this.performanceQueue.length === 0) return;

    try {
      if (!this.db) return;
      const batch = this.db.batch();
      const metrics = this.performanceQueue.splice(0, this.batchSize);

      metrics.forEach(metric => {
        const docRef = this.db!.collection('performance_metrics').doc();
        batch.set(docRef, metric);
      });

      await batch.commit();

      logger.debug('Performance metrics flushed', { count: metrics.length });

    } catch (error) {
      logger.error('Failed to flush performance metrics', {
        error: error instanceof Error ? error.message : 'Unknown error',
        queueSize: this.performanceQueue.length
      });
    }
  }

  /**
   * Flush security events to database
   */
  private async flushSecurityEvents(): Promise<void> {
    if (this.securityQueue.length === 0) return;

    try {
      if (!this.db) return;
      const batch = this.db.batch();
      const events = this.securityQueue.splice(0, this.batchSize);

      events.forEach(event => {
        const docRef = this.db!.collection('security_events').doc();
        batch.set(docRef, event);
      });

      await batch.commit();

      logger.debug('Security events flushed', { count: events.length });

    } catch (error) {
      logger.error('Failed to flush security events', {
        error: error instanceof Error ? error.message : 'Unknown error',
        queueSize: this.securityQueue.length
      });
    }
  }

  /**
   * Start periodic flush of queued events
   */
  private startPeriodicFlush(): void {
    this.flushInterval = setInterval(async () => {
      await Promise.all([
        this.flushEvents(),
        this.flushPerformanceMetrics(),
        this.flushSecurityEvents()
      ]);
    }, 30000); // Flush every 30 seconds
  }

  /**
   * Stop periodic flush (cleanup)
   */
  public stopPeriodicFlush(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  /**
   * Hash user ID for privacy compliance
   */
  private hashUserId(userId: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(userId).digest('hex').substring(0, 16);
  }

  /**
   * Hash IP address for privacy compliance
   */
  private hashIP(ip: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(ip).digest('hex').substring(0, 12);
  }

  /**
   * Check if event is high priority (should be flushed immediately)
   */
  private isHighPriorityEvent(event: string): boolean {
    const highPriorityEvents = [
      'auth_failure',
      'auth_success',
      'error_occurred',
      'security_incident',
      'rate_limit_hit'
    ];
    return highPriorityEvents.includes(event);
  }

  /**
   * Get start time for analytics time range
   */
  private getTimeRangeStart(timeRange: 'hour' | 'day' | 'week'): Date {
    const now = new Date();
    switch (timeRange) {
      case 'hour':
        return new Date(now.getTime() - 60 * 60 * 1000);
      case 'day':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case 'week':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      default:
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }
  }
}

// Export singleton instance
export const analyticsService = new AnalyticsService();