/**
 * @fileoverview API Restoration Service - Enables disabled file operation endpoints
 * 
 * CRITICAL ISSUE RESOLVED:
 * - File operation APIs disabled in api-disabled folder
 * - Missing authentication and authorization
 * - No error handling or validation
 * - No rate limiting or security measures
 * 
 * VERSION: 1.0.0-REPAIR
 * PRIORITY: P0-EMERGENCY
 */

import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { z } from 'zod';
import { getAdminAuth } from '@/lib/admin';
import { getAccessTokenForUser } from './token-sync-service';
import { getAdminFirestore } from '@/lib/admin';
import { logger } from '@/lib/logger';
import { rateLimiters } from '@/lib/security/rate-limiter';
import { securityMiddleware, sanitizeInput } from '@/lib/security/middleware';

// Request validation schemas
const MoveFileSchema = z.object({
  fileId: z.string().min(1, 'File ID is required'),
  newParentId: z.string().min(1, 'New parent ID is required'),
  oldParentId: z.string().optional(),
});

const DeleteFileSchema = z.object({
  fileId: z.string().min(1, 'File ID is required'),
  permanent: z.boolean().optional().default(false),
});

const RenameFileSchema = z.object({
  fileId: z.string().min(1, 'File ID is required'),
  newName: z.string().min(1, 'New name is required').max(255, 'Name too long'),
});

const RestoreFileSchema = z.object({
  fileId: z.string().min(1, 'File ID is required'),
});

const CreateFolderSchema = z.object({
  name: z.string().min(1, 'Folder name is required').max(255, 'Name too long'),
  parentId: z.string().optional().default('root'),
});

interface OperationResult {
  success: boolean;
  fileId?: string;
  message?: string;
  error?: string;
  metadata?: any;
}

export class APIRestorationService {
  private db: any;

  constructor() {
    this.db = getAdminFirestore();
  }

  /**
   * RESTORED: Move file to new parent folder
   */
  async moveFile(request: NextRequest): Promise<NextResponse> {
    return rateLimiters.standard(request, async (req) => {
      return securityMiddleware(req, async (req) => {
        try {
          // Authenticate user
          const uid = await this.authenticateRequest(req);
          
          // Validate and sanitize input
          const body = sanitizeInput(await req.json());
          const { fileId, newParentId, oldParentId } = MoveFileSchema.parse(body);
          
          // Get authenticated Drive client
          const drive = await this.getDriveClient(uid);
          
          // Prepare update request
          const updateRequest: any = {
            fileId,
            addParents: newParentId,
          };
          
          if (oldParentId) {
            updateRequest.removeParents = oldParentId;
          } else {
            // Get current parents to remove
            const fileMetadata = await drive.files.get({
              fileId,
              fields: 'parents'
            });
            
            if (fileMetadata.data.parents && fileMetadata.data.parents.length > 0) {
              updateRequest.removeParents = fileMetadata.data.parents.join(',');
            }
          }
          
          // Execute move operation
          const result = await drive.files.update(updateRequest);
          
          // Log operation for audit
          await this.logFileOperation(uid, 'move', {
            fileId,
            newParentId,
            oldParentId,
            timestamp: Date.now()
          });
          
          logger.info('File moved successfully', { uid, fileId, newParentId });
          
          return NextResponse.json({
            success: true,
            fileId,
            message: 'File moved successfully',
            metadata: {
              newParentId,
              oldParentId
            }
          });
          
        } catch (error) {
          return this.handleError(error, 'move file');
        }
      });
    });
  }

  /**
   * RESTORED: Delete file (move to trash or permanent delete)
   */
  async deleteFile(request: NextRequest): Promise<NextResponse> {
    return rateLimiters.standard(request, async (req) => {
      return securityMiddleware(req, async (req) => {
        try {
          // Authenticate user
          const uid = await this.authenticateRequest(req);
          
          // Validate and sanitize input
          const body = sanitizeInput(await req.json());
          const { fileId, permanent } = DeleteFileSchema.parse(body);
          
          // Get authenticated Drive client
          const drive = await this.getDriveClient(uid);
          
          let result: any;
          
          if (permanent) {
            // Permanent deletion
            result = await drive.files.delete({ fileId });
            logger.info('File permanently deleted', { uid, fileId });
          } else {
            // Move to trash
            result = await drive.files.update({
              fileId,
              requestBody: { trashed: true }
            });
            logger.info('File moved to trash', { uid, fileId });
          }
          
          // Log operation for audit
          await this.logFileOperation(uid, permanent ? 'delete_permanent' : 'delete_trash', {
            fileId,
            permanent,
            timestamp: Date.now()
          });
          
          return NextResponse.json({
            success: true,
            fileId,
            message: permanent ? 'File permanently deleted' : 'File moved to trash',
            metadata: { permanent }
          });
          
        } catch (error) {
          return this.handleError(error, 'delete file');
        }
      });
    });
  }

  /**
   * RESTORED: Rename file
   */
  async renameFile(request: NextRequest): Promise<NextResponse> {
    return rateLimiters.standard(request, async (req) => {
      return securityMiddleware(req, async (req) => {
        try {
          // Authenticate user
          const uid = await this.authenticateRequest(req);
          
          // Validate and sanitize input
          const body = sanitizeInput(await req.json());
          const { fileId, newName } = RenameFileSchema.parse(body);
          
          // Get authenticated Drive client
          const drive = await this.getDriveClient(uid);
          
          // Get current file metadata
          const currentFile = await drive.files.get({
            fileId,
            fields: 'name'
          });
          
          const oldName = currentFile.data.name;
          
          // Execute rename operation
          const result = await drive.files.update({
            fileId,
            requestBody: { name: newName }
          });
          
          // Log operation for audit
          await this.logFileOperation(uid, 'rename', {
            fileId,
            oldName,
            newName,
            timestamp: Date.now()
          });
          
          logger.info('File renamed successfully', { uid, fileId, oldName, newName });
          
          return NextResponse.json({
            success: true,
            fileId,
            message: 'File renamed successfully',
            metadata: {
              oldName,
              newName
            }
          });
          
        } catch (error) {
          return this.handleError(error, 'rename file');
        }
      });
    });
  }

  /**
   * RESTORED: Restore file from trash
   */
  async restoreFile(request: NextRequest): Promise<NextResponse> {
    return rateLimiters.standard(request, async (req) => {
      return securityMiddleware(req, async (req) => {
        try {
          // Authenticate user
          const uid = await this.authenticateRequest(req);
          
          // Validate and sanitize input
          const body = sanitizeInput(await req.json());
          const { fileId } = RestoreFileSchema.parse(body);
          
          // Get authenticated Drive client
          const drive = await this.getDriveClient(uid);
          
          // Restore from trash
          const result = await drive.files.update({
            fileId,
            requestBody: { trashed: false }
          });
          
          // Log operation for audit
          await this.logFileOperation(uid, 'restore', {
            fileId,
            timestamp: Date.now()
          });
          
          logger.info('File restored from trash', { uid, fileId });
          
          return NextResponse.json({
            success: true,
            fileId,
            message: 'File restored from trash'
          });
          
        } catch (error) {
          return this.handleError(error, 'restore file');
        }
      });
    });
  }

  /**
   * RESTORED: Create new folder
   */
  async createFolder(request: NextRequest): Promise<NextResponse> {
    return rateLimiters.standard(request, async (req) => {
      return securityMiddleware(req, async (req) => {
        try {
          // Authenticate user
          const uid = await this.authenticateRequest(req);
          
          // Validate and sanitize input
          const body = sanitizeInput(await req.json());
          const { name, parentId } = CreateFolderSchema.parse(body);
          
          // Get authenticated Drive client
          const drive = await this.getDriveClient(uid);
          
          // Create folder
          const result = await drive.files.create({
            requestBody: {
              name,
              mimeType: 'application/vnd.google-apps.folder',
              parents: [parentId]
            },
            fields: 'id, name, parents'
          });
          
          const folderId = result.data.id;
          
          // Log operation for audit
          await this.logFileOperation(uid, 'create_folder', {
            folderId,
            name,
            parentId,
            timestamp: Date.now()
          });
          
          logger.info('Folder created successfully', { uid, folderId, name, parentId });
          
          return NextResponse.json({
            success: true,
            fileId: folderId,
            message: 'Folder created successfully',
            metadata: {
              name,
              parentId,
              mimeType: 'application/vnd.google-apps.folder'
            }
          });
          
        } catch (error) {
          return this.handleError(error, 'create folder');
        }
      });
    });
  }

  /**
   * SECURITY: Authenticate request and return user ID
   */
  private async authenticateRequest(request: NextRequest): Promise<string> {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    
    if (!token) {
      throw new Error('No authorization token provided');
    }

    const auth = getAdminAuth();
    if (!auth) {
      throw new Error('Authentication service unavailable');
    }

    try {
      const decodedToken = await auth.verifyIdToken(token);
      return decodedToken.uid;
    } catch (error) {
      throw new Error('Invalid authentication token');
    }
  }

  /**
   * CORE: Get authenticated Google Drive client
   */
  private async getDriveClient(uid: string) {
    try {
      const accessToken = await getAccessTokenForUser(this.db, uid);
      
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });
      
      return google.drive({ version: 'v3', auth });
    } catch (error) {
      logger.error('Failed to create Drive client', { uid, error });
      throw new Error('Google Drive connection failed. Please re-authorize your account.');
    }
  }

  /**
   * AUDIT: Log file operations for security and compliance
   */
  private async logFileOperation(uid: string, operation: string, details: any): Promise<void> {
    try {
      const logEntry = {
        uid,
        operation,
        details,
        timestamp: Date.now(),
        userAgent: 'backend-api',
        source: 'file-operations'
      };
      
      await this.db.collection('auditLogs').add(logEntry);
    } catch (error) {
      logger.error('Failed to log file operation', { uid, operation, error });
      // Don't throw - logging failure shouldn't break the operation
    }
  }

  /**
   * ERROR: Standardized error handling
   */
  private handleError(error: any, operation: string): NextResponse {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.error(`File operation failed: ${operation}`, { error: errorMessage });
    
    // Handle specific Google API errors
    if (errorMessage.includes('File not found')) {
      return NextResponse.json(
        { error: 'File not found', operation },
        { status: 404 }
      );
    }
    
    if (errorMessage.includes('Insufficient Permission') || errorMessage.includes('unauthorized')) {
      return NextResponse.json(
        { error: 'Insufficient permissions for this operation', operation },
        { status: 403 }
      );
    }
    
    if (errorMessage.includes('Invalid authentication token') || errorMessage.includes('No authorization token')) {
      return NextResponse.json(
        { error: 'Authentication required', operation },
        { status: 401 }
      );
    }
    
    if (errorMessage.includes('Rate limit exceeded')) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.', operation },
        { status: 429 }
      );
    }
    
    // Generic server error
    return NextResponse.json(
      { error: 'Operation failed. Please try again.', operation },
      { status: 500 }
    );
  }

  /**
   * HEALTH: Check if all file operations are available
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; operations: string[]; details: any }> {
    const operations = ['move', 'delete', 'rename', 'restore', 'create_folder'];
    
    try {
      // Test authentication service
      const auth = getAdminAuth();
      if (!auth) {
        throw new Error('Authentication service unavailable');
      }
      
      // Test Firestore connection
      await this.db.collection('health').doc('test').get();
      
      return {
        status: 'healthy',
        operations,
        details: {
          authService: 'available',
          database: 'connected',
          googleAPI: 'configured'
        }
      };
      
    } catch (error) {
      return {
        status: 'unhealthy',
        operations: [],
        details: {
          error: error instanceof Error ? error.message : String(error),
          timestamp: Date.now()
        }
      };
    }
  }
}

/**
 * FACTORY: Create API restoration service
 */
export function createAPIRestorationService(): APIRestorationService {
  return new APIRestorationService();
}

/**
 * EXPORTS: Route handlers for restored APIs
 */
export const restoredFileOperations = {
  moveFile: (request: NextRequest) => createAPIRestorationService().moveFile(request),
  deleteFile: (request: NextRequest) => createAPIRestorationService().deleteFile(request),
  renameFile: (request: NextRequest) => createAPIRestorationService().renameFile(request),
  restoreFile: (request: NextRequest) => createAPIRestorationService().restoreFile(request),
  createFolder: (request: NextRequest) => createAPIRestorationService().createFolder(request),
};