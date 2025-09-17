/**
 * @fileoverview Cleanup endpoint for stuck background scans
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '@/lib/admin';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'No authorization token provided' }, { status: 401 });
    }

    const auth = getAdminAuth();
    if (!auth) {
      return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    }

    const decodedToken = await auth.verifyIdToken(token);
    const uid = decodedToken.uid;

    const db = getAdminFirestore();
    if (!db) {
      return NextResponse.json({ error: 'Database not available' }, { status: 500 });
    }

    // Find stuck scans (running for more than 1 hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const stuckScansQuery = await db
      .collection('background_scans')
      .where('uid', '==', uid)
      .where('status', 'in', ['pending', 'running'])
      .where('createdAt', '<', oneHourAgo)
      .get();

    const cleanedScans = [];
    
    for (const doc of stuckScansQuery.docs) {
      const scanData = doc.data();
      
      // Mark as failed
      await doc.ref.update({
        status: 'failed',
        error: 'Scan timeout - cleaned up automatically',
        completedAt: new Date(),
        updatedAt: new Date()
      });

      cleanedScans.push({
        id: doc.id,
        type: scanData.type,
        createdAt: scanData.createdAt
      });

      logger.info(`Cleaned up stuck scan ${doc.id} for user ${uid}`);
    }

    return NextResponse.json({
      message: `Cleaned up ${cleanedScans.length} stuck scans`,
      cleanedScans
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Scan cleanup failed', error instanceof Error ? error : new Error(errorMessage));
    return NextResponse.json(
      { error: 'Failed to cleanup scans' },
      { status: 500 }
    );
  }
}