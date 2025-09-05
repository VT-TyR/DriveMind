import { NextRequest, NextResponse } from 'next/server';
import { validateHealth } from '@/ai/flows/validate-health';
import { auth } from '@/lib/admin';

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json({ error: 'No authorization token provided' }, { status: 401 });
    }

    const decodedToken = await auth.verifyIdToken(token);
    
    const result = await validateHealth({
      auth: {
        uid: decodedToken.uid,
        email: decodedToken.email,
      }
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Health validation API error:', error);
    return NextResponse.json(
      { error: 'Failed to validate system health', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}