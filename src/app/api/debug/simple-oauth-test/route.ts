import { NextResponse } from 'next/server';

export async function GET() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  
  if (!clientId) {
    return NextResponse.json({ error: 'Missing client ID' });
  }

  const baseUrl = 'https://studio--drivemind-q69b7.us-central1.hosted.app';
  
  // Create a simple test URL to verify the redirect URI
  const testUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(clientId)}&` +
    `redirect_uri=${encodeURIComponent(baseUrl + '/ai')}&` +
    `response_type=code&` +
    `scope=${encodeURIComponent('https://www.googleapis.com/auth/drive.read')}&` +
    `access_type=offline&` +
    `state=simple-test`;

  return NextResponse.json({
    message: 'Simple OAuth Test',
    instructions: [
      '1. Click the testUrl below',
      '2. If you get "redirect_uri_mismatch", the Google Console is configured differently',
      '3. If you get to Google OAuth consent, the redirect URI is correct',
      '4. The issue might be in the token exchange phase'
    ],
    testUrl,
    clientId: `${clientId.substring(0, 10)}...${clientId.substring(clientId.length - 10)}`,
    redirectUri: baseUrl + '/ai',
    timestamp: new Date().toISOString()
  });
}