import { NextRequest, NextResponse } from 'next/server';
import { organizeWithAI } from '@/ai/flows/ai-organize-smart';
import { auth } from '@/lib/admin';

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json({ error: 'No authorization token provided' }, { status: 401 });
    }

    const decodedToken = await auth.verifyIdToken(token);
    const { 
      inventoryId,
      analysisDepth = 'advanced',
      maxSuggestions = 50,
      includeContentAnalysis = true
    } = await request.json();

    const result = await organizeWithAI({
      auth: {
        uid: decodedToken.uid,
        email: decodedToken.email,
      },
      inventoryId,
      analysisDepth,
      maxSuggestions,
      includeContentAnalysis,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('File organization API error:', error);
    return NextResponse.json(
      { error: 'Failed to organize files', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}