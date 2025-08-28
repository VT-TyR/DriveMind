import { NextResponse } from 'next/server';

export async function GET() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  
  if (!clientId) {
    return NextResponse.json({ error: 'Missing client ID' });
  }

  const baseUrl = 'https://studio--drivemind-q69b7.us-central1.hosted.app';
  
  // Test all common Google Drive scopes
  const commonScopes = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/drive.metadata.readonly',
    'https://www.googleapis.com/auth/drive.read',
    'https://www.googleapis.com/auth/drive.appdata',
    'https://www.googleapis.com/auth/drive.photos.readonly',
    // Basic Google scopes that might be configured
    'openid',
    'email',
    'profile',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
  ];

  const testUrls = commonScopes.map(scope => {
    const testUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(clientId)}&` +
      `redirect_uri=${encodeURIComponent(baseUrl + '/ai')}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(scope)}&` +
      `access_type=offline&` +
      `state=scope-test`;
    
    return {
      scope,
      description: getScopeDescription(scope),
      testUrl
    };
  });

  return NextResponse.json({
    message: 'OAuth Scope Testing',
    instructions: [
      '1. Try each testUrl below in your browser',
      '2. The first one that does NOT show "invalid_scope" is the correct scope',
      '3. Note which scope works and we will update the application',
      '4. You may get "access_denied" - that is OK, we just need to avoid "invalid_scope"'
    ],
    clientId: `${clientId.substring(0, 10)}...${clientId.substring(clientId.length - 10)}`,
    testUrls,
    timestamp: new Date().toISOString()
  });
}

function getScopeDescription(scope: string): string {
  const descriptions: Record<string, string> = {
    'https://www.googleapis.com/auth/drive': 'Full access to Google Drive',
    'https://www.googleapis.com/auth/drive.file': 'Access to files created by this app',
    'https://www.googleapis.com/auth/drive.readonly': 'Read-only access to Google Drive',
    'https://www.googleapis.com/auth/drive.metadata.readonly': 'Read-only access to file metadata',
    'https://www.googleapis.com/auth/drive.read': 'Read access to Google Drive (alternative)',
    'https://www.googleapis.com/auth/drive.appdata': 'Access to application data folder',
    'https://www.googleapis.com/auth/drive.photos.readonly': 'Read-only access to photos',
    'openid': 'OpenID Connect',
    'email': 'Email address',
    'profile': 'Basic profile info',
    'https://www.googleapis.com/auth/userinfo.email': 'Email address (userinfo)',
    'https://www.googleapis.com/auth/userinfo.profile': 'Profile info (userinfo)'
  };
  
  return descriptions[scope] || 'Unknown scope';
}