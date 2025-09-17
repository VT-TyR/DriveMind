/**
 * @fileoverview Cloud Functions Repair - Updated functions with completion logic
 * 
 * CRITICAL ISSUE RESOLVED:
 * - Background scans start but never complete properly
 * - Improved error handling and retry logic
 * - Enhanced logging and monitoring
 * - Token synchronization fixes
 * 
 * VERSION: 1.0.0-REPAIR
 * PRIORITY: P0-EMERGENCY
 */

import { setGlobalOptions } from "firebase-functions";
import * as logger from "firebase-functions/logger";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { runScanJobToCompletion } from "./scan-completion-service";
import { createTokenSyncService } from "./token-sync-service";

// ENHANCED: Better resource limits for scan operations
setGlobalOptions({ 
  maxInstances: 10,
  timeoutSeconds: 540, // 9 minutes max
  memory: "1GiB"
});

// Initialize Admin (idempotent in Functions)
if (!getApps().length) {
  initializeApp({ credential: applicationDefault() });
}

const db = getFirestore();

/**
 * CRITICAL FIX: Enhanced scan job trigger with completion guarantee
 */
export const onScanJobCreated = onDocumentCreated({
  document: "scanJobs/{jobId}",
  maxInstances: 5,
  timeoutSeconds: 540,
  memory: "1GiB"
}, async (event) => {
  const startTime = Date.now();
  const jobId = event.params.jobId;
  
  try {
    const doc = event.data;
    if (!doc) {
      logger.error("No document data in scan job event", { jobId });
      return;
    }
    
    const job = doc.data() as any;
    if (!job || job.status !== 'pending') {
      logger.info("Skipping job - not pending", { jobId, status: job?.status });
      return;
    }

    if (!job.uid) {
      logger.error("Job missing user ID", { jobId });
      await markJobAsFailed(jobId, "Invalid job: missing user ID");
      return;
    }

    const ref = doc.ref;
    
    // Mark as acknowledged by worker
    await ref.update({ 
      workerAcknowledged: true, 
      worker: 'functions-v2-enhanced', 
      workerStartTime: Date.now(),
      updatedAt: Date.now() 
    });
    
    logger.info("Worker acknowledged scan job", { 
      jobId, 
      uid: job.uid, 
      type: job.type 
    });

    // CRITICAL: Run scan to completion with enhanced service
    await runScanJobToCompletion(db, jobId);
    
    const duration = Date.now() - startTime;
    logger.info("Scan job completed successfully", { 
      jobId, 
      uid: job.uid,
      duration,
      type: job.type
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.error("Scan job failed in Cloud Function", { 
      jobId, 
      error: errorMessage,
      duration,
      stackTrace: error instanceof Error ? error.stack : undefined
    });

    // Ensure job is marked as failed
    try {
      await markJobAsFailed(jobId, errorMessage);
    } catch (updateError) {
      logger.error("Failed to update job failure status", { 
        jobId, 
        originalError: errorMessage,
        updateError: updateError instanceof Error ? updateError.message : String(updateError)
      });
    }
  }
});

/**
 * ENHANCED: Token synchronization and validation trigger
 */
export const onUserTokenUpdate = onDocumentCreated({
  document: "users/{uid}/secrets/googleDrive",
  maxInstances: 10
}, async (event) => {
  try {
    const uid = event.params.uid;
    const doc = event.data;
    
    if (!doc) {
      logger.warn("No document data in token update", { uid });
      return;
    }

    const tokenData = doc.data();
    if (!tokenData || !tokenData.refreshToken) {
      logger.warn("Invalid token data", { uid });
      return;
    }

    logger.info("User token updated", { uid });

    // Initialize token sync service and validate
    const tokenService = createTokenSyncService(db);
    
    // Validate the new tokens
    const validation = await tokenService.validateUserTokens(uid);
    
    if (!validation.isValid) {
      logger.warn("New tokens failed validation", { 
        uid, 
        error: validation.error 
      });
      
      // Log validation failure but don't fail the function
      await db.collection('tokenValidationLogs').add({
        uid,
        status: 'failed',
        error: validation.error,
        timestamp: Date.now()
      });
      
      return;
    }

    logger.info("Token validation successful", { uid });
    
    // Log successful validation
    await db.collection('tokenValidationLogs').add({
      uid,
      status: 'success',
      scopes: validation.scopes,
      timestamp: Date.now()
    });

  } catch (error) {
    const uid = event.params?.uid || 'unknown';
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logger.error("Token update handler failed", { 
      uid, 
      error: errorMessage 
    });
  }
});

/**
 * MONITORING: Scan job timeout monitor
 */
export const scanJobTimeoutMonitor = onDocumentCreated({
  document: "scanJobs/{jobId}",
  maxInstances: 1
}, async (event) => {
  const jobId = event.params.jobId;
  const TIMEOUT_MINUTES = 15; // Maximum scan time
  
  try {
    // Wait for timeout period
    await new Promise(resolve => setTimeout(resolve, TIMEOUT_MINUTES * 60 * 1000));
    
    // Check if job is still running
    const jobDoc = await db.collection('scanJobs').doc(jobId).get();
    
    if (!jobDoc.exists) {
      return; // Job was deleted
    }
    
    const jobData = jobDoc.data();
    if (jobData?.status === 'running') {
      logger.warn("Scan job timeout detected", { 
        jobId, 
        uid: jobData.uid,
        timeoutMinutes: TIMEOUT_MINUTES 
      });
      
      // Mark as failed due to timeout
      await markJobAsFailed(jobId, `Scan timeout after ${TIMEOUT_MINUTES} minutes`);
    }
    
  } catch (error) {
    logger.error("Timeout monitor error", { 
      jobId, 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
});

/**
 * CLEANUP: Clean up old completed/failed jobs
 */
export const cleanupOldScanJobs = onDocumentCreated({
  document: "maintenance/cleanup",
  maxInstances: 1
}, async (event) => {
  try {
    const RETENTION_DAYS = 30;
    const cutoffTime = Date.now() - (RETENTION_DAYS * 24 * 60 * 60 * 1000);
    
    // Find old completed/failed jobs
    const oldJobs = await db.collection('scanJobs')
      .where('status', 'in', ['completed', 'failed'])
      .where('completedAt', '<', cutoffTime)
      .limit(100) // Process in batches
      .get();
    
    if (oldJobs.empty) {
      logger.info("No old jobs to clean up");
      return;
    }
    
    const batch = db.batch();
    let deleteCount = 0;
    
    oldJobs.forEach(doc => {
      batch.delete(doc.ref);
      deleteCount++;
    });
    
    await batch.commit();
    
    logger.info("Cleaned up old scan jobs", { 
      deletedCount: deleteCount,
      retentionDays: RETENTION_DAYS 
    });
    
  } catch (error) {
    logger.error("Cleanup failed", { 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
});

/**
 * UTILITY: Mark job as failed with details
 */
async function markJobAsFailed(jobId: string, errorMessage: string): Promise<void> {
  try {
    await db.collection('scanJobs').doc(jobId).update({
      status: 'failed',
      error: errorMessage,
      completedAt: Date.now(),
      updatedAt: Date.now(),
      progress: {
        current: 0,
        total: 1,
        percentage: 0,
        currentStep: `Failed: ${errorMessage}`
      }
    });
    
    logger.info("Job marked as failed", { jobId, error: errorMessage });
    
  } catch (updateError) {
    logger.error("Failed to mark job as failed", { 
      jobId, 
      originalError: errorMessage,
      updateError: updateError instanceof Error ? updateError.message : String(updateError)
    });
  }
}

/**
 * HEALTH: Functions health check endpoint
 */
export const functionsHealthCheck = onDocumentCreated({
  document: "health/functions-check",
  maxInstances: 1
}, async (event) => {
  try {
    const healthData = {
      status: 'healthy',
      timestamp: Date.now(),
      functions: {
        scanJobProcessor: 'active',
        tokenValidator: 'active',
        timeoutMonitor: 'active',
        cleanup: 'active'
      },
      environment: {
        nodeVersion: process.version,
        memory: process.memoryUsage(),
        region: process.env.FUNCTION_REGION || 'unknown'
      }
    };
    
    await db.collection('functionsHealth').doc('latest').set(healthData);
    
    logger.info("Functions health check completed", healthData);
    
  } catch (error) {
    const errorData = {
      status: 'unhealthy',
      timestamp: Date.now(),
      error: error instanceof Error ? error.message : String(error)
    };
    
    await db.collection('functionsHealth').doc('latest').set(errorData);
    
    logger.error("Functions health check failed", errorData);
  }
});

/**
 * EXPORT: All function handlers
 */
export const functions = {
  onScanJobCreated,
  onUserTokenUpdate,
  scanJobTimeoutMonitor,
  cleanupOldScanJobs,
  functionsHealthCheck
};