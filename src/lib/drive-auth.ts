import { GoogleAuthProvider } from 'firebase/auth';

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
 * Gets the stored access token for server-side use.
 * The actual Drive client creation should happen server-side only.
 */
export function getStoredAccessToken(uid: string): string {
  return getDriveAccessToken(uid);
}