/**
 * Detailed OAuth diagnostic endpoint
 */

import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function GET() {
  try {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
    const redirectUri = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://studio--drivemind-q69b7.us-central1.hosted.app'}/api/auth/drive/callback`;
    
    const diagnostics = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      credentials: {
        hasClientId: !!clientId,
        clientIdLength: clientId?.length || 0,
        clientIdStart: clientId?.substring(0, 20) || 'missing',
        clientIdEnd: clientId?.substring(-10) || 'missing',
        hasClientSecret: !!clientSecret,
        clientSecretLength: clientSecret?.length || 0,
        clientSecretStart: clientSecret?.substring(0, 8) || 'missing',
        clientSecretPattern: clientSecret?.match(/^GOCSPX-/) ? 'valid_pattern' : 'invalid_pattern'
      },
      config: {
        redirectUri,
        baseUrl: process.env.NEXT_PUBLIC_BASE_URL,
        firebaseConfig: !!process.env.FIREBASE_CONFIG
      },
      validation: {
        clientIdTrimmed: clientId === process.env.GOOGLE_OAUTH_CLIENT_ID?.trim(),
        clientSecretTrimmed: clientSecret === process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim(),
        noWhitespace: {
          clientId: !clientId?.includes(' ') && !clientId?.includes('\n') && !clientId?.includes('\t'),
          clientSecret: !clientSecret?.includes(' ') && !clientSecret?.includes('\n') && !clientSecret?.includes('\t')
        }
      }
    };
    
    // Test OAuth2 client creation
    try {
      const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: ['https://www.googleapis.com/auth/drive'],
      });
      
      diagnostics.oauth = {
        clientCreation: 'success',
        authUrlGenerated: !!authUrl,
        authUrlLength: authUrl.length
      };
    } catch (error: any) {
      diagnostics.oauth = {
        clientCreation: 'failed',
        error: error.message
      };
    }
    
    return NextResponse.json(diagnostics);
  } catch (error: any) {
    return NextResponse.json({
      error: 'diagnostic_failed',
      message: error.message,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}