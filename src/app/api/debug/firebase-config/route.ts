import { NextResponse } from 'next/server';

export async function GET() {
  // Check what Firebase configuration is actually being used
  const config = {
    hasNextPublicFirebaseConfig: !!process.env.NEXT_PUBLIC_FIREBASE_CONFIG,
    nextPublicFirebaseConfig: process.env.NEXT_PUBLIC_FIREBASE_CONFIG ? 'Set (hidden for security)' : 'Not set',
    fallbackProjectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'draftcore-os',
    fallbackApiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'demo-key',
    nodeEnv: process.env.NODE_ENV,
    timestamp: new Date().toISOString()
  };

  return NextResponse.json(config);
}