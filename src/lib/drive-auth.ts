import { auth } from '@/lib/firebase';
import { GoogleAuthProvider, getAdditionalUserInfo } from 'firebase/auth';
import { google } from 'googleapis';

// Store access tokens temporarily (in production, use secure storage)
const userTokens: Record<string, string> = {};

/**
 * Stores the Google access token after Firebase Auth sign-in.
 * Call this in your auth context after successful sign-in.
 */
export function storeGoogleAccessToken(uid: string, accessToken: string) {
  userTokens[uid] = accessToken;
}

/**
 * Gets the stored Google Drive access token.
 */
export function getDriveAccessToken(uid: string): string {
  const token = userTokens[uid];
  if (!token) {
    throw new Error('No Drive access token available. Please sign in again.');
  }
  return token;
}

/**
 * Creates a Google Drive API client using stored access token.
 */
export function getDriveClient(uid: string) {
  const accessToken = getDriveAccessToken(uid);
  
  const oauth = new google.auth.OAuth2();
  oauth.setCredentials({ access_token: accessToken });
  
  return google.drive({ version: 'v3', auth: oauth });
}