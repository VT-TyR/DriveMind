/**
 * Structured Production Logging Service - ALPHA Standards
 * Comprehensive logging with correlation IDs, performance metrics, and security audit trails
 */

interface LogContext {
  requestId?: string;
  userId?: string;
  operation?: string;
  duration?: number;
  metadata?: Record<string, any>;
  error?: Error;
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  service: string;
  version: string;
  environment: string;
  requestId?: string;
  userId?: string;
  operation?: string;
  duration?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
  };
  metadata?: Record<string, any>;
}

class Logger {
  private readonly service = 'drivemind-backend';
  private readonly version = process.env.npm_package_version || '1.0.0';
  private readonly environment = process.env.NODE_ENV || 'development';

  private formatLogEntry(
    level: LogLevel,
    message: string,
    context?: LogContext
  ): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.service,
      version: this.version,
      environment: this.environment,
    };

    if (context) {
      if (context.requestId) entry.requestId = context.requestId;
      if (context.userId) entry.userId = this.hashUserId(context.userId);
      if (context.operation) entry.operation = context.operation;
      if (context.duration !== undefined) entry.duration = context.duration;
      if (context.metadata) entry.metadata = this.sanitizeMetadata(context.metadata);
      
      if (context.error) {
        entry.error = {
          name: context.error.name,
          message: context.error.message,
          stack: this.environment === 'development' ? context.error.stack : undefined,
          code: (context.error as any).code,
        };
      }
    }

    return entry;
  }

  private output(entry: LogEntry): void {
    // In production, this would go to structured logging (e.g., Cloud Logging)
    // For now, use console with proper formatting
    const output = JSON.stringify(entry);
    
    switch (entry.level) {
      case 'debug':
        console.debug(output);
        break;
      case 'info':
        console.info(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      case 'error':
      case 'fatal':
        console.error(output);
        break;
      default:
        console.log(output);
    }
  }

  debug(message: string, context?: LogContext): void {
    if (this.environment === 'development') {
      this.output(this.formatLogEntry('debug', message, context));
    }
  }

  info(message: string, context?: LogContext): void {
    this.output(this.formatLogEntry('info', message, context));
  }

  warn(message: string, context?: LogContext): void {
    this.output(this.formatLogEntry('warn', message, context));
  }

  error(message: string, context?: LogContext): void {
    this.output(this.formatLogEntry('error', message, context));
  }

  fatal(message: string, context?: LogContext): void {
    this.output(this.formatLogEntry('fatal', message, context));
    // In a real application, might trigger alerts or shutdown
  }

  // Convenience methods for common operations
  apiRequest(method: string, path: string, statusCode: number, duration: number, context?: Omit<LogContext, 'operation' | 'duration'>): void {
    this.info(`${method} ${path} - ${statusCode}`, {
      ...context,
      operation: `${method} ${path}`,
      duration,
      metadata: {
        ...context?.metadata,
        statusCode,
        method,
        path
      }
    });
  }

  authEvent(event: 'login' | 'logout' | 'token_refresh' | 'auth_failure', userId?: string, context?: LogContext): void {
    this.info(`Authentication event: ${event}`, {
      ...context,
      userId,
      operation: `auth_${event}`,
      metadata: {
        ...context?.metadata,
        authEvent: event,
        securityEvent: true
      }
    });
  }

  businessOperation(operation: string, success: boolean, duration?: number, context?: LogContext): void {
    const level = success ? 'info' : 'warn';
    const message = `Business operation: ${operation} ${success ? 'completed' : 'failed'}`;
    
    this[level](message, {
      ...context,
      operation,
      duration,
      metadata: {
        ...context?.metadata,
        success,
        businessOperation: true
      }
    });
  }

  externalApiCall(service: string, endpoint: string, success: boolean, duration: number, context?: LogContext): void {
    const message = `External API: ${service} ${endpoint} ${success ? 'success' : 'failure'}`;
    const level = success ? 'info' : 'error';
    
    this[level](message, {
      ...context,
      operation: `external_api_${service}`,
      duration,
      metadata: {
        ...context?.metadata,
        externalService: service,
        endpoint,
        success
      }
    });
  }

  performanceMetric(operation: string, duration: number, context?: LogContext): void {
    this.info(`Performance: ${operation} completed in ${duration}ms`, {
      ...context,
      operation,
      duration,
      metadata: {
        ...context?.metadata,
        performanceMetric: true
      }
    });
  }

  private hashUserId(userId: string): string {
    // Simple hash for privacy - in production use proper hashing
    return userId.length > 8 ? 
      `${userId.slice(0, 4)}****${userId.slice(-4)}` : 
      '****';
  }

  private sanitizeMetadata(metadata: Record<string, any>): Record<string, any> {
    const sanitized = { ...metadata };
    
    // Remove sensitive fields
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth', 'credential'];
    
    for (const key in sanitized) {
      if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      }
    }
    
    return sanitized;
  }

  // Request correlation helper
  createRequestContext(requestId: string, userId?: string, operation?: string): LogContext {
    return {
      requestId,
      userId,
      operation,
      metadata: {
        correlationId: requestId
      }
    };
  }

  // Performance timing helper
  startTimer(): () => number {
    const startTime = Date.now();
    return () => Date.now() - startTime;
  }
}

export const logger = new Logger();

// Request correlation middleware helper
export const generateRequestId = (): string => {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Error logging helper
export const logError = (error: Error, context?: LogContext): void => {
  logger.error(error.message, {
    ...context,
    error,
    metadata: {
      ...context?.metadata,
      errorType: error.constructor.name
    }
  });
};