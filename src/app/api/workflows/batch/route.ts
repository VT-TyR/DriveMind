import { NextRequest, NextResponse } from 'next/server';
import { executeBatchOperations } from '@/ai/flows/batch-operations';
import { auth } from '@/lib/admin';

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json({ error: 'No authorization token provided' }, { status: 401 });
    }

    const decodedToken = await auth.verifyIdToken(token);
    const { 
      operations,
      batchName = 'API Batch',
      safetyLevel = 'normal',
      concurrency = 5,
      executionMode = 'preview',
      continueOnError = true,
      createBackup = true
    } = await request.json();

    if (!operations || !Array.isArray(operations)) {
      return NextResponse.json({ error: 'Operations array is required' }, { status: 400 });
    }

    const result = await executeBatchOperations({
      auth: {
        uid: decodedToken.uid,
        email: decodedToken.email,
      },
      operations,
      batchName,
      safetyLevel,
      executionMode,
      continueOnError,
      createBackup,
      maxConcurrency: concurrency,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Batch operations API error:', error);
    return NextResponse.json(
      { error: 'Failed to execute batch operations', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}