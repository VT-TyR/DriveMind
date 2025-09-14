/**
 * Firestore Migration 002: Create System Collections
 * System-level collections for metrics, monitoring, and administration
 */

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const migration = {
  version: '002',
  description: 'Create system collections for metrics, monitoring, and rate limiting',
  timestamp: new Date().toISOString(),
  
  async up() {
    console.log('Running migration 002: Create system collections...');
    
    try {
      await this.createSystemCollections();
      await this.createMetricsCollections();
      await this.createRateLimitingCollections();
      await this.createCircuitBreakerCollections();
      
      console.log('Migration 002 completed successfully');
      return { success: true, version: this.version };
      
    } catch (error) {
      console.error('Migration 002 failed:', error);
      throw error;
    }
  },
  
  async down() {
    console.log('Rolling back migration 002...');
    
    // System collections cleanup would require careful consideration
    console.log('Manual cleanup: Remove system collections if needed');
    
    return { success: true, rollback: true };
  },
  
  async createSystemCollections() {
    console.log('Creating system collections...');
    
    // System configuration
    await db.doc('_system/config').set({
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      features: {
        aiProcessing: true,
        backgroundScans: true,
        duplicateDetection: true,
        organizationRules: true
      },
      limits: {
        maxFilesPerScan: 100000,
        maxConcurrentScans: 5,
        apiRateLimit: {
          oauth: { requests: 100, window: 60 }, // per minute
          workflows: { requests: 50, window: 60 },
          ai: { requests: 30, window: 60 }
        }
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Service health tracking
    await db.doc('_system/health').set({
      status: 'healthy',
      lastCheck: admin.firestore.FieldValue.serverTimestamp(),
      dependencies: {
        firebase: { status: 'healthy', lastCheck: admin.firestore.FieldValue.serverTimestamp() },
        googleAuth: { status: 'healthy', lastCheck: admin.firestore.FieldValue.serverTimestamp() },
        googleDrive: { status: 'healthy', lastCheck: admin.firestore.FieldValue.serverTimestamp() }
      },
      uptime: 0,
      version: '1.0.0'
    });
    
    // Application metadata
    await db.doc('_system/metadata').set({
      name: 'DriveMind',
      version: '1.0.0',
      deployedAt: admin.firestore.FieldValue.serverTimestamp(),
      gitCommit: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
      environment: process.env.NODE_ENV || 'development',
      buildInfo: {
        nodeVersion: process.version,
        platform: process.platform,
        architecture: process.arch
      }
    });
    
    console.log('System collections created');
  },
  
  async createMetricsCollections() {
    console.log('Creating metrics collections...');
    
    // Business metrics aggregation
    await db.doc('_metrics/business').set({
      totalUsers: 0,
      totalScans: 0,
      totalFilesProcessed: 0,
      totalDuplicatesDetected: 0,
      totalAIInsights: 0,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      
      // Daily aggregates (last 30 days)
      dailyStats: {},
      
      // Performance metrics
      avgScanTime: 0,
      avgFilesPerScan: 0,
      p95ResponseTime: 0
    });
    
    // API usage metrics
    await db.doc('_metrics/api_usage').set({
      endpoints: {
        '/api/auth/drive/begin': { calls: 0, errors: 0, avgLatency: 0 },
        '/api/auth/drive/callback': { calls: 0, errors: 0, avgLatency: 0 },
        '/api/workflows/scan': { calls: 0, errors: 0, avgLatency: 0 },
        '/api/workflows/background-scan': { calls: 0, errors: 0, avgLatency: 0 },
        '/api/ai/classify': { calls: 0, errors: 0, avgLatency: 0 }
      },
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Error tracking
    await db.doc('_metrics/errors').set({
      errorCounts: {},
      criticalErrors: [],
      lastError: null,
      errorRate: 0,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log('Metrics collections created');
  },
  
  async createRateLimitingCollections() {
    console.log('Creating rate limiting collections...');
    
    // Rate limit configuration
    await db.doc('_system/rate_limits').set({
      rules: {
        oauth_endpoints: {
          requests: 100,
          window: 60, // seconds
          enabled: true
        },
        workflow_endpoints: {
          requests: 50,
          window: 60,
          enabled: true
        },
        ai_endpoints: {
          requests: 30,
          window: 60,
          enabled: true
        },
        health_endpoints: {
          requests: 200,
          window: 60,
          enabled: true
        }
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log('Rate limiting collections created');
  },
  
  async createCircuitBreakerCollections() {
    console.log('Creating circuit breaker collections...');
    
    // Circuit breaker state
    await db.doc('_system/circuit_breakers').set({
      services: {
        'google-drive-api': {
          state: 'CLOSED',
          failureCount: 0,
          successCount: 0,
          nextAttempt: 0,
          lastFailure: null,
          config: {
            failureThreshold: 5,
            resetTimeout: 60000,
            successThreshold: 2
          }
        },
        'google-oauth': {
          state: 'CLOSED', 
          failureCount: 0,
          successCount: 0,
          nextAttempt: 0,
          lastFailure: null,
          config: {
            failureThreshold: 3,
            resetTimeout: 30000,
            successThreshold: 2
          }
        },
        'gemini-ai': {
          state: 'CLOSED',
          failureCount: 0,
          successCount: 0,
          nextAttempt: 0,
          lastFailure: null,
          config: {
            failureThreshold: 5,
            resetTimeout: 120000,
            successThreshold: 3
          }
        }
      },
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log('Circuit breaker collections created');
  }
};

// Execute migration if run directly
if (require.main === module) {
  migration.up()
    .then(result => {
      console.log('Migration completed:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = migration;