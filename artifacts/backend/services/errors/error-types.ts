/**
 * Comprehensive Error Taxonomy - ALPHA Standards
 * Structured error handling with proper error codes and context
 */

export class BaseError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly context?: Record<string, any>;
  public readonly timestamp: string;
  public readonly requestId?: string;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    context?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.context = context;
    this.timestamp = new Date().toISOString();
    this.requestId = context?.requestId;
    
    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: this.code,
      message: this.message,
      timestamp: this.timestamp,
      requestId: this.requestId,
      details: this.context?.details,
    };
  }
}

// Authentication Errors
export class AuthError extends BaseError {
  constructor(message: string, code: string, context?: Record<string, any>) {
    super(message, code, 401, context);
  }
}

export class AuthorizationError extends BaseError {
  constructor(message: string, code: string, context?: Record<string, any>) {
    super(message, code, 403, context);
  }
}

// Validation Errors
export class ValidationError extends BaseError {
  constructor(message: string, validationDetails: any, context?: Record<string, any>) {
    super(message, 'VALIDATION_ERROR', 400, { ...context, details: validationDetails });
  }
}

// Business Logic Errors
export class BusinessLogicError extends BaseError {
  constructor(message: string, code: string, context?: Record<string, any>) {
    super(message, code, 422, context);
  }
}

// External Service Errors
export class ExternalServiceError extends BaseError {
  constructor(service: string, message: string, code: string, statusCode: number = 503, context?: Record<string, any>) {
    super(`${service}: ${message}`, code, statusCode, { ...context, service });
  }
}

// Rate Limiting Errors
export class RateLimitError extends BaseError {
  constructor(message: string, retryAfter: number, context?: Record<string, any>) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429, { ...context, retryAfter });
  }
}

// System Errors
export class SystemError extends BaseError {
  constructor(message: string, code: string, context?: Record<string, any>) {
    super(message, code, 500, context);
  }
}

// Not Found Errors
export class NotFoundError extends BaseError {
  constructor(resource: string, identifier?: string, context?: Record<string, any>) {
    const message = identifier ? 
      `${resource} with identifier '${identifier}' not found` : 
      `${resource} not found`;
    super(message, 'RESOURCE_NOT_FOUND', 404, { ...context, resource, identifier });
  }
}

// Conflict Errors
export class ConflictError extends BaseError {
  constructor(message: string, code: string, context?: Record<string, any>) {
    super(message, code, 409, context);
  }
}

// Specific Error Types for DriveMind
export class DriveAPIError extends ExternalServiceError {
  constructor(message: string, googleErrorCode?: string, context?: Record<string, any>) {
    super('Google Drive API', message, `DRIVE_API_ERROR${googleErrorCode ? `_${googleErrorCode}` : ''}`, 503, {
      ...context,
      googleErrorCode
    });
  }
}

export class TokenError extends AuthError {
  constructor(message: string, code: string, context?: Record<string, any>) {
    super(message, code, { ...context, category: 'token' });
  }
}

export class ScanError extends BusinessLogicError {
  constructor(message: string, code: string, context?: Record<string, any>) {
    super(message, code, { ...context, category: 'scan' });
  }
}

export class AIServiceError extends ExternalServiceError {
  constructor(message: string, code: string, context?: Record<string, any>) {
    super('AI Service', message, code, 503, context);
  }
}

// Error Code Constants
export const ERROR_CODES = {
  // Authentication
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_INVALID: 'AUTH_INVALID',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  TOKEN_MISSING: 'TOKEN_MISSING',
  OAUTH_INIT_FAILED: 'OAUTH_INIT_FAILED',
  OAUTH_CALLBACK_FAILED: 'OAUTH_CALLBACK_FAILED',
  
  // Authorization
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  RESOURCE_ACCESS_DENIED: 'RESOURCE_ACCESS_DENIED',
  SCOPE_INSUFFICIENT: 'SCOPE_INSUFFICIENT',
  
  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  REQUIRED_FIELD_MISSING: 'REQUIRED_FIELD_MISSING',
  INVALID_FORMAT: 'INVALID_FORMAT',
  INVALID_PARAMETER: 'INVALID_PARAMETER',
  
  // Business Logic
  SCAN_IN_PROGRESS: 'SCAN_IN_PROGRESS',
  SCAN_NOT_FOUND: 'SCAN_NOT_FOUND',
  DUPLICATE_OPERATION: 'DUPLICATE_OPERATION',
  OPERATION_NOT_ALLOWED: 'OPERATION_NOT_ALLOWED',
  
  // External Services
  DRIVE_API_ERROR: 'DRIVE_API_ERROR',
  AI_SERVICE_ERROR: 'AI_SERVICE_ERROR',
  FIREBASE_ERROR: 'FIREBASE_ERROR',
  
  // System
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  
  // Rate Limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  
  // Resources
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  RESOURCE_CONFLICT: 'RESOURCE_CONFLICT',
  RESOURCE_LOCKED: 'RESOURCE_LOCKED',
} as const;

// Error Factory Functions
export const createAuthError = (message: string, code: keyof typeof ERROR_CODES = 'AUTH_INVALID', context?: Record<string, any>) => 
  new AuthError(message, ERROR_CODES[code], context);

export const createValidationError = (message: string, details: any, context?: Record<string, any>) => 
  new ValidationError(message, details, context);

export const createDriveError = (message: string, googleErrorCode?: string, context?: Record<string, any>) => 
  new DriveAPIError(message, googleErrorCode, context);

export const createSystemError = (message: string, code: keyof typeof ERROR_CODES = 'INTERNAL_ERROR', context?: Record<string, any>) => 
  new SystemError(message, ERROR_CODES[code], context);

// Error Response Formatter
export const formatErrorResponse = (error: BaseError, requestId?: string) => {
  const errorResponse = {
    ...error.toJSON(),
    requestId: requestId || error.requestId
  };

  // Remove sensitive data in production
  if (process.env.NODE_ENV === 'production') {
    delete errorResponse.details?.stack;
  }

  return errorResponse;
};