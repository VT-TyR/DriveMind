import { NextRequest, NextResponse } from 'next/server';
import { proposeRules } from '@/ai/flows/ai-propose-rules';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('Propose rule API called with prompt:', body.prompt?.slice(0, 100));
    
    // Validate input
    if (!body.prompt || typeof body.prompt !== 'string') {
      return NextResponse.json(
        { error: 'Invalid input: prompt string required' },
        { status: 400 }
      );
    }
    
    if (!body.auth?.uid) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }
    
    const result = await proposeRules({
      prompt: body.prompt,
      auth: { uid: body.auth.uid }
    });
    
    console.log('Rule proposal successful:', { ruleId: result.ruleId });
    return NextResponse.json(result);
    
  } catch (error: any) {
    console.error('Rule proposal API error:', error);
    
    // Return a safe fallback response
    return NextResponse.json({
      ruleId: `fallback_${Date.now()}`,
      humanPrompt: 'Service unavailable',
      compiledRule: {
        filter: {
          nameRegex: ".*",
          mimeTypes: ["*"],
          olderThanDays: 0,
        },
        action: { type: "move", dest: ["Organized"] }
      },
      uid: 'fallback'
    });
  }
}