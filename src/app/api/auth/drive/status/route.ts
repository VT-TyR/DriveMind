import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAdminAuth } from '@/lib/admin';
import { getUserRefreshToken } from '@/lib/token-store';
import { driveFor } from '@/lib/google-drive';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    logger.info('🔍 Checking Google Drive connection status');
    
    // Check if user is authenticated with Firebase
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    let uid: string | null = null;
    
    if (token) {
      try {
        const auth = getAdminAuth();
        if (!auth) {
          throw new Error('Firebase Admin Auth not initialized');
        }
        const decodedToken = await auth.verifyIdToken(token);
        uid = decodedToken.uid;
        logger.info(`✅ Firebase user authenticated: ${uid}`);
      } catch (error) {
        logger.warn('⚠️ Invalid Firebase token, checking cookies only');
      }
    }

    // Method 1: Check Firestore-stored refresh token (for server-side operations)
    if (uid) {
      try {
        const storedRefreshToken = await getUserRefreshToken(uid);
        if (storedRefreshToken) {
          // Test the stored token by creating a Drive client
          const drive = await driveFor(uid);
          await drive.files.list({ pageSize: 1 });
          
          logger.info(`✅ Firestore token valid for user ${uid}`);
          return NextResponse.json({ 
            connected: true, 
            source: 'firestore',
            uid 
          });
        }
      } catch (error) {
        logger.warn(`⚠️ Firestore token invalid for user ${uid}: ${error instanceof Error ? error.message : error}`);
      }
    }

    // Method 2: Check cookie-based tokens (for browser sessions)
    const cookieStore = await cookies();
    const accessToken = cookieStore.get('google_access_token')?.value;
    const refreshToken = cookieStore.get('google_refresh_token')?.value;
    
    if (accessToken || refreshToken) {
      try {
        const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
        
        if (!clientId || !clientSecret) {
          logger.error('❌ OAuth credentials not configured');
          return NextResponse.json({ connected: false, error: 'OAuth not configured' });
        }
        
        const { google } = require('googleapis');
        const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
        oauth2Client.setCredentials({
          access_token: accessToken,
          refresh_token: refreshToken
        });
        
        const drive = google.drive({ version: 'v3', auth: oauth2Client });
        await drive.files.list({ pageSize: 1 });
        
        logger.info('✅ Cookie-based token valid');
        return NextResponse.json({ 
          connected: true, 
          source: 'cookies',
          uid 
        });
      } catch (error) {
        logger.warn(`⚠️ Cookie tokens invalid: ${error instanceof Error ? error.message : error}`);
        // Clear invalid cookies
        (await cookies()).delete('google_access_token');
        (await cookies()).delete('google_refresh_token');
      }
    }
    
    logger.info('❌ No valid Google Drive connection found');
    return NextResponse.json({ 
      connected: false, 
      uid,
      error: uid ? 'No stored refresh token found' : 'No authentication provided'
    });
    
  } catch (error) {
    logger.error(`💥 Drive status check error: ${error instanceof Error ? error.message : error}`);
    return NextResponse.json({ 
      connected: false, 
      error: 'Status check failed' 
    });
  }
}