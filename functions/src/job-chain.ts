/**
 * @fileoverview Job Chaining system for long-running scans
 * Handles scans that exceed Cloud Function timeout limits
 */

import { Firestore } from 'firebase-admin/firestore';
import { logger } from './logger';
import { ScanCheckpoint } from './checkpoint-manager';

export interface ChainedJob {
  id: string;
  parentJobId: string;
  chainIndex: number;
  uid: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  checkpoint?: ScanCheckpoint;
  results?: {
    filesProcessed: number;
    bytesProcessed: number;
    pagesProcessed: number;
  };
  error?: string;
}

export interface JobChainConfig {
  maxExecutionTime: number; // milliseconds
  maxFilesPerChain: number;
  maxChainLength: number;
  timeoutBuffer: number; // milliseconds before function timeout
}

const DEFAULT_CONFIG: JobChainConfig = {
  maxExecutionTime: 480000, // 8 minutes (leaving 1min buffer for 9min timeout)
  maxFilesPerChain: 50000,
  maxChainLength: 20,
  timeoutBuffer: 60000, // 1 minute
};

const JOB_CHAINS_COLLECTION = 'jobChains';

export class JobChainManager {
  private db: Firestore;
  private config: JobChainConfig;
  private startTime: number;
  private filesProcessedInChain: number = 0;

  constructor(db: Firestore, config?: Partial<JobChainConfig>) {
    this.db = db;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startTime = Date.now();
  }

  /**
   * Checks if current execution should be terminated and chained
   */
  shouldChainJob(filesProcessed: number): boolean {
    const executionTime = Date.now() - this.startTime;
    this.filesProcessedInChain += filesProcessed;

    // Chain if approaching timeout or file limit
    return (
      executionTime >= this.config.maxExecutionTime ||
      this.filesProcessedInChain >= this.config.maxFilesPerChain
    );
  }

  /**
   * Creates a chained job to continue processing
   */
  async createChainedJob(
    parentJobId: string,
    uid: string,
    checkpoint: ScanCheckpoint
  ): Promise<string> {
    try {
      // Get parent chain info
      const parentChain = await this.getJobChain(parentJobId);
      const chainIndex = parentChain ? parentChain.chainIndex + 1 : 1;

      // Check chain length limit
      if (chainIndex > this.config.maxChainLength) {
        throw new Error(`Maximum chain length (${this.config.maxChainLength}) exceeded`);
      }

      const chainedJob: ChainedJob = {
        id: `${parentJobId}_chain_${chainIndex}`,
        parentJobId,
        chainIndex,
        uid,
        status: 'pending',
        createdAt: Date.now(),
        checkpoint,
      };

      // Save chained job
      await this.db
        .collection(JOB_CHAINS_COLLECTION)
        .doc(chainedJob.id)
        .set(chainedJob);

      // Create scan job that will trigger the function
      await this.db.collection('scanJobs').doc(chainedJob.id).set({
        uid,
        status: 'pending',
        type: 'chained_scan',
        parentJobId,
        chainIndex,
        checkpoint,
        config: {
          resumeFromCheckpoint: true,
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      logger.info('Chained job created', {
        chainedJobId: chainedJob.id,
        parentJobId,
        chainIndex,
        filesProcessed: checkpoint.filesProcessed,
      });

      return chainedJob.id;
    } catch (error) {
      logger.error('Failed to create chained job', {
        parentJobId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Gets job chain information
   */
  async getJobChain(jobId: string): Promise<ChainedJob | null> {
    try {
      const doc = await this.db
        .collection(JOB_CHAINS_COLLECTION)
        .doc(jobId)
        .get();

      if (!doc.exists) {
        return null;
      }

      return doc.data() as ChainedJob;
    } catch (error) {
      logger.error('Failed to get job chain', {
        jobId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Gets all jobs in a chain
   */
  async getFullChain(rootJobId: string): Promise<ChainedJob[]> {
    try {
      const chain: ChainedJob[] = [];
      
      // Get root job
      const rootChain = await this.getJobChain(rootJobId);
      if (rootChain) {
        chain.push(rootChain);
      }

      // Get all chained jobs
      const snapshot = await this.db
        .collection(JOB_CHAINS_COLLECTION)
        .where('parentJobId', '==', rootJobId)
        .orderBy('chainIndex', 'asc')
        .get();

      snapshot.forEach(doc => {
        chain.push(doc.data() as ChainedJob);
      });

      // Recursively get chains of chains
      for (const job of [...chain]) {
        if (job.id !== rootJobId) {
          const subChain = await this.getFullChain(job.id);
          chain.push(...subChain.filter(j => !chain.find(c => c.id === j.id)));
        }
      }

      return chain.sort((a, b) => a.chainIndex - b.chainIndex);
    } catch (error) {
      logger.error('Failed to get full chain', {
        rootJobId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Updates chain job status
   */
  async updateChainStatus(
    jobId: string,
    status: ChainedJob['status'],
    results?: ChainedJob['results'],
    error?: string
  ): Promise<void> {
    try {
      const update: Partial<ChainedJob> = {
        status,
      };

      if (status === 'running' && !update.startedAt) {
        update.startedAt = Date.now();
      }

      if (status === 'completed' || status === 'failed') {
        update.completedAt = Date.now();
      }

      if (results) {
        update.results = results;
      }

      if (error) {
        update.error = error;
      }

      await this.db
        .collection(JOB_CHAINS_COLLECTION)
        .doc(jobId)
        .update(update);

      logger.info('Chain status updated', {
        jobId,
        status,
        results,
      });
    } catch (error) {
      logger.error('Failed to update chain status', {
        jobId,
        status,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Aggregates results from all jobs in a chain
   */
  async aggregateChainResults(rootJobId: string): Promise<{
    totalFilesProcessed: number;
    totalBytesProcessed: number;
    totalPagesProcessed: number;
    chainLength: number;
    totalDuration: number;
    status: 'completed' | 'partial' | 'failed';
  }> {
    try {
      const chain = await this.getFullChain(rootJobId);
      
      let totalFilesProcessed = 0;
      let totalBytesProcessed = 0;
      let totalPagesProcessed = 0;
      let earliestStart = Infinity;
      let latestEnd = 0;
      let hasFailure = false;
      let hasPending = false;

      for (const job of chain) {
        if (job.results) {
          totalFilesProcessed += job.results.filesProcessed || 0;
          totalBytesProcessed += job.results.bytesProcessed || 0;
          totalPagesProcessed += job.results.pagesProcessed || 0;
        }

        if (job.startedAt && job.startedAt < earliestStart) {
          earliestStart = job.startedAt;
        }

        if (job.completedAt && job.completedAt > latestEnd) {
          latestEnd = job.completedAt;
        }

        if (job.status === 'failed') {
          hasFailure = true;
        }

        if (job.status === 'pending' || job.status === 'running') {
          hasPending = true;
        }
      }

      const totalDuration = latestEnd > 0 && earliestStart < Infinity
        ? latestEnd - earliestStart
        : 0;

      const status = hasFailure ? 'failed' : hasPending ? 'partial' : 'completed';

      logger.info('Chain results aggregated', {
        rootJobId,
        chainLength: chain.length,
        totalFilesProcessed,
        status,
      });

      return {
        totalFilesProcessed,
        totalBytesProcessed,
        totalPagesProcessed,
        chainLength: chain.length,
        totalDuration,
        status,
      };
    } catch (error) {
      logger.error('Failed to aggregate chain results', {
        rootJobId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        totalFilesProcessed: 0,
        totalBytesProcessed: 0,
        totalPagesProcessed: 0,
        chainLength: 0,
        totalDuration: 0,
        status: 'failed',
      };
    }
  }

  /**
   * Cleans up completed chains older than retention period
   */
  async cleanupOldChains(retentionDays: number = 7): Promise<number> {
    try {
      const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
      
      const snapshot = await this.db
        .collection(JOB_CHAINS_COLLECTION)
        .where('completedAt', '<', cutoffTime)
        .where('status', 'in', ['completed', 'failed'])
        .limit(100)
        .get();

      if (snapshot.empty) {
        return 0;
      }

      const batch = this.db.batch();
      snapshot.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      logger.info('Old chains cleaned up', {
        count: snapshot.size,
        retentionDays,
      });

      return snapshot.size;
    } catch (error) {
      logger.error('Failed to cleanup old chains', {
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * Gets remaining execution time before timeout
   */
  getRemainingTime(): number {
    const elapsed = Date.now() - this.startTime;
    return Math.max(0, this.config.maxExecutionTime - elapsed);
  }

  /**
   * Estimates if there's enough time to process more files
   */
  hasTimeForMoreFiles(averageTimePerFile: number, batchSize: number): boolean {
    const remainingTime = this.getRemainingTime();
    const estimatedTime = averageTimePerFile * batchSize;
    
    // Leave buffer for checkpoint save and cleanup
    return remainingTime > (estimatedTime + this.config.timeoutBuffer);
  }
}

/**
 * Factory function for creating job chain manager
 */
export function createJobChainManager(
  db: Firestore,
  config?: Partial<JobChainConfig>
): JobChainManager {
  return new JobChainManager(db, config);
}