
/**
 * In a real app, you would use a database to store user credentials.
 * For this example, we'll use a simple in-memory store.
 */
import { google } from 'googleapis';
import { getOAuthClient } from '@/lib/google-auth';


const userRefreshTokens: Record<string, string> = {};

/** Persist user's Drive refresh token */
export async function saveRefreshToken(uid: string, refresh: string | null | undefined) {
    if (refresh) {
        userRefreshTokens[uid] = refresh;
        console.log(`Saved refresh token for user ${uid}`);
    }
}

/** Create an authenticated Drive client for a given uid (requires stored refresh token). */
export async function driveFor(uid:string) {
  const refresh = userRefreshTokens[uid];
  if (!refresh) {
    // This is not a user-facing error. It's a server-side logic error.
    // The UI should prevent this from happening by guiding the user through auth.
    throw new Error(`No Google Drive connection for user '${uid}'. Please connect your account first.`);
  }
  const oauth = getOAuthClient();
  oauth.setCredentials({ refresh_token: refresh });
  return google.drive({ version: "v3", auth: oauth });
}

/** Minimal safe scopes for read-only. Expand later if needed. */
export const READONLY_SCOPES = [
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/drive.readonly"
];

/** Full write scope, for when you are ready for move/delete. */
export const WRITE_SCOPES = [
    ...READONLY_SCOPES,
    "https://www.googleapis.com/auth/drive"
];
