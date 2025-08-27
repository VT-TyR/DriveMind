import { NextResponse } from 'next/server';

export async function GET() {
  // Debug endpoint to check environment variables
  return NextResponse.json({
    hasGeminiApiKey: !!process.env.GEMINI_API_KEY,
    hasGoogleApiKey: !!process.env.GOOGLE_API_KEY,
    hasOAuthClientId: !!process.env.GOOGLE_OAUTH_CLIENT_ID,
    hasOAuthClientSecret: !!process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    nodeEnv: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
    // Don't expose actual keys, just their lengths for debugging
    geminiKeyLength: process.env.GEMINI_API_KEY?.length || 0,
    oauthClientIdLength: process.env.GOOGLE_OAUTH_CLIENT_ID?.length || 0,
  });
}