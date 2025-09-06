import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAdminAuth } from '@/lib/admin';
import { saveUserRefreshToken, getUserRefreshToken } from '@/lib/token-store';
import { logger } from '@/lib/logger';

/**
 * Sync endpoint to ensure token consistency between cookies and Firestore
 * This handles cases where tokens exist in one location but not the other
 */
export async function POST(request: NextRequest) {
  try {
    logger.info('🔄 Starting token sync process');
    
    // Get Firebase user
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'No authorization token provided' }, { status: 401 });
    }

    const auth = getAdminAuth();
    const decodedToken = await auth.verifyIdToken(token);
    const uid = decodedToken.uid;
    
    logger.info(`👤 Syncing tokens for user: ${uid}`);

    // Get tokens from both sources
    const cookieStore = await cookies();
    const cookieRefreshToken = cookieStore.get('google_refresh_token')?.value;
    const firestoreRefreshToken = await getUserRefreshToken(uid);

    logger.info('📊 Token sync status:', {
      hasCookieToken: !!cookieRefreshToken,
      hasFirestoreToken: !!firestoreRefreshToken,
      tokensMatch: cookieRefreshToken === firestoreRefreshToken
    });

    // Sync logic: prioritize Firestore, but use cookies as backup
    let finalToken: string | null = null;
    let syncActions: string[] = [];

    if (firestoreRefreshToken) {
      // Firestore has token - use it and sync to cookies
      finalToken = firestoreRefreshToken;
      
      if (!cookieRefreshToken || cookieRefreshToken !== firestoreRefreshToken) {
        // Update cookies to match Firestore
        const response = NextResponse.json({ 
          synced: true, 
          source: 'firestore',
          actions: ['updated_cookies']
        });
        
        response.cookies.set('google_refresh_token', firestoreRefreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 60 * 60 * 24 * 30, // 30 days
          path: '/',
        });
        
        syncActions.push('updated_cookies');
        logger.info('✅ Updated cookies from Firestore token');
        return response;
      }
    } else if (cookieRefreshToken) {
      // Cookies have token but Firestore doesn't - sync to Firestore
      finalToken = cookieRefreshToken;
      await saveUserRefreshToken(uid, cookieRefreshToken);
      syncActions.push('updated_firestore');
      logger.info('✅ Updated Firestore from cookie token');
    }

    if (!finalToken) {
      logger.warn('⚠️ No refresh tokens found in either location');
      return NextResponse.json({ 
        synced: false, 
        error: 'No refresh tokens found',
        needsReauth: true
      });
    }

    logger.info(`✅ Token sync completed: ${syncActions.join(', ') || 'no action needed'}`);
    
    return NextResponse.json({ 
      synced: true, 
      source: firestoreRefreshToken ? 'firestore' : 'cookies',
      actions: syncActions,
      hasToken: true
    });

  } catch (error) {
    logger.error(`💥 Token sync error: ${error instanceof Error ? error.message : error}`);
    return NextResponse.json({ 
      synced: false, 
      error: 'Token sync failed' 
    }, { status: 500 });
  }
}