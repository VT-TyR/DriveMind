import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '@/lib/admin';

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'No authorization token provided' }, { status: 401 });
    }

    const auth = getAdminAuth();
    const db = getAdminFirestore();
    if (!auth || !db) {
      return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    }

    const { uid } = await auth.verifyIdToken(token);
    const ref = db.collection('users').doc(uid).collection('secrets').doc('driveState');
    const snap = await ref.get();
    const canDelta = snap.exists && !!(snap.data()?.pageToken);

    return NextResponse.json({ canDelta });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

