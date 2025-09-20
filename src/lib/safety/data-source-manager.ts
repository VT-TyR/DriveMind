/**
 * @fileoverview Centralized Data Source Manager
 * Provides a single control point for all data operations
 * Manages switching between mock and Firebase data sources with fallback support
 */

import { z } from 'zod';
import { DataSourceConfig, DataSourceType } from './types';
import { getFeatureFlag, FEATURE_FLAGS, isFallbackEnabled } from './feature-flags';
import { logger } from '@/lib/logger';
import { ActionBatchSchema } from '@/lib/ai-types';

// Import both data sources
import * as mockDb from '@/lib/mock-db';
import * as firebaseDb from '@/lib/firebase-db';

type ActionBatch = z.infer<typeof ActionBatchSchema>;

/**
 * Data source interface that both implementations must follow
 */
interface DataSource {
  getActionBatch(batchId: string, uid: string): Promise<ActionBatch>;
  saveActionBatch(batchId: string, batchData: ActionBatch): Promise<void>;
  createActionBatch?(batchData: ActionBatch): Promise<string>;
  getUserActionBatches?(uid: string, limit?: number): Promise<ActionBatch[]>;
  checkHealth?(): Promise<{ status: 'healthy' | 'unhealthy'; details: Record<string, any> }>;
}

/**
 * Centralized Data Source Manager
 * Singleton pattern to ensure single control point
 */
export class DataSourceManager {
  private static instance: DataSourceManager;
  private currentSource: DataSourceType;
  private config: DataSourceConfig;
  private mockSource: DataSource;
  private firebaseSource: DataSource;
  private operationCounts = {
    mock: { reads: 0, writes: 0, errors: 0 },
    firebase: { reads: 0, writes: 0, errors: 0 }
  };
  private fallbackHistory: Array<{
    timestamp: Date;
    from: DataSourceType;
    to: DataSourceType;
    reason: string;
  }> = [];

  private constructor() {
    this.mockSource = mockDb;
    this.firebaseSource = firebaseDb;
    this.currentSource = this.determineActiveSource();
    this.config = this.getDefaultConfig(this.currentSource);
    
    logger.info('DataSourceManager initialized', {
      activeSource: this.currentSource,
      config: this.config
    });
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): DataSourceManager {
    if (!DataSourceManager.instance) {
      DataSourceManager.instance = new DataSourceManager();
    }
    return DataSourceManager.instance;
  }

  /**
   * Determine which data source should be active based on feature flags
   */
  private determineActiveSource(): DataSourceType {
    const mockEnabled = getFeatureFlag(FEATURE_FLAGS.DATA_SOURCE_MOCK);
    const firebaseEnabled = getFeatureFlag(FEATURE_FLAGS.DATA_SOURCE_FIREBASE);
    
    if (mockEnabled && firebaseEnabled) {
      return 'hybrid';
    } else if (mockEnabled) {
      return 'mock';
    } else {
      return 'firebase';
    }
  }

  /**
   * Get default configuration for a data source type
   */
  private getDefaultConfig(type: DataSourceType): DataSourceConfig {
    const baseConfig = {
      fallbackEnabled: isFallbackEnabled(),
      maxRetries: 3,
      timeoutMs: 5000
    };

    switch (type) {
      case 'mock':
        return {
          ...baseConfig,
          type: 'mock',
          priority: 0,
          maxRetries: 1, // Mock doesn't need retries
          timeoutMs: 100
        };
      case 'firebase':
        return {
          ...baseConfig,
          type: 'firebase',
          priority: 100
        };
      case 'hybrid':
        return {
          ...baseConfig,
          type: 'hybrid',
          priority: 50,
          fallbackEnabled: true // Always enable fallback in hybrid mode
        };
    }
  }

  /**
   * Get the current data source based on type and priority
   */
  private getDataSource(preferredType?: DataSourceType): DataSource {
    const type = preferredType || this.currentSource;
    
    if (type === 'mock') {
      return this.mockSource;
    } else if (type === 'firebase') {
      return this.firebaseSource;
    } else {
      // Hybrid mode: use Firebase with mock fallback
      return this.config.priority > 50 ? this.firebaseSource : this.mockSource;
    }
  }

  /**
   * Execute operation with retry and fallback logic
   */
  private async executeWithFallback<T>(
    operation: (source: DataSource) => Promise<T>,
    operationType: 'read' | 'write',
    context: Record<string, any> = {}
  ): Promise<T> {
    const primarySource = this.getDataSource();
    const primaryType = this.currentSource === 'hybrid' 
      ? (this.config.priority > 50 ? 'firebase' : 'mock')
      : this.currentSource;

    let lastError: Error | undefined;
    let attempts = 0;

    // Try primary source with retries
    while (attempts < this.config.maxRetries) {
      try {
        const result = await this.withTimeout(
          operation(primarySource),
          this.config.timeoutMs
        );
        
        // Update metrics
        if (operationType === 'read') {
          this.operationCounts[primaryType].reads++;
        } else {
          this.operationCounts[primaryType].writes++;
        }
        
        return result;
      } catch (error) {
        lastError = error as Error;
        attempts++;
        this.operationCounts[primaryType].errors++;
        
        logger.warn('Data source operation failed', {
          source: primaryType,
          operationType,
          attempt: attempts,
          error: lastError.message,
          context
        });

        if (attempts < this.config.maxRetries) {
          // Exponential backoff
          await this.delay(Math.pow(2, attempts) * 100);
        }
      }
    }

    // Try fallback if enabled
    if (this.config.fallbackEnabled && this.currentSource !== 'mock') {
      logger.info('Attempting fallback to mock data source', {
        reason: lastError?.message,
        context
      });

      try {
        const fallbackSource = this.mockSource;
        const result = await this.withTimeout(
          operation(fallbackSource),
          1000 // Faster timeout for mock
        );

        // Record fallback
        this.fallbackHistory.push({
          timestamp: new Date(),
          from: primaryType as DataSourceType,
          to: 'mock',
          reason: lastError?.message || 'Unknown error'
        });

        // Update metrics
        if (operationType === 'read') {
          this.operationCounts.mock.reads++;
        } else {
          this.operationCounts.mock.writes++;
        }

        logger.info('Fallback successful', {
          from: primaryType,
          to: 'mock',
          operationType,
          context
        });

        return result;
      } catch (fallbackError) {
        this.operationCounts.mock.errors++;
        logger.error('Fallback also failed', undefined, {
          error: (fallbackError as Error).message,
          context
        });
      }
    }

    // All attempts failed
    throw lastError || new Error('Operation failed after all retries');
  }

  /**
   * Wrap promise with timeout
   */
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
  }

  /**
   * Delay helper for retries
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Switch to a different data source
   */
  public async switchDataSource(
    newSource: DataSourceType,
    config?: Partial<DataSourceConfig>
  ): Promise<void> {
    const oldSource = this.currentSource;
    
    // Validate health of new source first
    if (newSource !== 'mock') {
      try {
        const health = await this.checkHealth(newSource);
        if (health.status === 'unhealthy') {
          throw new Error(`Target data source ${newSource} is unhealthy`);
        }
      } catch (error) {
        logger.error('Health check failed for target data source', undefined, {
          source: newSource,
          error: (error as Error).message
        });
        throw error;
      }
    }

    this.currentSource = newSource;
    this.config = {
      ...this.getDefaultConfig(newSource),
      ...config
    };

    logger.info('Data source switched', {
      from: oldSource,
      to: newSource,
      config: this.config
    });
  }

  /**
   * Get current data source type
   */
  public getCurrentSource(): DataSourceType {
    return this.currentSource;
  }

  /**
   * Get current configuration
   */
  public getConfig(): DataSourceConfig {
    return { ...this.config };
  }

  /**
   * Get operation metrics
   */
  public getMetrics() {
    return {
      currentSource: this.currentSource,
      operations: { ...this.operationCounts },
      fallbacks: this.fallbackHistory.length,
      recentFallbacks: this.fallbackHistory.slice(-5)
    };
  }

  /**
   * Reset metrics
   */
  public resetMetrics(): void {
    this.operationCounts = {
      mock: { reads: 0, writes: 0, errors: 0 },
      firebase: { reads: 0, writes: 0, errors: 0 }
    };
    this.fallbackHistory = [];
  }

  /**
   * Check health of a specific data source
   */
  public async checkHealth(source?: DataSourceType): Promise<{
    status: 'healthy' | 'unhealthy';
    details: Record<string, any>;
  }> {
    const targetSource = source || this.currentSource;
    const dataSource = this.getDataSource(targetSource);

    try {
      if (targetSource === 'mock') {
        // Mock is always healthy
        return {
          status: 'healthy',
          details: {
            type: 'mock',
            message: 'Mock data source is always available'
          }
        };
      }

      // Use Firebase health check if available
      if (dataSource.checkHealth) {
        return await dataSource.checkHealth();
      }

      // Fallback: try a simple read operation
      await this.withTimeout(
        dataSource.getActionBatch('health-check', 'system'),
        1000
      ).catch(() => {
        // Ignore errors, this is just a health check
      });

      return {
        status: 'healthy',
        details: {
          type: targetSource,
          message: 'Data source is responsive'
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          type: targetSource,
          error: (error as Error).message
        }
      };
    }
  }

  // ===== Data Operations Proxy Methods =====
  
  /**
   * Get action batch with automatic fallback
   */
  public async getActionBatch(batchId: string, uid: string): Promise<ActionBatch> {
    return this.executeWithFallback(
      (source) => source.getActionBatch(batchId, uid),
      'read',
      { batchId, uid }
    );
  }

  /**
   * Save action batch with automatic fallback
   */
  public async saveActionBatch(batchId: string, batchData: ActionBatch): Promise<void> {
    return this.executeWithFallback(
      (source) => source.saveActionBatch(batchId, batchData),
      'write',
      { batchId, uid: batchData.uid }
    );
  }

  /**
   * Create new action batch
   */
  public async createActionBatch(batchData: ActionBatch): Promise<string> {
    return this.executeWithFallback(
      async (source) => {
        if (source.createActionBatch) {
          return source.createActionBatch(batchData);
        }
        // Fallback for sources without create method
        const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await source.saveActionBatch(batchId, batchData);
        return batchId;
      },
      'write',
      { uid: batchData.uid }
    );
  }

  /**
   * Get user's action batches
   */
  public async getUserActionBatches(uid: string, limit?: number): Promise<ActionBatch[]> {
    return this.executeWithFallback(
      async (source) => {
        if (source.getUserActionBatches) {
          return source.getUserActionBatches(uid, limit);
        }
        // Return empty array if method not available
        return [];
      },
      'read',
      { uid, limit }
    );
  }

  /**
   * Export current state for snapshots
   */
  public exportState(): Record<string, unknown> {
    return {
      currentSource: this.currentSource,
      config: this.config,
      metrics: this.getMetrics(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Import state from snapshot
   */
  public async importState(state: Record<string, unknown>): Promise<void> {
    if (state.currentSource && state.config) {
      await this.switchDataSource(
        state.currentSource as DataSourceType,
        state.config as Partial<DataSourceConfig>
      );
    }
  }
}

// Export singleton instance getter
export const getDataSourceManager = () => DataSourceManager.getInstance();