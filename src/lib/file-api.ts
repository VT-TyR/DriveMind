/**
 * Client-side API service for file operations
 */

export interface MoveFileRequest {
  uid: string;
  fileId: string;
  newParentId: string;
  oldParentId?: string;
}

export interface DeleteFileRequest {
  uid: string;
  fileId: string;
}

export interface RenameFileRequest {
  uid: string;
  fileId: string;
  newName: string;
}

export interface CreateFolderRequest {
  uid: string;
  name: string;
  parentId?: string;
}

class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

async function apiCall(endpoint: string, data: any) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(error.error || 'API call failed', response.status);
  }

  return response.json();
}

export async function moveFileApi(request: MoveFileRequest): Promise<void> {
  await apiCall('/api/files/move', request);
}

export async function deleteFileApi(request: DeleteFileRequest): Promise<void> {
  await apiCall('/api/files/delete', request);
}

export async function renameFileApi(request: RenameFileRequest): Promise<void> {
  await apiCall('/api/files/rename', request);
}

export async function restoreFileApi(request: DeleteFileRequest): Promise<void> {
  // Restore is the same as delete but with trashed: false
  await apiCall('/api/files/restore', request);
}

export async function createFolderApi(request: CreateFolderRequest): Promise<string> {
  const result = await apiCall('/api/folders/create', request);
  return result.folderId;
}