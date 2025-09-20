/**
 * Health Check Endpoint
 * Production-grade health monitoring
 * Compliant with ALPHA-CODENAME v1.8 requirements
 */

import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { initAdmin } from '@/lib/firebase-admin';
import { getShutdownStatus } from '@/lib/graceful-shutdown';

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  commit?: string;
  checks: {
    [key: string]: {
      status: 'pass' | 'fail' | 'warn';
      message?: string;
      responseTime?: number;
      details?: any;
    };
  };
}

/**
 * Perform health check on Firestore
 */
async function checkFirestore(): Promise<{ status: 'pass' | 'fail'; responseTime: number; message?: string }> {
  const start = Date.now();
  try {
    await initAdmin();
    const db = getFirestore();
    
    // Try to read a system collection
    const testDoc = await db.collection('_health').doc('check').get();
    
    // Write a test document with timestamp
    await db.collection('_health').doc('check').set({
      timestamp: new Date(),
      status: 'healthy',
    });
    
    return {
      status: 'pass',
      responseTime: Date.now() - start,
    };
  } catch (error) {
    return {
      status: 'fail',
      responseTime: Date.now() - start,
      message: error instanceof Error ? error.message : 'Firestore check failed',
    };
  }
}

/**
 * Perform health check on Storage
 */
async function checkStorage(): Promise<{ status: 'pass' | 'fail'; responseTime: number; message?: string }> {
  const start = Date.now();
  try {
    await initAdmin();
    const storage = getStorage();
    const bucket = storage.bucket();
    
    // Check if bucket is accessible
    const [metadata] = await bucket.getMetadata();
    
    if (!metadata || !metadata.name) {
      throw new Error('Storage bucket not accessible');
    }
    
    return {
      status: 'pass',
      responseTime: Date.now() - start,
    };
  } catch (error) {
    return {
      status: 'fail',
      responseTime: Date.now() - start,
      message: error instanceof Error ? error.message : 'Storage check failed',
    };
  }
}

/**
 * Check memory usage
 */
function checkMemory(): { status: 'pass' | 'warn' | 'fail'; details: any } {
  const usage = process.memoryUsage();
  const heapUsedPercent = (usage.heapUsed / usage.heapTotal) * 100;
  
  return {
    status: heapUsedPercent > 90 ? 'fail' : heapUsedPercent > 70 ? 'warn' : 'pass',
    details: {
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024) + ' MB',
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024) + ' MB',
      rss: Math.round(usage.rss / 1024 / 1024) + ' MB',
      external: Math.round(usage.external / 1024 / 1024) + ' MB',
      heapUsedPercent: Math.round(heapUsedPercent) + '%',
    },
  };
}

/**
 * Check CPU usage
 */
function checkCPU(): { status: 'pass' | 'warn' | 'fail'; details: any } {
  const cpus = require('os').cpus();
  const loadAvg = require('os').loadavg();
  
  // Get CPU usage percentage (rough estimate)
  const avgLoad = loadAvg[0]; // 1 minute average
  const cpuCount = cpus.length;
  const loadPercent = (avgLoad / cpuCount) * 100;
  
  return {
    status: loadPercent > 90 ? 'fail' : loadPercent > 70 ? 'warn' : 'pass',
    details: {
      cores: cpuCount,
      loadAverage: {
        '1min': loadAvg[0].toFixed(2),
        '5min': loadAvg[1].toFixed(2),
        '15min': loadAvg[2].toFixed(2),
      },
      loadPercent: Math.round(loadPercent) + '%',
    },
  };
}

/**
 * Health check handler
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  // Check if we're shutting down
  const shutdownStatus = getShutdownStatus();
  if (shutdownStatus.isShuttingDown) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        message: 'Service is shutting down',
        activeConnections: shutdownStatus.activeConnections,
      },
      { 
        status: 503,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Retry-After': '60',
        },
      }
    );
  }
  
  // Perform health checks
  const checks: HealthCheckResult['checks'] = {};
  
  // Basic checks (always perform)
  checks.server = {
    status: 'pass',
    message: 'Server is responding',
    responseTime: 0,
  };
  
  // Memory check
  const memoryCheck = checkMemory();
  checks.memory = {
    status: memoryCheck.status,
    details: memoryCheck.details,
  };
  
  // CPU check
  const cpuCheck = checkCPU();
  checks.cpu = {
    status: cpuCheck.status,
    details: cpuCheck.details,
  };
  
  // Check query parameter for detailed checks
  const detailed = request.nextUrl.searchParams.get('detailed') === 'true';
  
  if (detailed) {
    // Firestore check
    const firestoreCheck = await checkFirestore();
    checks.firestore = firestoreCheck;
    
    // Storage check
    const storageCheck = await checkStorage();
    checks.storage = storageCheck;
  }
  
  // Determine overall status
  const failedChecks = Object.values(checks).filter(c => c.status === 'fail').length;
  const warnChecks = Object.values(checks).filter(c => c.status === 'warn').length;
  
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  if (failedChecks > 0) {
    overallStatus = 'unhealthy';
  } else if (warnChecks > 0) {
    overallStatus = 'degraded';
  } else {
    overallStatus = 'healthy';
  }
  
  const response: HealthCheckResult = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.NEXT_PUBLIC_VERSION || '1.0.0',
    commit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT || undefined,
    checks,
  };
  
  // Set appropriate status code
  const statusCode = overallStatus === 'healthy' ? 200 : 
                     overallStatus === 'degraded' ? 200 : 503;
  
  return NextResponse.json(response, {
    status: statusCode,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Response-Time': `${Date.now() - startTime}ms`,
    },
  });
}

/**
 * HEAD request for simple health check
 */
export async function HEAD(request: NextRequest) {
  const shutdownStatus = getShutdownStatus();
  
  if (shutdownStatus.isShuttingDown) {
    return new NextResponse(null, {
      status: 503,
      headers: {
        'X-Health-Status': 'unhealthy',
        'X-Health-Message': 'Service is shutting down',
        'Retry-After': '60',
      },
    });
  }
  
  return new NextResponse(null, {
    status: 200,
    headers: {
      'X-Health-Status': 'healthy',
      'X-Uptime': String(process.uptime()),
    },
  });
}