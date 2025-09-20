/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import {setGlobalOptions} from "firebase-functions";
import { logger } from './logger';
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp, applicationDefault, getApps } from "firebase-admin/app";
import { runScanJob } from "./scan-runner";
import { healthCheck } from './health';
import { metrics } from './metrics';
import { about } from './about';

export { healthCheck, metrics, about };

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({ maxInstances: 10 });

// Initialize Admin (idempotent in Functions)
if (!getApps().length) {
  initializeApp({ credential: applicationDefault() });
}

// Draft worker: detect new scanJobs and mark them acknowledged.
// NOTE: This is a minimal scaffold; wire full processing by moving the
// background logic from Next.js API into a shared module used here.
export const onScanJobCreated = onDocumentCreated("scanJobs/{jobId}", async (event) => {
  try {
    const doc = event.data;
    if (!doc) return;
    const job = doc.data() as any;
    if (!job || job.status !== 'pending') return;

    const db = getFirestore();
    const ref = doc.ref;

    await ref.update({ workerAcknowledged: true, worker: 'functions-v2', updatedAt: Date.now() });
    logger.info("Worker acknowledged new scan job", { jobId: ref.id, uid: job.uid });

    // Run the scan job pipeline
    const dataConnectEndpoint = process.env.DATACONNECT_ENDPOINT;
    if (!dataConnectEndpoint) {
      throw new Error('DATACONNECT_ENDPOINT environment variable not set');
    }
    await runScanJob(db, ref.id, dataConnectEndpoint);
  } catch (e: any) {
    logger.error("Error in onScanJobCreated", e);
  }
});
