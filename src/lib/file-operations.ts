/**
 * File operations for Google Drive integration
 */
import { driveFor } from './google-drive';
import { logger, withTiming } from './logger';
import { mapGoogleApiError, GoogleDriveError } from './error-handler';

export interface FileOperation {
  id: string;
  type: 'move' | 'delete' | 'restore' | 'rename';
  fileId: string;
  fileName: string;
  details?: {
    newParentId?: string;
    newName?: string;
    oldParentId?: string;
  };
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  error?: string;
  timestamp: Date;
}

export interface MoveFileOptions {
  fileId: string;
  newParentId: string;
  oldParentId?: string;
}

export interface RenameFileOptions {
  fileId: string;
  newName: string;
}

/**
 * Move a file to a different folder
 */
export async function moveFile(uid: string, options: MoveFileOptions): Promise<void> {
  return withTiming('moveFile', async () => {
    const drive = await driveFor(uid);
    
    try {
      logger.fileOperation('move', options.fileId, undefined, { 
        userId: uid, 
        newParentId: options.newParentId 
      });

      // Get current parents
      const file = await drive.files.get({
        fileId: options.fileId,
        fields: 'parents'
      });

      const previousParents = file.data.parents?.join(',') || '';
      
      // Move the file
      await drive.files.update({
        fileId: options.fileId,
        addParents: options.newParentId,
        removeParents: previousParents,
      });
      
      logger.info('File moved successfully', {
        userId: uid,
        fileId: options.fileId,
        newParentId: options.newParentId,
        operation: 'move'
      });
    } catch (error) {
      logger.fileOperationError('move', options.fileId, error as Error, undefined, {
        userId: uid,
        newParentId: options.newParentId
      });
      throw mapGoogleApiError(error, options.fileId);
    }
  }, { userId: uid, operation: 'moveFile' });
}

/**
 * Delete a file (move to trash)
 */
export async function deleteFile(uid: string, fileId: string): Promise<void> {
  return withTiming('deleteFile', async () => {
    const drive = await driveFor(uid);
    
    try {
      logger.fileOperation('delete', fileId, undefined, { userId: uid });

      await drive.files.update({
        fileId,
        requestBody: {
          trashed: true
        }
      });
      
      logger.info('File moved to trash successfully', {
        userId: uid,
        fileId,
        operation: 'delete'
      });
    } catch (error) {
      logger.fileOperationError('delete', fileId, error as Error, undefined, {
        userId: uid
      });
      throw mapGoogleApiError(error, fileId);
    }
  }, { userId: uid, operation: 'deleteFile' });
}

/**
 * Permanently delete a file
 */
export async function permanentlyDeleteFile(uid: string, fileId: string): Promise<void> {
  return withTiming('permanentlyDeleteFile', async () => {
    const drive = await driveFor(uid);
    
    try {
      logger.fileOperation('permanent_delete', fileId, undefined, { userId: uid });

      await drive.files.delete({
        fileId
      });
      
      logger.info('File permanently deleted successfully', {
        userId: uid,
        fileId,
        operation: 'permanent_delete'
      });
    } catch (error) {
      logger.fileOperationError('permanent_delete', fileId, error as Error, undefined, {
        userId: uid
      });
      throw mapGoogleApiError(error, fileId);
    }
  }, { userId: uid, operation: 'permanentlyDeleteFile' });
}

/**
 * Restore a file from trash
 */
export async function restoreFile(uid: string, fileId: string): Promise<void> {
  return withTiming('restoreFile', async () => {
    const drive = await driveFor(uid);
    
    try {
      logger.fileOperation('restore', fileId, undefined, { userId: uid });

      await drive.files.update({
        fileId,
        requestBody: {
          trashed: false
        }
      });
      
      logger.info('File restored from trash successfully', {
        userId: uid,
        fileId,
        operation: 'restore'
      });
    } catch (error) {
      logger.fileOperationError('restore', fileId, error as Error, undefined, {
        userId: uid
      });
      throw mapGoogleApiError(error, fileId);
    }
  }, { userId: uid, operation: 'restoreFile' });
}

/**
 * Rename a file
 */
export async function renameFile(uid: string, options: RenameFileOptions): Promise<void> {
  return withTiming('renameFile', async () => {
    const drive = await driveFor(uid);
    
    try {
      logger.fileOperation('rename', options.fileId, undefined, { 
        userId: uid, 
        newName: options.newName 
      });

      await drive.files.update({
        fileId: options.fileId,
        requestBody: {
          name: options.newName
        }
      });
      
      logger.info('File renamed successfully', {
        userId: uid,
        fileId: options.fileId,
        newName: options.newName,
        operation: 'rename'
      });
    } catch (error) {
      logger.fileOperationError('rename', options.fileId, error as Error, undefined, {
        userId: uid,
        newName: options.newName
      });
      throw mapGoogleApiError(error, options.fileId);
    }
  }, { userId: uid, operation: 'renameFile' });
}

/**
 * Create a new folder
 */
export async function createFolder(uid: string, name: string, parentId?: string): Promise<string> {
  return withTiming('createFolder', async () => {
    const drive = await driveFor(uid);
    
    try {
      logger.fileOperation('create_folder', name, name, { 
        userId: uid, 
        parentId 
      });

      const fileMetadata: any = {
        name,
        mimeType: 'application/vnd.google-apps.folder'
      };
      
      if (parentId) {
        fileMetadata.parents = [parentId];
      }
      
      const response = await drive.files.create({
        requestBody: fileMetadata,
        fields: 'id'
      });
      
      const folderId = response.data.id!;
      
      logger.info('Folder created successfully', {
        userId: uid,
        fileId: folderId,
        fileName: name,
        parentId,
        operation: 'create_folder'
      });
      
      return folderId;
    } catch (error) {
      logger.fileOperationError('create_folder', name, error as Error, name, {
        userId: uid,
        parentId
      });
      throw mapGoogleApiError(error, name);
    }
  }, { userId: uid, operation: 'createFolder' });
}

/**
 * Get folder contents
 */
export async function getFolderContents(uid: string, folderId: string): Promise<any[]> {
  return withTiming('getFolderContents', async () => {
    const drive = await driveFor(uid);
    
    try {
      logger.fileOperation('list_folder', folderId, undefined, { 
        userId: uid 
      });

      const response = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'files(id, name, mimeType, size, modifiedTime)',
        orderBy: 'name'
      });
      
      const files = response.data.files || [];
      
      logger.info('Folder contents retrieved successfully', {
        userId: uid,
        fileId: folderId,
        fileCount: files.length,
        operation: 'list_folder'
      });
      
      return files;
    } catch (error) {
      logger.fileOperationError('list_folder', folderId, error as Error, undefined, {
        userId: uid
      });
      throw mapGoogleApiError(error, folderId);
    }
  }, { userId: uid, operation: 'getFolderContents' });
}

/**
 * Batch operation handler
 */
export class BatchFileOperations {
  private operations: FileOperation[] = [];
  private uid: string;

  constructor(uid: string) {
    this.uid = uid;
  }

  addMoveOperation(fileId: string, fileName: string, newParentId: string, oldParentId?: string): string {
    const operation: FileOperation = {
      id: `move_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'move',
      fileId,
      fileName,
      details: { newParentId, oldParentId },
      status: 'pending',
      timestamp: new Date()
    };
    
    this.operations.push(operation);
    return operation.id;
  }

  addDeleteOperation(fileId: string, fileName: string): string {
    const operation: FileOperation = {
      id: `delete_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'delete',
      fileId,
      fileName,
      status: 'pending',
      timestamp: new Date()
    };
    
    this.operations.push(operation);
    return operation.id;
  }

  addRenameOperation(fileId: string, fileName: string, newName: string): string {
    const operation: FileOperation = {
      id: `rename_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'rename',
      fileId,
      fileName,
      details: { newName },
      status: 'pending',
      timestamp: new Date()
    };
    
    this.operations.push(operation);
    return operation.id;
  }

  getOperations(): FileOperation[] {
    return [...this.operations];
  }

  async executeAll(): Promise<FileOperation[]> {
    const results: FileOperation[] = [];
    
    for (const operation of this.operations) {
      const updatedOperation = { ...operation };
      updatedOperation.status = 'in_progress';
      
      try {
        switch (operation.type) {
          case 'move':
            if (operation.details?.newParentId) {
              await moveFile(this.uid, {
                fileId: operation.fileId,
                newParentId: operation.details.newParentId,
                oldParentId: operation.details.oldParentId
              });
            }
            break;
            
          case 'delete':
            await deleteFile(this.uid, operation.fileId);
            break;
            
          case 'rename':
            if (operation.details?.newName) {
              await renameFile(this.uid, {
                fileId: operation.fileId,
                newName: operation.details.newName
              });
            }
            break;
            
          case 'restore':
            await restoreFile(this.uid, operation.fileId);
            break;
        }
        
        updatedOperation.status = 'completed';
      } catch (error) {
        updatedOperation.status = 'failed';
        updatedOperation.error = error instanceof Error ? error.message : String(error);
      }
      
      results.push(updatedOperation);
    }
    
    return results;
  }

  clear(): void {
    this.operations = [];
  }
}