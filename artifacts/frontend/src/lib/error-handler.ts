/**
 * Comprehensive error handling system with structured logging
 * Implements ALPHA-CODENAME v1.4 error management standards
 */

// Error types
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly timestamp: string;
  public readonly context?: Record<string, any>;

  constructor(
    message: string,
    code: string = 'UNKNOWN_ERROR',
    statusCode: number = 500,
    isOperational: boolean = true,
    context?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    this.context = context;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      timestamp: this.timestamp,
      context: this.context,
      stack: this.stack,
    };
  }
}

export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'VALIDATION_ERROR', 400, true, context);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'AUTHENTICATION_ERROR', 401, true, context);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'AUTHORIZATION_ERROR', 403, true, context);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'NOT_FOUND_ERROR', 404, true, context);
  }
}

export class RateLimitError extends AppError {
  public readonly retryAfter: number;

  constructor(message: string, retryAfter: number = 60, context?: Record<string, any>) {
    super(message, 'RATE_LIMIT_ERROR', 429, true, { ...context, retryAfter });
    this.retryAfter = retryAfter;
  }
}

export class ServiceError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'SERVICE_ERROR', 503, true, context);
  }
}

export class NetworkError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'NETWORK_ERROR', 0, true, context);
  }
}

// Firebase error mapping
export function mapFirebaseError(error: any): AppError {
  const errorCode = error?.code || 'unknown';
  const errorMessage = error?.message || 'An unknown error occurred';
  
  const context = {
    originalCode: errorCode,
    originalMessage: errorMessage,
    firebaseError: true,
  };

  switch (errorCode) {
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-email':
      return new AuthenticationError('Invalid credentials', context);
    
    case 'auth/user-disabled':
      return new AuthenticationError('Account has been disabled', context);
    
    case 'auth/too-many-requests':
      return new RateLimitError('Too many authentication attempts. Please try again later.', 300, context);
    
    case 'auth/network-request-failed':
      return new NetworkError('Network connection failed. Please check your internet connection.', context);
    
    case 'permission-denied':
      return new AuthorizationError('Permission denied. Check your access rights.', context);
    
    case 'not-found':
      return new NotFoundError('Resource not found', context);
    
    case 'unavailable':
      return new ServiceError('Service temporarily unavailable', context);
    
    case 'deadline-exceeded':
    case 'cancelled':
      return new ServiceError('Request timeout', context);
    
    case 'resource-exhausted':
      return new RateLimitError('Resource quota exceeded', 60, context);
    
    case 'invalid-argument':
    case 'failed-precondition':
      return new ValidationError('Invalid request parameters', context);
    
    default:
      return new AppError(
        `Firebase error: ${errorMessage}`,
        'FIREBASE_ERROR',
        500,
        true,
        context
      );
  }
}

// Error reporting service
export interface ErrorReportService {
  report(error: AppError, context?: Record<string, any>): Promise<void>;
}

class ConsoleErrorReporter implements ErrorReportService {
  async report(error: AppError, context?: Record<string, any>): Promise<void> {
    const errorReport = {
      ...error.toJSON(),
      additionalContext: context,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'server',
      url: typeof window !== 'undefined' ? window.location.href : 'unknown',
      timestamp: new Date().toISOString(),
    };

    if (error.statusCode >= 500 || !error.isOperational) {
      console.error('Critical Error:', errorReport);
    } else {
      console.warn('Operational Error:', errorReport);
    }
  }
}

// Global error handler
class ErrorHandler {
  private reporters: ErrorReportService[] = [];
  private errorCounts = new Map<string, number>();
  private readonly maxErrorsPerType = 10;

  constructor() {
    // Add default console reporter
    this.addReporter(new ConsoleErrorReporter());
    
    // Set up global error handling
    this.setupGlobalHandlers();
  }

  addReporter(reporter: ErrorReportService): void {
    this.reporters.push(reporter);
  }

  async handleError(error: Error | AppError, context?: Record<string, any>): Promise<AppError> {
    // Convert regular errors to AppErrors
    const appError = error instanceof AppError 
      ? error 
      : new AppError(error.message, 'UNKNOWN_ERROR', 500, false, { stack: error.stack });

    // Prevent error spam
    const errorKey = `${appError.code}:${appError.message}`;
    const currentCount = this.errorCounts.get(errorKey) || 0;
    
    if (currentCount < this.maxErrorsPerType) {
      this.errorCounts.set(errorKey, currentCount + 1);
      
      // Report to all configured reporters
      await Promise.allSettled(
        this.reporters.map(reporter => 
          reporter.report(appError, context).catch(reportError => {
            console.error('Error reporter failed:', reportError);
          })
        )
      );
    }

    return appError;
  }

  private setupGlobalHandlers(): void {
    // Handle unhandled promise rejections
    if (typeof window !== 'undefined') {
      window.addEventListener('unhandledrejection', (event) => {
        const error = event.reason instanceof Error 
          ? event.reason 
          : new Error(String(event.reason));
        
        this.handleError(error, {
          type: 'unhandledrejection',
          url: window.location.href,
        }).catch(console.error);
      });

      // Handle uncaught errors
      window.addEventListener('error', (event) => {
        const error = event.error instanceof Error 
          ? event.error 
          : new Error(event.message);
        
        this.handleError(error, {
          type: 'uncaughterror',
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          url: window.location.href,
        }).catch(console.error);
      });
    } else if (typeof process !== 'undefined') {
      // Node.js environment
      process.on('unhandledRejection', (reason, promise) => {
        const error = reason instanceof Error 
          ? reason 
          : new Error(String(reason));
        
        this.handleError(error, {
          type: 'unhandledrejection',
          promise: promise.toString(),
        }).catch(console.error);
      });

      process.on('uncaughtException', (error) => {
        this.handleError(error, {
          type: 'uncaughtexception',
        }).then(() => {
          // Exit process on uncaught exceptions in production
          if (process.env.NODE_ENV === 'production') {
            process.exit(1);
          }
        }).catch(console.error);
      });
    }
  }

  // Get error statistics
  getErrorStats(): Record<string, number> {
    return Object.fromEntries(this.errorCounts);
  }

  // Clear error counts (useful for testing)
  clearErrorStats(): void {
    this.errorCounts.clear();
  }
}

// Create global error handler instance
const globalErrorHandler = new ErrorHandler();

export default globalErrorHandler;

// Utility functions for error handling
export async function handleAsyncError<T>(
  asyncFn: () => Promise<T>,
  context?: Record<string, any>
): Promise<T> {
  try {
    return await asyncFn();
  } catch (error) {
    const appError = await globalErrorHandler.handleError(
      error instanceof Error ? error : new Error(String(error)),
      context
    );
    throw appError;
  }
}

export function handleSyncError<T>(
  syncFn: () => T,
  context?: Record<string, any>
): T {
  try {
    return syncFn();
  } catch (error) {
    globalErrorHandler.handleError(
      error instanceof Error ? error : new Error(String(error)),
      context
    ).catch(console.error);
    throw error;
  }
}

// Error boundary helper for React components
export interface ErrorInfo {
  componentStack: string;
  errorBoundary?: string;
}

export function handleReactError(
  error: Error,
  errorInfo: ErrorInfo,
  componentName?: string
): void {
  globalErrorHandler.handleError(error, {
    type: 'react_error_boundary',
    componentName,
    componentStack: errorInfo.componentStack,
    errorBoundary: errorInfo.errorBoundary,
  }).catch(console.error);
}

// Retry utility with exponential backoff
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelay: number = 1000,
  maxDelay: number = 10000,
  context?: Record<string, any>
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt === maxAttempts) {
        break;
      }
      
      // Don't retry certain error types
      if (lastError instanceof ValidationError ||
          lastError instanceof AuthenticationError ||
          lastError instanceof AuthorizationError ||
          lastError instanceof NotFoundError) {
        break;
      }
      
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
      const jitter = Math.random() * 0.1 * delay;
      
      await new Promise(resolve => setTimeout(resolve, delay + jitter));
    }
  }
  
  const finalError = await globalErrorHandler.handleError(lastError!, {
    ...context,
    retryAttempts: maxAttempts,
    finalAttempt: true,
  });
  
  throw finalError;
}

// Error classification helpers
export function isRetryableError(error: Error | AppError): boolean {
  if (error instanceof AppError) {
    return ![
      'VALIDATION_ERROR',
      'AUTHENTICATION_ERROR',
      'AUTHORIZATION_ERROR',
      'NOT_FOUND_ERROR'
    ].includes(error.code);
  }
  return true;
}

export function isUserFacingError(error: Error | AppError): boolean {
  return error instanceof AppError && error.isOperational;
}

export function getErrorMessage(error: Error | AppError): string {
  if (error instanceof AppError && error.isOperational) {
    return error.message;
  }
  return 'An unexpected error occurred. Please try again.';
}

// Error codes for consistent error handling
export const ERROR_CODES = {
  // Authentication
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_INVALID: 'AUTH_INVALID',
  AUTH_EXPIRED: 'AUTH_EXPIRED',
  
  // Authorization
  ACCESS_DENIED: 'ACCESS_DENIED',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  
  // Validation
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  
  // Network
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT',
  
  // Service
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  
  // Data
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  
  // System
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];
