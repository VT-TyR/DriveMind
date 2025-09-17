/**
 * @fileoverview API endpoint for renaming files in Google Drive
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/admin';
import { google } from 'googleapis';
import { logger } from '@/lib/logger';
import { getStoredTokens } from '@/lib/token-store';

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const auth = getAdminAuth();
    if (!auth) {
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
    }

    let uid: string;
    try {
      const decodedToken = await auth.verifyIdToken(token);
      uid = decodedToken.uid;
    } catch (error) {
      logger.error('Auth verification failed', { error });
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Parse request body
    const { fileId, newName } = await request.json();

    if (!fileId || !newName) {
      return NextResponse.json(
        { error: 'Missing required fields: fileId, newName' },
        { status: 400 }
      );
    }

    // Validate new name
    if (newName.trim().length === 0) {
      return NextResponse.json(
        { error: 'File name cannot be empty' },
        { status: 400 }
      );
    }

    // Get stored OAuth tokens
    const tokens = await getStoredTokens(uid);
    if (!tokens?.access_token) {
      return NextResponse.json(
        { error: 'No Drive access token found. Please reconnect your Google account.' },
        { status: 401 }
      );
    }

    // Set up Google Drive API
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials(tokens);

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Get current file name for logging
    const file = await drive.files.get({
      fileId,
      fields: 'name',
    });

    const oldName = file.data.name;

    // Rename the file
    await drive.files.update({
      fileId,
      requestBody: {
        name: newName.trim(),
      },
    });

    logger.info('File renamed successfully', {
      uid,
      fileId,
      oldName,
      newName: newName.trim(),
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    logger.error('Rename file operation failed', { error });
    
    if (error instanceof Error) {
      if (error.message.includes('insufficient')) {
        return NextResponse.json(
          { error: 'Insufficient permissions to rename this file' },
          { status: 403 }
        );
      }
      if (error.message.includes('not found')) {
        return NextResponse.json(
          { error: 'File not found' },
          { status: 404 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to rename file' },
      { status: 500 }
    );
  }
}