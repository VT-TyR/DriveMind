import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Check if Gemini API key is available
    const hasApiKey = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
    
    // Additional environment checks
    const envCheck = {
      hasApiKey,
      hasOAuthClientId: !!process.env.GOOGLE_OAUTH_CLIENT_ID,
      hasOAuthSecret: !!process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      nodeEnv: process.env.NODE_ENV,
      timestamp: new Date().toISOString()
    };
    
    console.log('Health check results:', envCheck);

    return NextResponse.json({
      status: hasApiKey ? 'healthy' : 'degraded',
      ...envCheck
    });
  } catch (error) {
    console.error('Health check error:', error);
    return NextResponse.json({
      status: 'error',
      hasApiKey: false,
      error: 'Health check failed'
    }, { status: 500 });
  }
}