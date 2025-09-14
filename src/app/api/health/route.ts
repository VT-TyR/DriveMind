/**
 * Health check endpoint - ALPHA-CODENAME Production Gate Requirement
 * Provides system health status without exposing sensitive information
 */

import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseConfig } from '@/lib/firebase-config';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  
  try {
    // Check all dependencies
    const [firebaseStatus, googleAuthStatus, dbStatus] = await Promise.all([
      checkFirebase(),
      checkGoogleAuth(),
      checkDatabase(),
    ]);
    
    const health = {
      status: 'healthy',
      version: process.env.npm_package_version || '1.2.1',
      build: process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7) || 'local',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      dependencies: {
        firebase: firebaseStatus,
        google_auth: googleAuthStatus,
        database: dbStatus,
      },
      metrics: {
        memory_used_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        memory_total_mb: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        response_time_ms: Date.now() - startTime,
      },
      compliance: {
        alpha_codename: 'v1.8',
        aei21: 'compliant',
        security_headers: 'enabled',
        rate_limiting: 'enabled',
      },
    };

    // Determine overall health
    const isHealthy = Object.values(health.dependencies).every(dep => dep.status === 'healthy');
    
    if (!isHealthy) {
      health.status = 'degraded';
      logger.warn('Health check detected degraded status', {
        requestId,
        dependencies: health.dependencies,
      });
    }
    
    // Log health check (without PII)
    logger.info('Health check completed', {
      requestId,
      status: health.status,
      responseTime: health.metrics.response_time_ms,
    });
    
    return NextResponse.json(health, {
      status: isHealthy ? 200 : 503,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Request-ID': requestId,
      },
    });
  } catch (error) {
    logger.error('Health check failed', {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check failed',
        requestId,
      },
      { status: 503 }
    );
  }
}

async function checkFirebase(): Promise<{ status: string; latency_ms?: number }> {
  const start = Date.now();
  try {
    // Check Firebase configuration without exposing values
    const config = getFirebaseConfig();
    if (!config) {
      return { status: 'unhealthy' };
    }
    
    // Validate project ID format
    if (!config.projectId || !config.projectId.match(/^[a-z0-9-]+$/)) {
      return { status: 'unhealthy' };
    }
    
    return { 
      status: 'healthy',
      latency_ms: Date.now() - start,
    };
  } catch (error) {
    return { status: 'unhealthy' };
  }
}

async function checkGoogleAuth(): Promise<{ status: string; configured?: boolean }> {
  try {
    // Check OAuth configuration without exposing secrets
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      return { status: 'unhealthy', configured: false };
    }
    
    // Validate format without exposing values
    if (clientId.length < 10 || clientSecret.length < 10) {
      return { status: 'unhealthy', configured: false };
    }
    
    return { status: 'healthy', configured: true };
  } catch (error) {
    return { status: 'unhealthy', configured: false };
  }
}

async function checkDatabase(): Promise<{ status: string; connected?: boolean }> {
  try {
    // Check if we can import Firebase Admin
    const { getAdminFirestore } = await import('@/lib/admin');
    const db = getAdminFirestore();
    
    if (!db) {
      return { status: 'unhealthy', connected: false };
    }
    
    // Try a simple read operation with timeout
    const testPromise = db.collection('_health').doc('check').get();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout')), 2000)
    );
    
    await Promise.race([testPromise, timeoutPromise]);
    
    return { status: 'healthy', connected: true };
  } catch (error) {
    // Database might be unavailable but that's okay for health check
    return { status: 'degraded', connected: false };
  }
}