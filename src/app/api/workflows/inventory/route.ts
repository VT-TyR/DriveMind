import { NextRequest, NextResponse } from 'next/server';
import { analyzeInventory } from '@/ai/flows/inventory-analyze';
import { auth } from '@/lib/admin';

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json({ error: 'No authorization token provided' }, { status: 401 });
    }

    const decodedToken = await auth.verifyIdToken(token);
    const { scanId, reuseRecentScan = true } = await request.json();

    const result = await analyzeInventory({
      auth: {
        uid: decodedToken.uid,
        email: decodedToken.email,
      },
      scanId,
      reuseRecentScan,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Inventory analysis API error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze inventory', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}