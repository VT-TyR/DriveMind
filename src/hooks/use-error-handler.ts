/**
 * Custom hook for centralized error handling in React components
 */

import { useCallback } from 'react';
import { useToast } from './use-toast';
import { logger } from '@/lib/logger';
import { isAppError, getErrorMessage, getErrorCode } from '@/lib/error-handler';

export interface UseErrorHandlerOptions {
  component?: string;
  userId?: string;
  logErrors?: boolean;
  showToasts?: boolean;
}

export function useErrorHandler(options: UseErrorHandlerOptions = {}) {
  const { toast } = useToast();
  const { 
    component = 'Unknown Component',
    userId,
    logErrors = true,
    showToasts = true
  } = options;

  const handleError = useCallback((
    error: unknown,
    context?: string | Record<string, any>
  ) => {
    const errorMessage = getErrorMessage(error);
    const errorCode = getErrorCode(error);
    
    // Log the error if enabled
    if (logErrors) {
      const logContext = typeof context === 'string' 
        ? { context, component, userId }
        : { ...context, component, userId };
        
      logger.error(`Component error in ${component}`, error as Error, logContext);
    }

    // Show toast notification if enabled
    if (showToasts) {
      const title = isAppError(error) && error.code !== 'GENERIC_ERROR' 
        ? error.code 
        : 'Error';
        
      toast({
        variant: 'destructive',
        title,
        description: errorMessage,
      });
    }

    return {
      message: errorMessage,
      code: errorCode,
      isAppError: isAppError(error)
    };
  }, [toast, component, userId, logErrors, showToasts]);

  const handleAsyncError = useCallback(async <T>(
    asyncFn: () => Promise<T>,
    context?: string | Record<string, any>
  ): Promise<T | null> => {
    try {
      return await asyncFn();
    } catch (error) {
      handleError(error, context);
      return null;
    }
  }, [handleError]);

  const wrapAsync = useCallback(<T extends any[], R>(
    fn: (...args: T) => Promise<R>,
    context?: string | Record<string, any>
  ) => {
    return async (...args: T): Promise<R | null> => {
      try {
        return await fn(...args);
      } catch (error) {
        handleError(error, context);
        return null;
      }
    };
  }, [handleError]);

  return {
    handleError,
    handleAsyncError,
    wrapAsync,
  };
}