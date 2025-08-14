'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { useAuth } from './auth-context';
import { FileOperation } from '@/lib/file-operations';
import {
  moveFileApi,
  deleteFileApi,
  renameFileApi,
  createFolderApi,
} from '@/lib/file-api';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { isAppError, getErrorMessage, AuthenticationError } from '@/lib/error-handler';

interface FileOperationsContextType {
  operations: FileOperation[];
  isProcessing: boolean;
  
  // Single operations
  moveFileOperation: (fileId: string, fileName: string, newParentId: string) => Promise<void>;
  deleteFileOperation: (fileId: string, fileName: string) => Promise<void>;
  restoreFileOperation: (fileId: string, fileName: string) => Promise<void>;
  renameFileOperation: (fileId: string, fileName: string, newName: string) => Promise<void>;
  createFolderOperation: (name: string, parentId?: string) => Promise<string>;
  
  // Batch operations
  addToBatch: (type: 'move' | 'delete' | 'rename', fileId: string, fileName: string, details?: any) => void;
  executeBatch: () => Promise<void>;
  clearBatch: () => void;
  getBatchSize: () => number;
}

const FileOperationsContext = createContext<FileOperationsContextType | null>(null);

export function useFileOperations() {
  const context = useContext(FileOperationsContext);
  if (!context) {
    throw new Error('useFileOperations must be used within a FileOperationsProvider');
  }
  return context;
}

interface FileOperationsProviderProps {
  children: React.ReactNode;
}

export function FileOperationsProvider({ children }: FileOperationsProviderProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [operations, setOperations] = useState<FileOperation[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleError = (error: unknown, operation: string, context?: any) => {
    logger.error(`File operation failed: ${operation}`, error as Error, {
      userId: user?.uid,
      operation,
      component: 'FileOperationsContext',
      ...context
    });
    
    const message = getErrorMessage(error);
    const title = isAppError(error) ? error.code : `${operation} failed`;
    
    toast({
      variant: 'destructive',
      title,
      description: message,
    });
  };

  const handleSuccess = (message: string) => {
    toast({
      title: 'Success',
      description: message,
    });
  };

  const moveFileOperation = useCallback(async (fileId: string, fileName: string, newParentId: string) => {
    if (!user) throw new Error('User not authenticated');
    
    setIsProcessing(true);
    try {
      await moveFileApi({ uid: user.uid, fileId, newParentId });
      handleSuccess(`"${fileName}" moved successfully`);
    } catch (error) {
      handleError(error, 'Move file');
      throw error;
    } finally {
      setIsProcessing(false);
    }
  }, [user, toast]);

  const deleteFileOperation = useCallback(async (fileId: string, fileName: string) => {
    if (!user) throw new Error('User not authenticated');
    
    setIsProcessing(true);
    try {
      await deleteFileApi({ uid: user.uid, fileId });
      handleSuccess(`"${fileName}" moved to trash`);
    } catch (error) {
      handleError(error, 'Delete file');
      throw error;
    } finally {
      setIsProcessing(false);
    }
  }, [user, toast]);

  const restoreFileOperation = useCallback(async (fileId: string, fileName: string) => {
    if (!user) throw new Error('User not authenticated');
    
    setIsProcessing(true);
    try {
      // For now, we'll implement restore as a placeholder
      // In a real implementation, we'd need a restore API endpoint
      handleSuccess(`"${fileName}" restore functionality coming soon`);
    } catch (error) {
      handleError(error, 'Restore file');
      throw error;
    } finally {
      setIsProcessing(false);
    }
  }, [user, toast]);

  const renameFileOperation = useCallback(async (fileId: string, fileName: string, newName: string) => {
    if (!user) throw new Error('User not authenticated');
    
    setIsProcessing(true);
    try {
      await renameFileApi({ uid: user.uid, fileId, newName });
      handleSuccess(`File renamed from "${fileName}" to "${newName}"`);
    } catch (error) {
      handleError(error, 'Rename file');
      throw error;
    } finally {
      setIsProcessing(false);
    }
  }, [user, toast]);

  const createFolderOperation = useCallback(async (name: string, parentId?: string) => {
    if (!user) throw new Error('User not authenticated');
    
    setIsProcessing(true);
    try {
      const folderId = await createFolderApi({ uid: user.uid, name, parentId });
      handleSuccess(`Folder "${name}" created successfully`);
      return folderId;
    } catch (error) {
      handleError(error, 'Create folder');
      throw error;
    } finally {
      setIsProcessing(false);
    }
  }, [user, toast]);


  const addToBatch = useCallback((type: 'move' | 'delete' | 'rename', fileId: string, fileName: string, details?: any) => {
    if (!user) return;

    const operation: FileOperation = {
      id: `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      fileId,
      fileName,
      details,
      status: 'pending',
      timestamp: new Date()
    };
    
    setOperations(prev => [...prev, operation]);
    
    toast({
      title: 'Added to batch',
      description: `"${fileName}" added to batch operations (${operations.length + 1} total)`,
    });
  }, [user, operations.length, toast]);

  const executeBatch = useCallback(async () => {
    if (!user || operations.length === 0) return;
    
    setIsProcessing(true);
    const updatedOperations = [...operations];
    
    try {
      let successful = 0;
      let failed = 0;

      for (let i = 0; i < updatedOperations.length; i++) {
        const operation = updatedOperations[i];
        updatedOperations[i] = { ...operation, status: 'in_progress' as const };
        setOperations([...updatedOperations]);

        try {
          switch (operation.type) {
            case 'move':
              await moveFileApi({
                uid: user.uid,
                fileId: operation.fileId,
                newParentId: operation.details?.newParentId || 'root'
              });
              break;
            case 'delete':
              await deleteFileApi({ uid: user.uid, fileId: operation.fileId });
              break;
            case 'rename':
              await renameFileApi({
                uid: user.uid,
                fileId: operation.fileId,
                newName: operation.details?.newName || `${operation.fileName}_renamed`
              });
              break;
          }
          
          updatedOperations[i] = { ...operation, status: 'completed' as const };
          successful++;
        } catch (error) {
          updatedOperations[i] = { 
            ...operation, 
            status: 'failed' as const,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
          failed++;
        }
        
        setOperations([...updatedOperations]);
      }
      
      if (failed > 0) {
        toast({
          variant: 'destructive',
          title: 'Batch operation completed with errors',
          description: `${successful} operations completed, ${failed} failed`,
        });
      } else {
        handleSuccess(`Batch operation completed successfully (${successful} operations)`);
      }
      
      // Clear batch after execution
      setTimeout(() => {
        setOperations([]);
      }, 3000);
      
    } catch (error) {
      handleError(error, 'Batch execution');
    } finally {
      setIsProcessing(false);
    }
  }, [user, operations, toast]);

  const clearBatch = useCallback(() => {
    setOperations([]);
    toast({
      title: 'Batch cleared',
      description: 'All pending operations removed',
    });
  }, [toast]);

  const getBatchSize = useCallback(() => {
    return operations.length;
  }, [operations]);

  // Clear operations when user changes
  React.useEffect(() => {
    if (user) {
      // Clear any pending operations when user changes
      setOperations([]);
    }
  }, [user]);

  const value = {
    operations,
    isProcessing,
    moveFileOperation,
    deleteFileOperation,
    restoreFileOperation,
    renameFileOperation,
    createFolderOperation,
    addToBatch,
    executeBatch,
    clearBatch,
    getBatchSize,
  };

  return (
    <FileOperationsContext.Provider value={value}>
      {children}
    </FileOperationsContext.Provider>
  );
}