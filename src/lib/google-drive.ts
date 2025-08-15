
/**
 * Google Drive API integration using Firebase Auth tokens.
 * Access tokens are automatically handled by Firebase Auth.
 */
import { google } from 'googleapis';
import { getDriveClient } from '@/lib/drive-auth';
import { File } from '@/lib/types';

/** Create an authenticated Drive client using Firebase Auth token. */
export async function driveFor(uid: string) {
  // Use Firebase Auth stored token
  return getDriveClient(uid);
}

/** Get file type based on MIME type */
function getFileType(mimeType: string): File['type'] {
  if (mimeType === 'application/vnd.google-apps.folder') return 'Folder';
  if (mimeType === 'application/vnd.google-apps.document') return 'Document';
  if (mimeType === 'application/vnd.google-apps.spreadsheet') return 'Spreadsheet';
  if (mimeType === 'application/vnd.google-apps.presentation') return 'Presentation';
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.startsWith('image/')) return 'Image';
  if (mimeType.startsWith('video/')) return 'Video';
  return 'Other';
}

/** List files from Google Drive with pagination */
export async function listFiles(
  uid: string,
  pageToken?: string,
  pageSize: number = 100,
  query?: string
): Promise<{
  files: File[];
  nextPageToken?: string;
  totalCount?: number;
}> {
  const drive = await driveFor(uid);
  
  const response = await drive.files.list({
    pageSize,
    pageToken,
    q: query || 'trashed = false',
    fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, parents, shared)',
    orderBy: 'modifiedTime desc',
  });

  const files: File[] = (response.data.files || []).map(file => ({
    id: file.id!,
    name: file.name!,
    type: getFileType(file.mimeType || ''),
    size: parseInt(file.size || '0'),
    lastModified: new Date(file.modifiedTime!),
    isDuplicate: false, // Will be computed later
    path: [], // Will be resolved later
    vaultScore: null,
  }));

  return {
    files,
    nextPageToken: response.data.nextPageToken || undefined,
  };
}

/** Get file metadata by ID */
export async function getFileMetadata(uid: string, fileId: string): Promise<File | null> {
  try {
    const drive = await driveFor(uid);
    const response = await drive.files.get({
      fileId,
      fields: 'id, name, mimeType, size, modifiedTime, parents, shared',
    });

    const file = response.data;
    return {
      id: file.id!,
      name: file.name!,
      type: getFileType(file.mimeType || ''),
      size: parseInt(file.size || '0'),
      lastModified: new Date(file.modifiedTime!),
      isDuplicate: false,
      path: [], // Will be resolved later
      vaultScore: null,
    };
  } catch (error) {
    console.error(`Error fetching file ${fileId}:`, error);
    return null;
  }
}

/** Get folder path for a file */
export async function getFilePath(uid: string, fileId: string): Promise<string[]> {
  const drive = await driveFor(uid);
  const path: string[] = [];
  
  try {
    const response = await drive.files.get({
      fileId,
      fields: 'parents',
    });

    const parents = response.data.parents;
    if (parents && parents.length > 0) {
      // Recursively build path
      const parentPath = await buildPath(drive, parents[0]);
      path.push(...parentPath);
    }
  } catch (error) {
    console.error(`Error getting path for file ${fileId}:`, error);
  }

  return path;
}

/** Recursively build folder path */
async function buildPath(drive: any, folderId: string): Promise<string[]> {
  if (folderId === 'root') {
    return ['My Drive'];
  }

  try {
    const response = await drive.files.get({
      fileId: folderId,
      fields: 'name, parents',
    });

    const folder = response.data;
    const path = [folder.name];

    if (folder.parents && folder.parents.length > 0) {
      const parentPath = await buildPath(drive, folder.parents[0]);
      return [...parentPath, ...path];
    }

    return ['My Drive', ...path];
  } catch (error) {
    console.error(`Error getting folder ${folderId}:`, error);
    return [];
  }
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
