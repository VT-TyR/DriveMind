/**
 * @fileoverview API endpoint for creating folders in Google Drive
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
    const { name, parentId } = await request.json();

    if (!name) {
      return NextResponse.json(
        { error: 'Missing required field: name' },
        { status: 400 }
      );
    }

    // Validate folder name
    if (name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Folder name cannot be empty' },
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

    // Create folder metadata
    const folderMetadata: any = {
      name: name.trim(),
      mimeType: 'application/vnd.google-apps.folder',
    };

    // Set parent if provided
    if (parentId) {
      folderMetadata.parents = [parentId];
    }

    // Create the folder
    const folder = await drive.files.create({
      requestBody: folderMetadata,
      fields: 'id,name,parents',
    });

    const folderId = folder.data.id;
    if (!folderId) {
      throw new Error('Failed to get folder ID from Drive API response');
    }

    logger.info('Folder created successfully', {
      uid,
      folderId,
      folderName: name.trim(),
      parentId,
    });

    return NextResponse.json({ 
      success: true,
      folderId,
      name: name.trim(),
      parentId,
    });

  } catch (error) {
    logger.error('Create folder operation failed', { error });
    
    if (error instanceof Error) {
      if (error.message.includes('insufficient')) {
        return NextResponse.json(
          { error: 'Insufficient permissions to create folders' },
          { status: 403 }
        );
      }
      if (error.message.includes('not found')) {
        return NextResponse.json(
          { error: 'Parent folder not found' },
          { status: 404 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to create folder' },
      { status: 500 }
    );
  }
}