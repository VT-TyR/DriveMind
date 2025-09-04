/**
 * Health check endpoint - ALPHA-CODENAME Production Gate Requirement
 */

import { NextResponse } from 'next/server';

export async function GET() {
  const health = {
    status: 'healthy',
    version: process.env.VERCEL_GIT_COMMIT_SHA || process.env.npm_package_version || '1.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    dependencies: {
      firebase: await checkFirebase(),
      google_auth: await checkGoogleAuth(),
    },
    metrics: {
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
    }
  };

  const isHealthy = Object.values(health.dependencies).every(dep => dep.status === 'healthy');
  
  return NextResponse.json(health, {
    status: isHealthy ? 200 : 503,
    headers: {
      'Cache-Control': 'no-cache',
      'Content-Type': 'application/json',
    },
  });
}

async function checkFirebase(): Promise<{ status: string; message?: string }> {
  try {
    // Basic check - ensure Firebase config is available
    const firebaseConfig = process.env.NEXT_PUBLIC_FIREBASE_CONFIG;
    if (!firebaseConfig) {
      return { status: 'unhealthy', message: 'Firebase config missing' };
    }
    
    return { status: 'healthy' };
  } catch (error) {
    return { status: 'unhealthy', message: 'Firebase connection failed' };
  }
}

async function checkGoogleAuth(): Promise<{ status: string; message?: string }> {
  try {
    // Basic check - ensure OAuth secrets are configured
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      return { status: 'unhealthy', message: 'OAuth credentials missing' };
    }
    
    return { status: 'healthy' };
  } catch (error) {
    return { status: 'unhealthy', message: 'Google Auth configuration failed' };
  }
}