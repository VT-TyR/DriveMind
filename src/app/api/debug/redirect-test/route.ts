import { NextResponse } from 'next/server';

export async function GET() {
  // This endpoint helps debug redirect URI configurations
  // It shows what URLs are being used in the OAuth flow
  
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://studio--drivemind-q69b7.us-central1.hosted.app';
  
  const possibleRedirectUris = [
    `${baseUrl}/api/auth/drive/callback`,
    `${baseUrl}/ai`,
    `${baseUrl}/api/oauth/callback`,
    `${baseUrl}/callback`,
    `https://studio--drivemind-q69b7.us-central1.hosted.app/api/auth/drive/callback`,
    `https://studio--drivemind-q69b7.us-central1.hosted.app/ai`,
  ];
  
  return NextResponse.json({
    message: 'OAuth Redirect URI Debug Info',
    baseUrl,
    currentlyUsedRedirectUri: `${baseUrl}/api/auth/drive/callback`,
    possibleRedirectUris,
    instructions: [
      '1. Check Google Console OAuth settings',
      '2. Ensure redirect URI matches exactly (case-sensitive)', 
      '3. Common mismatches: /ai vs /api/auth/drive/callback',
      '4. Verify HTTPS is used (not HTTP)',
      '5. Check for trailing slashes'
    ],
    timestamp: new Date().toISOString()
  });
}