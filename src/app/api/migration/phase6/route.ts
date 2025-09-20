/**
 * Phase 6 Migration Control API
 * Manages the mock-to-real data migration process
 */

import { NextRequest, NextResponse } from 'next/server';
import { getMigrationCoordinator } from '@/lib/safety/phase6-migration-coordinator';
import { logger } from '@/lib/logger';
// Admin-only endpoint - simple token auth for migration control
const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN || 'migration-admin-2025';
const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(',') || ['scott.presley@gmail.com'];

function checkAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  return token === ADMIN_TOKEN;
}

export async function GET(request: NextRequest) {
  try {
    // Auth check
    if (!checkAuth(request)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const coordinator = getMigrationCoordinator();
    const status = coordinator.getStatus();

    return NextResponse.json({
      success: true,
      status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get migration status', error as Error);
    return NextResponse.json(
      { error: 'Failed to get migration status' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Auth check
    if (!checkAuth(request)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { action } = body;

    const coordinator = getMigrationCoordinator();

    switch (action) {
      case 'start':
        await coordinator.startMigration();
        logger.info('Phase 6 migration started', {
          initiator: 'admin-token'
        });
        return NextResponse.json({
          success: true,
          message: 'Migration started',
          status: coordinator.getStatus()
        });

      case 'rollback':
        await coordinator.initiateRollback();
        logger.warn('Migration rollback initiated', {
          initiator: 'admin-token'
        });
        return NextResponse.json({
          success: true,
          message: 'Rollback initiated',
          status: coordinator.getStatus()
        });

      case 'abort':
        const reason = body.reason || 'Manual abort';
        await coordinator.abortMigration(reason);
        logger.error('Migration aborted', undefined, {
          initiator: 'admin-token',
          reason
        });
        return NextResponse.json({
          success: true,
          message: 'Migration aborted',
          status: coordinator.getStatus()
        });

      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    logger.error('Migration control error', error as Error);
    return NextResponse.json(
      { error: 'Migration control failed' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Auth check
    if (!checkAuth(request)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Emergency reset - completely resets migration state
    const coordinator = getMigrationCoordinator();
    await coordinator.abortMigration('Emergency reset');
    
    logger.warn('Migration emergency reset', {
      initiator: 'admin-token'
    });

    return NextResponse.json({
      success: true,
      message: 'Migration state reset'
    });
  } catch (error) {
    logger.error('Emergency reset failed', error as Error);
    return NextResponse.json(
      { error: 'Emergency reset failed' },
      { status: 500 }
    );
  }
}