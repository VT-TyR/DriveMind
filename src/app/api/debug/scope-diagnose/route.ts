/**
 * Diagnostic endpoint to test different OAuth scopes
 */

import { NextResponse } from 'next/server';

export async function GET() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const redirectUri = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://studio--drivemind-q69b7.us-central1.hosted.app'}/api/auth/drive/callback`;
  
  const testScopes = [
    {
      name: 'Basic (openid email profile)',
      scope: 'openid email profile',
      description: 'Basic user info - should always work'
    },
    {
      name: 'Drive Read Only', 
      scope: 'https://www.googleapis.com/auth/drive.readonly',
      description: 'Read-only access to Drive files'
    },
    {
      name: 'Drive File',
      scope: 'https://www.googleapis.com/auth/drive.file', 
      description: 'Access to files created by this app'
    },
    {
      name: 'Drive Full',
      scope: 'https://www.googleapis.com/auth/drive',
      description: 'Full access to all Drive files'
    },
    {
      name: 'Drive Metadata',
      scope: 'https://www.googleapis.com/auth/drive.metadata.readonly',
      description: 'Read-only access to file metadata'
    }
  ];
  
  const testUrls = testScopes.map(scopeTest => {
    const params = new URLSearchParams({
      client_id: clientId!,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopeTest.scope,
      access_type: 'offline',
      prompt: 'consent'
    });
    
    return {
      ...scopeTest,
      testUrl: `https://accounts.google.com/o/oauth2/auth?${params.toString()}`
    };
  });
  
  return NextResponse.json({
    status: 'OAuth Scope Diagnostic',
    clientId: clientId?.substring(0, 20) + '...',
    redirectUri,
    instructions: [
      '1. Test each URL below in a new browser tab',
      '2. The first URL that works (shows Google consent screen) indicates the maximum scope allowed',
      '3. URLs that show 400 error indicate scope/API issues',
      '4. URLs that show invalid_client indicate client configuration issues'
    ],
    testResults: testUrls
  });
}