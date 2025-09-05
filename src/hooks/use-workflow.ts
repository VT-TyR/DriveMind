'use client';

import { useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useProgress } from '@/contexts/progress-context';
import { useToast } from '@/hooks/use-toast';

interface WorkflowOptions {
  onProgress?: (progress: number) => void;
  onComplete?: (result: any) => void;
  onError?: (error: string) => void;
}

export function useWorkflow() {
  const { user } = useAuth();
  const { createTask, updateTask, completeTask, errorTask } = useProgress();
  const { toast } = useToast();

  const executeWorkflow = useCallback(async (
    workflowName: string,
    endpoint: string,
    payload: any,
    options: WorkflowOptions = {}
  ): Promise<any> => {
    if (!user) {
      throw new Error('User not authenticated');
    }

    const taskId = createTask(
      workflowName,
      `Starting ${workflowName.toLowerCase()}...`
    );

    try {
      updateTask(taskId, { progress: 10 });
      
      const token = await user.getIdToken();
      
      updateTask(taskId, { 
        progress: 20,
        description: 'Connecting to workflow service...'
      });

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      updateTask(taskId, { progress: 50 });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const errorMessage = errorData?.error || `HTTP ${response.status}`;
        throw new Error(errorMessage);
      }

      updateTask(taskId, { 
        progress: 80,
        description: 'Processing results...'
      });

      const result = await response.json();
      
      updateTask(taskId, { progress: 95 });
      
      completeTask(taskId, {
        filesProcessed: result.totalFiles || result.files?.length || 0,
        duration: result.processingTime || result.scanDuration || 0
      });

      toast({
        title: `${workflowName} Complete`,
        description: `Successfully completed ${workflowName.toLowerCase()}.`,
      });

      options.onComplete?.(result);
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      errorTask(taskId, errorMessage);
      
      toast({
        variant: 'destructive',
        title: `${workflowName} Failed`,
        description: errorMessage,
      });

      options.onError?.(errorMessage);
      throw error;
    }
  }, [user, createTask, updateTask, completeTask, errorTask, toast]);

  const scanDrive = useCallback(async (
    options: {
      maxDepth?: number;
      includeTrashed?: boolean;
      scanSharedDrives?: boolean;
    } = {},
    workflowOptions: WorkflowOptions = {}
  ) => {
    return executeWorkflow(
      'Drive Scan',
      '/api/workflows/scan',
      {
        maxDepth: 10,
        includeTrashed: false,
        scanSharedDrives: false,
        ...options
      },
      workflowOptions
    );
  }, [executeWorkflow]);

  const analyzeInventory = useCallback(async (
    options: {
      scanId?: string;
      reuseRecentScan?: boolean;
    } = {},
    workflowOptions: WorkflowOptions = {}
  ) => {
    return executeWorkflow(
      'Inventory Analysis',
      '/api/workflows/inventory',
      {
        reuseRecentScan: true,
        ...options
      },
      workflowOptions
    );
  }, [executeWorkflow]);

  const detectDuplicates = useCallback(async (
    options: {
      scanId?: string;
      algorithms?: string[];
      confidenceThreshold?: number;
      maxGroups?: number;
    } = {},
    workflowOptions: WorkflowOptions = {}
  ) => {
    return executeWorkflow(
      'Duplicate Detection',
      '/api/workflows/duplicates',
      {
        algorithms: ['content_hash', 'fuzzy_match', 'version_detect'],
        confidenceThreshold: 0.8,
        maxGroups: 50,
        ...options
      },
      workflowOptions
    );
  }, [executeWorkflow]);

  const organizeFiles = useCallback(async (
    options: {
      scanId?: string;
      analysisDepth?: 'shallow' | 'medium' | 'deep';
      autoExecuteRules?: boolean;
      maxFilesToAnalyze?: number;
    } = {},
    workflowOptions: WorkflowOptions = {}
  ) => {
    return executeWorkflow(
      'File Organization',
      '/api/workflows/organize',
      {
        analysisDepth: 'medium',
        autoExecuteRules: false,
        maxFilesToAnalyze: 1000,
        ...options
      },
      workflowOptions
    );
  }, [executeWorkflow]);

  const executeBatchOperations = useCallback(async (
    options: {
      operations: any[];
      batchName?: string;
      safetyLevel?: 'normal' | 'aggressive' | 'conservative';
      concurrency?: number;
      executionMode?: 'immediate' | 'scheduled' | 'preview';
      continueOnError?: boolean;
      createBackup?: boolean;
    },
    workflowOptions: WorkflowOptions = {}
  ) => {
    return executeWorkflow(
      'Batch Operations',
      '/api/workflows/batch',
      {
        batchName: 'Scheduled Batch',
        safetyLevel: 'normal',
        concurrency: 5,
        executionMode: 'preview',
        continueOnError: true,
        createBackup: true,
        ...options
      },
      workflowOptions
    );
  }, [executeWorkflow]);

  return {
    scanDrive,
    analyzeInventory,
    detectDuplicates,
    organizeFiles,
    executeBatchOperations,
  };
}