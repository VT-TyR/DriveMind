/**
 * Server-side Google Drive client creation.
 * This file should only be imported in server components or API routes.
 */
import { google } from 'googleapis';

/**
 * Creates a Google Drive API client using an access token.
 * This function should only be called server-side.
 */
export function createDriveClient(accessToken: string) {
  const oauth = new google.auth.OAuth2();
  oauth.setCredentials({ access_token: accessToken });
  
  return google.drive({ version: 'v3', auth: oauth });
}