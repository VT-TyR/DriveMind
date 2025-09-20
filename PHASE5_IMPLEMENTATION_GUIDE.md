# Phase 5: Real-Time Data Implementation Guide

## Quick Start Implementation

### Step 1: Enable Feature Flags for Safe Migration

Create `/src/lib/feature-flags/data-sources.ts`:

```typescript
/**
 * Feature flags for controlling data source migration
 * Allows gradual rollout and instant rollback
 */

export interface DataSourceFlags {
  useRealBusinessMetrics: boolean;
  useRealSystemMetrics: boolean;
  useRealHistoricalData: boolean;
  useRealInfrastructureMetrics: boolean;
  fallbackOnError: boolean;
  logDataSources: boolean;
}

export function getDataSourceFlags(): DataSourceFlags {
  return {
    useRealBusinessMetrics: process.env.NEXT_PUBLIC_USE_REAL_BUSINESS_METRICS === 'true',
    useRealSystemMetrics: process.env.NEXT_PUBLIC_USE_REAL_SYSTEM_METRICS === 'true',
    useRealHistoricalData: process.env.NEXT_PUBLIC_USE_REAL_HISTORICAL_DATA === 'true',
    useRealInfrastructureMetrics: process.env.NEXT_PUBLIC_USE_REAL_INFRASTRUCTURE_METRICS === 'true',
    fallbackOnError: process.env.NEXT_PUBLIC_FALLBACK_ON_ERROR !== 'false', // Default true
    logDataSources: process.env.NEXT_PUBLIC_LOG_DATA_SOURCES === 'true'
  };
}
```

### Step 2: Implement Real-Time Analytics Collection

Create `/src/lib/analytics/event-tracker.ts`:

```typescript
/**
 * Real-time analytics event tracking
 * Replaces mock business metrics with actual user events
 */

import { getAdminFirestore } from '@/lib/admin';
import { logger } from '@/lib/logger';

export enum AnalyticsEvent {
  FILE_PROCESSED = 'file_processed',
  DUPLICATE_DETECTED = 'duplicate_detected',
  CLEANUP_EXECUTED = 'cleanup_executed',
  AUTH_ATTEMPT = 'auth_attempt',
  AUTH_SUCCESS = 'auth_success',
  FILE_UPLOAD = 'file_upload',
  FILE_DELETE = 'file_delete',
  FILE_MOVE = 'file_move',
  SCAN_STARTED = 'scan_started',
  SCAN_COMPLETED = 'scan_completed',
  ERROR_OCCURRED = 'error_occurred'
}

export interface EventData {
  event: AnalyticsEvent;
  userId?: string;
  metadata?: Record<string, any>;
  timestamp: Date;
  sessionId?: string;
}

class AnalyticsTracker {
  private queue: EventData[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private readonly BATCH_SIZE = 100;
  private readonly FLUSH_INTERVAL = 5000; // 5 seconds

  constructor() {
    this.startBatchProcessor();
  }

  /**
   * Track an analytics event
   */
  async track(event: AnalyticsEvent, userId?: string, metadata?: Record<string, any>) {
    const eventData: EventData = {
      event,
      userId,
      metadata,
      timestamp: new Date(),
      sessionId: this.getSessionId()
    };

    this.queue.push(eventData);

    // Flush immediately if batch is full
    if (this.queue.length >= this.BATCH_SIZE) {
      await this.flush();
    }

    logger.info('Analytics event tracked', {
      event,
      userId,
      queueSize: this.queue.length
    });
  }

  /**
   * Flush events to Firestore
   */
  private async flush() {
    if (this.queue.length === 0) return;

    const events = [...this.queue];
    this.queue = [];

    try {
      const db = getAdminFirestore();
      if (!db) {
        logger.error('Firestore not available for analytics');
        return;
      }

      const batch = db.batch();
      
      events.forEach(event => {
        const docRef = db.collection('analytics').doc();
        batch.set(docRef, {
          ...event,
          timestamp: event.timestamp,
          serverTimestamp: new Date()
        });
      });

      await batch.commit();
      
      logger.info('Analytics events flushed', {
        count: events.length
      });
    } catch (error) {
      logger.error('Failed to flush analytics events', {
        error: error instanceof Error ? error.message : 'Unknown error',
        eventCount: events.length
      });
      
      // Re-queue events if flush failed
      this.queue = [...events, ...this.queue];
    }
  }

  /**
   * Start batch processor
   */
  private startBatchProcessor() {
    this.flushInterval = setInterval(() => {
      this.flush();
    }, this.FLUSH_INTERVAL);
  }

  /**
   * Get or create session ID
   */
  private getSessionId(): string {
    // In a real implementation, this would use cookies or session storage
    return process.env.SESSION_ID || 'default-session';
  }

  /**
   * Cleanup on shutdown
   */
  async shutdown() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    await this.flush();
  }
}

export const analyticsTracker = new AnalyticsTracker();
```

### Step 3: Replace Mock Business Metrics

Update `/src/lib/dashboard-metrics.ts` - Business Metrics Collection:

```typescript
/**
 * Collect real business metrics from Firestore
 * With fallback to mock data based on feature flags
 */
private async collectBusinessMetrics(): Promise<BusinessMetrics> {
  const cached = this.cache.get('business-metrics');
  if (cached) return cached;

  const flags = getDataSourceFlags();
  
  if (!flags.useRealBusinessMetrics) {
    // Return mock data if flag is disabled
    return this.generateMockBusinessMetrics();
  }

  try {
    const db = getAdminFirestore();
    if (!db) {
      throw new Error('Firestore not available');
    }
    
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Parallel queries for real metrics
    const [
      activeUsers,
      filesProcessedToday,
      duplicatesDetectedToday,
      cleanupActionsToday,
      activeScans,
      authAttempts,
      authSuccesses
    ] = await Promise.all([
      // Active users in last hour
      db.collection('analytics')
        .where('event', '==', AnalyticsEvent.AUTH_SUCCESS)
        .where('timestamp', '>=', oneHourAgo)
        .get()
        .then(snapshot => new Set(snapshot.docs.map(doc => doc.data().userId)).size),
      
      // Files processed today
      db.collection('analytics')
        .where('event', '==', AnalyticsEvent.FILE_PROCESSED)
        .where('timestamp', '>=', oneDayAgo)
        .get()
        .then(snapshot => snapshot.size),
      
      // Duplicates detected today
      db.collection('analytics')
        .where('event', '==', AnalyticsEvent.DUPLICATE_DETECTED)
        .where('timestamp', '>=', oneDayAgo)
        .get()
        .then(snapshot => snapshot.size),
      
      // Cleanup actions today
      db.collection('analytics')
        .where('event', '==', AnalyticsEvent.CLEANUP_EXECUTED)
        .where('timestamp', '>=', oneDayAgo)
        .get()
        .then(snapshot => snapshot.size),
      
      // Active background scans
      db.collection('background_scans')
        .where('status', 'in', ['running', 'pending'])
        .get()
        .then(snapshot => snapshot.size),
      
      // Auth attempts in last day
      db.collection('analytics')
        .where('event', '==', AnalyticsEvent.AUTH_ATTEMPT)
        .where('timestamp', '>=', oneDayAgo)
        .get()
        .then(snapshot => snapshot.size),
      
      // Auth successes in last day
      db.collection('analytics')
        .where('event', '==', AnalyticsEvent.AUTH_SUCCESS)
        .where('timestamp', '>=', oneDayAgo)
        .get()
        .then(snapshot => snapshot.size)
    ]);

    const authSuccessRate = authAttempts > 0 
      ? (authSuccesses / authAttempts) * 100 
      : 100;

    const metrics: BusinessMetrics = {
      activeUsers,
      filesProcessed: filesProcessedToday,
      duplicatesDetected: duplicatesDetectedToday,
      cleanupActionsExecuted: cleanupActionsToday,
      backgroundScans: activeScans,
      authSuccessRate
    };

    // Log data source for monitoring
    if (flags.logDataSources) {
      logger.info('Using real business metrics', { metrics });
    }

    this.cache.set('business-metrics', metrics, 120);
    return metrics;
    
  } catch (error) {
    logger.error('Failed to collect real business metrics', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    if (flags.fallbackOnError) {
      logger.warn('Falling back to mock business metrics');
      return this.generateMockBusinessMetrics();
    }
    
    throw error;
  }
}
```

### Step 4: Implement Historical Data Collection

Create `/src/lib/analytics/historical-data.ts`:

```typescript
/**
 * Historical data aggregation service
 * Replaces mock timeline generation with real historical data
 */

import { getAdminFirestore } from '@/lib/admin';
import { logger } from '@/lib/logger';

export interface TimeSeriesDataPoint {
  date: string;
  files: number;
  totalSize: number;
  duplicates: number;
  cleanupActions: number;
}

class HistoricalDataService {
  private cache = new Map<string, any>();
  
  /**
   * Get storage timeline for last N days
   */
  async getStorageTimeline(days: number = 30): Promise<TimeSeriesDataPoint[]> {
    const cacheKey = `timeline-${days}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 300000) { // 5 min cache
      return cached.data;
    }

    try {
      const db = getAdminFirestore();
      if (!db) throw new Error('Firestore not available');

      const timeline: TimeSeriesDataPoint[] = [];
      const now = new Date();
      
      // Query aggregated daily stats
      const promises = [];
      
      for (let i = 0; i < days; i++) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);
        
        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);
        
        promises.push(this.getDayStats(date, nextDate));
      }
      
      const dailyStats = await Promise.all(promises);
      
      // Build timeline in chronological order
      dailyStats.reverse().forEach((stats, index) => {
        const date = new Date(now);
        date.setDate(date.getDate() - (days - index - 1));
        
        timeline.push({
          date: date.toISOString().split('T')[0],
          files: stats.files,
          totalSize: stats.totalSize,
          duplicates: stats.duplicates,
          cleanupActions: stats.cleanupActions
        });
      });
      
      this.cache.set(cacheKey, {
        data: timeline,
        timestamp: Date.now()
      });
      
      return timeline;
      
    } catch (error) {
      logger.error('Failed to get storage timeline', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Return empty timeline on error
      return [];
    }
  }
  
  /**
   * Get stats for a specific day
   */
  private async getDayStats(startDate: Date, endDate: Date) {
    const db = getAdminFirestore();
    if (!db) {
      return { files: 0, totalSize: 0, duplicates: 0, cleanupActions: 0 };
    }

    try {
      const [
        fileEvents,
        duplicateEvents,
        cleanupEvents,
        scanResults
      ] = await Promise.all([
        db.collection('analytics')
          .where('event', '==', 'file_processed')
          .where('timestamp', '>=', startDate)
          .where('timestamp', '<', endDate)
          .get(),
        
        db.collection('analytics')
          .where('event', '==', 'duplicate_detected')
          .where('timestamp', '>=', startDate)
          .where('timestamp', '<', endDate)
          .get(),
        
        db.collection('analytics')
          .where('event', '==', 'cleanup_executed')
          .where('timestamp', '>=', startDate)
          .where('timestamp', '<', endDate)
          .get(),
        
        db.collection('scan_results')
          .where('completedAt', '>=', startDate)
          .where('completedAt', '<', endDate)
          .orderBy('completedAt', 'desc')
          .limit(1)
          .get()
      ]);
      
      // Calculate total size from latest scan of the day
      let totalSize = 0;
      if (!scanResults.empty) {
        const latestScan = scanResults.docs[0].data();
        totalSize = latestScan.totalSize || 0;
      }
      
      return {
        files: fileEvents.size,
        totalSize,
        duplicates: duplicateEvents.size,
        cleanupActions: cleanupEvents.size
      };
      
    } catch (error) {
      logger.warn('Failed to get day stats', {
        date: startDate.toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return { files: 0, totalSize: 0, duplicates: 0, cleanupActions: 0 };
    }
  }
  
  /**
   * Aggregate and store daily stats (to be run by Cloud Function)
   */
  async aggregateDailyStats(date: Date) {
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1);
    
    const stats = await this.getDayStats(startDate, endDate);
    
    const db = getAdminFirestore();
    if (!db) return;
    
    try {
      await db.collection('daily_stats').doc(startDate.toISOString().split('T')[0]).set({
        ...stats,
        date: startDate,
        aggregatedAt: new Date()
      });
      
      logger.info('Daily stats aggregated', {
        date: startDate.toISOString().split('T')[0],
        stats
      });
    } catch (error) {
      logger.error('Failed to store daily stats', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

export const historicalDataService = new HistoricalDataService();
```

### Step 5: Safety Monitoring Dashboard

Create `/src/lib/monitoring/data-migration-monitor.ts`:

```typescript
/**
 * Data Migration Monitoring Service
 * Tracks migration progress and data quality
 */

import { logger } from '@/lib/logger';
import { getAdminFirestore } from '@/lib/admin';

export interface DataQualityMetrics {
  dataSource: 'real' | 'mock' | 'mixed';
  accuracy: number; // Percentage
  completeness: number; // Percentage
  freshness: number; // Seconds since last update
  fallbackTriggers: number;
  errors: number;
  validationStatus: 'passed' | 'failed' | 'warning';
}

export interface MigrationStatus {
  phase: string;
  progress: number; // Percentage
  startedAt: Date;
  estimatedCompletion: Date;
  blockers: string[];
  risks: string[];
}

class DataMigrationMonitor {
  private metrics: Map<string, DataQualityMetrics> = new Map();
  private status: MigrationStatus | null = null;
  
  /**
   * Track data source usage
   */
  trackDataSource(
    component: string, 
    source: 'real' | 'mock',
    success: boolean,
    responseTime: number
  ) {
    const existing = this.metrics.get(component) || this.createEmptyMetrics();
    
    if (!success) {
      existing.errors++;
      if (source === 'mock') {
        existing.fallbackTriggers++;
      }
    }
    
    existing.dataSource = source;
    existing.freshness = 0; // Just updated
    
    this.metrics.set(component, existing);
    
    // Log significant events
    if (!success) {
      logger.warn('Data source error', {
        component,
        source,
        responseTime
      });
    }
    
    // Store in Firestore for analysis
    this.persistMetrics(component, existing);
  }
  
  /**
   * Validate data quality
   */
  async validateDataQuality(component: string, data: any): Promise<boolean> {
    const validations = {
      businessMetrics: this.validateBusinessMetrics,
      systemMetrics: this.validateSystemMetrics,
      historicalData: this.validateHistoricalData
    };
    
    const validator = validations[component as keyof typeof validations];
    if (!validator) return true;
    
    try {
      const isValid = await validator.call(this, data);
      
      const metrics = this.metrics.get(component) || this.createEmptyMetrics();
      metrics.validationStatus = isValid ? 'passed' : 'failed';
      metrics.accuracy = isValid ? 100 : 0;
      
      this.metrics.set(component, metrics);
      
      if (!isValid) {
        logger.error('Data validation failed', {
          component,
          data
        });
      }
      
      return isValid;
    } catch (error) {
      logger.error('Validation error', {
        component,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }
  
  /**
   * Validate business metrics data
   */
  private validateBusinessMetrics(data: any): boolean {
    // Check for required fields
    if (!data.activeUsers || !data.filesProcessed) return false;
    
    // Check data ranges
    if (data.activeUsers < 0 || data.activeUsers > 1000000) return false;
    if (data.filesProcessed < 0 || data.filesProcessed > 10000000) return false;
    if (data.authSuccessRate < 0 || data.authSuccessRate > 100) return false;
    
    // Check data types
    if (typeof data.activeUsers !== 'number') return false;
    if (typeof data.filesProcessed !== 'number') return false;
    
    return true;
  }
  
  /**
   * Validate system metrics data
   */
  private validateSystemMetrics(data: any): boolean {
    if (!data.uptime || !data.responseTime) return false;
    if (data.uptime < 0) return false;
    if (data.responseTime < 0 || data.responseTime > 10000) return false;
    if (data.errorRate < 0 || data.errorRate > 100) return false;
    
    return true;
  }
  
  /**
   * Validate historical data
   */
  private validateHistoricalData(data: any): boolean {
    if (!Array.isArray(data)) return false;
    if (data.length === 0) return true;
    
    for (const point of data) {
      if (!point.date || !point.files) return false;
      if (point.files < 0 || point.totalSize < 0) return false;
    }
    
    return true;
  }
  
  /**
   * Get migration dashboard data
   */
  getMigrationDashboard() {
    const components = Array.from(this.metrics.entries()).map(([name, metrics]) => ({
      name,
      ...metrics
    }));
    
    const overallHealth = this.calculateOverallHealth();
    
    return {
      status: this.status,
      health: overallHealth,
      components,
      recommendations: this.getRecommendations(),
      alerts: this.getAlerts()
    };
  }
  
  /**
   * Calculate overall migration health
   */
  private calculateOverallHealth(): number {
    if (this.metrics.size === 0) return 100;
    
    let totalScore = 0;
    let count = 0;
    
    this.metrics.forEach(metrics => {
      const score = 
        (metrics.accuracy * 0.4) +
        (metrics.completeness * 0.3) +
        ((metrics.errors === 0 ? 100 : 0) * 0.2) +
        ((metrics.fallbackTriggers === 0 ? 100 : 0) * 0.1);
      
      totalScore += score;
      count++;
    });
    
    return count > 0 ? totalScore / count : 0;
  }
  
  /**
   * Get recommendations based on current state
   */
  private getRecommendations(): string[] {
    const recommendations: string[] = [];
    
    this.metrics.forEach((metrics, component) => {
      if (metrics.fallbackTriggers > 10) {
        recommendations.push(`High fallback rate for ${component}. Check data availability.`);
      }
      
      if (metrics.errors > 5) {
        recommendations.push(`Multiple errors in ${component}. Review error logs.`);
      }
      
      if (metrics.accuracy < 95) {
        recommendations.push(`Low data accuracy in ${component}. Validate data sources.`);
      }
    });
    
    return recommendations;
  }
  
  /**
   * Get active alerts
   */
  private getAlerts(): any[] {
    const alerts: any[] = [];
    
    this.metrics.forEach((metrics, component) => {
      if (metrics.validationStatus === 'failed') {
        alerts.push({
          level: 'error',
          message: `Data validation failed for ${component}`,
          timestamp: new Date()
        });
      }
      
      if (metrics.fallbackTriggers > 50) {
        alerts.push({
          level: 'warning', 
          message: `Excessive fallbacks for ${component}`,
          timestamp: new Date()
        });
      }
    });
    
    return alerts;
  }
  
  /**
   * Persist metrics to Firestore
   */
  private async persistMetrics(component: string, metrics: DataQualityMetrics) {
    try {
      const db = getAdminFirestore();
      if (!db) return;
      
      await db.collection('migration_metrics').doc(component).set({
        ...metrics,
        component,
        timestamp: new Date()
      }, { merge: true });
      
    } catch (error) {
      logger.error('Failed to persist migration metrics', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  /**
   * Create empty metrics object
   */
  private createEmptyMetrics(): DataQualityMetrics {
    return {
      dataSource: 'mock',
      accuracy: 0,
      completeness: 0,
      freshness: 0,
      fallbackTriggers: 0,
      errors: 0,
      validationStatus: 'warning'
    };
  }
}

export const migrationMonitor = new DataMigrationMonitor();
```

### Step 6: Environment Configuration

Update `.env.local`:

```bash
# Phase 5 Data Migration Flags
NEXT_PUBLIC_USE_REAL_BUSINESS_METRICS=false
NEXT_PUBLIC_USE_REAL_SYSTEM_METRICS=false
NEXT_PUBLIC_USE_REAL_HISTORICAL_DATA=false
NEXT_PUBLIC_USE_REAL_INFRASTRUCTURE_METRICS=false
NEXT_PUBLIC_FALLBACK_ON_ERROR=true
NEXT_PUBLIC_LOG_DATA_SOURCES=true

# Monitoring
NEXT_PUBLIC_ENABLE_MIGRATION_DASHBOARD=true
NEXT_PUBLIC_DATA_QUALITY_THRESHOLD=95
```

### Step 7: Gradual Rollout Script

Create `/scripts/phase5-rollout.sh`:

```bash
#!/bin/bash

# Phase 5 Gradual Rollout Script
# Enables real data sources progressively with validation

set -e

echo "Starting Phase 5 Data Migration Rollout..."

# Function to check data quality
check_data_quality() {
    local component=$1
    local response=$(curl -s https://studio--drivemind-q69b7.us-central1.hosted.app/api/monitoring/data-quality?component=$component)
    local accuracy=$(echo $response | jq -r '.accuracy')
    
    if (( $(echo "$accuracy < 95" | bc -l) )); then
        echo "❌ Data quality check failed for $component (accuracy: $accuracy%)"
        return 1
    fi
    
    echo "✅ Data quality check passed for $component (accuracy: $accuracy%)"
    return 0
}

# Phase 5A: Enable Business Metrics (Week 1)
echo "Phase 5A: Enabling real business metrics..."
npx firebase functions:config:set features.use_real_business_metrics=true
npx firebase deploy --only functions

sleep 300 # Wait 5 minutes for data collection

if check_data_quality "businessMetrics"; then
    echo "✅ Business metrics migration successful"
else
    echo "❌ Rolling back business metrics..."
    npx firebase functions:config:set features.use_real_business_metrics=false
    npx firebase deploy --only functions
    exit 1
fi

# Phase 5B: Enable System Metrics (Week 2)
echo "Phase 5B: Enabling real system metrics..."
npx firebase functions:config:set features.use_real_system_metrics=true
npx firebase deploy --only functions

sleep 300

if check_data_quality "systemMetrics"; then
    echo "✅ System metrics migration successful"
else
    echo "❌ Rolling back system metrics..."
    npx firebase functions:config:set features.use_real_system_metrics=false
    npx firebase deploy --only functions
    exit 1
fi

# Phase 5C: Enable Historical Data (Week 3)
echo "Phase 5C: Enabling real historical data..."
npx firebase functions:config:set features.use_real_historical_data=true
npx firebase deploy --only functions

sleep 300

if check_data_quality "historicalData"; then
    echo "✅ Historical data migration successful"
else
    echo "❌ Rolling back historical data..."
    npx firebase functions:config:set features.use_real_historical_data=false
    npx firebase deploy --only functions
    exit 1
fi

# Phase 5D: Disable Mock Fallbacks (Week 4)
echo "Phase 5D: Disabling mock fallbacks..."
npx firebase functions:config:set features.fallback_on_error=false
npx firebase deploy --only functions

# Monitor for 10 minutes
echo "Monitoring without fallbacks for 10 minutes..."
sleep 600

# Check error rates
error_rate=$(curl -s https://studio--drivemind-q69b7.us-central1.hosted.app/api/dashboard/live | jq -r '.system.errorRate')

if (( $(echo "$error_rate > 1" | bc -l) )); then
    echo "❌ Error rate too high without fallbacks ($error_rate%). Re-enabling..."
    npx firebase functions:config:set features.fallback_on_error=true
    npx firebase deploy --only functions
    exit 1
fi

echo "✅ Phase 5 Migration Complete!"
echo "All data sources migrated to real-time data"

# Generate final report
curl -s https://studio--drivemind-q69b7.us-central1.hosted.app/api/monitoring/migration-report > phase5-completion-report.json
echo "Migration report saved to phase5-completion-report.json"
```

## Safety Oversight Dashboard

Access the migration monitoring dashboard at:
`https://studio--drivemind-q69b7.us-central1.hosted.app/admin/migration-dashboard`

Key metrics to monitor:
- Data source distribution (real vs mock)
- Fallback trigger rate
- Data validation pass rate
- Query performance (P95 < 250ms)
- Error rates by component

## Rollback Procedure

If issues arise during migration:

1. **Immediate Rollback** (< 1 minute):
```bash
# Disable all real data sources
npx firebase functions:config:set \
  features.use_real_business_metrics=false \
  features.use_real_system_metrics=false \
  features.use_real_historical_data=false \
  features.fallback_on_error=true

npx firebase deploy --only functions
```

2. **Verify Rollback**:
```bash
curl https://studio--drivemind-q69b7.us-central1.hosted.app/api/dashboard/live?section=all
# Should show mock data sources in use
```

3. **Investigation**:
- Check error logs in Firebase Console
- Review migration metrics dashboard
- Analyze data validation failures
- Check Firestore query performance

## Success Criteria Checklist

- [ ] All feature flags deployed and configurable
- [ ] Analytics tracking implemented and collecting data
- [ ] Real business metrics queries returning valid data
- [ ] Historical data aggregation running daily
- [ ] Migration monitor showing > 95% data quality
- [ ] Response times P95 < 250ms with real data
- [ ] Error rate < 1% during migration
- [ ] Rollback tested and confirmed working
- [ ] All mock data generators deprecated
- [ ] Documentation updated with new data flows

## Post-Migration Cleanup

After successful migration:

1. Remove mock data files:
   - `/src/lib/mock-db.ts`
   - Mock generation functions in dashboard services

2. Update documentation:
   - Remove references to mock data
   - Document real data sources
   - Update API documentation

3. Archive migration code:
   - Feature flags (keep for 30 days)
   - Migration monitor (keep for analysis)
   - Rollback scripts (keep for emergency)

---

**Implementation Start Date:** 2025-09-20  
**Estimated Completion:** 6 weeks  
**Safety Gates:** All enabled ✅  
**Rollback Ready:** Yes ✅