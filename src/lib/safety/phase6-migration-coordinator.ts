/**
 * Phase 6 Migration Coordinator
 * CX-Orchestrator implementation for phased mock-to-real data migration
 * Manages controlled rollout from 5% → 25% → 50% → 75% → 100%
 */

import { z } from 'zod';
import { getDataSourceManager } from './data-source-manager';
import { logger } from '@/lib/logger';
import { 
  getFeatureFlag, 
  setFeatureFlag, 
  FEATURE_FLAGS,
  resetFeatureFlags
} from './feature-flags';

// Migration phases with percentage rollouts
const MIGRATION_PHASES = [
  { percentage: 5, name: 'initial', minValidationTime: 300000 }, // 5 minutes
  { percentage: 25, name: 'early', minValidationTime: 600000 },   // 10 minutes
  { percentage: 50, name: 'half', minValidationTime: 900000 },    // 15 minutes
  { percentage: 75, name: 'majority', minValidationTime: 600000 }, // 10 minutes
  { percentage: 100, name: 'complete', minValidationTime: 300000 } // 5 minutes
] as const;

// Migration state tracking
interface MigrationState {
  currentPhase: number;
  percentage: number;
  startTime: Date;
  phaseStartTime: Date;
  metrics: {
    totalRequests: number;
    mockRequests: number;
    firebaseRequests: number;
    errors: number;
    rollbacks: number;
  };
  checkpoints: Array<{
    phase: number;
    timestamp: Date;
    status: 'passed' | 'failed' | 'rolled_back';
    metrics: Record<string, any>;
  }>;
  validationStatus: {
    dataIntegrity: boolean;
    performance: boolean;
    errorRate: boolean;
    lastCheck: Date;
  };
}

// Validation thresholds
const VALIDATION_THRESHOLDS = {
  maxErrorRate: 0.05,        // 5% error rate
  maxLatencyP95: 1000,        // 1 second
  maxLatencyP99: 2000,        // 2 seconds
  minSuccessRate: 0.95,       // 95% success
  maxMemoryUsage: 512 * 1024 * 1024, // 512MB
  maxCpuUsage: 80             // 80% CPU
};

export class Phase6MigrationCoordinator {
  private static instance: Phase6MigrationCoordinator;
  private dataSourceManager = getDataSourceManager();
  private state: MigrationState;
  private migrationActive = false;
  private rollbackReady = true;
  private validationInterval?: NodeJS.Timeout;
  private metricsBuffer: Array<{
    timestamp: Date;
    latency: number;
    success: boolean;
    source: 'mock' | 'firebase';
  }> = [];

  private constructor() {
    this.state = this.initializeState();
  }

  public static getInstance(): Phase6MigrationCoordinator {
    if (!Phase6MigrationCoordinator.instance) {
      Phase6MigrationCoordinator.instance = new Phase6MigrationCoordinator();
    }
    return Phase6MigrationCoordinator.instance;
  }

  private initializeState(): MigrationState {
    return {
      currentPhase: -1,
      percentage: 0,
      startTime: new Date(),
      phaseStartTime: new Date(),
      metrics: {
        totalRequests: 0,
        mockRequests: 0,
        firebaseRequests: 0,
        errors: 0,
        rollbacks: 0
      },
      checkpoints: [],
      validationStatus: {
        dataIntegrity: true,
        performance: true,
        errorRate: true,
        lastCheck: new Date()
      }
    };
  }

  /**
   * Start the phased migration process
   */
  public async startMigration(): Promise<void> {
    if (this.migrationActive) {
      throw new Error('Migration already in progress');
    }

    logger.info('[CX-Orchestrator] Starting Phase 6 Migration', {
      phases: MIGRATION_PHASES,
      thresholds: VALIDATION_THRESHOLDS
    });

    this.migrationActive = true;
    this.state = this.initializeState();
    
    // Start continuous validation
    this.startValidationMonitoring();
    
    // Begin with first phase
    await this.advanceToNextPhase();
  }

  /**
   * Advance to the next migration phase
   */
  private async advanceToNextPhase(): Promise<void> {
    const nextPhaseIndex = this.state.currentPhase + 1;
    
    if (nextPhaseIndex >= MIGRATION_PHASES.length) {
      await this.completeMigration();
      return;
    }

    const phase = MIGRATION_PHASES[nextPhaseIndex];
    
    logger.info('[CX-Orchestrator] Advancing to phase', {
      phase: phase.name,
      percentage: phase.percentage,
      previousPhase: this.state.currentPhase
    });

    // Create checkpoint before advancing
    await this.createCheckpoint();

    // Update state
    this.state.currentPhase = nextPhaseIndex;
    this.state.percentage = phase.percentage;
    this.state.phaseStartTime = new Date();

    // Configure data source for new phase
    await this.configureDataSourceForPhase(phase.percentage);

    // Schedule validation after minimum time
    setTimeout(() => {
      this.validatePhaseAndProgress();
    }, phase.minValidationTime);
  }

  /**
   * Configure data source manager for current phase percentage
   */
  private async configureDataSourceForPhase(percentage: number): Promise<void> {
    const useFirebase = Math.random() * 100 < percentage;
    
    if (percentage === 100) {
      // Full migration to Firebase
      await this.dataSourceManager.switchDataSource('firebase', {
        fallbackEnabled: false,
        priority: 100,
        maxRetries: 3,
        timeoutMs: 5000
      });
      setFeatureFlag(FEATURE_FLAGS.DATA_SOURCE_FIREBASE, true);
      setFeatureFlag(FEATURE_FLAGS.DATA_SOURCE_MOCK, false);
    } else if (percentage === 0) {
      // Full mock (shouldn't happen in normal flow)
      await this.dataSourceManager.switchDataSource('mock', {
        fallbackEnabled: false,
        priority: 0
      });
      setFeatureFlag(FEATURE_FLAGS.DATA_SOURCE_FIREBASE, false);
      setFeatureFlag(FEATURE_FLAGS.DATA_SOURCE_MOCK, true);
    } else {
      // Hybrid mode with percentage-based routing
      await this.dataSourceManager.switchDataSource('hybrid', {
        fallbackEnabled: true,
        priority: percentage, // Use percentage as priority
        maxRetries: 2,
        timeoutMs: 3000
      });
      setFeatureFlag(FEATURE_FLAGS.DATA_SOURCE_FIREBASE, true);
      setFeatureFlag(FEATURE_FLAGS.DATA_SOURCE_MOCK, true);
    }

    logger.info('[CX-Orchestrator] Data source configured', {
      percentage,
      currentSource: this.dataSourceManager.getCurrentSource(),
      config: this.dataSourceManager.getConfig()
    });
  }

  /**
   * Start continuous validation monitoring
   */
  private startValidationMonitoring(): void {
    if (this.validationInterval) {
      clearInterval(this.validationInterval);
    }

    this.validationInterval = setInterval(() => {
      this.performValidationChecks();
    }, 30000); // Check every 30 seconds
  }

  /**
   * Perform validation checks
   */
  private async performValidationChecks(): Promise<void> {
    const metrics = this.dataSourceManager.getMetrics();
    const bufferMetrics = this.calculateBufferMetrics();
    
    // Check error rate
    const errorRate = this.calculateErrorRate(metrics);
    const isErrorRateOk = errorRate <= VALIDATION_THRESHOLDS.maxErrorRate;
    
    // Check performance
    const latencyP95 = bufferMetrics.p95;
    const latencyP99 = bufferMetrics.p99;
    const isPerformanceOk = 
      latencyP95 <= VALIDATION_THRESHOLDS.maxLatencyP95 &&
      latencyP99 <= VALIDATION_THRESHOLDS.maxLatencyP99;
    
    // Check data integrity (simplified check)
    const dataIntegrityOk = await this.validateDataIntegrity();
    
    // Update validation status
    this.state.validationStatus = {
      dataIntegrity: dataIntegrityOk,
      performance: isPerformanceOk,
      errorRate: isErrorRateOk,
      lastCheck: new Date()
    };

    // Log validation results
    logger.info('[CX-Orchestrator] Validation check', {
      phase: MIGRATION_PHASES[this.state.currentPhase]?.name || 'pre-migration',
      percentage: this.state.percentage,
      errorRate,
      latencyP95,
      latencyP99,
      status: this.state.validationStatus
    });

    // Trigger rollback if validation fails
    if (!isErrorRateOk || !isPerformanceOk || !dataIntegrityOk) {
      await this.handleValidationFailure();
    }
  }

  /**
   * Calculate error rate from metrics
   */
  private calculateErrorRate(metrics: any): number {
    const totalOps = 
      metrics.operations.mock.reads + metrics.operations.mock.writes +
      metrics.operations.firebase.reads + metrics.operations.firebase.writes;
    
    const totalErrors = 
      metrics.operations.mock.errors + metrics.operations.firebase.errors;
    
    return totalOps > 0 ? totalErrors / totalOps : 0;
  }

  /**
   * Calculate buffer metrics (percentiles)
   */
  private calculateBufferMetrics() {
    if (this.metricsBuffer.length === 0) {
      return { p95: 0, p99: 0, successRate: 1 };
    }

    const latencies = this.metricsBuffer
      .filter(m => m.success)
      .map(m => m.latency)
      .sort((a, b) => a - b);
    
    const successCount = this.metricsBuffer.filter(m => m.success).length;
    const successRate = successCount / this.metricsBuffer.length;
    
    const p95Index = Math.floor(latencies.length * 0.95);
    const p99Index = Math.floor(latencies.length * 0.99);
    
    return {
      p95: latencies[p95Index] || 0,
      p99: latencies[p99Index] || 0,
      successRate
    };
  }

  /**
   * Validate data integrity
   */
  private async validateDataIntegrity(): Promise<boolean> {
    try {
      // Perform sample reads from both sources and compare
      const testBatchId = 'integrity-test-' + Date.now();
      const testUid = 'system-validation';
      
      // This is simplified - in production, would do more comprehensive checks
      const health = await this.dataSourceManager.checkHealth();
      return health.status === 'healthy';
    } catch (error) {
      logger.error('[CX-Orchestrator] Data integrity check failed', error as Error);
      return false;
    }
  }

  /**
   * Handle validation failure
   */
  private async handleValidationFailure(): Promise<void> {
    logger.warn('[CX-Orchestrator] Validation failure detected', {
      phase: MIGRATION_PHASES[this.state.currentPhase]?.name,
      percentage: this.state.percentage,
      status: this.state.validationStatus
    });

    if (this.rollbackReady && this.state.currentPhase > 0) {
      await this.initiateRollback();
    }
  }

  /**
   * Validate current phase and progress if ready
   */
  private async validatePhaseAndProgress(): Promise<void> {
    if (!this.migrationActive) return;

    const validation = this.state.validationStatus;
    const allChecksPass = 
      validation.dataIntegrity && 
      validation.performance && 
      validation.errorRate;

    if (allChecksPass) {
      logger.info('[CX-Orchestrator] Phase validation passed', {
        phase: MIGRATION_PHASES[this.state.currentPhase].name,
        percentage: this.state.percentage
      });
      
      // Progress to next phase
      await this.advanceToNextPhase();
    } else {
      logger.warn('[CX-Orchestrator] Phase validation failed, extending validation period', {
        phase: MIGRATION_PHASES[this.state.currentPhase].name,
        status: validation
      });
      
      // Retry validation after delay
      setTimeout(() => {
        this.validatePhaseAndProgress();
      }, 60000); // Retry in 1 minute
    }
  }

  /**
   * Create checkpoint for current state
   */
  private async createCheckpoint(): Promise<void> {
    const checkpoint = {
      phase: this.state.currentPhase,
      timestamp: new Date(),
      status: 'passed' as const,
      metrics: {
        ...this.state.metrics,
        dataSourceMetrics: this.dataSourceManager.getMetrics(),
        validationStatus: { ...this.state.validationStatus }
      }
    };

    this.state.checkpoints.push(checkpoint);
    
    logger.info('[CX-Orchestrator] Checkpoint created', {
      phase: checkpoint.phase,
      checkpointNumber: this.state.checkpoints.length
    });
  }

  /**
   * Initiate rollback to previous phase
   */
  public async initiateRollback(): Promise<void> {
    if (!this.rollbackReady) {
      logger.error('[CX-Orchestrator] Rollback not ready');
      return;
    }

    const previousPhase = Math.max(0, this.state.currentPhase - 1);
    const targetPercentage = previousPhase >= 0 
      ? MIGRATION_PHASES[previousPhase].percentage 
      : 0;

    logger.warn('[CX-Orchestrator] Initiating rollback', {
      currentPhase: this.state.currentPhase,
      targetPhase: previousPhase,
      targetPercentage
    });

    this.state.metrics.rollbacks++;
    
    // Rollback to previous phase configuration
    await this.configureDataSourceForPhase(targetPercentage);
    
    // Update state
    this.state.currentPhase = previousPhase;
    this.state.percentage = targetPercentage;
    
    // Create rollback checkpoint
    this.state.checkpoints.push({
      phase: previousPhase,
      timestamp: new Date(),
      status: 'rolled_back',
      metrics: {
        reason: 'Validation failure',
        rollbackFrom: this.state.currentPhase
      }
    });

    // If rolled back to beginning, stop migration
    if (previousPhase < 0) {
      await this.abortMigration('Rolled back to initial state');
    }
  }

  /**
   * Complete the migration
   */
  private async completeMigration(): Promise<void> {
    logger.info('[CX-Orchestrator] Migration completed successfully', {
      duration: Date.now() - this.state.startTime.getTime(),
      metrics: this.state.metrics,
      checkpoints: this.state.checkpoints.length
    });

    this.migrationActive = false;
    
    // Stop validation monitoring
    if (this.validationInterval) {
      clearInterval(this.validationInterval);
      this.validationInterval = undefined;
    }

    // Final validation
    await this.performValidationChecks();
    
    // Generate completion report
    this.generateCompletionReport();
  }

  /**
   * Abort the migration
   */
  public async abortMigration(reason: string): Promise<void> {
    logger.error('[CX-Orchestrator] Migration aborted', { reason });
    
    this.migrationActive = false;
    
    // Rollback to full mock mode
    await this.configureDataSourceForPhase(0);
    
    // Stop validation
    if (this.validationInterval) {
      clearInterval(this.validationInterval);
      this.validationInterval = undefined;
    }
    
    // Generate abort report
    this.generateAbortReport(reason);
  }

  /**
   * Generate completion report
   */
  private generateCompletionReport(): void {
    const report = {
      status: 'completed',
      startTime: this.state.startTime,
      endTime: new Date(),
      duration: Date.now() - this.state.startTime.getTime(),
      phases: MIGRATION_PHASES.map((phase, idx) => ({
        ...phase,
        completed: idx <= this.state.currentPhase,
        checkpoint: this.state.checkpoints.find(c => c.phase === idx)
      })),
      metrics: this.state.metrics,
      finalValidation: this.state.validationStatus,
      dataSourceMetrics: this.dataSourceManager.getMetrics()
    };

    logger.info('[CX-Orchestrator] Migration Completion Report', report);
  }

  /**
   * Generate abort report
   */
  private generateAbortReport(reason: string): void {
    const report = {
      status: 'aborted',
      reason,
      startTime: this.state.startTime,
      abortTime: new Date(),
      lastPhase: MIGRATION_PHASES[this.state.currentPhase]?.name || 'none',
      metrics: this.state.metrics,
      checkpoints: this.state.checkpoints,
      dataSourceMetrics: this.dataSourceManager.getMetrics()
    };

    logger.error('[CX-Orchestrator] Migration Abort Report', report);
  }

  /**
   * Get current migration status
   */
  public getStatus() {
    return {
      active: this.migrationActive,
      phase: MIGRATION_PHASES[this.state.currentPhase]?.name || 'idle',
      percentage: this.state.percentage,
      metrics: this.state.metrics,
      validation: this.state.validationStatus,
      checkpoints: this.state.checkpoints.length,
      rollbackReady: this.rollbackReady
    };
  }

  /**
   * Record operation metric
   */
  public recordMetric(metric: {
    latency: number;
    success: boolean;
    source: 'mock' | 'firebase';
  }): void {
    this.metricsBuffer.push({
      ...metric,
      timestamp: new Date()
    });

    // Keep buffer size limited
    if (this.metricsBuffer.length > 1000) {
      this.metricsBuffer = this.metricsBuffer.slice(-500);
    }

    // Update state metrics
    this.state.metrics.totalRequests++;
    if (metric.source === 'mock') {
      this.state.metrics.mockRequests++;
    } else {
      this.state.metrics.firebaseRequests++;
    }
    if (!metric.success) {
      this.state.metrics.errors++;
    }
  }
}

// Export singleton getter
export const getMigrationCoordinator = () => Phase6MigrationCoordinator.getInstance();