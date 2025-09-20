/**
 * @fileoverview Production Firebase database service for DriveMind.
 * Replaces mock-db.ts with real Firestore operations.
 * All operations include proper error handling, validation, and logging.
 */

import { z } from 'zod';
import { getAdminFirestore } from '@/lib/admin';
import type { Firestore } from 'firebase-admin/firestore';
import { publishFileIndex } from '@/lib/dataconnect';
import { ActionBatchSchema, ProposeRulesOutputSchema } from '@/lib/ai-types';
import { logger } from '@/lib/logger';

// Use Firebase Admin Firestore for server-side operations
const getDb = (): Firestore => getAdminFirestore() as Firestore;

// Firestore collections
const COLLECTIONS = {
  ACTION_BATCHES: 'actionBatches',
  RULES: 'rules',
  SNAPSHOTS: 'snapshots',
  ANALYTICS: 'analytics',
  HEALTH_CHECKS: 'healthChecks',
  SIMILARITY_CLUSTERS: 'similarityClusters',
  VERSION_LINKS: 'versionLinks',
  SCAN_JOBS: 'scanJobs',
  FILE_INDEX: 'fileIndex',
  SCAN_DELTAS: 'scanDeltas'
} as const;

type ActionBatch = z.infer<typeof ActionBatchSchema>;
type Rule = z.infer<typeof ProposeRulesOutputSchema>;

// Helper: normalize Firestore timestamp/number/string to Date
function toDate(value: any, fallback: Date = new Date()): Date {
  try {
    if (!value) return fallback;
    if (typeof value === 'number') return new Date(value);
    if (typeof value === 'string') return new Date(value);
    if (typeof value === 'object' && typeof value.toDate === 'function') {
      return value.toDate();
    }
    return fallback;
  } catch {
    return fallback;
  }
}

/**
 * Retrieves an action batch by ID for a specific user.
 * Throws error if batch doesn't exist or doesn't belong to user.
 */
export async function getActionBatch(batchId: string, uid: string): Promise<ActionBatch> {
  try {
    const db = getDb();
    const docSnap = await db.collection(COLLECTIONS.ACTION_BATCHES).doc(batchId).get();

    if (!docSnap.exists) {
      throw new Error(`Action batch ${batchId} not found`);
    }
    const data = docSnap.data() || {};

    // Convert stored timestamps back to Date objects
    const processedData = {
      ...data,
      createdAt: toDate(data.createdAt),
      executedAt: data.executedAt ? toDate(data.executedAt) : null,
      preflight: data.preflight ? {
        ...data.preflight,
        createdAt: toDate(data.preflight.createdAt)
      } : null,
      confirmation: data.confirmation ? {
        ...data.confirmation,
        approvedAt: data.confirmation.approvedAt ? toDate(data.confirmation.approvedAt) : null
      } : null,
      execution: data.execution ? {
        ...data.execution,
        startedAt: data.execution.startedAt ? toDate(data.execution.startedAt) : null,
        finishedAt: data.execution.finishedAt ? toDate(data.execution.finishedAt) : null
      } : null,
      restorePlan: data.restorePlan ? {
        ...data.restorePlan,
        expiresAt: toDate(data.restorePlan.expiresAt)
      } : null
    };
    
    const batch = ActionBatchSchema.parse(processedData);
    
    if (batch.uid !== uid) {
      throw new Error(`Action batch ${batchId} does not belong to user ${uid}`);
    }
    
    logger.info('Retrieved action batch', { batchId, uid, status: batch.status });
    return batch;
    
  } catch (error) {
    logger.error('Error retrieving action batch', undefined, { batchId, uid, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/**
 * Saves or updates an action batch in Firestore.
 * Converts Date objects to Firestore timestamps for proper storage.
 */
export async function saveActionBatch(batchId: string, batchData: ActionBatch): Promise<void> {
  try {
    const db = getDb();
    // Serialize Dates to millis for Admin Firestore
    const firestoreData = {
      ...batchData,
      createdAt: batchData.createdAt?.getTime?.() ?? Date.now(),
      executedAt: batchData.executedAt ? batchData.executedAt.getTime() : null,
      preflight: batchData.preflight ? {
        ...batchData.preflight,
        createdAt: batchData.preflight.createdAt.getTime(),
      } : null,
      confirmation: batchData.confirmation ? {
        ...batchData.confirmation,
        approvedAt: batchData.confirmation.approvedAt ? batchData.confirmation.approvedAt.getTime() : null,
      } : null,
      execution: batchData.execution ? {
        ...batchData.execution,
        startedAt: batchData.execution.startedAt ? batchData.execution.startedAt.getTime() : null,
        finishedAt: batchData.execution.finishedAt ? batchData.execution.finishedAt.getTime() : null,
      } : null,
      restorePlan: batchData.restorePlan ? {
        ...batchData.restorePlan,
        expiresAt: batchData.restorePlan.expiresAt.getTime(),
      } : null,
      updatedAt: Date.now(),
    } as any;

    await db.collection(COLLECTIONS.ACTION_BATCHES).doc(batchId).set(firestoreData);
    
    logger.info('Saved action batch', { batchId, uid: batchData.uid, status: batchData.status });
    
  } catch (error) {
    logger.error('Error saving action batch', undefined, { batchId, uid: batchData.uid, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/**
 * Creates a new action batch with auto-generated ID.
 */
export async function createActionBatch(batchData: ActionBatch): Promise<string> {
  try {
    const db = getDb();
    const firestoreData = {
      ...batchData,
      createdAt: batchData.createdAt?.getTime?.() ?? Date.now(),
      executedAt: null,
      updatedAt: Date.now(),
    } as any;

    const docRef = await db.collection(COLLECTIONS.ACTION_BATCHES).add(firestoreData);
    
    logger.info('Created action batch', { batchId: docRef.id, uid: batchData.uid, status: batchData.status });
    return docRef.id;
    
  } catch (error) {
    logger.error('Error creating action batch', undefined, { uid: batchData.uid, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/**
 * Gets user's recent action batches with pagination.
 */
export async function getUserActionBatches(uid: string, limitCount: number = 50): Promise<ActionBatch[]> {
  try {
    const db = getDb();
    const querySnapshot = await db.collection(COLLECTIONS.ACTION_BATCHES)
      .where('uid', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(limitCount)
      .get();
    const batches: ActionBatch[] = [];
    
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const processedData = {
        ...data,
        createdAt: toDate(data.createdAt),
        executedAt: data.executedAt ? toDate(data.executedAt) : null,
        preflight: data.preflight ? {
          ...data.preflight,
          createdAt: toDate(data.preflight.createdAt)
        } : null,
        confirmation: data.confirmation ? {
          ...data.confirmation,
          approvedAt: data.confirmation.approvedAt ? toDate(data.confirmation.approvedAt) : null
        } : null,
        execution: data.execution ? {
          ...data.execution,
          startedAt: data.execution.startedAt ? toDate(data.execution.startedAt) : null,
          finishedAt: data.execution.finishedAt ? toDate(data.execution.finishedAt) : null
        } : null,
        restorePlan: data.restorePlan ? {
          ...data.restorePlan,
          expiresAt: toDate(data.restorePlan.expiresAt)
        } : null
      };
      
      batches.push(ActionBatchSchema.parse(processedData));
    });
    
    logger.info('Retrieved user action batches', { uid, count: batches.length });
    return batches;
    
  } catch (error) {
    logger.error('Error retrieving user action batches', undefined, { uid, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/**
 * Retrieves a rule by ID for a specific user.
 */
export async function getRule(ruleId: string, uid: string): Promise<Rule> {
  try {
    const db = getDb();
    const docSnap = await db.collection(COLLECTIONS.RULES).doc(ruleId).get();
    
    if (!docSnap.exists) {
      throw new Error(`Rule ${ruleId} not found`);
    }
    const rule = ProposeRulesOutputSchema.parse(docSnap.data());
    
    if (rule.uid !== uid) {
      throw new Error(`Rule ${ruleId} does not belong to user ${uid}`);
    }
    
    logger.info('Retrieved rule', { ruleId, uid });
    return rule;
    
  } catch (error) {
    logger.error('Error retrieving rule', undefined, { ruleId, uid, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/**
 * Saves or updates a rule in Firestore.
 */
export async function saveRule(ruleId: string, ruleData: Rule): Promise<void> {
  try {
    const db = getDb();
    await db.collection(COLLECTIONS.RULES).doc(ruleId).set({
      ...ruleData,
      updatedAt: Date.now()
    });
    
    logger.info('Saved rule', { ruleId, uid: ruleData.uid });
    
  } catch (error) {
    logger.error('Error saving rule', undefined, { ruleId, uid: ruleData.uid, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/**
 * Gets user's rules with pagination.
 */
export async function getUserRules(uid: string, limitCount: number = 50): Promise<Rule[]> {
  try {
    const db = getDb();
    const querySnapshot = await db.collection(COLLECTIONS.RULES)
      .where('uid', '==', uid)
      .limit(limitCount)
      .get();
    const rules: Rule[] = [];
    
    querySnapshot.forEach((docSnap) => {
      rules.push(ProposeRulesOutputSchema.parse(docSnap.data()));
    });
    
    logger.info('Retrieved user rules', { uid, count: rules.length });
    return rules;
    
  } catch (error) {
    logger.error('Error retrieving user rules', undefined, { uid, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/**
 * Stores file snapshot metadata.
 */
export async function saveSnapshot(uid: string, fileId: string, batchId: string, snapshotPath: string): Promise<string> {
  try {
    const db = getDb();
    const snapshotData = {
      uid,
      fileId,
      batchId,
      snapshotPath,
      createdAt: Date.now()
    };
    const docRef = await db.collection(COLLECTIONS.SNAPSHOTS).add(snapshotData);
    
    logger.info('Saved snapshot', { snapshotId: docRef.id, uid, fileId, batchId });
    return docRef.id;
    
  } catch (error) {
    logger.error('Error saving snapshot', undefined, { uid, fileId, batchId, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/**
 * Stores analytics data.
 */
export async function saveAnalytics(uid: string, data: Record<string, any>): Promise<string> {
  try {
    const db = getDb();
    const analyticsData = {
      uid,
      data,
      createdAt: Date.now()
    };
    const docRef = await db.collection(COLLECTIONS.ANALYTICS).add(analyticsData);
    
    logger.info('Saved analytics', { analyticsId: docRef.id, uid });
    return docRef.id;
    
  } catch (error) {
    logger.error('Error saving analytics', undefined, { uid, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/**
 * Stores health check result.
 */
export async function saveHealthCheck(uid: string, status: 'healthy' | 'degraded' | 'unhealthy', details: Record<string, any>): Promise<string> {
  try {
    const db = getDb();
    const healthData = {
      uid,
      status,
      details,
      createdAt: Date.now()
    };
    const docRef = await db.collection(COLLECTIONS.HEALTH_CHECKS).add(healthData);
    
    logger.info('Saved health check', { healthCheckId: docRef.id, uid, status });
    return docRef.id;
    
  } catch (error) {
    logger.error('Error saving health check', undefined, { uid, status, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/**
 * Stores similarity cluster data.
 */
export async function saveSimilarityCluster(uid: string, clusters: Record<string, any>): Promise<string> {
  try {
    const db = getDb();
    const clusterData = {
      uid,
      clusters,
      createdAt: Date.now()
    };
    const docRef = await db.collection(COLLECTIONS.SIMILARITY_CLUSTERS).add(clusterData);
    
    logger.info('Saved similarity cluster', { clusterId: docRef.id, uid });
    return docRef.id;
    
  } catch (error) {
    logger.error('Error saving similarity cluster', undefined, { uid, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/**
 * Stores version link data.
 */
export async function saveVersionLinks(uid: string, chains: Record<string, any>): Promise<string> {
  try {
    const db = getDb();
    const versionData = {
      uid,
      chains,
      createdAt: Date.now()
    };
    const docRef = await db.collection(COLLECTIONS.VERSION_LINKS).add(versionData);
    
    logger.info('Saved version links', { versionId: docRef.id, uid });
    return docRef.id;
    
  } catch (error) {
    logger.error('Error saving version links', undefined, { uid, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/**
 * Batch delete multiple documents.
 */
export async function batchDeleteDocuments(collectionName: string, docIds: string[]): Promise<void> {
  try {
    const db = getDb();
    const batch = db.batch();

    for (const docId of docIds) {
      const ref = db.collection(collectionName).doc(docId);
      batch.delete(ref);
    }

    await batch.commit();
    
    logger.info('Batch deleted documents', { collection: collectionName, count: docIds.length });
    
  } catch (error) {
    logger.error('Error batch deleting documents', undefined, { collection: collectionName, docIds, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

/**
 * Health check for database connectivity.
 */
export async function checkDatabaseHealth(): Promise<{ status: 'healthy' | 'unhealthy'; details: Record<string, any> }> {
  try {
    const db = getDb();
    // Try to read from a test document
    const testDocRef = db.collection('health').doc('test');
    const testDocSnap = await testDocRef.get();
    
    return {
      status: 'healthy',
      details: {
        connected: true,
        timestamp: new Date().toISOString(),
        testDocExists: testDocSnap.exists
      }
    };
    
  } catch (error) {
    logger.error('Database health check failed', undefined, { error: error instanceof Error ? error.message : String(error) });
    return {
      status: 'unhealthy',
      details: {
        connected: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      }
    };
  }
}

/**
 * Retrieves the latest analytics data for a user by type.
 */
export async function getLatestAnalytics(uid: string, type?: string): Promise<any | null> {
  try {
    const db = getDb();
    let q = db.collection(COLLECTIONS.ANALYTICS)
      .where('uid', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(1);

    if (type) {
      q = db.collection(COLLECTIONS.ANALYTICS)
        .where('uid', '==', uid)
        .where('data.type', '==', type)
        .orderBy('createdAt', 'desc')
        .limit(1);
    }

    const snapshot = await q.get();

    if (snapshot.empty) {
      return null;
    }

    const docSnap = snapshot.docs[0];
    return { id: docSnap.id, ...docSnap.data() };
    
  } catch (error) {
    logger.error('Error retrieving latest analytics', undefined, { uid, type, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

/**
 * Retrieves analytics data for dashboard summary.
 */
export async function getDashboardStats(uid: string): Promise<any> {
  try {
    // Get the latest drive scan
    const latestScan = await getLatestAnalytics(uid, 'drive_scan');
    
    // Get recent analytics (last 7 days)
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const db = getDb();
    const recentSnapshot = await db.collection(COLLECTIONS.ANALYTICS)
      .where('uid', '==', uid)
      .where('createdAt', '>=', weekAgo.getTime())
      .orderBy('createdAt', 'desc')
      .get();
    
    const stats = {
      totalFiles: 0,
      duplicateFiles: 0,
      totalSize: 0,
      recentActivity: recentSnapshot.size,
      vaultCandidates: 0,
      cleanupSuggestions: 0,
      qualityScore: 0,
      scanStatus: 'idle' as const,
      lastScanTime: null as Date | null,
    };
    
    if (latestScan && latestScan.data) {
      const scanData = latestScan.data;
      stats.totalFiles = scanData.totalFiles || 0;
      stats.totalSize = scanData.totalSize || 0;
      stats.duplicateFiles = scanData.duplicateCandidates?.length || 0;
      // Normalize to Date
      const created = (latestScan as any).createdAt;
      stats.lastScanTime = created ? toDate(created) : null;
      
      // Calculate quality score based on scan results
      const hasRecentScan = stats.lastScanTime && (Date.now() - stats.lastScanTime.getTime()) < 24 * 60 * 60 * 1000;
      const duplicateRatio = stats.totalFiles > 0 ? (stats.duplicateFiles / stats.totalFiles) : 0;
      stats.qualityScore = Math.round((hasRecentScan ? 50 : 20) + (duplicateRatio < 0.1 ? 50 : duplicateRatio < 0.2 ? 30 : 10));
      
      // Estimate vault candidates (large old files)
      stats.vaultCandidates = Math.floor(stats.totalFiles * 0.05); // Rough estimate
      stats.cleanupSuggestions = stats.duplicateFiles + Math.floor(stats.totalFiles * 0.02);
    }
    
    return stats;
    
  } catch (error) {
    logger.error('Error retrieving dashboard stats', undefined, { uid, error: error instanceof Error ? error.message : String(error) });
    return {
      totalFiles: 0,
      duplicateFiles: 0,
      totalSize: 0,
      recentActivity: 0,
      vaultCandidates: 0,
      cleanupSuggestions: 0,
      qualityScore: 0,
      scanStatus: 'idle' as const,
      lastScanTime: null,
    };
  }
}

// Scan Job System for Background Processing
export interface ScanJob {
  id: string;
  uid: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  type: 'drive_scan' | 'full_analysis' | 'duplicate_detection';
  progress: {
    current: number;
    total: number;
    percentage: number;
    currentStep: string;
    estimatedTimeRemaining?: number;
    bytesProcessed?: number;
    totalBytes?: number;
  };
  config: {
    maxDepth?: number;
    includeTrashed?: boolean;
    rootFolderId?: string;
    fileTypes?: string[];
  };
  results?: {
    scanId?: string;
    filesFound?: number;
    duplicatesDetected?: number;
    totalSize?: number;
    insights?: any;
  };
  error?: string;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
}

/**
 * Creates a new background scan job
 */
export async function createScanJob(
  uid: string,
  type: ScanJob['type'],
  config: ScanJob['config'] = {}
): Promise<string> {
  try {
    const db = getDb();
    const jobData: Omit<ScanJob, 'id'> = {
      uid,
      status: 'pending',
      type,
      progress: {
        current: 0,
        total: 0,
        percentage: 0,
        currentStep: 'Initializing scan...'
      },
      config,
      createdAt: Date.now(), // Use timestamp for Firebase Admin
      updatedAt: Date.now()
    };

    const docRef = await db.collection(COLLECTIONS.SCAN_JOBS).add(jobData);
    logger.info('Created scan job', { jobId: docRef.id, uid, type });
    return docRef.id;
  } catch (error) {
    logger.error(`Failed to create scan job for user ${uid}, type ${type}: ${error instanceof Error ? error.message : error}`);
    throw error;
  }
}

/**
 * Gets the current active scan job for a user
 */
export async function getActiveScanJob(uid: string): Promise<ScanJob | null> {
  try {
    const db = getDb();
    const querySnapshot = await db.collection(COLLECTIONS.SCAN_JOBS)
      .where('uid', '==', uid)
      .where('status', 'in', ['pending', 'running'])
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();

    if (querySnapshot.empty) {
      return null;
    }

    const doc = querySnapshot.docs[0];
    return { id: doc.id, ...doc.data() } as ScanJob;
  } catch (error) {
    logger.error(`Failed to get active scan job for user ${uid}: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

/**
 * Updates scan job progress
 */
export async function updateScanJobProgress(
  jobId: string,
  progress: Partial<ScanJob['progress']>,
  status?: ScanJob['status']
): Promise<void> {
  try {
    const db = getDb();
    const jobRef = db.collection(COLLECTIONS.SCAN_JOBS).doc(jobId);
    const updateData: any = {
      updatedAt: Date.now()
    };

    if (status) {
      updateData.status = status;
      if (status === 'running' && !updateData.startedAt) {
        updateData.startedAt = Date.now();
      }
      if (status === 'completed' || status === 'failed') {
        updateData.completedAt = Date.now();
      }
    }

    if (progress) {
      // Get current progress to merge
      const jobDoc = await jobRef.get();
      if (jobDoc.exists) {
        const currentProgress = jobDoc.data()?.progress || {};
        updateData.progress = { ...currentProgress, ...progress };
        
        // Calculate percentage if current and total are available
        if (updateData.progress.current && updateData.progress.total) {
          updateData.progress.percentage = Math.round(
            (updateData.progress.current / updateData.progress.total) * 100
          );
        }
      }
    }

    await jobRef.update(updateData);
  } catch (error) {
    logger.error(`Failed to update scan job progress for job ${jobId}: ${error instanceof Error ? error.message : error}`);
    throw error;
  }
}

/**
 * Cancels a scan job by setting its status to 'cancelled'.
 */
export async function cancelScanJob(jobId: string, uid?: string): Promise<void> {
  const db = getDb();
  const jobRef = db.collection(COLLECTIONS.SCAN_JOBS).doc(jobId);
  const snap = await jobRef.get();
  if (!snap.exists) return;
  const data = snap.data() as ScanJob;
  if (uid && data.uid !== uid) {
    throw new Error('Not authorized to cancel this job');
  }
  await jobRef.update({ status: 'cancelled', updatedAt: Date.now() });
}

/**
 * Returns true if the job has been cancelled by the user.
 */
export async function isScanCancelled(jobId: string): Promise<boolean> {
  const db = getDb();
  const snap = await db.collection(COLLECTIONS.SCAN_JOBS).doc(jobId).get();
  if (!snap.exists) return false;
  const data = snap.data() as ScanJob;
  return data.status === 'cancelled';
}

/**
 * Completes a scan job with results
 */
export async function completeScanJob(
  jobId: string,
  results: ScanJob['results']
): Promise<void> {
  try {
    const db = getDb();
    const jobRef = db.collection(COLLECTIONS.SCAN_JOBS).doc(jobId);
    await jobRef.update({
      status: 'completed',
      results,
      completedAt: Date.now(),
      updatedAt: Date.now(),
      progress: {
        current: 1,
        total: 1,
        percentage: 100,
        currentStep: 'Scan completed successfully'
      }
    });
    
    logger.info('Completed scan job', { jobId, results });
  } catch (error) {
    logger.error(`Failed to complete scan job ${jobId}: ${error instanceof Error ? error.message : error}`);
    throw error;
  }
}

/**
 * Fails a scan job with error
 */
export async function failScanJob(jobId: string, error: string): Promise<void> {
  try {
    const db = getDb();
    const jobRef = db.collection(COLLECTIONS.SCAN_JOBS).doc(jobId);
    await jobRef.update({
      status: 'failed',
      error,
      completedAt: Date.now(),
      updatedAt: Date.now()
    });
    
    logger.error(`Failed scan job ${jobId}: ${error}`);
  } catch (error) {
    logger.error(`Failed to fail scan job ${jobId}: ${error instanceof Error ? error.message : error}`);
    throw error;
  }
}

/**
 * Gets recent scan jobs for a user
 */
export async function getUserScanJobs(uid: string, limit: number = 10): Promise<ScanJob[]> {
  try {
    const db = getDb();
    const snapshot = await db.collection(COLLECTIONS.SCAN_JOBS)
      .where('uid', '==', uid)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as ScanJob));
  } catch (error) {
    logger.error(`Failed to get user scan jobs for ${uid}: ${error instanceof Error ? error.message : error}`);
    return [];
  }
}

// Delta Scan System for Incremental Updates
export interface FileIndexEntry {
  id: string; // Drive file ID
  uid: string;
  name: string;
  mimeType: string;
  size: number;
  modifiedTime: string; // ISO timestamp
  parentId?: string;
  md5Checksum?: string;
  version: number; // Revision version from Drive
  lastScanId: string;
  createdAt: number;
  updatedAt: number;
  isDeleted?: boolean;
}

export interface ScanDelta {
  id: string;
  uid: string;
  scanId: string;
  type: 'created' | 'modified' | 'deleted' | 'moved';
  fileId: string;
  fileName: string;
  oldPath?: string;
  newPath?: string;
  sizeChange?: number;
  timestamp: number;
  processed: boolean;
}

/**
 * Updates the file index with new/changed files from a scan
 */
export async function updateFileIndex(
  uid: string,
  files: any[],
  scanId: string
): Promise<{ updated: number; created: number; deleted: number }> {
  try {
    const db = getDb();
    const batch = db.batch();
    let updated = 0;
    let created = 0;
    let deleted = 0;

    // Get existing file index for this user
    const existingSnapshot = await db.collection(COLLECTIONS.FILE_INDEX)
      .where('uid', '==', uid)
      .where('isDeleted', '!=', true)
      .get();
    const existingFiles = new Map<string, FileIndexEntry>();
    
    existingSnapshot.forEach(doc => {
      const data = doc.data() as FileIndexEntry;
      existingFiles.set(data.id, data);
    });

    const scannedFileIds = new Set<string>();

    // Process each file from the scan
    for (const file of files) {
      scannedFileIds.add(file.id);
      const existing = existingFiles.get(file.id);

      const fileEntry: Omit<FileIndexEntry, 'createdAt' | 'updatedAt'> = {
        id: file.id,
        uid,
        name: file.name,
        mimeType: file.mimeType || 'unknown',
        size: parseInt(file.size || '0'),
        modifiedTime: file.modifiedTime || new Date().toISOString(),
        parentId: file.parents?.[0],
        md5Checksum: file.md5Checksum,
        version: parseInt(file.version || '1'),
        lastScanId: scanId,
        isDeleted: false
      };

      if (existing) {
        // Check if file has changed
        const hasChanged = 
          existing.modifiedTime !== fileEntry.modifiedTime ||
          existing.size !== fileEntry.size ||
          existing.name !== fileEntry.name ||
          existing.parentId !== fileEntry.parentId;

        if (hasChanged) {
          // Create delta record
          const deltaDoc = db.collection(COLLECTIONS.SCAN_DELTAS).doc();
          batch.set(deltaDoc, {
            id: deltaDoc.id,
            uid,
            scanId,
            type: 'modified',
            fileId: file.id,
            fileName: file.name,
            sizeChange: fileEntry.size - existing.size,
            timestamp: Date.now(),
            processed: false
          });

          // Update file index
          const fileDoc = db.collection(COLLECTIONS.FILE_INDEX).doc(`${uid}_${file.id}`);
          batch.update(fileDoc, {
            ...fileEntry,
            updatedAt: Date.now()
          });
          
          updated++;
        }
      } else {
        // New file
        const deltaDoc = db.collection(COLLECTIONS.SCAN_DELTAS).doc();
        batch.set(deltaDoc, {
          id: deltaDoc.id,
          uid,
          scanId,
          type: 'created',
          fileId: file.id,
          fileName: file.name,
          timestamp: Date.now(),
          processed: false
        });

        // Add to file index
        const fileDoc = db.collection(COLLECTIONS.FILE_INDEX).doc(`${uid}_${file.id}`);
        batch.set(fileDoc, {
          ...fileEntry,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });

        created++;
      }
    }

    // Mark files as deleted if they weren't found in the scan
    for (const [fileId, existing] of existingFiles) {
      if (!scannedFileIds.has(fileId) && !existing.isDeleted) {
        // Create deletion delta
        const deltaDoc = db.collection(COLLECTIONS.SCAN_DELTAS).doc();
        batch.set(deltaDoc, {
          id: deltaDoc.id,
          uid,
          scanId,
          type: 'deleted',
          fileId: fileId,
          fileName: existing.name,
          timestamp: Date.now(),
          processed: false
        });

        // Mark as deleted in index
        const fileDoc = db.collection(COLLECTIONS.FILE_INDEX).doc(`${uid}_${fileId}`);
        batch.update(fileDoc, {
          isDeleted: true,
          lastScanId: scanId,
          updatedAt: Date.now()
        });

        deleted++;
      }
    }

    await batch.commit();

    // Fire-and-forget: push index entries to DataConnect if enabled
    const entriesForDc = files.map(file => ({
      id: file.id,
      uid,
      name: file.name,
      mimeType: file.mimeType || 'unknown',
      size: parseInt(file.size || '0'),
      modifiedTime: file.modifiedTime || new Date().toISOString(),
      parentId: file.parents?.[0],
      md5Checksum: file.md5Checksum,
      version: parseInt(file.version || '1'),
      lastScanId: scanId,
      isDeleted: false,
      updatedAt: new Date().toISOString(),
    }));
    publishFileIndex(entriesForDc).catch(e => {
      logger.warn('DataConnect file index publish failed', { 
        uid, 
        scanId
      }, e as Error);
    });
    
    logger.info('File index updated', { 
      uid, 
      scanId, 
      updated, 
      created, 
      deleted,
      totalFiles: files.length 
    });

    return { updated, created, deleted };
  } catch (error) {
    logger.error(`Failed to update file index for user ${uid}, scan ${scanId}: ${error instanceof Error ? error.message : error}`);
    throw error;
  }
}

/**
 * Gets files that have changed since the last scan
 */
export async function getChangedFilesSinceLastScan(
  uid: string,
  lastScanId?: string
): Promise<ScanDelta[]> {
  try {
    const db = getDb();
    let q = db.collection(COLLECTIONS.SCAN_DELTAS)
      .where('uid', '==', uid)
      .where('processed', '==', false)
      .orderBy('timestamp', 'desc');

    if (lastScanId) {
      const lastScanSnapshot = await db.collection(COLLECTIONS.SCAN_DELTAS)
        .where('uid', '==', uid)
        .where('scanId', '==', lastScanId)
        .orderBy('timestamp', 'desc')
        .limit(1)
        .get();

      if (!lastScanSnapshot.empty) {
        const lastScanTime = lastScanSnapshot.docs[0].data().timestamp;
        q = db.collection(COLLECTIONS.SCAN_DELTAS)
          .where('uid', '==', uid)
          .where('timestamp', '>', lastScanTime)
          .orderBy('timestamp', 'desc');
      }
    }

    const snapshot = await q.get();
    return snapshot.docs.map(d => d.data() as ScanDelta);
  } catch (error) {
    logger.error(`Failed to get changed files for user ${uid}: ${error instanceof Error ? error.message : error}`);
    return [];
  }
}

/**
 * Gets the last successful scan timestamp for delta comparison
 */
export async function getLastScanTimestamp(uid: string): Promise<string | null> {
  try {
    const db = getDb();
    const querySnapshot = await db.collection(COLLECTIONS.SCAN_JOBS)
      .where('uid', '==', uid)
      .where('status', '==', 'completed')
      .orderBy('completedAt', 'desc')
      .limit(1)
      .get();

    if (querySnapshot.empty) {
      return null;
    }

    const lastScan = querySnapshot.docs[0].data();
    // Firebase Admin timestamps are just numbers (Date.now() format)
    return lastScan.completedAt ? new Date(lastScan.completedAt).toISOString() : null;
  } catch (error) {
    logger.error(`Failed to get last scan timestamp for user ${uid}: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

/**
 * Determines if a full scan is needed or if delta scan is sufficient
 */
export async function shouldRunFullScan(uid: string): Promise<{
  shouldRunFull: boolean;
  reason: string;
  lastScanTime?: string;
  fileCount?: number;
}> {
  try {
    const lastScanTime = await getLastScanTimestamp(uid);
    
    if (!lastScanTime) {
      return { 
        shouldRunFull: true, 
        reason: 'No previous scan found' 
      };
    }

    // Check how old the last scan is
    const daysSinceLastScan = (Date.now() - new Date(lastScanTime).getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysSinceLastScan > 7) {
      return { 
        shouldRunFull: true, 
        reason: 'Last scan is more than 7 days old',
        lastScanTime 
      };
    }

    // Check file index size - if we have very few files indexed, run full scan
    const db = getDb();
    const indexSnapshot = await db.collection(COLLECTIONS.FILE_INDEX)
      .where('uid', '==', uid)
      .where('isDeleted', '!=', true)
      .get();
    
    const fileCount = indexSnapshot.size;
    
    if (fileCount < 100) {
      return { 
        shouldRunFull: true, 
        reason: 'File index is incomplete (< 100 files)',
        lastScanTime,
        fileCount 
      };
    }

    return { 
      shouldRunFull: false, 
      reason: 'Delta scan sufficient',
      lastScanTime,
      fileCount 
    };
  } catch (error) {
    logger.error(`Failed to check scan requirements for user ${uid}: ${error instanceof Error ? error.message : error}`);
    return { 
      shouldRunFull: true, 
      reason: 'Error checking scan requirements' 
    };
  }
}

// Placeholder for server-side operations - use client Firestore
export const createFirebaseAdmin = () => {
  throw new Error('Firebase Admin not available in client environment');
};
