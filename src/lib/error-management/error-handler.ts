/**
 * @fileoverview Centralized error handling system to reduce error rates
 * Implements retry logic, circuit breakers, and graceful degradation
 */

import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum ErrorCategory {
  AUTH = 'authentication',
  VALIDATION = 'validation',
  NETWORK = 'network',
  DATABASE = 'database',
  RATE_LIMIT = 'rate_limit',
  PERMISSION = 'permission',
  EXTERNAL_SERVICE = 'external_service',
  INTERNAL = 'internal'
}

interface ErrorContext {
  userId?: string;
  requestId?: string;
  operation?: string;
  metadata?: Record<string, any>;
}

interface RetryConfig {
  maxAttempts: number;
  backoffMs: number;
  exponential: boolean;
}

class ErrorManagementSystem {
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private errorMetrics: Map<string, number> = new Map();
  
  /**
   * Handle errors with automatic categorization and appropriate response
   */
  handleError(
    error: unknown,
    context: ErrorContext = {}
  ): { message: string; status: number; category: ErrorCategory; severity: ErrorSeverity } {
    const errorInfo = this.categorizeError(error);
    
    // Log with appropriate severity
    this.logError(error, errorInfo, context);
    
    // Update error metrics
    this.updateMetrics(errorInfo.category);
    
    // Determine user-friendly message
    const message = this.getUserMessage(errorInfo);
    
    return {
      message,
      status: errorInfo.status,
      category: errorInfo.category,
      severity: errorInfo.severity
    };
  }
  
  /**
   * Retry operation with exponential backoff
   */
  async withRetry<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {}
  ): Promise<T> {
    const { 
      maxAttempts = 3, 
      backoffMs = 100, 
      exponential = true 
    } = config;
    
    let lastError: unknown;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt < maxAttempts) {
          const delay = exponential 
            ? backoffMs * Math.pow(2, attempt - 1)
            : backoffMs;
          
          logger.warn('Operation failed, retrying', { 
            attempt, 
            maxAttempts, 
            delayMs: delay,
            error: error instanceof Error ? error.message : String(error)
          });
          
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }
  
  /**
   * Circuit breaker pattern for external services
   */
  getCircuitBreaker(serviceName: string): CircuitBreaker {
    if (!this.circuitBreakers.has(serviceName)) {
      this.circuitBreakers.set(serviceName, new CircuitBreaker(serviceName));
    }
    return this.circuitBreakers.get(serviceName)!;
  }
  
  /**
   * Graceful degradation wrapper
   */
  async withFallback<T>(
    primaryOperation: () => Promise<T>,
    fallbackOperation: () => Promise<T>,
    serviceName: string
  ): Promise<T> {
    const breaker = this.getCircuitBreaker(serviceName);
    
    if (breaker.isOpen()) {
      logger.info('Circuit breaker open, using fallback', { serviceName });
      return fallbackOperation();
    }
    
    try {
      const result = await primaryOperation();
      breaker.onSuccess();
      return result;
    } catch (error) {
      breaker.onFailure();
      logger.warn('Primary operation failed, using fallback', { 
        serviceName,
        error: error instanceof Error ? error.message : String(error)
      });
      return fallbackOperation();
    }
  }
  
  /**
   * Categorize error for proper handling
   */
  private categorizeError(error: unknown): {
    category: ErrorCategory;
    severity: ErrorSeverity;
    status: number;
    retryable: boolean;
  } {
    const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    
    // Authentication errors
    if (errorMessage.includes('auth') || errorMessage.includes('token') || errorMessage.includes('unauthorized')) {
      return {
        category: ErrorCategory.AUTH,
        severity: ErrorSeverity.MEDIUM,
        status: 401,
        retryable: false
      };
    }
    
    // Validation errors
    if (errorMessage.includes('validation') || errorMessage.includes('invalid') || errorMessage.includes('required')) {
      return {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.LOW,
        status: 400,
        retryable: false
      };
    }
    
    // Rate limiting
    if (errorMessage.includes('rate limit') || errorMessage.includes('too many')) {
      return {
        category: ErrorCategory.RATE_LIMIT,
        severity: ErrorSeverity.LOW,
        status: 429,
        retryable: true
      };
    }
    
    // Network errors
    if (errorMessage.includes('network') || errorMessage.includes('timeout') || errorMessage.includes('econnrefused')) {
      return {
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.MEDIUM,
        status: 503,
        retryable: true
      };
    }
    
    // Database errors
    if (errorMessage.includes('database') || errorMessage.includes('firestore') || errorMessage.includes('collection')) {
      return {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.HIGH,
        status: 500,
        retryable: true
      };
    }
    
    // Permission errors
    if (errorMessage.includes('permission') || errorMessage.includes('forbidden') || errorMessage.includes('access')) {
      return {
        category: ErrorCategory.PERMISSION,
        severity: ErrorSeverity.MEDIUM,
        status: 403,
        retryable: false
      };
    }
    
    // Default to internal error
    return {
      category: ErrorCategory.INTERNAL,
      severity: ErrorSeverity.HIGH,
      status: 500,
      retryable: false
    };
  }
  
  /**
   * Get user-friendly error message
   */
  private getUserMessage(errorInfo: ReturnType<typeof this.categorizeError>): string {
    switch (errorInfo.category) {
      case ErrorCategory.AUTH:
        return 'Please sign in to continue';
      case ErrorCategory.VALIDATION:
        return 'Please check your input and try again';
      case ErrorCategory.RATE_LIMIT:
        return 'Too many requests. Please wait a moment and try again';
      case ErrorCategory.NETWORK:
        return 'Connection error. Please check your internet and try again';
      case ErrorCategory.DATABASE:
        return 'Service temporarily unavailable. Please try again later';
      case ErrorCategory.PERMISSION:
        return 'You do not have permission to perform this action';
      default:
        return 'An unexpected error occurred. Please try again';
    }
  }
  
  /**
   * Log error with appropriate severity
   */
  private logError(error: unknown, errorInfo: ReturnType<typeof this.categorizeError>, context: ErrorContext): void {
    const logData = {
      category: errorInfo.category,
      severity: errorInfo.severity,
      retryable: errorInfo.retryable,
      ...context,
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : String(error)
    };
    
    switch (errorInfo.severity) {
      case ErrorSeverity.CRITICAL:
        logger.error('Critical error occurred', undefined, logData);
        break;
      case ErrorSeverity.HIGH:
        logger.error('Error occurred', undefined, logData);
        break;
      case ErrorSeverity.MEDIUM:
        logger.warn('Warning: Error occurred', logData);
        break;
      case ErrorSeverity.LOW:
        logger.info('Handled error', logData);
        break;
    }
  }
  
  /**
   * Update error metrics
   */
  private updateMetrics(category: ErrorCategory): void {
    const key = `error_${category}`;
    const current = this.errorMetrics.get(key) || 0;
    this.errorMetrics.set(key, current + 1);
  }
  
  /**
   * Get error metrics for monitoring
   */
  getMetrics(): Record<string, number> {
    const metrics: Record<string, number> = {};
    this.errorMetrics.forEach((value, key) => {
      metrics[key] = value;
    });
    return metrics;
  }
}

/**
 * Circuit Breaker implementation
 */
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  constructor(
    private serviceName: string,
    private threshold = 5,
    private timeout = 60000 // 1 minute
  ) {}
  
  isOpen(): boolean {
    if (this.state === 'open') {
      // Check if timeout has passed
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'half-open';
        return false;
      }
      return true;
    }
    return false;
  }
  
  onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }
  
  onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.threshold) {
      this.state = 'open';
      logger.warn('Circuit breaker opened', { 
        serviceName: this.serviceName, 
        failures: this.failures 
      });
    }
  }
}

// Export singleton instance
export const errorHandler = new ErrorManagementSystem();

/**
 * API Response helper with error handling
 */
export function createErrorResponse(
  error: unknown,
  context: ErrorContext = {}
): NextResponse {
  const errorInfo = errorHandler.handleError(error, context);
  
  return NextResponse.json(
    {
      error: errorInfo.message,
      category: errorInfo.category,
      requestId: context.requestId
    },
    { status: errorInfo.status }
  );
}