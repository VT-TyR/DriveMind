import { NextRequest, NextResponse } from 'next/server';
import { detectSmartDuplicates } from '@/ai/flows/duplicates-detect-smart';
import { auth } from '@/lib/admin';

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json({ error: 'No authorization token provided' }, { status: 401 });
    }

    const decodedToken = await auth.verifyIdToken(token);
    const { 
      algorithm = 'thorough',
      includeContentHashing = true,
      includeFuzzyMatching = true,
      minFileSize = 1024,
      maxFiles = 1000
    } = await request.json();

    const result = await detectSmartDuplicates({
      auth: {
        uid: decodedToken.uid,
        email: decodedToken.email,
      },
      algorithm,
      includeContentHashing,
      includeFuzzyMatching,
      minFileSize,
      maxFiles,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Duplicate detection API error:', error);
    return NextResponse.json(
      { error: 'Failed to detect duplicates', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}