import { NextRequest, NextResponse } from 'next/server';
import { getDashboardStats } from '@/lib/firebase-db';
import { auth } from '@/lib/admin';

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json({ error: 'No authorization token provided' }, { status: 401 });
    }

    const decodedToken = await auth.verifyIdToken(token);
    
    const stats = await getDashboardStats(decodedToken.uid);

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Dashboard stats API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard stats', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}