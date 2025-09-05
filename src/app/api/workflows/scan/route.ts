import { NextRequest, NextResponse } from 'next/server';
import { scanDriveComplete } from '@/ai/flows/drive-scan-complete';
import { auth } from '@/lib/admin';

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json({ error: 'No authorization token provided' }, { status: 401 });
    }

    const decodedToken = await auth.verifyIdToken(token);
    const { maxDepth = 20, includeTrashed = false, scanSharedDrives = false } = await request.json();

    const result = await scanDriveComplete({
      auth: {
        uid: decodedToken.uid,
        email: decodedToken.email,
      },
      maxDepth,
      includeTrashed,
      scanSharedDrives,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Drive scan API error:', error);
    return NextResponse.json(
      { error: 'Failed to scan drive', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}