/**
 * Metrics endpoint - ALPHA-CODENAME Production Gate Requirement  
 */

import { NextResponse } from 'next/server';

export async function GET() {
  const metrics = {
    timestamp: new Date().toISOString(),
    application: {
      name: 'drivemind',
      version: process.env.VERCEL_GIT_COMMIT_SHA || '1.0.0',
      environment: process.env.NODE_ENV,
      uptime: process.uptime(),
    },
    system: {
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      platform: process.platform,
      nodeVersion: process.version,
    },
    runtime: {
      pid: process.pid,
      ppid: process.ppid,
      title: process.title,
    },
    // In production, these would come from actual metrics collection
    business: {
      activeUsers: 0,
      filesProcessed: 0,
      duplicatesDetected: 0,
      cleanupActionsExecuted: 0,
    }
  };

  return NextResponse.json(metrics, {
    headers: {
      'Cache-Control': 'no-cache',
      'Content-Type': 'application/json',
    },
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Log deployment or custom metrics
    console.log('[METRICS] Custom metric received:', {
      timestamp: new Date().toISOString(),
      ...body
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Metric recorded',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid metric data' },
      { status: 400 }
    );
  }
}