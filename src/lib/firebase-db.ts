/**
 * @fileoverview Production Firebase database service for DriveMind.
 * Replaces mock-db.ts with real Firestore operations.
 * All operations include proper error handling, validation, and logging.
 */

import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  getDocs,
  addDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  Timestamp,
  orderBy,
  limit as firestoreLimit
} from 'firebase/firestore';
import { z } from 'zod';
import { db } from '@/lib/firebase';
import { ActionBatchSchema, ProposeRulesOutputSchema } from '@/lib/ai-types';
import { logger } from '@/lib/logger';

// Firestore collections
const COLLECTIONS = {
  ACTION_BATCHES: 'actionBatches',
  RULES: 'rules',
  SNAPSHOTS: 'snapshots',
  ANALYTICS: 'analytics',
  HEALTH_CHECKS: 'healthChecks',
  SIMILARITY_CLUSTERS: 'similarityClusters',
  VERSION_LINKS: 'versionLinks'
} as const;

type ActionBatch = z.infer<typeof ActionBatchSchema>;
type Rule = z.infer<typeof ProposeRulesOutputSchema>;

/**
 * Retrieves an action batch by ID for a specific user.
 * Throws error if batch doesn't exist or doesn't belong to user.
 */
export async function getActionBatch(batchId: string, uid: string): Promise<ActionBatch> {
  try {
    const docRef = doc(db, COLLECTIONS.ACTION_BATCHES, batchId);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      throw new Error(`Action batch ${batchId} not found`);
    }
    
    const data = docSnap.data();
    
    // Convert Firestore timestamps back to Date objects
    const processedData = {
      ...data,
      createdAt: data.createdAt?.toDate() || new Date(),
      executedAt: data.executedAt?.toDate() || null,
      preflight: data.preflight ? {
        ...data.preflight,
        createdAt: data.preflight.createdAt?.toDate() || new Date()
      } : null,
      confirmation: data.confirmation ? {
        ...data.confirmation,
        approvedAt: data.confirmation.approvedAt?.toDate() || null
      } : null,
      execution: data.execution ? {
        ...data.execution,
        startedAt: data.execution.startedAt?.toDate() || null,
        finishedAt: data.execution.finishedAt?.toDate() || null
      } : null,
      restorePlan: data.restorePlan ? {
        ...data.restorePlan,
        expiresAt: data.restorePlan.expiresAt?.toDate() || new Date()
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
    // Convert Date objects to Firestore timestamps
    const firestoreData = {
      ...batchData,
      createdAt: Timestamp.fromDate(batchData.createdAt),
      executedAt: batchData.executedAt ? Timestamp.fromDate(batchData.executedAt) : null,
      preflight: batchData.preflight ? {
        ...batchData.preflight,
        createdAt: Timestamp.fromDate(batchData.preflight.createdAt)
      } : null,
      confirmation: batchData.confirmation ? {
        ...batchData.confirmation,
        approvedAt: batchData.confirmation.approvedAt ? Timestamp.fromDate(batchData.confirmation.approvedAt) : null
      } : null,
      execution: batchData.execution ? {
        ...batchData.execution,
        startedAt: batchData.execution.startedAt ? Timestamp.fromDate(batchData.execution.startedAt) : null,
        finishedAt: batchData.execution.finishedAt ? Timestamp.fromDate(batchData.execution.finishedAt) : null
      } : null,
      restorePlan: batchData.restorePlan ? {
        ...batchData.restorePlan,
        expiresAt: Timestamp.fromDate(batchData.restorePlan.expiresAt)
      } : null,
      updatedAt: serverTimestamp()
    };
    
    const docRef = doc(db, COLLECTIONS.ACTION_BATCHES, batchId);
    await setDoc(docRef, firestoreData);
    
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
    const firestoreData = {
      ...batchData,
      createdAt: serverTimestamp(),
      executedAt: null,
      updatedAt: serverTimestamp()
    };
    
    const docRef = await addDoc(collection(db, COLLECTIONS.ACTION_BATCHES), firestoreData);
    
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
    const q = query(
      collection(db, COLLECTIONS.ACTION_BATCHES),
      where('uid', '==', uid),
      orderBy('createdAt', 'desc'),
      firestoreLimit(limitCount)
    );
    
    const querySnapshot = await getDocs(q);
    const batches: ActionBatch[] = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const processedData = {
        ...data,
        createdAt: data.createdAt?.toDate() || new Date(),
        executedAt: data.executedAt?.toDate() || null,
        preflight: data.preflight ? {
          ...data.preflight,
          createdAt: data.preflight.createdAt?.toDate() || new Date()
        } : null,
        confirmation: data.confirmation ? {
          ...data.confirmation,
          approvedAt: data.confirmation.approvedAt?.toDate() || null
        } : null,
        execution: data.execution ? {
          ...data.execution,
          startedAt: data.execution.startedAt?.toDate() || null,
          finishedAt: data.execution.finishedAt?.toDate() || null
        } : null,
        restorePlan: data.restorePlan ? {
          ...data.restorePlan,
          expiresAt: data.restorePlan.expiresAt?.toDate() || new Date()
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
    const docRef = doc(db, COLLECTIONS.RULES, ruleId);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
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
    const docRef = doc(db, COLLECTIONS.RULES, ruleId);
    await setDoc(docRef, {
      ...ruleData,
      updatedAt: serverTimestamp()
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
    const q = query(
      collection(db, COLLECTIONS.RULES),
      where('uid', '==', uid),
      firestoreLimit(limitCount)
    );
    
    const querySnapshot = await getDocs(q);
    const rules: Rule[] = [];
    
    querySnapshot.forEach((doc) => {
      rules.push(ProposeRulesOutputSchema.parse(doc.data()));
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
    const snapshotData = {
      uid,
      fileId,
      batchId,
      snapshotPath,
      createdAt: serverTimestamp()
    };
    
    const docRef = await addDoc(collection(db, COLLECTIONS.SNAPSHOTS), snapshotData);
    
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
    const analyticsData = {
      uid,
      data,
      createdAt: serverTimestamp()
    };
    
    const docRef = await addDoc(collection(db, COLLECTIONS.ANALYTICS), analyticsData);
    
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
export async function saveHealthCheck(uid: string, status: 'healthy' | 'unhealthy', details: Record<string, any>): Promise<string> {
  try {
    const healthData = {
      uid,
      status,
      details,
      createdAt: serverTimestamp()
    };
    
    const docRef = await addDoc(collection(db, COLLECTIONS.HEALTH_CHECKS), healthData);
    
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
    const clusterData = {
      uid,
      clusters,
      createdAt: serverTimestamp()
    };
    
    const docRef = await addDoc(collection(db, COLLECTIONS.SIMILARITY_CLUSTERS), clusterData);
    
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
    const versionData = {
      uid,
      chains,
      createdAt: serverTimestamp()
    };
    
    const docRef = await addDoc(collection(db, COLLECTIONS.VERSION_LINKS), versionData);
    
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
    const batch = writeBatch(db);
    
    for (const docId of docIds) {
      const docRef = doc(db, collectionName, docId);
      batch.delete(docRef);
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
    // Try to read from a test document
    const testDocRef = doc(db, 'health', 'test');
    const testDocSnap = await getDoc(testDocRef);
    
    return {
      status: 'healthy',
      details: {
        connected: true,
        timestamp: new Date().toISOString(),
        testDocExists: testDocSnap.exists()
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

// Placeholder for server-side operations - use client Firestore
export const createFirebaseAdmin = () => {
  throw new Error('Firebase Admin not available in client environment');
};