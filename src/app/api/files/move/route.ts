/**
 * @fileoverview API endpoint for moving files in Google Drive
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/admin';
import { google } from 'googleapis';
import { logger } from '@/lib/logger';
import { getStoredTokens } from '@/lib/token-store';
import { isFileOpsEnabledServer, featureMessages } from '@/lib/feature-flags';

export async function POST(request: NextRequest) {
  try {
    // Feature flag gate
    if (!isFileOpsEnabledServer()) {
      return NextResponse.json({ error: featureMessages.fileOpsDisabled }, { status: 404 });
    }

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
    const { fileId, newParentId, oldParentId } = await request.json();

    if (!fileId || !newParentId) {
      return NextResponse.json(
        { error: 'Missing required fields: fileId, newParentId' },
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

    // Get current parents to remove
    const file = await drive.files.get({
      fileId,
      fields: 'parents,name',
    });

    const previousParents = file.data.parents?.join(',') || '';

    // Move the file
    await drive.files.update({
      fileId,
      addParents: newParentId,
      removeParents: previousParents,
    });

    logger.info('File moved successfully', {
      uid,
      fileId,
      fileName: file.data.name || 'Unknown',
      newParentId,
      previousParents,
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    logger.error('Move file operation failed', { error });
    
    if (error instanceof Error) {
      if (error.message.includes('insufficient')) {
        return NextResponse.json(
          { error: 'Insufficient permissions to move this file' },
          { status: 403 }
        );
      }
      if (error.message.includes('not found')) {
        return NextResponse.json(
          { error: 'File or folder not found' },
          { status: 404 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to move file' },
      { status: 500 }
    );
  }
}
