/**
 * @fileoverview Safety Dashboard API endpoint
 * Provides real-time monitoring data for migration safety infrastructure
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSafetyController } from '@/lib/safety/safety-controller';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const controller = getSafetyController();
    const status = await controller.getStatus();

    return NextResponse.json({
      success: true,
      data: {
        ...status,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Failed to get safety dashboard data', undefined, {
      error: (error as Error).message
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to retrieve dashboard data',
        message: (error as Error).message
      },
      { status: 500 }
    );
  }
}

/**
 * Health check endpoint for the safety system
 */
export async function HEAD() {
  try {
    const controller = getSafetyController();
    const health = await controller.checkHealth();

    if (health.status === 'healthy') {
      return new NextResponse(null, { status: 200 });
    } else if (health.status === 'degraded') {
      return new NextResponse(null, { status: 503 });
    } else {
      return new NextResponse(null, { status: 500 });
    }
  } catch (error) {
    return new NextResponse(null, { status: 500 });
  }
}