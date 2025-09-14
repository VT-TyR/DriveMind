/**
 * Production Circuit Breaker Service - ALPHA Standards
 * Resilience patterns for external service calls with exponential backoff
 */

import { logger } from '../logging/logger';
import { metrics } from '../monitoring/metrics';
import { ExternalServiceError } from '../errors/error-types';

interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeout: number;
  monitoringPeriod: number;
  successThreshold: number; // For half-open state
}

interface CircuitBreakerState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  successCount: number;
  nextAttempt: number;
  lastFailure?: Date;
}

class CircuitBreaker {
  private circuits: Map<string, CircuitBreakerState> = new Map();
  private readonly defaultOptions: CircuitBreakerOptions = {
    failureThreshold: 5,
    resetTimeout: 60000, // 1 minute
    monitoringPeriod: 300000, // 5 minutes
    successThreshold: 2
  };

  async execute<T>(
    serviceName: string,
    operation: () => Promise<T>,
    options?: Partial<CircuitBreakerOptions>
  ): Promise<T> {
    const config = { ...this.defaultOptions, ...options };
    const circuit = this.getCircuit(serviceName);
    
    // Check circuit state
    if (circuit.state === 'OPEN') {
      if (Date.now() < circuit.nextAttempt) {
        metrics.recordCircuitBreakerEvent(serviceName, 'failure');
        throw new ExternalServiceError(
          serviceName,
          'Circuit breaker is OPEN - service unavailable',
          'CIRCUIT_BREAKER_OPEN',
          503,
          { nextAttempt: new Date(circuit.nextAttempt).toISOString() }
        );
      } else {
        // Transition to half-open
        this.transitionToHalfOpen(serviceName);
      }
    }

    try {
      const result = await operation();
      this.recordSuccess(serviceName, config);
      return result;
    } catch (error) {
      this.recordFailure(serviceName, config, error as Error);
      throw error;
    }
  }

  private getCircuit(serviceName: string): CircuitBreakerState {
    if (!this.circuits.has(serviceName)) {
      this.circuits.set(serviceName, {
        state: 'CLOSED',
        failureCount: 0,
        successCount: 0,
        nextAttempt: 0
      });
    }
    return this.circuits.get(serviceName)!;
  }

  private recordSuccess(serviceName: string, config: CircuitBreakerOptions): void {
    const circuit = this.getCircuit(serviceName);
    
    circuit.successCount++;
    metrics.recordCircuitBreakerEvent(serviceName, 'success');
    
    if (circuit.state === 'HALF_OPEN' && circuit.successCount >= config.successThreshold) {
      this.transitionToClosed(serviceName);
    } else if (circuit.state === 'CLOSED') {
      // Reset failure count on success in closed state
      circuit.failureCount = 0;
    }

    logger.debug('Circuit breaker success recorded', {
      metadata: {
        serviceName,
        state: circuit.state,
        successCount: circuit.successCount,
        failureCount: circuit.failureCount
      }
    });
  }

  private recordFailure(serviceName: string, config: CircuitBreakerOptions, error: Error): void {
    const circuit = this.getCircuit(serviceName);
    
    circuit.failureCount++;
    circuit.lastFailure = new Date();
    metrics.recordCircuitBreakerEvent(serviceName, 'failure');
    
    logger.warn('Circuit breaker failure recorded', {
      error,
      metadata: {
        serviceName,
        state: circuit.state,
        failureCount: circuit.failureCount,
        threshold: config.failureThreshold
      }
    });

    if (circuit.state === 'CLOSED' && circuit.failureCount >= config.failureThreshold) {
      this.transitionToOpen(serviceName, config);
    } else if (circuit.state === 'HALF_OPEN') {
      // Any failure in half-open immediately goes back to open
      this.transitionToOpen(serviceName, config);
    }
  }

  private transitionToClosed(serviceName: string): void {
    const circuit = this.getCircuit(serviceName);
    circuit.state = 'CLOSED';
    circuit.failureCount = 0;
    circuit.successCount = 0;
    circuit.nextAttempt = 0;
    
    metrics.recordCircuitBreakerEvent(serviceName, 'close');
    logger.info('Circuit breaker transitioned to CLOSED', {
      metadata: { serviceName }
    });
  }

  private transitionToOpen(serviceName: string, config: CircuitBreakerOptions): void {
    const circuit = this.getCircuit(serviceName);
    circuit.state = 'OPEN';
    circuit.nextAttempt = Date.now() + config.resetTimeout;
    circuit.successCount = 0;
    
    metrics.recordCircuitBreakerEvent(serviceName, 'open');
    logger.warn('Circuit breaker transitioned to OPEN', {
      metadata: {
        serviceName,
        failureCount: circuit.failureCount,
        nextAttempt: new Date(circuit.nextAttempt).toISOString()
      }
    });
  }

  private transitionToHalfOpen(serviceName: string): void {
    const circuit = this.getCircuit(serviceName);
    circuit.state = 'HALF_OPEN';
    circuit.successCount = 0;
    
    metrics.recordCircuitBreakerEvent(serviceName, 'half_open');
    logger.info('Circuit breaker transitioned to HALF_OPEN', {
      metadata: { serviceName }
    });
  }

  // Monitoring and diagnostics
  getCircuitStatus(serviceName?: string): Record<string, any> {
    if (serviceName) {
      const circuit = this.circuits.get(serviceName);
      if (!circuit) return { status: 'not_found' };
      
      return {
        serviceName,
        state: circuit.state,
        failureCount: circuit.failureCount,
        successCount: circuit.successCount,
        lastFailure: circuit.lastFailure?.toISOString(),
        nextAttempt: circuit.nextAttempt > 0 ? new Date(circuit.nextAttempt).toISOString() : null
      };
    }

    // Return all circuits
    const status: Record<string, any> = {};
    for (const [name, circuit] of this.circuits) {
      status[name] = {
        state: circuit.state,
        failureCount: circuit.failureCount,
        successCount: circuit.successCount,
        lastFailure: circuit.lastFailure?.toISOString(),
        nextAttempt: circuit.nextAttempt > 0 ? new Date(circuit.nextAttempt).toISOString() : null
      };
    }
    
    return status;
  }

  // Manual circuit control (for admin/testing)
  forceOpen(serviceName: string): void {
    const circuit = this.getCircuit(serviceName);
    circuit.state = 'OPEN';
    circuit.nextAttempt = Date.now() + this.defaultOptions.resetTimeout;
    
    logger.warn('Circuit breaker manually opened', {
      metadata: { serviceName }
    });
  }

  forceClose(serviceName: string): void {
    this.transitionToClosed(serviceName);
    
    logger.info('Circuit breaker manually closed', {
      metadata: { serviceName }
    });
  }

  reset(serviceName: string): void {
    this.circuits.delete(serviceName);
    
    logger.info('Circuit breaker reset', {
      metadata: { serviceName }
    });
  }

  // Health check
  healthCheck(): { healthy: boolean; circuits: Record<string, any> } {
    const circuits = this.getCircuitStatus();
    const openCircuits = Object.values(circuits).filter((c: any) => c.state === 'OPEN');
    
    return {
      healthy: openCircuits.length === 0,
      circuits
    };
  }
}

/**
 * Exponential Backoff with Jitter
 * Used for retries with circuit breaker protection
 */
export class ExponentialBackoff {
  private attempt: number = 0;
  
  constructor(
    private readonly maxRetries: number = 3,
    private readonly baseDelay: number = 1000,
    private readonly maxDelay: number = 30000
  ) {}

  async execute<T>(
    operation: () => Promise<T>,
    serviceName: string,
    shouldRetry: (error: Error) => boolean = () => true
  ): Promise<T> {
    let lastError: Error | null = null;

    for (this.attempt = 0; this.attempt <= this.maxRetries; this.attempt++) {
      try {
        const result = await operation();
        
        // Reset attempt counter on success
        this.attempt = 0;
        return result;
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry if circuit breaker is open
        if (lastError.message.includes('CIRCUIT_BREAKER_OPEN')) {
          throw lastError;
        }

        // Check if we should retry this error
        if (!shouldRetry(lastError) || this.attempt === this.maxRetries) {
          throw lastError;
        }

        const delay = this.calculateDelay();
        
        logger.warn('Retrying operation with exponential backoff', {
          metadata: {
            serviceName,
            attempt: this.attempt + 1,
            maxRetries: this.maxRetries,
            delay,
            error: lastError.message
          }
        });

        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  private calculateDelay(): number {
    const exponentialDelay = this.baseDelay * Math.pow(2, this.attempt);
    const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter
    return Math.min(exponentialDelay + jitter, this.maxDelay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Default instances
export const circuitBreaker = new CircuitBreaker();
export const exponentialBackoff = new ExponentialBackoff();

// Convenience function for protected external calls
export async function protectedExternalCall<T>(
  serviceName: string,
  operation: () => Promise<T>,
  options?: {
    circuitBreakerOptions?: Partial<CircuitBreakerOptions>;
    retryOptions?: { maxRetries?: number; baseDelay?: number; maxDelay?: number };
    shouldRetry?: (error: Error) => boolean;
  }
): Promise<T> {
  const backoff = new ExponentialBackoff(
    options?.retryOptions?.maxRetries,
    options?.retryOptions?.baseDelay,
    options?.retryOptions?.maxDelay
  );

  return await backoff.execute(
    () => circuitBreaker.execute(serviceName, operation, options?.circuitBreakerOptions),
    serviceName,
    options?.shouldRetry
  );
}