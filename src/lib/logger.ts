/**
 * Centralized logging system for DriveMind
 * Provides structured logging with different levels and contexts
 * ALPHA-CODENAME v1.8 compliant with PII hashing
 */

import crypto from 'crypto';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  userId?: string;
  userHash?: string; // Hashed version of userId
  fileId?: string;
  fileName?: string;
  operation?: string;
  component?: string;
  api?: string;
  requestId?: string;
  [key: string]: any;
}

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: Error;
  stack?: string;
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development';
  private isProduction = process.env.NODE_ENV === 'production';
  private logLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';
  private piiFields = ['userId', 'email', 'phone', 'ssn', 'creditCard', 'password', 'token', 'refreshToken'];

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    };
    return levels[level] >= levels[this.logLevel];
  }

  /**
   * Hash PII data for privacy compliance
   */
  private hashPII(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex').substring(0, 8);
  }

  /**
   * Sanitize context to remove or hash PII
   */
  private sanitizeContext(context?: LogContext): LogContext | undefined {
    if (!context) return undefined;
    
    const sanitized = { ...context };
    
    // Hash userId if present
    if (sanitized.userId) {
      sanitized.userHash = this.hashPII(sanitized.userId);
      delete sanitized.userId;
    }
    
    // Remove or hash other PII fields
    for (const field of this.piiFields) {
      if (sanitized[field]) {
        if (typeof sanitized[field] === 'string') {
          sanitized[`${field}Hash`] = this.hashPII(sanitized[field]);
        }
        delete sanitized[field];
      }
    }
    
    return sanitized;
  }

  private formatLogEntry(entry: LogEntry): string {
    const { timestamp, level, message, context, error } = entry;
    const time = timestamp.toISOString();
    const sanitizedContext = this.sanitizeContext(context);
    const ctx = sanitizedContext ? ` [${JSON.stringify(sanitizedContext)}]` : '';
    
    // In production, don't include stack traces
    const err = error ? ` Error: ${error.message}` : '';
    
    return `[${time}] ${level.toUpperCase()}: ${message}${ctx}${err}`;
  }

  private createLogEntry(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: Error
  ): LogEntry {
    return {
      timestamp: new Date(),
      level,
      message,
      context,
      error,
      stack: error?.stack,
    };
  }

  private writeLog(entry: LogEntry): void {
    if (!this.shouldLog(entry.level)) return;

    const formatted = this.formatLogEntry(entry);

    // Console output
    switch (entry.level) {
      case 'debug':
        if (!this.isProduction) console.debug(formatted);
        break;
      case 'info':
        console.info(formatted);
        break;
      case 'warn':
        console.warn(formatted);
        break;
      case 'error':
        console.error(formatted);
        // Only show stack traces in development
        if (entry.error && this.isDevelopment) {
          console.error(entry.error.stack);
        }
        break;
    }

    // In production, you might want to send logs to a service like:
    // - Firebase Cloud Logging
    // - Sentry
    // - LogRocket
    // - Custom logging endpoint
    if (!this.isDevelopment && entry.level === 'error') {
      this.sendToErrorTracking(entry);
    }
  }

  private async sendToErrorTracking(entry: LogEntry): Promise<void> {
    // Sanitize context before sending to external service
    const sanitizedContext = this.sanitizeContext(entry.context);
    
    try {
      // Send to error tracking service with sanitized data
      // await sentryClient.captureException(entry.error, { 
      //   contexts: sanitizedContext,
      //   level: entry.level,
      //   timestamp: entry.timestamp,
      // });
      
      // Log to structured logging service
      if (this.isProduction) {
        console.log(JSON.stringify({
          timestamp: entry.timestamp.toISOString(),
          level: entry.level,
          message: entry.message,
          context: sanitizedContext,
          error: entry.error ? {
            message: entry.error.message,
            name: entry.error.name,
          } : undefined,
        }));
      }
    } catch (error) {
      // Use console.error sparingly in production
      if (!this.isProduction) {
        console.error('Failed to send error to tracking service:', error);
      }
    }
  }

  debug(message: string, context?: LogContext): void {
    this.writeLog(this.createLogEntry('debug', message, context));
  }

  info(message: string, context?: LogContext): void {
    this.writeLog(this.createLogEntry('info', message, context));
  }

  warn(message: string, context?: LogContext, error?: Error): void {
    this.writeLog(this.createLogEntry('warn', message, context, error));
  }

  error(message: string, errorOrContext?: Error | LogContext, context?: LogContext): void {
    // Handle overloaded parameters
    let actualError: Error | undefined;
    let actualContext: LogContext | undefined;
    
    if (errorOrContext instanceof Error) {
      actualError = errorOrContext;
      actualContext = context;
    } else {
      actualContext = errorOrContext;
    }
    
    this.writeLog(this.createLogEntry('error', message, actualContext, actualError));
  }

  // Specialized methods for common operations
  apiRequest(method: string, endpoint: string, context?: LogContext): void {
    this.info(`API ${method} ${endpoint}`, { ...context, api: endpoint });
  }

  apiError(method: string, endpoint: string, error: Error, context?: LogContext): void {
    this.error(`API ${method} ${endpoint} failed`, error, { ...context, api: endpoint });
  }

  fileOperation(operation: string, fileId: string, fileName?: string, context?: LogContext): void {
    this.info(`File operation: ${operation}`, {
      ...context,
      operation,
      fileId,
      fileName,
    });
  }

  fileOperationError(
    operation: string,
    fileId: string,
    error: Error,
    fileName?: string,
    context?: LogContext
  ): void {
    this.error(`File operation failed: ${operation}`, error, {
      ...context,
      operation,
      fileId,
      fileName,
    });
  }

  authEvent(event: string, userId?: string, context?: LogContext): void {
    const userHash = userId ? this.hashPII(userId) : undefined;
    this.info(`Auth event: ${event}`, { ...context, userHash, component: 'auth' });
  }

  authError(event: string, error: Error, userId?: string, context?: LogContext): void {
    const userHash = userId ? this.hashPII(userId) : undefined;
    this.error(`Auth error: ${event}`, error, { ...context, userHash, component: 'auth' });
  }

  // Performance tracking
  performanceLog(operation: string, duration: number, context?: LogContext): void {
    this.info(`Performance: ${operation} took ${duration}ms`, {
      ...context,
      performance: { operation, duration },
    });
  }
}

export const logger = new Logger();

// Utility function for timing operations
export async function withTiming<T>(
  operation: string,
  fn: () => Promise<T>,
  context?: LogContext
): Promise<T> {
  const start = Date.now();
  try {
    logger.debug(`Starting operation: ${operation}`, context);
    const result = await fn();
    const duration = Date.now() - start;
    logger.performanceLog(operation, duration, context);
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    logger.error(`Operation failed: ${operation} (${duration}ms)`, error as Error, context);
    throw error;
  }
}

// Error boundary helper
export function logErrorBoundary(error: Error, errorInfo: any, component?: string): void {
  logger.error('React Error Boundary caught error', error, {
    component,
    errorInfo: errorInfo.componentStack,
  });
}