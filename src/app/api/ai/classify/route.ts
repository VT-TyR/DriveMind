import { NextRequest, NextResponse } from 'next/server';
import { classifyFiles } from '@/ai/flows/ai-classify';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('Classify API called with:', { filesCount: body.files?.length || 0 });
    
    // Validate input
    if (!body.files || !Array.isArray(body.files)) {
      return NextResponse.json(
        { error: 'Invalid input: files array required' },
        { status: 400 }
      );
    }
    
    const result = await classifyFiles({
      files: body.files,
      redact: body.redact ?? true
    });
    
    console.log('Classification successful:', { labelsCount: result.labels.length });
    return NextResponse.json(result);
    
  } catch (error: any) {
    console.error('Classification API error:', error);
    
    // Return a safe fallback response
    return NextResponse.json({
      labels: [{
        fileId: 'fallback',
        topics: ['documents'],
        sensitivity: 'low',
        docType: 'document',
        summary: 'Classification service unavailable',
        suggestedPath: ['Documents'],
        confidence: 0.1
      }]
    });
  }
}