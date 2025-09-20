/**
 * Graceful Shutdown Handler
 * Implements proper shutdown procedures for production deployment
 * Compliant with ALPHA-CODENAME v1.8 requirements
 */

import { EventEmitter } from 'events';

export interface ShutdownHandler {
  name: string;
  handler: () => Promise<void>;
  timeout?: number; // milliseconds
  priority?: number; // lower number = higher priority
}

class GracefulShutdownManager extends EventEmitter {
  private static instance: GracefulShutdownManager;
  private handlers: ShutdownHandler[] = [];
  private isShuttingDown = false;
  private shutdownTimeout = 30000; // 30 seconds default
  private activeConnections = new Set<any>();
  private shutdownPromise: Promise<void> | null = null;
  
  private constructor() {
    super();
    this.setupSignalHandlers();
  }
  
  static getInstance(): GracefulShutdownManager {
    if (!GracefulShutdownManager.instance) {
      GracefulShutdownManager.instance = new GracefulShutdownManager();
    }
    return GracefulShutdownManager.instance;
  }
  
  /**
   * Setup signal handlers for graceful shutdown
   */
  private setupSignalHandlers() {
    // Handle termination signals
    const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
    
    signals.forEach(signal => {
      process.on(signal, async () => {
        console.log(`[SHUTDOWN] Received ${signal}, initiating graceful shutdown...`);
        await this.shutdown(signal);
      });
    });
    
    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      console.error('[SHUTDOWN] Uncaught exception:', error);
      await this.shutdown('UNCAUGHT_EXCEPTION', 1);
    });
    
    // Handle unhandled promise rejections
    process.on('unhandledRejection', async (reason, promise) => {
      console.error('[SHUTDOWN] Unhandled rejection at:', promise, 'reason:', reason);
      // Don't exit on unhandled rejection, just log it
    });
    
    // Handle process exit
    process.on('exit', (code) => {
      console.log(`[SHUTDOWN] Process exiting with code ${code}`);
    });
  }
  
  /**
   * Register a shutdown handler
   */
  register(handler: ShutdownHandler) {
    if (this.isShuttingDown) {
      console.warn(`[SHUTDOWN] Cannot register handler ${handler.name} during shutdown`);
      return;
    }
    
    this.handlers.push(handler);
    // Sort by priority (lower number = higher priority)
    this.handlers.sort((a, b) => (a.priority || 999) - (b.priority || 999));
    
    console.log(`[SHUTDOWN] Registered handler: ${handler.name}`);
  }
  
  /**
   * Track active connection
   */
  trackConnection(connection: any) {
    this.activeConnections.add(connection);
    
    // Remove connection when closed
    if (connection && typeof connection.on === 'function') {
      connection.on('close', () => {
        this.activeConnections.delete(connection);
      });
    }
  }
  
  /**
   * Remove tracked connection
   */
  untrackConnection(connection: any) {
    this.activeConnections.delete(connection);
  }
  
  /**
   * Get active connections count
   */
  getActiveConnectionsCount(): number {
    return this.activeConnections.size;
  }
  
  /**
   * Perform graceful shutdown
   */
  async shutdown(reason: string = 'UNKNOWN', exitCode: number = 0): Promise<void> {
    // Prevent multiple shutdown attempts
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }
    
    this.shutdownPromise = this.performShutdown(reason, exitCode);
    return this.shutdownPromise;
  }
  
  private async performShutdown(reason: string, exitCode: number): Promise<void> {
    if (this.isShuttingDown) {
      console.log('[SHUTDOWN] Shutdown already in progress');
      return;
    }
    
    this.isShuttingDown = true;
    this.emit('shutdown:start', { reason, timestamp: new Date() });
    
    const startTime = Date.now();
    console.log(`[SHUTDOWN] Starting graceful shutdown (reason: ${reason})`);
    
    try {
      // Stop accepting new connections/requests
      console.log('[SHUTDOWN] Stopping new connections...');
      this.emit('shutdown:stop-accepting');
      
      // Wait for active connections to finish (with timeout)
      await this.waitForConnections();
      
      // Execute shutdown handlers in priority order
      for (const handler of this.handlers) {
        const handlerTimeout = handler.timeout || 10000;
        
        try {
          console.log(`[SHUTDOWN] Executing handler: ${handler.name}`);
          
          await Promise.race([
            handler.handler(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Timeout')), handlerTimeout)
            ),
          ]);
          
          console.log(`[SHUTDOWN] ✓ Handler completed: ${handler.name}`);
        } catch (error) {
          console.error(`[SHUTDOWN] ✗ Handler failed: ${handler.name}`, error);
          // Continue with other handlers even if one fails
        }
      }
      
      const duration = Date.now() - startTime;
      console.log(`[SHUTDOWN] Graceful shutdown completed in ${duration}ms`);
      
      this.emit('shutdown:complete', { reason, duration, timestamp: new Date() });
      
    } catch (error) {
      console.error('[SHUTDOWN] Error during shutdown:', error);
      this.emit('shutdown:error', { reason, error, timestamp: new Date() });
      
    } finally {
      // Force exit after timeout
      setTimeout(() => {
        console.error('[SHUTDOWN] Forcing exit after timeout');
        process.exit(exitCode);
      }, 5000);
      
      // Exit normally
      process.exit(exitCode);
    }
  }
  
  /**
   * Wait for active connections to close
   */
  private async waitForConnections(): Promise<void> {
    const startTime = Date.now();
    const checkInterval = 100; // Check every 100ms
    const maxWaitTime = 10000; // Maximum 10 seconds
    
    while (this.activeConnections.size > 0) {
      if (Date.now() - startTime > maxWaitTime) {
        console.warn(
          `[SHUTDOWN] Timeout waiting for ${this.activeConnections.size} connections`
        );
        
        // Force close remaining connections
        for (const connection of this.activeConnections) {
          try {
            if (connection && typeof connection.destroy === 'function') {
              connection.destroy();
            } else if (connection && typeof connection.close === 'function') {
              connection.close();
            }
          } catch (error) {
            console.error('[SHUTDOWN] Error closing connection:', error);
          }
        }
        break;
      }
      
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
    
    console.log('[SHUTDOWN] All connections closed');
  }
  
  /**
   * Check if shutdown is in progress
   */
  isShuttingDownStatus(): boolean {
    return this.isShuttingDown;
  }
  
  /**
   * Set global shutdown timeout
   */
  setShutdownTimeout(timeout: number) {
    this.shutdownTimeout = timeout;
  }
}

// Export singleton instance
export const shutdownManager = GracefulShutdownManager.getInstance();

/**
 * Default shutdown handlers for common services
 */

// Database connections handler
// Only register in Node.js runtime, not Edge Runtime
if (typeof process !== 'undefined' && process.versions?.node) {
  shutdownManager.register({
    name: 'database-connections',
    priority: 1,
    timeout: 5000,
    handler: async () => {
      console.log('[SHUTDOWN] Closing database connections...');
      // Close Firestore connections
      try {
        const { getFirestore } = await import('firebase-admin/firestore');
        await getFirestore().terminate();
      } catch (error) {
        console.error('[SHUTDOWN] Error closing Firestore:', error);
      }
    },
  });
}

// Cache cleanup handler
shutdownManager.register({
  name: 'cache-cleanup',
  priority: 2,
  timeout: 3000,
  handler: async () => {
    console.log('[SHUTDOWN] Cleaning up caches...');
    // Clear any in-memory caches
    if (global.gc) {
      global.gc();
    }
  },
});

// Metrics flush handler
shutdownManager.register({
  name: 'metrics-flush',
  priority: 3,
  timeout: 3000,
  handler: async () => {
    console.log('[SHUTDOWN] Flushing metrics...');
    // Flush any pending metrics or logs
  },
});

/**
 * Middleware to track HTTP connections
 */
export function trackHTTPConnection(req: any, res: any, next: () => void) {
  shutdownManager.trackConnection(res);
  
  // Stop accepting new requests during shutdown
  if (shutdownManager.isShuttingDownStatus()) {
    res.statusCode = 503;
    res.setHeader('Connection', 'close');
    res.setHeader('Retry-After', '60');
    res.end('Service is shutting down');
    return;
  }
  
  // Clean up on response end
  res.on('finish', () => {
    shutdownManager.untrackConnection(res);
  });
  
  res.on('close', () => {
    shutdownManager.untrackConnection(res);
  });
  
  next();
}

/**
 * Register custom shutdown handler
 */
export function onShutdown(
  name: string,
  handler: () => Promise<void>,
  options?: { timeout?: number; priority?: number }
) {
  shutdownManager.register({
    name,
    handler,
    timeout: options?.timeout,
    priority: options?.priority,
  });
}

/**
 * Manual shutdown trigger
 */
export function triggerShutdown(reason: string = 'MANUAL', exitCode: number = 0) {
  return shutdownManager.shutdown(reason, exitCode);
}

/**
 * Get shutdown status
 */
export function getShutdownStatus() {
  return {
    isShuttingDown: shutdownManager.isShuttingDownStatus(),
    activeConnections: shutdownManager.getActiveConnectionsCount(),
  };
}