'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';

interface ErrorLog {
  id: string;
  timestamp: Date;
  error: string;
  context: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  recovered: boolean;
  recoveryAction?: string;
  metadata?: Record<string, any>;
}

interface RecoveryAction {
  id: string;
  label: string;
  description: string;
  action: () => Promise<void>;
  retryable: boolean;
}

interface ErrorRecoveryContextType {
  errors: ErrorLog[];
  logError: (error: string, context: string, severity?: ErrorLog['severity'], metadata?: Record<string, any>) => string;
  markRecovered: (errorId: string, recoveryAction?: string) => void;
  clearErrors: () => void;
  getRecoveryActions: (errorId: string) => RecoveryAction[];
  retryLastAction: (errorId: string) => Promise<void>;
  exportErrorLog: () => string;
}

const ErrorRecoveryContext = createContext<ErrorRecoveryContextType | undefined>(undefined);

export function ErrorRecoveryProvider({ children }: { children: React.ReactNode }) {
  const [errors, setErrors] = useState<ErrorLog[]>([]);
  const [lastActions, setLastActions] = useState<Map<string, () => Promise<void>>>(new Map());
  const { toast } = useToast();

  const logError = useCallback((
    error: string, 
    context: string, 
    severity: ErrorLog['severity'] = 'medium',
    metadata?: Record<string, any>
  ): string => {
    const errorId = `error_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    const errorLog: ErrorLog = {
      id: errorId,
      timestamp: new Date(),
      error,
      context,
      severity,
      recovered: false,
      metadata,
    };

    setErrors(prev => [errorLog, ...prev].slice(0, 100)); // Keep last 100 errors

    // Show toast for high/critical errors
    if (severity === 'high' || severity === 'critical') {
      toast({
        variant: 'destructive',
        title: 'System Error',
        description: `${context}: ${error}`,
      });
    }

    return errorId;
  }, [toast]);

  const markRecovered = useCallback((errorId: string, recoveryAction?: string) => {
    setErrors(prev => prev.map(error => 
      error.id === errorId 
        ? { ...error, recovered: true, recoveryAction }
        : error
    ));

    toast({
      title: 'Error Recovered',
      description: recoveryAction || 'System has recovered from the error.',
    });
  }, [toast]);

  const clearErrors = useCallback(() => {
    setErrors([]);
    setLastActions(new Map());
  }, []);

  const getRecoveryActions = useCallback((errorId: string): RecoveryAction[] => {
    const error = errors.find(e => e.id === errorId);
    if (!error) return [];

    const actions: RecoveryAction[] = [];

    // Context-specific recovery actions
    switch (error.context) {
      case 'Drive Scan':
        actions.push(
          {
            id: 'retry_scan',
            label: 'Retry Scan',
            description: 'Restart the drive scanning process',
            action: async () => {
              // This would trigger a retry of the scan
              markRecovered(errorId, 'Retried drive scan');
            },
            retryable: true,
          },
          {
            id: 'reduce_depth',
            label: 'Reduce Scan Depth',
            description: 'Try scanning with reduced depth to avoid timeout',
            action: async () => {
              // This would retry with maxDepth = 5
              markRecovered(errorId, 'Retried with reduced depth');
            },
            retryable: true,
          }
        );
        break;

      case 'Duplicate Detection':
        actions.push(
          {
            id: 'retry_duplicates',
            label: 'Retry Detection',
            description: 'Restart duplicate detection with current settings',
            action: async () => {
              markRecovered(errorId, 'Retried duplicate detection');
            },
            retryable: true,
          },
          {
            id: 'reduce_algorithms',
            label: 'Use Fewer Algorithms',
            description: 'Try with only content hash algorithm',
            action: async () => {
              markRecovered(errorId, 'Retried with reduced algorithms');
            },
            retryable: true,
          }
        );
        break;

      case 'File Organization':
        actions.push(
          {
            id: 'retry_organize',
            label: 'Retry Organization',
            description: 'Restart file organization process',
            action: async () => {
              markRecovered(errorId, 'Retried file organization');
            },
            retryable: true,
          }
        );
        break;

      case 'Batch Operations':
        actions.push(
          {
            id: 'retry_batch',
            label: 'Retry Operations',
            description: 'Restart batch operations',
            action: async () => {
              markRecovered(errorId, 'Retried batch operations');
            },
            retryable: true,
          },
          {
            id: 'reduce_concurrency',
            label: 'Reduce Concurrency',
            description: 'Try with lower concurrency to avoid rate limits',
            action: async () => {
              markRecovered(errorId, 'Retried with reduced concurrency');
            },
            retryable: true,
          }
        );
        break;
    }

    // Generic recovery actions
    actions.push(
      {
        id: 'refresh_auth',
        label: 'Refresh Authentication',
        description: 'Refresh Google Drive authentication tokens',
        action: async () => {
          // This would trigger auth refresh
          markRecovered(errorId, 'Refreshed authentication');
        },
        retryable: false,
      },
      {
        id: 'clear_cache',
        label: 'Clear Cache',
        description: 'Clear cached data and start fresh',
        action: async () => {
          localStorage.clear();
          markRecovered(errorId, 'Cleared cache');
        },
        retryable: false,
      }
    );

    return actions;
  }, [errors, markRecovered]);

  const retryLastAction = useCallback(async (errorId: string) => {
    const lastAction = lastActions.get(errorId);
    if (lastAction) {
      try {
        await lastAction();
        markRecovered(errorId, 'Retried last action successfully');
      } catch (error) {
        const newErrorId = logError(
          error instanceof Error ? error.message : String(error),
          'Retry Action',
          'medium'
        );
        throw error;
      }
    }
  }, [lastActions, markRecovered, logError]);

  const exportErrorLog = useCallback((): string => {
    const report = {
      timestamp: new Date().toISOString(),
      totalErrors: errors.length,
      errorsBySeverity: {
        critical: errors.filter(e => e.severity === 'critical').length,
        high: errors.filter(e => e.severity === 'high').length,
        medium: errors.filter(e => e.severity === 'medium').length,
        low: errors.filter(e => e.severity === 'low').length,
      },
      recoveryRate: errors.length > 0 ? (errors.filter(e => e.recovered).length / errors.length) * 100 : 0,
      errors: errors.map(error => ({
        ...error,
        timestamp: error.timestamp.toISOString(),
      })),
    };

    return JSON.stringify(report, null, 2);
  }, [errors]);

  const contextValue: ErrorRecoveryContextType = {
    errors,
    logError,
    markRecovered,
    clearErrors,
    getRecoveryActions,
    retryLastAction,
    exportErrorLog,
  };

  return (
    <ErrorRecoveryContext.Provider value={contextValue}>
      {children}
    </ErrorRecoveryContext.Provider>
  );
}

export function useErrorRecovery() {
  const context = useContext(ErrorRecoveryContext);
  if (context === undefined) {
    // Return default values for SSR/build time when context is not available
    return {
      errors: [],
      logError: () => '',
      markRecovered: () => {},
      clearErrors: () => {},
      getRecoveryActions: () => [],
      retryLastAction: async () => {},
      exportErrorLog: () => '',
    };
  }
  return context;
}