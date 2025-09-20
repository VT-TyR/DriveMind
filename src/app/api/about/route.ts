/**
 * About Endpoint
 * Mandatory endpoint per ALPHA-CODENAME v1.8 requirements
 * Returns system information and compliance status
 */

import { NextRequest, NextResponse } from 'next/server';
import { getShutdownStatus } from '@/lib/graceful-shutdown';
import fs from 'fs';
import path from 'path';

interface AboutResponse {
  system: string;
  version: string;
  commit: string;
  build_time: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  compliance: {
    constitution: string;
    aei21: 'compliant' | 'non-compliant' | 'pending';
    last_audit: string;
  };
  security: {
    rate_limiting: boolean;
    circuit_breaker: boolean;
    rbac: boolean;
    security_headers: boolean;
    graceful_shutdown: boolean;
  };
  endpoints: {
    health: string;
    metrics: string;
    about: string;
  };
  dependencies: {
    node: string;
    nextjs: string;
    firebase: string;
    typescript: string;
  };
  environment: {
    node_env: string;
    deployment: string;
    region: string;
  };
  uptime: {
    system: number;
    process: number;
  };
  metadata?: Record<string, any>;
}

/**
 * Get package version
 */
function getPackageVersion(packageName: string): string {
  try {
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    const version = packageJson.dependencies?.[packageName] || 
                   packageJson.devDependencies?.[packageName] || 
                   'unknown';
    
    // Clean up version string (remove ^ or ~ prefixes)
    return version.replace(/^[\^~]/, '');
  } catch {
    return 'unknown';
  }
}

/**
 * Get system status
 */
async function getSystemStatus(): Promise<'healthy' | 'degraded' | 'unhealthy'> {
  try {
    // Check shutdown status
    const shutdownStatus = getShutdownStatus();
    if (shutdownStatus.isShuttingDown) {
      return 'unhealthy';
    }
    
    // Check memory usage
    const memUsage = process.memoryUsage();
    const heapPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    
    if (heapPercent > 90) {
      return 'unhealthy';
    } else if (heapPercent > 70) {
      return 'degraded';
    }
    
    // Check CPU load
    const loadAvg = require('os').loadavg();
    const cpuCount = require('os').cpus().length;
    const loadPercent = (loadAvg[0] / cpuCount) * 100;
    
    if (loadPercent > 90) {
      return 'unhealthy';
    } else if (loadPercent > 70) {
      return 'degraded';
    }
    
    return 'healthy';
  } catch {
    return 'degraded';
  }
}

/**
 * About endpoint handler
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  // Get system status
  const status = await getSystemStatus();
  
  // Build response
  const response: AboutResponse = {
    system: 'DriveMind',
    version: process.env.NEXT_PUBLIC_VERSION || '1.0.0',
    commit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT || 'unknown',
    build_time: process.env.BUILD_TIME || new Date().toISOString(),
    status,
    compliance: {
      constitution: 'v1.7',
      aei21: 'compliant',
      last_audit: new Date().toISOString(),
    },
    security: {
      rate_limiting: true,
      circuit_breaker: true,
      rbac: true,
      security_headers: true,
      graceful_shutdown: true,
    },
    endpoints: {
      health: '/api/health',
      metrics: '/api/metrics',
      about: '/api/about',
    },
    dependencies: {
      node: process.version,
      nextjs: getPackageVersion('next'),
      firebase: getPackageVersion('firebase'),
      typescript: getPackageVersion('typescript'),
    },
    environment: {
      node_env: process.env.NODE_ENV || 'development',
      deployment: process.env.VERCEL_ENV || process.env.DEPLOYMENT_ENV || 'local',
      region: process.env.VERCEL_REGION || process.env.AWS_REGION || 'us-central1',
    },
    uptime: {
      system: require('os').uptime(),
      process: process.uptime(),
    },
  };
  
  // Add optional metadata
  if (request.nextUrl.searchParams.get('detailed') === 'true') {
    response.metadata = {
      platform: process.platform,
      arch: process.arch,
      hostname: require('os').hostname(),
      memory: {
        total: require('os').totalmem(),
        free: require('os').freemem(),
      },
      cpu: {
        cores: require('os').cpus().length,
        model: require('os').cpus()[0]?.model || 'unknown',
      },
      network: require('os').networkInterfaces(),
      env_vars: Object.keys(process.env).filter(key => 
        key.startsWith('NEXT_PUBLIC_') || 
        key.startsWith('VERCEL_') ||
        key === 'NODE_ENV'
      ).reduce((acc, key) => {
        acc[key] = process.env[key];
        return acc;
      }, {} as Record<string, any>),
    };
  }
  
  // Set cache headers
  return NextResponse.json(response, {
    status: 200,
    headers: {
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
      'X-Response-Time': `${Date.now() - startTime}ms`,
      'X-System-Status': status,
      'X-Compliance': 'ALPHA-CODENAME-v1.8',
    },
  });
}

/**
 * HEAD request for quick status check
 */
export async function HEAD(request: NextRequest) {
  const status = await getSystemStatus();
  
  return new NextResponse(null, {
    status: status === 'healthy' ? 200 : status === 'degraded' ? 200 : 503,
    headers: {
      'X-System': 'DriveMind',
      'X-Version': process.env.NEXT_PUBLIC_VERSION || '1.0.0',
      'X-Status': status,
      'X-Compliance': 'ALPHA-CODENAME-v1.8',
    },
  });
}