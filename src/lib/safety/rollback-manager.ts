/**
 * @fileoverview Rollback Infrastructure Manager
 * Provides snapshot creation, storage, and rollback capabilities
 * Ensures <5 minute recovery time as per requirements
 */

import { 
  RollbackSnapshot, 
  RollbackPlan, 
  RollbackStep,
  MigrationState,
  DataSourceType 
} from './types';
import { exportFeatureFlagState, importFeatureFlagState } from './feature-flags';
import { getDataSourceManager } from './data-source-manager';
import { logger } from '@/lib/logger';
import { getAdminFirestore } from '@/lib/admin';
import type { Firestore } from 'firebase-admin/firestore';

const SNAPSHOT_COLLECTION = 'safetySnapshots';
const MAX_SNAPSHOTS = 10; // Keep last 10 snapshots
const SNAPSHOT_TTL_DAYS = 7; // Keep snapshots for 7 days

/**
 * Rollback Manager for managing system state snapshots and recovery
 */
export class RollbackManager {
  private static instance: RollbackManager;
  private db: Firestore | null = null;
  private currentSnapshot: RollbackSnapshot | null = null;
  private snapshotHistory: RollbackSnapshot[] = [];
  private isRollbackInProgress = false;

  private constructor() {
    try {
      this.db = getAdminFirestore() as Firestore;
      this.loadSnapshotHistory();
    } catch (error) {
      logger.warn('Firestore not available, using in-memory snapshot storage', {
        error: (error as Error).message
      });
    }
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): RollbackManager {
    if (!RollbackManager.instance) {
      RollbackManager.instance = new RollbackManager();
    }
    return RollbackManager.instance;
  }

  /**
   * Load snapshot history from storage
   */
  private async loadSnapshotHistory(): Promise<void> {
    if (!this.db) {
      return;
    }

    try {
      const snapshots = await this.db
        .collection(SNAPSHOT_COLLECTION)
        .orderBy('createdAt', 'desc')
        .limit(MAX_SNAPSHOTS)
        .get();

      this.snapshotHistory = snapshots.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          createdAt: new Date(data.createdAt)
        } as RollbackSnapshot;
      });

      if (this.snapshotHistory.length > 0) {
        this.currentSnapshot = this.snapshotHistory[0];
      }

      logger.info('Snapshot history loaded', {
        count: this.snapshotHistory.length,
        latestSnapshot: this.currentSnapshot?.id
      });
    } catch (error) {
      logger.error('Failed to load snapshot history', undefined, {
        error: (error as Error).message
      });
    }
  }

  /**
   * Create a new snapshot of the current system state
   */
  public async createSnapshot(
    phase: MigrationState['phase'],
    metadata?: Record<string, unknown>
  ): Promise<RollbackSnapshot> {
    try {
      const dataSourceManager = getDataSourceManager();
      const snapshot: RollbackSnapshot = {
        id: `snapshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAt: new Date(),
        phase,
        dataSource: dataSourceManager.getCurrentSource(),
        state: {
          featureFlags: exportFeatureFlagState(),
          migrationState: await this.getCurrentMigrationState(),
          dataSnapshot: {
            dataSourceConfig: dataSourceManager.getConfig(),
            dataSourceMetrics: dataSourceManager.getMetrics(),
            ...dataSourceManager.exportState()
          }
        },
        metadata: {
          version: process.env.npm_package_version || '1.0.0',
          size: 0, // Will be calculated
          checksum: '', // Will be calculated
          ...metadata
        }
      };

      // Calculate snapshot size (rough estimate)
      const snapshotString = JSON.stringify(snapshot);
      snapshot.metadata.size = new TextEncoder().encode(snapshotString).length;
      
      // Simple checksum
      snapshot.metadata.checksum = await this.calculateChecksum(snapshotString);

      // Store snapshot
      await this.storeSnapshot(snapshot);

      // Update current and history
      this.currentSnapshot = snapshot;
      this.snapshotHistory.unshift(snapshot);
      
      // Trim history
      if (this.snapshotHistory.length > MAX_SNAPSHOTS) {
        const removed = this.snapshotHistory.splice(MAX_SNAPSHOTS);
        // Delete old snapshots from storage
        for (const old of removed) {
          await this.deleteSnapshot(old.id);
        }
      }

      logger.info('Snapshot created', {
        id: snapshot.id,
        phase,
        size: snapshot.metadata.size,
        checksum: snapshot.metadata.checksum
      });

      return snapshot;
    } catch (error) {
      logger.error('Failed to create snapshot', undefined, {
        phase,
        error: (error as Error).message
      });
      throw error;
    }
  }

  /**
   * Store snapshot in persistent storage
   */
  private async storeSnapshot(snapshot: RollbackSnapshot): Promise<void> {
    if (!this.db) {
      // In-memory storage only
      return;
    }

    try {
      await this.db.collection(SNAPSHOT_COLLECTION).doc(snapshot.id).set({
        ...snapshot,
        createdAt: snapshot.createdAt.getTime()
      });
    } catch (error) {
      logger.error('Failed to store snapshot', undefined, {
        id: snapshot.id,
        error: (error as Error).message
      });
      throw error;
    }
  }

  /**
   * Delete snapshot from storage
   */
  private async deleteSnapshot(snapshotId: string): Promise<void> {
    if (!this.db) {
      return;
    }

    try {
      await this.db.collection(SNAPSHOT_COLLECTION).doc(snapshotId).delete();
      logger.info('Snapshot deleted', { id: snapshotId });
    } catch (error) {
      logger.warn('Failed to delete snapshot', { 
        id: snapshotId,
        error: (error as Error).message 
      });
    }
  }

  /**
   * Get current migration state (placeholder - will be replaced by MigrationStateManager)
   */
  private async getCurrentMigrationState(): Promise<MigrationState> {
    // This will be replaced with actual migration state from MigrationStateManager
    return {
      id: 'current',
      phase: 'not_started',
      startedAt: null,
      completedAt: null,
      progress: {
        current: 0,
        total: 0,
        percentage: 0,
        estimatedTimeRemaining: 0
      },
      stats: {
        filesProcessed: 0,
        filesTotal: 0,
        errorsCount: 0,
        warningsCount: 0,
        bytesProcessed: 0,
        bytesTotal: 0
      },
      checkpoints: [],
      errors: [],
      rollbackAvailable: true
    };
  }

  /**
   * Calculate checksum for snapshot data
   */
  private async calculateChecksum(data: string): Promise<string> {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(data);
      const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } else {
      // Fallback for Node.js
      const crypto = require('crypto');
      return crypto.createHash('sha256').update(data).digest('hex');
    }
  }

  /**
   * Create a rollback plan for a specific snapshot
   */
  public async createRollbackPlan(snapshotId: string): Promise<RollbackPlan> {
    const snapshot = this.snapshotHistory.find(s => s.id === snapshotId);
    
    if (!snapshot) {
      throw new Error(`Snapshot ${snapshotId} not found`);
    }

    const steps: RollbackStep[] = [
      {
        order: 1,
        action: 'pause_operations',
        target: 'all_services',
        estimatedDuration: 5000, // 5 seconds
        critical: true,
        rollbackOnFailure: false
      },
      {
        order: 2,
        action: 'create_backup',
        target: 'current_state',
        estimatedDuration: 10000, // 10 seconds
        critical: false,
        rollbackOnFailure: false
      },
      {
        order: 3,
        action: 'restore_feature_flags',
        target: 'feature_flag_system',
        estimatedDuration: 1000, // 1 second
        critical: true,
        rollbackOnFailure: true
      },
      {
        order: 4,
        action: 'restore_data_source',
        target: 'data_source_manager',
        estimatedDuration: 5000, // 5 seconds
        critical: true,
        rollbackOnFailure: true
      },
      {
        order: 5,
        action: 'restore_migration_state',
        target: 'migration_state_manager',
        estimatedDuration: 2000, // 2 seconds
        critical: true,
        rollbackOnFailure: true
      },
      {
        order: 6,
        action: 'validate_restoration',
        target: 'validation_framework',
        estimatedDuration: 10000, // 10 seconds
        critical: true,
        rollbackOnFailure: true
      },
      {
        order: 7,
        action: 'resume_operations',
        target: 'all_services',
        estimatedDuration: 5000, // 5 seconds
        critical: true,
        rollbackOnFailure: false
      }
    ];

    const totalDuration = steps.reduce((sum, step) => sum + step.estimatedDuration, 0);

    const plan: RollbackPlan = {
      snapshotId,
      estimatedDuration: totalDuration,
      steps,
      validationRequired: true
    };

    logger.info('Rollback plan created', {
      snapshotId,
      steps: steps.length,
      estimatedDuration: `${totalDuration / 1000}s`
    });

    return plan;
  }

  /**
   * Execute rollback to a specific snapshot
   */
  public async executeRollback(
    snapshotId: string,
    options: {
      validateFirst?: boolean;
      force?: boolean;
      dryRun?: boolean;
    } = {}
  ): Promise<{
    success: boolean;
    duration: number;
    errors: Error[];
  }> {
    if (this.isRollbackInProgress && !options.force) {
      throw new Error('Rollback already in progress');
    }

    const startTime = Date.now();
    const errors: Error[] = [];
    this.isRollbackInProgress = true;

    try {
      const snapshot = this.snapshotHistory.find(s => s.id === snapshotId);
      
      if (!snapshot) {
        throw new Error(`Snapshot ${snapshotId} not found`);
      }

      logger.info('Starting rollback', {
        snapshotId,
        options,
        targetPhase: snapshot.phase
      });

      // Create rollback plan
      const plan = await this.createRollbackPlan(snapshotId);

      // Execute each step
      for (const step of plan.steps) {
        try {
          logger.info(`Executing rollback step ${step.order}`, {
            action: step.action,
            target: step.target
          });

          if (!options.dryRun) {
            await this.executeRollbackStep(step, snapshot);
          }
        } catch (error) {
          const err = error as Error;
          errors.push(err);
          
          logger.error(`Rollback step ${step.order} failed`, undefined, {
            action: step.action,
            error: err.message
          });

          if (step.critical && step.rollbackOnFailure) {
            throw new Error(`Critical step failed: ${step.action}`);
          }
        }
      }

      // Validate if required
      if (options.validateFirst && !options.dryRun) {
        const validationResult = await this.validateRollback(snapshot);
        if (!validationResult.success) {
          errors.push(new Error(`Validation failed: ${validationResult.message}`));
        }
      }

      const duration = Date.now() - startTime;
      const success = errors.length === 0;

      logger.info('Rollback completed', {
        success,
        duration: `${duration / 1000}s`,
        errors: errors.length
      });

      return {
        success,
        duration,
        errors
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Rollback failed', undefined, {
        snapshotId,
        duration: `${duration / 1000}s`,
        error: (error as Error).message
      });

      return {
        success: false,
        duration,
        errors: [...errors, error as Error]
      };
    } finally {
      this.isRollbackInProgress = false;
    }
  }

  /**
   * Execute a single rollback step
   */
  private async executeRollbackStep(
    step: RollbackStep,
    snapshot: RollbackSnapshot
  ): Promise<void> {
    switch (step.action) {
      case 'pause_operations':
        // Pause all operations (would integrate with actual services)
        await this.delay(100);
        break;

      case 'create_backup':
        // Create backup of current state before rollback
        await this.createSnapshot('rollback', {
          reason: 'Pre-rollback backup',
          targetSnapshot: snapshot.id
        });
        break;

      case 'restore_feature_flags':
        // Restore feature flags
        importFeatureFlagState(snapshot.state.featureFlags);
        break;

      case 'restore_data_source':
        // Restore data source configuration
        const dataSourceManager = getDataSourceManager();
        await dataSourceManager.importState(snapshot.state.dataSnapshot);
        break;

      case 'restore_migration_state':
        // This will be implemented when MigrationStateManager is ready
        await this.delay(100);
        break;

      case 'validate_restoration':
        // Validate the restored state
        const result = await this.validateRollback(snapshot);
        if (!result.success) {
          throw new Error(`Validation failed: ${result.message}`);
        }
        break;

      case 'resume_operations':
        // Resume all operations
        await this.delay(100);
        break;

      default:
        logger.warn('Unknown rollback step', { action: step.action });
    }
  }

  /**
   * Validate rollback was successful
   */
  private async validateRollback(snapshot: RollbackSnapshot): Promise<{
    success: boolean;
    message: string;
  }> {
    try {
      const dataSourceManager = getDataSourceManager();
      
      // Check data source matches
      if (dataSourceManager.getCurrentSource() !== snapshot.dataSource) {
        return {
          success: false,
          message: `Data source mismatch: expected ${snapshot.dataSource}, got ${dataSourceManager.getCurrentSource()}`
        };
      }

      // Check feature flags match
      const currentFlags = exportFeatureFlagState();
      const expectedFlags = snapshot.state.featureFlags;
      
      for (const [key, value] of Object.entries(expectedFlags)) {
        if (currentFlags[key] !== value) {
          return {
            success: false,
            message: `Feature flag mismatch: ${key} expected ${value}, got ${currentFlags[key]}`
          };
        }
      }

      // Additional validation would go here

      return {
        success: true,
        message: 'Rollback validation successful'
      };
    } catch (error) {
      return {
        success: false,
        message: `Validation error: ${(error as Error).message}`
      };
    }
  }

  /**
   * Get available snapshots
   */
  public getAvailableSnapshots(): RollbackSnapshot[] {
    return [...this.snapshotHistory];
  }

  /**
   * Get current snapshot
   */
  public getCurrentSnapshot(): RollbackSnapshot | null {
    return this.currentSnapshot;
  }

  /**
   * Check if rollback is available
   */
  public isRollbackAvailable(): boolean {
    return this.snapshotHistory.length > 0 && !this.isRollbackInProgress;
  }

  /**
   * Get rollback status
   */
  public getRollbackStatus(): {
    available: boolean;
    inProgress: boolean;
    lastSnapshot?: RollbackSnapshot;
    snapshotCount: number;
  } {
    return {
      available: this.isRollbackAvailable(),
      inProgress: this.isRollbackInProgress,
      lastSnapshot: this.currentSnapshot || undefined,
      snapshotCount: this.snapshotHistory.length
    };
  }

  /**
   * Clean up old snapshots
   */
  public async cleanupOldSnapshots(): Promise<number> {
    if (!this.db) {
      return 0;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - SNAPSHOT_TTL_DAYS);

    try {
      const oldSnapshots = await this.db
        .collection(SNAPSHOT_COLLECTION)
        .where('createdAt', '<', cutoffDate.getTime())
        .get();

      const batch = this.db.batch();
      oldSnapshots.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      logger.info('Old snapshots cleaned up', {
        count: oldSnapshots.size,
        cutoffDate: cutoffDate.toISOString()
      });

      return oldSnapshots.size;
    } catch (error) {
      logger.error('Failed to cleanup old snapshots', undefined, {
        error: (error as Error).message
      });
      return 0;
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance getter
export const getRollbackManager = () => RollbackManager.getInstance();