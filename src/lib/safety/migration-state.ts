/**
 * @fileoverview Migration State Manager
 * Tracks and manages the state of data migration process
 * Provides checkpoint management and progress tracking
 */

import {
  MigrationState,
  MigrationPhase,
  MigrationCheckpoint,
  MigrationError
} from './types';
import { logger } from '@/lib/logger';
import { getAdminFirestore } from '@/lib/admin';
import type { Firestore } from 'firebase-admin/firestore';
import { EventEmitter } from 'events';

const MIGRATION_STATE_COLLECTION = 'migrationStates';
const CHECKPOINT_COLLECTION = 'migrationCheckpoints';

/**
 * Migration State Manager for tracking migration progress
 */
export class MigrationStateManager extends EventEmitter {
  private static instance: MigrationStateManager;
  private db: Firestore | null = null;
  private currentState: MigrationState;
  private stateUpdateInterval: NodeJS.Timeout | null = null;
  private lastProgressUpdate = Date.now();

  private constructor() {
    super();
    
    // Initialize default state
    this.currentState = this.createInitialState();
    
    try {
      this.db = getAdminFirestore() as Firestore;
      this.loadState();
    } catch (error) {
      logger.warn('Firestore not available, using in-memory state storage', {
        error: (error as Error).message
      });
    }

    // Start state update interval
    this.startStateUpdateInterval();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): MigrationStateManager {
    if (!MigrationStateManager.instance) {
      MigrationStateManager.instance = new MigrationStateManager();
    }
    return MigrationStateManager.instance;
  }

  /**
   * Create initial migration state
   */
  private createInitialState(): MigrationState {
    return {
      id: `migration_${Date.now()}`,
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
      rollbackAvailable: false
    };
  }

  /**
   * Start periodic state updates
   */
  private startStateUpdateInterval(): void {
    this.stateUpdateInterval = setInterval(() => {
      this.updateEstimatedTime();
      this.persistState();
    }, 5000); // Update every 5 seconds
  }

  /**
   * Stop periodic state updates
   */
  private stopStateUpdateInterval(): void {
    if (this.stateUpdateInterval) {
      clearInterval(this.stateUpdateInterval);
      this.stateUpdateInterval = null;
    }
  }

  /**
   * Load state from storage
   */
  private async loadState(): Promise<void> {
    if (!this.db) {
      return;
    }

    try {
      const stateDoc = await this.db
        .collection(MIGRATION_STATE_COLLECTION)
        .orderBy('startedAt', 'desc')
        .limit(1)
        .get();

      if (!stateDoc.empty) {
        const data = stateDoc.docs[0].data();
        this.currentState = {
          ...data,
          id: stateDoc.docs[0].id,
          startedAt: data.startedAt ? new Date(data.startedAt) : null,
          completedAt: data.completedAt ? new Date(data.completedAt) : null,
          checkpoints: await this.loadCheckpoints(stateDoc.docs[0].id)
        } as MigrationState;

        logger.info('Migration state loaded', {
          id: this.currentState.id,
          phase: this.currentState.phase,
          progress: this.currentState.progress.percentage
        });
      }
    } catch (error) {
      logger.error('Failed to load migration state', undefined, {
        error: (error as Error).message
      });
    }
  }

  /**
   * Load checkpoints for a migration
   */
  private async loadCheckpoints(migrationId: string): Promise<MigrationCheckpoint[]> {
    if (!this.db) {
      return [];
    }

    try {
      const checkpoints = await this.db
        .collection(CHECKPOINT_COLLECTION)
        .where('migrationId', '==', migrationId)
        .orderBy('timestamp', 'asc')
        .get();

      return checkpoints.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          timestamp: new Date(data.timestamp)
        } as MigrationCheckpoint;
      });
    } catch (error) {
      logger.error('Failed to load checkpoints', undefined, {
        migrationId,
        error: (error as Error).message
      });
      return [];
    }
  }

  /**
   * Persist current state to storage
   */
  private async persistState(): Promise<void> {
    if (!this.db) {
      return;
    }

    try {
      const stateData = {
        ...this.currentState,
        startedAt: this.currentState.startedAt?.getTime() || null,
        completedAt: this.currentState.completedAt?.getTime() || null,
        updatedAt: Date.now()
      };

      await this.db
        .collection(MIGRATION_STATE_COLLECTION)
        .doc(this.currentState.id)
        .set(stateData, { merge: true });
    } catch (error) {
      logger.error('Failed to persist migration state', undefined, {
        id: this.currentState.id,
        error: (error as Error).message
      });
    }
  }

  /**
   * Start a new migration
   */
  public async startMigration(
    totalFiles: number,
    totalBytes: number
  ): Promise<void> {
    if (this.currentState.phase !== 'not_started' && 
        this.currentState.phase !== 'completed' &&
        this.currentState.phase !== 'failed') {
      throw new Error(`Cannot start migration in phase: ${this.currentState.phase}`);
    }

    this.currentState = {
      ...this.createInitialState(),
      id: `migration_${Date.now()}`,
      phase: 'preparing',
      startedAt: new Date(),
      stats: {
        ...this.currentState.stats,
        filesTotal: totalFiles,
        bytesTotal: totalBytes
      }
    };

    logger.info('Migration started', {
      id: this.currentState.id,
      totalFiles,
      totalBytes
    });

    await this.persistState();
    this.emit('migrationStarted', this.currentState);
  }

  /**
   * Update migration phase
   */
  public async updatePhase(newPhase: MigrationPhase): Promise<void> {
    const oldPhase = this.currentState.phase;
    this.currentState.phase = newPhase;

    if (newPhase === 'completed' || newPhase === 'failed') {
      this.currentState.completedAt = new Date();
      this.stopStateUpdateInterval();
    }

    logger.info('Migration phase updated', {
      from: oldPhase,
      to: newPhase,
      migrationId: this.currentState.id
    });

    await this.createCheckpoint(`Phase transition: ${oldPhase} -> ${newPhase}`);
    await this.persistState();
    this.emit('phaseChanged', { from: oldPhase, to: newPhase });
  }

  /**
   * Update migration progress
   */
  public async updateProgress(
    filesProcessed: number,
    bytesProcessed: number
  ): Promise<void> {
    this.currentState.stats.filesProcessed = filesProcessed;
    this.currentState.stats.bytesProcessed = bytesProcessed;

    // Calculate percentage
    if (this.currentState.stats.filesTotal > 0) {
      this.currentState.progress.current = filesProcessed;
      this.currentState.progress.total = this.currentState.stats.filesTotal;
      this.currentState.progress.percentage = Math.round(
        (filesProcessed / this.currentState.stats.filesTotal) * 100
      );
    }

    // Throttle progress events (max once per second)
    const now = Date.now();
    if (now - this.lastProgressUpdate > 1000) {
      this.lastProgressUpdate = now;
      this.emit('progressUpdated', this.currentState.progress);
    }

    // Persist less frequently
    if (filesProcessed % 100 === 0) {
      await this.persistState();
    }
  }

  /**
   * Update estimated time remaining
   */
  private updateEstimatedTime(): void {
    if (!this.currentState.startedAt || this.currentState.progress.percentage === 0) {
      return;
    }

    const elapsedMs = Date.now() - this.currentState.startedAt.getTime();
    const progressRate = this.currentState.progress.percentage / 100;
    
    if (progressRate > 0) {
      const totalEstimatedMs = elapsedMs / progressRate;
      const remainingMs = totalEstimatedMs - elapsedMs;
      this.currentState.progress.estimatedTimeRemaining = Math.max(0, Math.round(remainingMs));
    }
  }

  /**
   * Add an error to the migration state
   */
  public async addError(
    error: string,
    severity: MigrationError['severity'] = 'error',
    context?: Record<string, unknown>
  ): Promise<void> {
    const migrationError: MigrationError = {
      timestamp: new Date(),
      phase: this.currentState.phase,
      code: `ERR_${this.currentState.phase.toUpperCase()}_${Date.now()}`,
      message: error,
      severity,
      context
    };

    this.currentState.errors.push(migrationError);

    if (severity === 'error' || severity === 'critical') {
      this.currentState.stats.errorsCount++;
    } else {
      this.currentState.stats.warningsCount++;
    }

    logger[severity === 'warning' ? 'warn' : 'error']('Migration error', {
      error: migrationError.message,
      severity,
      phase: this.currentState.phase,
      context
    });

    if (severity === 'critical') {
      await this.updatePhase('failed');
    }

    await this.persistState();
    this.emit('errorOccurred', migrationError);
  }

  /**
   * Create a checkpoint
   */
  public async createCheckpoint(
    description?: string
  ): Promise<MigrationCheckpoint> {
    const checkpoint: MigrationCheckpoint = {
      id: `checkpoint_${Date.now()}`,
      phase: this.currentState.phase,
      timestamp: new Date(),
      state: {
        progress: { ...this.currentState.progress },
        stats: { ...this.currentState.stats },
        description
      },
      canRollbackTo: true
    };

    this.currentState.checkpoints.push(checkpoint);
    this.currentState.rollbackAvailable = true;

    // Store checkpoint
    if (this.db) {
      try {
        await this.db.collection(CHECKPOINT_COLLECTION).doc(checkpoint.id).set({
          ...checkpoint,
          migrationId: this.currentState.id,
          timestamp: checkpoint.timestamp.getTime()
        });
      } catch (error) {
        logger.error('Failed to store checkpoint', undefined, {
          checkpointId: checkpoint.id,
          error: (error as Error).message
        });
      }
    }

    logger.info('Checkpoint created', {
      id: checkpoint.id,
      phase: checkpoint.phase,
      description
    });

    this.emit('checkpointCreated', checkpoint);
    return checkpoint;
  }

  /**
   * Get current migration state
   */
  public getState(): MigrationState {
    return { ...this.currentState };
  }

  /**
   * Get migration statistics
   */
  public getStatistics(): MigrationState['stats'] {
    return { ...this.currentState.stats };
  }

  /**
   * Get migration progress
   */
  public getProgress(): MigrationState['progress'] {
    return { ...this.currentState.progress };
  }

  /**
   * Check if migration is active
   */
  public isActive(): boolean {
    return this.currentState.phase !== 'not_started' &&
           this.currentState.phase !== 'completed' &&
           this.currentState.phase !== 'failed';
  }

  /**
   * Check if migration can be resumed
   */
  public canResume(): boolean {
    return this.currentState.phase === 'migration' &&
           this.currentState.checkpoints.length > 0;
  }

  /**
   * Resume migration from last checkpoint
   */
  public async resumeFromCheckpoint(
    checkpointId?: string
  ): Promise<void> {
    const checkpoint = checkpointId
      ? this.currentState.checkpoints.find(c => c.id === checkpointId)
      : this.currentState.checkpoints[this.currentState.checkpoints.length - 1];

    if (!checkpoint) {
      throw new Error('No checkpoint found to resume from');
    }

    // Restore state from checkpoint
    this.currentState.progress = checkpoint.state.progress as MigrationState['progress'];
    this.currentState.stats = checkpoint.state.stats as MigrationState['stats'];
    this.currentState.phase = checkpoint.phase;

    logger.info('Migration resumed from checkpoint', {
      checkpointId: checkpoint.id,
      phase: checkpoint.phase,
      progress: this.currentState.progress.percentage
    });

    await this.persistState();
    this.emit('migrationResumed', checkpoint);
  }

  /**
   * Cancel the current migration
   */
  public async cancelMigration(reason?: string): Promise<void> {
    if (!this.isActive()) {
      throw new Error('No active migration to cancel');
    }

    await this.addError(
      reason || 'Migration cancelled by user',
      'warning',
      { cancelledAt: new Date().toISOString() }
    );

    await this.updatePhase('failed');
    this.emit('migrationCancelled', { reason });
  }

  /**
   * Get migration history
   */
  public async getMigrationHistory(limit = 10): Promise<MigrationState[]> {
    if (!this.db) {
      return [this.currentState];
    }

    try {
      const history = await this.db
        .collection(MIGRATION_STATE_COLLECTION)
        .orderBy('startedAt', 'desc')
        .limit(limit)
        .get();

      return history.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          startedAt: data.startedAt ? new Date(data.startedAt) : null,
          completedAt: data.completedAt ? new Date(data.completedAt) : null
        } as MigrationState;
      });
    } catch (error) {
      logger.error('Failed to get migration history', undefined, {
        error: (error as Error).message
      });
      return [];
    }
  }

  /**
   * Export state for snapshots
   */
  public exportState(): MigrationState {
    return { ...this.currentState };
  }

  /**
   * Import state from snapshot
   */
  public async importState(state: MigrationState): Promise<void> {
    this.currentState = { ...state };
    await this.persistState();
    this.emit('stateImported', state);
  }

  /**
   * Cleanup when shutting down
   */
  public destroy(): void {
    this.stopStateUpdateInterval();
    this.removeAllListeners();
  }
}

// Export singleton instance getter
export const getMigrationStateManager = () => MigrationStateManager.getInstance();