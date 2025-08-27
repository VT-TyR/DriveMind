import { NextResponse } from 'next/server';

export async function GET() {
  try {
    console.log('Testing Genkit import...');
    
    // Check environment variables first
    const hasGeminiKey = !!process.env.GEMINI_API_KEY;
    const hasGoogleKey = !!process.env.GOOGLE_API_KEY;
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    
    console.log('Environment check:', {
      hasGeminiKey,
      hasGoogleKey,
      apiKeyLength: apiKey?.length || 0
    });
    
    if (!apiKey) {
      return NextResponse.json({
        error: 'No API key found',
        hasGeminiKey,
        hasGoogleKey,
        success: false
      });
    }
    
    // Try to import Genkit
    const { ai } = await import('@/ai/genkit');
    
    return NextResponse.json({
      success: true,
      message: 'Genkit imported successfully',
      hasGeminiKey,
      hasGoogleKey,
      apiKeyLength: apiKey.length
    });
    
  } catch (error: any) {
    console.error('Genkit test failed:', error);
    return NextResponse.json({
      error: error.message,
      success: false
    });
  }
}