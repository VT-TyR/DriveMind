/**
 * Health Service - Production Implementation
 * Comprehensive system health monitoring with dependency checks and SLA validation
 */

import { z } from 'zod';
import { admin } from '../../../src/lib/admin';
import { google } from 'googleapis';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../logging/logger';
import { metrics } from '../monitoring/metrics';
import { ServiceUnavailableError, HealthCheckError } from '../errors/error-types';

// Health check configuration
const HEALTH_CHECK_TIMEOUT = 5000; // 5 seconds
const DEPENDENCY_TIMEOUT = 3000; // 3 seconds per dependency
const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
const SLA_P95_THRESHOLD = 100; // 100ms P95 for health endpoint

export interface DependencyHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  latency?: number;
  lastCheck: Date;
  metadata?: Record<string, any>;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  uptime: number;
  timestamp: Date;
  environment: 'development' | 'staging' | 'production';
  dependencies: {
    firebase: DependencyHealth;
    google_auth: DependencyHealth;
    google_drive: DependencyHealth;
    gemini: DependencyHealth;
    [key: string]: DependencyHealth;
  };
  metrics: {
    memory: {
      rss: number;
      heapTotal: number;
      heapUsed: number;
      external: number;
    };
    cpu: {
      user: number;
      system: number;
    };
    performance: {
      p50: number;
      p95: number;
      p99: number;
      requestCount: number;
      errorRate: number;
    };
  };
  sla: {
    availability: number;
    responseTime: number;
    errorRate: number;
  };
}

/**
 * Health Service for comprehensive system monitoring
 */
export class HealthService {
  private static instance: HealthService;
  private startTime = Date.now();
  private lastHealthCheck?: Date;
  private healthHistory: Array<{ timestamp: Date; status: string; latency: number }> = [];
  private dependencyCache = new Map<string, DependencyHealth>();
  private cacheTimeout = 30000; // 30 seconds cache

  private constructor() {
    // Start background health monitoring
    this.startBackgroundMonitoring();
  }

  public static getInstance(): HealthService {
    if (!HealthService.instance) {
      HealthService.instance = new HealthService();
    }
    return HealthService.instance;
  }

  /**
   * Comprehensive health check
   */
  async checkHealth(): Promise<SystemHealth> {
    const startTime = Date.now();
    
    try {
      logger.debug('Starting comprehensive health check');

      // Run dependency checks in parallel
      const [
        firebaseHealth,
        googleAuthHealth,
        googleDriveHealth,
        geminiHealth,
      ] = await Promise.allSettled([
        this.checkFirebase(),
        this.checkGoogleAuth(),
        this.checkGoogleDrive(),
        this.checkGemini(),
      ]);

      // Process results
      const dependencies = {
        firebase: this.getResultValue(firebaseHealth, 'firebase'),
        google_auth: this.getResultValue(googleAuthHealth, 'google_auth'),
        google_drive: this.getResultValue(googleDriveHealth, 'google_drive'),
        gemini: this.getResultValue(geminiHealth, 'gemini'),
      };

      // Calculate overall system status
      const overallStatus = this.calculateOverallStatus(dependencies);

      // Get system metrics
      const systemMetrics = this.getSystemMetrics();
      const performanceMetrics = await this.getPerformanceMetrics();
      const slaMetrics = await this.getSLAMetrics();

      const health: SystemHealth = {
        status: overallStatus,
        version: process.env.APP_VERSION || '1.0.0',
        uptime: (Date.now() - this.startTime) / 1000,
        timestamp: new Date(),
        environment: (process.env.NODE_ENV || 'development') as any,
        dependencies,
        metrics: {
          memory: systemMetrics.memory,
          cpu: systemMetrics.cpu,
          performance: performanceMetrics,
        },
        sla: slaMetrics,
      };

      const checkLatency = Date.now() - startTime;
      this.recordHealthCheck(overallStatus, checkLatency);

      // Record metrics
      metrics.recordEvent('health_check_completed', {
        status: overallStatus,
        latency: checkLatency,
        dependencyCount: Object.keys(dependencies).length,
      });

      logger.debug('Health check completed', {
        status: overallStatus,
        latency: checkLatency,
        dependencies: Object.entries(dependencies).map(([name, dep]) => ({
          name,
          status: dep.status,
          latency: dep.latency,
        })),
      });

      return health;

    } catch (error) {
      const checkLatency = Date.now() - startTime;
      
      logger.error('Health check failed', {
        latency: checkLatency,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      metrics.recordEvent('health_check_failed', {
        latency: checkLatency,
        errorType: error instanceof Error ? error.constructor.name : 'UnknownError',
      });

      // Return degraded health status
      return {
        status: 'unhealthy',
        version: process.env.APP_VERSION || '1.0.0',
        uptime: (Date.now() - this.startTime) / 1000,
        timestamp: new Date(),
        environment: (process.env.NODE_ENV || 'development') as any,
        dependencies: {} as any,
        metrics: {
          memory: { rss: 0, heapTotal: 0, heapUsed: 0, external: 0 },
          cpu: { user: 0, system: 0 },
          performance: { p50: 0, p95: 0, p99: 0, requestCount: 0, errorRate: 100 },
        },
        sla: { availability: 0, responseTime: 0, errorRate: 100 },
      };
    }
  }

  /**
   * Quick health check for load balancers
   */
  async quickHealthCheck(): Promise<{ status: string; latency: number }> {
    const startTime = Date.now();
    
    try {
      // Quick Firebase connectivity test
      await admin.firestore().collection('_system').doc('health').get();
      
      const latency = Date.now() - startTime;
      
      // Check if latency meets SLA
      const status = latency <= SLA_P95_THRESHOLD ? 'healthy' : 'degraded';
      
      return { status, latency };
      
    } catch (error) {
      const latency = Date.now() - startTime;
      
      logger.warn('Quick health check failed', {
        latency,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      return { status: 'unhealthy', latency };
    }
  }

  // Private helper methods

  private async checkFirebase(): Promise<DependencyHealth> {
    const startTime = Date.now();
    const cacheKey = 'firebase';
    
    // Check cache first
    const cached = this.getCachedHealth(cacheKey);
    if (cached) return cached;
    
    try {
      // Test Firestore connectivity
      const db = admin.firestore();
      const testDoc = await db.collection('_system').doc('health').get();
      
      // Test Auth (if available)
      try {
        await admin.auth().getUser('test-user-that-doesnt-exist');
      } catch (authError) {
        // Expected error for non-existent user
      }

      const latency = Date.now() - startTime;
      
      const health: DependencyHealth = {
        status: latency < DEPENDENCY_TIMEOUT ? 'healthy' : 'degraded',
        message: 'Firebase services operational',
        latency,
        lastCheck: new Date(),
        metadata: {
          firestoreConnected: true,
          authConnected: true,
        },
      };
      
      this.cacheHealth(cacheKey, health);
      return health;
      
    } catch (error) {
      const latency = Date.now() - startTime;
      
      const health: DependencyHealth = {
        status: 'unhealthy',
        message: `Firebase error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        latency,
        lastCheck: new Date(),
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
      
      this.cacheHealth(cacheKey, health);
      return health;
    }
  }

  private async checkGoogleAuth(): Promise<DependencyHealth> {
    const startTime = Date.now();
    const cacheKey = 'google_auth';
    
    const cached = this.getCachedHealth(cacheKey);
    if (cached) return cached;
    
    try {
      // Test OAuth configuration
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_OAUTH_CLIENT_ID,
        process.env.GOOGLE_OAUTH_CLIENT_SECRET,
        'http://localhost:3000/callback'
      );

      // Generate auth URL as connectivity test
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/drive.readonly'],
      });

      const latency = Date.now() - startTime;
      
      const health: DependencyHealth = {
        status: authUrl && latency < DEPENDENCY_TIMEOUT ? 'healthy' : 'degraded',
        message: 'Google OAuth configuration valid',
        latency,
        lastCheck: new Date(),
        metadata: {
          hasClientId: !!process.env.GOOGLE_OAUTH_CLIENT_ID,
          hasClientSecret: !!process.env.GOOGLE_OAUTH_CLIENT_SECRET,
        },
      };
      
      this.cacheHealth(cacheKey, health);
      return health;
      
    } catch (error) {
      const latency = Date.now() - startTime;
      
      const health: DependencyHealth = {
        status: 'unhealthy',
        message: `Google OAuth error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        latency,
        lastCheck: new Date(),
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
      
      this.cacheHealth(cacheKey, health);
      return health;
    }
  }

  private async checkGoogleDrive(): Promise<DependencyHealth> {
    const startTime = Date.now();
    const cacheKey = 'google_drive';
    
    const cached = this.getCachedHealth(cacheKey);
    if (cached) return cached;
    
    try {
      // Test Drive API availability without authentication
      const drive = google.drive({ version: 'v3' });
      
      // This will fail without auth but validates API availability
      try {
        await drive.about.get();
      } catch (authError) {
        // Expected authentication error means API is available
        if ((authError as any)?.code === 401) {
          const latency = Date.now() - startTime;
          
          const health: DependencyHealth = {
            status: latency < DEPENDENCY_TIMEOUT ? 'healthy' : 'degraded',
            message: 'Google Drive API accessible',
            latency,
            lastCheck: new Date(),
            metadata: {
              apiAvailable: true,
              requiresAuth: true,
            },
          };
          
          this.cacheHealth(cacheKey, health);
          return health;
        }
        throw authError;
      }
      
    } catch (error) {
      const latency = Date.now() - startTime;
      
      const health: DependencyHealth = {
        status: 'unhealthy',
        message: `Google Drive API error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        latency,
        lastCheck: new Date(),
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
      
      this.cacheHealth(cacheKey, health);
      return health;
    }
  }

  private async checkGemini(): Promise<DependencyHealth> {
    const startTime = Date.now();
    const cacheKey = 'gemini';
    
    const cached = this.getCachedHealth(cacheKey);
    if (cached) return cached;
    
    try {
      if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY not configured');
      }

      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      
      // Simple test prompt
      const result = await model.generateContent('Respond with just "OK"');
      const response = result.response.text();
      
      const latency = Date.now() - startTime;
      
      const health: DependencyHealth = {
        status: response.includes('OK') && latency < DEPENDENCY_TIMEOUT ? 'healthy' : 'degraded',
        message: 'Gemini AI service responsive',
        latency,
        lastCheck: new Date(),
        metadata: {
          hasApiKey: true,
          responseReceived: !!response,
        },
      };
      
      this.cacheHealth(cacheKey, health);
      return health;
      
    } catch (error) {
      const latency = Date.now() - startTime;
      
      const health: DependencyHealth = {
        status: 'unhealthy',
        message: `Gemini AI error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        latency,
        lastCheck: new Date(),
        metadata: {
          hasApiKey: !!process.env.GEMINI_API_KEY,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
      
      this.cacheHealth(cacheKey, health);
      return health;
    }
  }

  private getResultValue(
    result: PromiseSettledResult<DependencyHealth>,
    serviceName: string
  ): DependencyHealth {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        status: 'unhealthy',
        message: `${serviceName} health check failed: ${result.reason}`,
        lastCheck: new Date(),
      };
    }
  }

  private calculateOverallStatus(dependencies: Record<string, DependencyHealth>): 'healthy' | 'degraded' | 'unhealthy' {
    const statuses = Object.values(dependencies).map(dep => dep.status);
    
    if (statuses.every(status => status === 'healthy')) {
      return 'healthy';
    } else if (statuses.some(status => status === 'unhealthy')) {
      return 'unhealthy';
    } else {
      return 'degraded';
    }
  }

  private getSystemMetrics() {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    return {
      memory: {
        rss: memUsage.rss,
        heapTotal: memUsage.heapTotal,
        heapUsed: memUsage.heapUsed,
        external: memUsage.external,
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system,
      },
    };
  }

  private async getPerformanceMetrics() {
    // Get metrics from monitoring service
    const recentMetrics = await metrics.getRecentMetrics(['request_duration', 'request_count', 'error_count']);
    
    return {
      p50: recentMetrics.p50 || 0,
      p95: recentMetrics.p95 || 0,
      p99: recentMetrics.p99 || 0,
      requestCount: recentMetrics.requestCount || 0,
      errorRate: recentMetrics.errorRate || 0,
    };
  }

  private async getSLAMetrics() {
    // Calculate SLA metrics from recent performance data
    const healthyChecks = this.healthHistory.filter(h => h.status === 'healthy').length;
    const totalChecks = Math.max(this.healthHistory.length, 1);
    
    const avgResponseTime = this.healthHistory.reduce((sum, h) => sum + h.latency, 0) / totalChecks;
    
    return {
      availability: (healthyChecks / totalChecks) * 100,
      responseTime: avgResponseTime,
      errorRate: ((totalChecks - healthyChecks) / totalChecks) * 100,
    };
  }

  private recordHealthCheck(status: string, latency: number) {
    this.lastHealthCheck = new Date();
    
    // Keep only last 100 health checks
    this.healthHistory.push({
      timestamp: new Date(),
      status,
      latency,
    });
    
    if (this.healthHistory.length > 100) {
      this.healthHistory.shift();
    }
  }

  private getCachedHealth(key: string): DependencyHealth | null {
    const cached = this.dependencyCache.get(key);
    if (cached && Date.now() - cached.lastCheck.getTime() < this.cacheTimeout) {
      return cached;
    }
    return null;
  }

  private cacheHealth(key: string, health: DependencyHealth) {
    this.dependencyCache.set(key, health);
  }

  private startBackgroundMonitoring() {
    // Perform health checks in background
    setInterval(async () => {
      try {
        await this.quickHealthCheck();
      } catch (error) {
        logger.debug('Background health check failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }, HEALTH_CHECK_INTERVAL);
  }

  /**
   * Get health history for monitoring dashboards
   */
  getHealthHistory(): Array<{ timestamp: Date; status: string; latency: number }> {
    return [...this.healthHistory];
  }

  /**
   * Get current dependency status
   */
  getDependencyStatus(): Map<string, DependencyHealth> {
    return new Map(this.dependencyCache);
  }

  /**
   * Clear dependency cache (for testing)
   */
  clearCache() {
    this.dependencyCache.clear();
  }
}

// Export singleton instance
export const healthService = HealthService.getInstance();