/**
 * @fileoverview Checkpoint Manager for persistent scan state
 * Enables scan resumption after failures or timeouts
 */

import { Firestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';

export interface ScanCheckpoint {
  jobId: string;
  uid: string;
  scanId: string;
  pageToken?: string;
  filesProcessed: number;
  bytesProcessed: number;
  lastFileId?: string;
  lastModifiedTime?: string;
  scanType: 'full' | 'delta';
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  metadata: {
    duplicatesFound: number;
    indexUpdates: {
      created: number;
      modified: number;
      deleted: number;
    };
    pagesProcessed: number;
    errors: Array<{
      timestamp: number;
      error: string;
      recoverable: boolean;
    }>;
  };
}

const CHECKPOINT_COLLECTION = 'scanCheckpoints';
const CHECKPOINT_INTERVAL = 5000; // Files
const CHECKPOINT_TTL = 24 * 60 * 60 * 1000; // 24 hours

export class CheckpointManager {
  private db: Firestore;
  private filesProcessedSinceCheckpoint = 0;
  private lastCheckpointTime = Date.now();

  constructor(db: Firestore) {
    this.db = db;
  }

  /**
   * Creates or updates a checkpoint for scan resumption
   */
  async saveCheckpoint(checkpoint: ScanCheckpoint): Promise<void> {
    try {
      const docRef = this.db
        .collection(CHECKPOINT_COLLECTION)
        .doc(`${checkpoint.uid}_${checkpoint.jobId}`);

      await docRef.set({
        ...checkpoint,
        updatedAt: Date.now(),
        expiresAt: Date.now() + CHECKPOINT_TTL,
      }, { merge: true });

      logger.info('Checkpoint saved', {
        jobId: checkpoint.jobId,
        filesProcessed: checkpoint.filesProcessed,
        pageToken: checkpoint.pageToken ? 'present' : 'none',
      });

      this.filesProcessedSinceCheckpoint = 0;
      this.lastCheckpointTime = Date.now();
    } catch (error) {
      logger.error('Failed to save checkpoint', {
        jobId: checkpoint.jobId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Non-fatal: scan continues without checkpoint
    }
  }

  /**
   * Retrieves the latest checkpoint for a job
   */
  async getCheckpoint(uid: string, jobId: string): Promise<ScanCheckpoint | null> {
    try {
      const docRef = this.db
        .collection(CHECKPOINT_COLLECTION)
        .doc(`${uid}_${jobId}`);

      const doc = await docRef.get();
      if (!doc.exists) {
        return null;
      }

      const data = doc.data() as ScanCheckpoint;
      
      // Check if checkpoint has expired
      if (data.expiresAt < Date.now()) {
        logger.warn('Checkpoint expired', { jobId, uid });
        await this.deleteCheckpoint(uid, jobId);
        return null;
      }

      logger.info('Checkpoint retrieved', {
        jobId,
        filesProcessed: data.filesProcessed,
        pageToken: data.pageToken ? 'present' : 'none',
      });

      return data;
    } catch (error) {
      logger.error('Failed to retrieve checkpoint', {
        jobId,
        uid,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Determines if a checkpoint should be saved based on progress
   */
  shouldCheckpoint(filesProcessed: number): boolean {
    this.filesProcessedSinceCheckpoint += filesProcessed;
    
    // Checkpoint every N files or every 30 seconds
    const timeSinceLastCheckpoint = Date.now() - this.lastCheckpointTime;
    return (
      this.filesProcessedSinceCheckpoint >= CHECKPOINT_INTERVAL ||
      timeSinceLastCheckpoint >= 30000
    );
  }

  /**
   * Deletes a checkpoint after successful completion
   */
  async deleteCheckpoint(uid: string, jobId: string): Promise<void> {
    try {
      const docRef = this.db
        .collection(CHECKPOINT_COLLECTION)
        .doc(`${uid}_${jobId}`);

      await docRef.delete();
      logger.info('Checkpoint deleted', { jobId, uid });
    } catch (error) {
      logger.error('Failed to delete checkpoint', {
        jobId,
        uid,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Cleans up expired checkpoints (maintenance task)
   */
  async cleanupExpiredCheckpoints(): Promise<number> {
    try {
      const now = Date.now();
      const expiredQuery = this.db
        .collection(CHECKPOINT_COLLECTION)
        .where('expiresAt', '<', now)
        .limit(100);

      const snapshot = await expiredQuery.get();
      
      if (snapshot.empty) {
        return 0;
      }

      const batch = this.db.batch();
      snapshot.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();
      
      logger.info('Expired checkpoints cleaned', { count: snapshot.size });
      return snapshot.size;
    } catch (error) {
      logger.error('Failed to cleanup expired checkpoints', {
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * Gets checkpoint statistics for monitoring
   */
  async getCheckpointStats(uid?: string): Promise<{
    total: number;
    expired: number;
    active: number;
    oldestActive?: number;
  }> {
    try {
      const now = Date.now();
      let query = this.db.collection(CHECKPOINT_COLLECTION);
      
      if (uid) {
        query = query.where('uid', '==', uid) as any;
      }

      const snapshot = await query.get();
      
      let expired = 0;
      let active = 0;
      let oldestActive: number | undefined;

      snapshot.forEach(doc => {
        const data = doc.data() as ScanCheckpoint;
        if (data.expiresAt < now) {
          expired++;
        } else {
          active++;
          if (!oldestActive || data.createdAt < oldestActive) {
            oldestActive = data.createdAt;
          }
        }
      });

      return {
        total: snapshot.size,
        expired,
        active,
        oldestActive,
      };
    } catch (error) {
      logger.error('Failed to get checkpoint stats', {
        uid,
        error: error instanceof Error ? error.message : String(error),
      });
      return { total: 0, expired: 0, active: 0 };
    }
  }

  /**
   * Validates checkpoint data integrity
   */
  validateCheckpoint(checkpoint: ScanCheckpoint): boolean {
    if (!checkpoint.jobId || !checkpoint.uid || !checkpoint.scanId) {
      logger.warn('Invalid checkpoint: missing required fields');
      return false;
    }

    if (checkpoint.filesProcessed < 0 || checkpoint.bytesProcessed < 0) {
      logger.warn('Invalid checkpoint: negative progress values');
      return false;
    }

    if (checkpoint.expiresAt <= Date.now()) {
      logger.warn('Invalid checkpoint: already expired');
      return false;
    }

    return true;
  }

  /**
   * Creates a recovery checkpoint for error scenarios
   */
  async createRecoveryCheckpoint(
    jobId: string,
    uid: string,
    error: Error,
    lastKnownState: Partial<ScanCheckpoint>
  ): Promise<void> {
    try {
      const checkpoint: ScanCheckpoint = {
        jobId,
        uid,
        scanId: lastKnownState.scanId || `recovery_${Date.now()}`,
        filesProcessed: lastKnownState.filesProcessed || 0,
        bytesProcessed: lastKnownState.bytesProcessed || 0,
        scanType: lastKnownState.scanType || 'full',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        expiresAt: Date.now() + CHECKPOINT_TTL,
        pageToken: lastKnownState.pageToken,
        lastFileId: lastKnownState.lastFileId,
        lastModifiedTime: lastKnownState.lastModifiedTime,
        metadata: {
          duplicatesFound: lastKnownState.metadata?.duplicatesFound || 0,
          indexUpdates: lastKnownState.metadata?.indexUpdates || {
            created: 0,
            modified: 0,
            deleted: 0,
          },
          pagesProcessed: lastKnownState.metadata?.pagesProcessed || 0,
          errors: [
            ...(lastKnownState.metadata?.errors || []),
            {
              timestamp: Date.now(),
              error: error.message,
              recoverable: true,
            },
          ],
        },
      };

      await this.saveCheckpoint(checkpoint);
      logger.info('Recovery checkpoint created', { jobId, uid });
    } catch (saveError) {
      logger.error('Failed to create recovery checkpoint', {
        jobId,
        uid,
        error: saveError instanceof Error ? saveError.message : String(saveError),
      });
    }
  }
}

/**
 * Factory function for creating checkpoint manager
 */
export function createCheckpointManager(db: Firestore): CheckpointManager {
  return new CheckpointManager(db);
}