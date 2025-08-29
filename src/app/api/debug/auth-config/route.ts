import { NextResponse } from 'next/server';

export async function GET() {
  // Check the Firebase config that's actually being used by the client
  const firebaseConfigRaw = process.env.NEXT_PUBLIC_FIREBASE_CONFIG;
  
  if (!firebaseConfigRaw) {
    return NextResponse.json({
      error: 'NEXT_PUBLIC_FIREBASE_CONFIG not found',
      fallbackConfig: {
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'draftcore-os',
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'demo-key',
      }
    });
  }

  try {
    const firebaseConfig = JSON.parse(firebaseConfigRaw);
    
    return NextResponse.json({
      firebaseConfig: {
        projectId: firebaseConfig.projectId,
        appId: firebaseConfig.appId,
        authDomain: firebaseConfig.authDomain,
        apiKey: firebaseConfig.apiKey ? `${firebaseConfig.apiKey.substring(0, 10)}...` : 'Missing',
        messagingSenderId: firebaseConfig.messagingSenderId,
      },
      oauthCredentials: {
        clientId: process.env.GOOGLE_OAUTH_CLIENT_ID ? `${process.env.GOOGLE_OAUTH_CLIENT_ID.substring(0, 20)}...` : 'Missing',
        hasClientSecret: !!process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    return NextResponse.json({
      error: 'Failed to parse Firebase config',
      message: error.message,
      rawConfig: firebaseConfigRaw.substring(0, 100) + '...'
    });
  }
}