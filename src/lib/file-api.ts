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

async function apiCall(endpoint: string, data: any, token?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiError(error.error || 'API call failed', response.status);
  }

  return response.json();
}

export async function moveFileApi(request: MoveFileRequest, token?: string): Promise<void> {
  await apiCall('/api/files/move', request, token);
}

export async function deleteFileApi(request: DeleteFileRequest, token?: string): Promise<void> {
  await apiCall('/api/files/delete', request, token);
}

export async function renameFileApi(request: RenameFileRequest, token?: string): Promise<void> {
  await apiCall('/api/files/rename', request, token);
}

export async function restoreFileApi(request: DeleteFileRequest, token?: string): Promise<void> {
  await apiCall('/api/files/restore', request, token);
}

export async function createFolderApi(request: CreateFolderRequest, token?: string): Promise<string> {
  const result = await apiCall('/api/folders/create', request, token);
  return result.folderId;
}