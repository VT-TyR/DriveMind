/**
 * Centralized error handling utilities
 */

import { logger, LogContext } from './logger';

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly context?: LogContext;

  constructor(
    message: string,
    code: string = 'GENERIC_ERROR',
    statusCode: number = 500,
    isOperational: boolean = true,
    context?: LogContext
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.context = context;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, field?: string) {
    super(message, 'VALIDATION_ERROR', 400, true, { field });
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTH_ERROR', 401, true);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 'AUTHORIZATION_ERROR', 403, true);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} with id ${id} not found` : `${resource} not found`;
    super(message, 'NOT_FOUND', 404, true, { resource, id });
  }
}

export class GoogleDriveError extends AppError {
  constructor(message: string, originalError?: Error, fileId?: string) {
    super(message, 'GOOGLE_DRIVE_ERROR', 502, true, { 
      fileId, 
      originalError: originalError?.message 
    });
  }
}

export class FirebaseError extends AppError {
  constructor(message: string, originalError?: Error, operation?: string) {
    super(message, 'FIREBASE_ERROR', 502, true, { 
      operation, 
      originalError: originalError?.message 
    });
  }
}

export class RateLimitError extends AppError {
  constructor(resource: string, retryAfter?: number) {
    super(`Rate limit exceeded for ${resource}`, 'RATE_LIMIT', 429, true, { 
      resource, 
      retryAfter 
    });
  }
}

export class AIFlowError extends AppError {
  constructor(message: string, originalError?: Error, flowName?: string) {
    super(message, 'AI_FLOW_ERROR', 502, true, { 
      flowName, 
      originalError: originalError?.message 
    });
  }
}

// Error handling utilities
export function isAppError(error: any): error is AppError {
  return error instanceof AppError;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unknown error occurred';
}

export function getErrorCode(error: unknown): string {
  if (isAppError(error)) {
    return error.code;
  }
  if (error instanceof Error) {
    return error.name;
  }
  return 'UNKNOWN_ERROR';
}

// Async error handler wrapper
export function handleAsyncError<T extends any[], R>(
  fn: (...args: T) => Promise<R>,
  context?: LogContext
) {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args);
    } catch (error) {
      logger.error('Async operation failed', error as Error, context);
      throw error;
    }
  };
}

// Promise error handler
export function handlePromise<T>(
  promise: Promise<T>,
  context?: LogContext
): Promise<[Error | null, T | null]> {
  return promise
    .then<[null, T]>((data: T) => [null, data])
    .catch<[Error, null]>((error: Error) => {
      logger.error('Promise rejected', error, context);
      return [error, null];
    });
}

// Firebase error mapper
export function mapFirebaseError(error: any): AppError {
  const code = error?.code || 'unknown';
  const message = error?.message || 'Firebase operation failed';

  switch (code) {
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return new AuthenticationError('Invalid credentials');
    case 'auth/too-many-requests':
      return new RateLimitError('authentication');
    case 'permission-denied':
      return new AuthorizationError('Insufficient permissions');
    case 'not-found':
      return new NotFoundError('Document');
    default:
      return new FirebaseError(message, error);
  }
}

// Google API error mapper
export function mapGoogleApiError(error: any, fileId?: string): AppError {
  const status = error?.response?.status || error?.status;
  const message = error?.response?.data?.error?.message || error?.message || 'Google API error';

  switch (status) {
    case 401:
      return new AuthenticationError('Google API authentication failed');
    case 403:
      return new AuthorizationError('Insufficient Google Drive permissions');
    case 404:
      return new NotFoundError('File', fileId);
    case 429:
      return new RateLimitError('Google Drive API');
    case 500:
    case 502:
    case 503:
      return new GoogleDriveError('Google Drive service unavailable', error, fileId);
    default:
      return new GoogleDriveError(message, error, fileId);
  }
}

// AI/Genkit error mapper
export function mapAIError(error: any, flowName?: string): AppError {
  const message = error?.message || 'AI service error';
  
  if (message.includes('FAILED_PRECONDITION') && message.includes('API key')) {
    return new AIFlowError('AI service configuration incomplete', error, flowName);
  }
  
  if (message.includes('quota') || message.includes('rate limit')) {
    return new RateLimitError('AI service');
  }
  
  return new AIFlowError(message, error, flowName);
}

// Global error handler for unhandled promises and exceptions
export function setupGlobalErrorHandling() {
  if (typeof window !== 'undefined') {
    // Browser environment
    window.addEventListener('unhandledrejection', (event) => {
      logger.error('Unhandled promise rejection', event.reason);
      event.preventDefault(); // Prevent the default browser behavior
    });

    window.addEventListener('error', (event) => {
      logger.error('Unhandled error', new Error(event.message), {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    });
  } else if (typeof process !== 'undefined') {
    // Node.js environment
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled promise rejection', reason as Error, {
        promise: promise.toString(),
      });
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', error);
      process.exit(1);
    });
  }
}