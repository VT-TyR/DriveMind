import { google } from 'googleapis';
import { Firestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';

type ScanStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

interface ScanProgress {
  current: number;
  total: number;
  percentage: number;
  currentStep: string;
  estimatedTimeRemaining?: number;
  bytesProcessed?: number;
  totalBytes?: number;
}

interface ScanJobDoc {
  uid: string;
  status: ScanStatus;
  type: 'drive_scan' | 'full_analysis' | 'duplicate_detection';
  progress: ScanProgress;
  config: {
    maxDepth?: number;
    includeTrashed?: boolean;
    rootFolderId?: string;
    fileTypes?: string[];
  };
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  completedAt?: number;
  results?: any;
  error?: string;
}

interface FileIndexEntry {
  id: string;
  uid: string;
  name: string;
  mimeType: string;
  size: number;
  modifiedTime: string;
  parentId?: string;
  md5Checksum?: string;
  version: number;
  lastScanId: string;
  createdAt: number;
  updatedAt: number;
  isDeleted?: boolean;
}

const COLLECTIONS = {
  SCAN_JOBS: 'scanJobs',
  FILE_INDEX: 'fileIndex',
  SCAN_DELTAS: 'scanDeltas',
  USERS: 'users',
} as const;

export async function runScanJob(db: Firestore, jobId: string) {
  const jobRef = db.collection(COLLECTIONS.SCAN_JOBS).doc(jobId);
  const snap = await jobRef.get();
  if (!snap.exists) {
    logger.error('Scan job not found', { jobId });
    return;
  }
  const job = snap.data() as ScanJobDoc;
  if (job.status !== 'pending') {
    logger.info('Scan job not pending; skipping', { jobId, status: job.status });
    return;
  }

  const { uid, config } = job;
  const forceFull = !!(config as any)?.forceFull;
  const forceDelta = !!(config as any)?.forceDelta;

  const setProgress = async (progress: Partial<ScanProgress>, status?: ScanStatus) => {
    const update: any = { updatedAt: Date.now() };
    if (status) {
      update.status = status;
      if (status === 'running' && !job.startedAt) update.startedAt = Date.now();
      if (status === 'completed' || status === 'failed') update.completedAt = Date.now();
    }
    if (progress) {
      const cur = ((await jobRef.get()).data() as any)?.progress || {};
      update.progress = { ...cur, ...progress };
      if (update.progress.current && update.progress.total) {
        update.progress.percentage = Math.round((update.progress.current / update.progress.total) * 100);
      }
    }
    await jobRef.update(update);
  };

  const isCancelled = async (): Promise<boolean> => {
    const s = (await jobRef.get()).data() as ScanJobDoc;
    return s.status === 'cancelled';
  };

  const fail = async (message: string) => {
    await jobRef.update({ status: 'failed', error: message, completedAt: Date.now(), updatedAt: Date.now() });
  };

  const complete = async (results: any) => {
    await jobRef.update({ status: 'completed', results, completedAt: Date.now(), updatedAt: Date.now(), progress: { current: 1, total: 1, percentage: 100, currentStep: 'Scan completed successfully' } });
  };

  const startedAt = Date.now();
  const metrics = { pages: 0, writeOps: 0 };
  try {
    await setProgress({ currentStep: 'Initializing scan...' }, 'running');
    await setProgress({ current: 1, total: 6, currentStep: 'Checking scan requirements...' });

    const scanDecision = await shouldRunFullScan(db, uid);

    await setProgress({ current: 2, total: 6, currentStep: 'Connecting to Google Drive...' });
    if (await isCancelled()) return await fail('Scan cancelled by user');

    const drive = await driveForUser(db, uid);

    await setProgress({ current: 3, total: 6, currentStep: 'Scanning Google Drive files...' });
    if (await isCancelled()) return await fail('Scan cancelled by user');

    const scanId = `scan_${jobId}_${Date.now()}`;
    let totalSize = 0;
    let totalFiles = 0;
    let duplicates = 0;

    // Decide mode; allow forceDelta only if we have a saved token
    const savedToken = await getSavedPageToken(db, uid);
    if (!forceDelta && (forceFull || scanDecision.shouldRunFull)) {
      const res = await scanAndIndexFiles(db, uid, drive, config, scanId, jobRef, setProgress, isCancelled, metrics);
      totalSize = res.totalSize;
      totalFiles = res.totalFiles;
      duplicates = res.duplicates;
      // Initialize or advance the Drive Changes page token for future delta scans
      const newToken = await getStartPageToken(drive);
      await saveDriveState(db, uid, { pageToken: newToken });
    } else {
      const res = await scanChangesAndIndexFiles(db, uid, drive, config, scanId, jobRef, setProgress, isCancelled, metrics, savedToken || undefined);
      totalSize = res.totalSize;
      totalFiles = res.totalFiles;
      duplicates = res.duplicates;
    }

    await setProgress({ current: 5, total: 6, currentStep: 'Analyzing for duplicates...' });
    if (await isCancelled()) return await fail('Scan cancelled by user');

    const durationMs = Date.now() - startedAt;
    const results = {
      scanId,
      filesFound: totalFiles,
      duplicatesDetected: duplicates,
      totalSize,
      insights: {
        totalFiles,
        duplicateGroups: duplicates,
        totalSize,
        archiveCandidates: Math.floor(totalFiles * 0.05),
        qualityScore: Math.max(20, 100 - Math.floor((duplicates / Math.max(1, totalFiles)) * 100)),
        recommendedActions: [
          duplicates > 0 ? 'Remove duplicate files to save storage' : 'No duplicates found',
          'Archive old files to improve organization',
          'Set up automated organization rules',
        ].filter(Boolean),
        scanType: (!forceDelta && (forceFull || scanDecision.shouldRunFull)) ? 'full' : 'delta',
        metrics: { pages: metrics.pages, writeOps: metrics.writeOps, durationMs },
      },
    };

    await setProgress({ current: 6, total: 6, currentStep: 'Finalizing scan results...' });
    if (await isCancelled()) return await fail('Scan cancelled by user');

    await complete(results);
    logger.info('Scan completed', { jobId, uid, files: totalFiles });
  } catch (e: any) {
    logger.error('Scan job failed', e);
    await jobRef.update({ status: 'failed', error: e?.message || String(e), completedAt: Date.now(), updatedAt: Date.now() });
  }
}

async function driveForUser(db: Firestore, uid: string) {
  const doc = await db.collection(`users/${uid}/secrets`).doc('googleDrive').get();
  const refreshToken = (doc.exists ? (doc.data() as any)?.refreshToken : null) as string | null;
  if (!refreshToken) throw new Error('No Google Drive connection');
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Missing Google OAuth credentials');
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: 'v3', auth: oauth2Client });
}

async function shouldRunFullScan(db: Firestore, uid: string): Promise<{ shouldRunFull: boolean; reason: string; lastScanTime?: string; fileCount?: number }> {
  try {
    const completed = await db.collection(COLLECTIONS.SCAN_JOBS)
      .where('uid', '==', uid)
      .where('status', '==', 'completed')
      .orderBy('completedAt', 'desc')
      .limit(1)
      .get();
    let lastScanTime: string | undefined;
    if (!completed.empty) {
      const t = completed.docs[0].data().completedAt;
      lastScanTime = t ? new Date(t).toISOString() : undefined;
    }
    if (!lastScanTime) return { shouldRunFull: true, reason: 'No previous scan found' };
    const days = (Date.now() - new Date(lastScanTime).getTime()) / (24 * 60 * 60 * 1000);
    if (days > 7) return { shouldRunFull: true, reason: 'Last scan is more than 7 days old', lastScanTime };
    const indexSnapshot = await db.collection(COLLECTIONS.FILE_INDEX).where('uid', '==', uid).where('isDeleted', '!=', true).get();
    const fileCount = indexSnapshot.size;
    if (fileCount < 100) return { shouldRunFull: true, reason: 'File index is incomplete (<100 files)', lastScanTime, fileCount };
    return { shouldRunFull: false, reason: 'Delta scan sufficient', lastScanTime, fileCount };
  } catch (e: any) {
    logger.warn('shouldRunFullScan error; defaulting to full', e);
    return { shouldRunFull: true, reason: 'Error checking scan requirements' };
  }
}

async function scanAndIndexFiles(
  db: Firestore,
  uid: string,
  drive: any,
  config: any,
  scanId: string,
  jobRef: FirebaseFirestore.DocumentReference,
  setProgress: (p: Partial<ScanProgress>, s?: ScanStatus) => Promise<void>,
  isCancelled: () => Promise<boolean>,
  metrics: { pages: number; writeOps: number },
) {
  let pageToken: string | undefined;
  let totalSize = 0;
  let totalFiles = 0;
  let duplicateGroups = 0;
  let pageCount = 0;

  // Load existing index once for delta comparison
  const existingSnapshot = await db.collection(COLLECTIONS.FILE_INDEX)
    .where('uid', '==', uid)
    .where('isDeleted', '!=', true)
    .get();
  const existing = new Map<string, FileIndexEntry>();
  existingSnapshot.forEach(d => existing.set((d.data() as any).id, d.data() as FileIndexEntry));

  const scannedIds = new Set<string>();

  do {
    if (await isCancelled()) throw new Error('Scan cancelled by user');
    const res: any = await withBackoff(() => drive.files.list({
      pageSize: 1000,
      pageToken,
      q: config?.includeTrashed ? undefined : 'trashed = false',
      fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, parents, md5Checksum, version)',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    }));
    const files: any[] = res.data.files || [];
    pageCount++;
    metrics.pages++;
    totalFiles += files.length;
    for (const f of files) totalSize += parseInt(f.size || '0');

    // Update progress
    await setProgress({
      currentStep: `Scanning: ${totalFiles.toLocaleString()} files found (${Math.round(totalSize / 1024 / 1024 / 1024)} GB)` ,
      current: 3,
      total: 6,
      bytesProcessed: totalSize,
    });

    // Index update per page
    const writer = (db as any).bulkWriter ? (db as any).bulkWriter() : null;
    const batch = writer || db.batch();
    for (const file of files) {
      scannedIds.add(file.id);
      const current = existing.get(file.id);
      const entry: Omit<FileIndexEntry, 'createdAt' | 'updatedAt'> = {
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
      } as any;
      const docRef = db.collection(COLLECTIONS.FILE_INDEX).doc(`${uid}_${file.id}`);
      if (current) {
        const hasChanged = current.modifiedTime !== entry.modifiedTime || current.size !== entry.size || current.name !== entry.name || current.parentId !== entry.parentId;
        if (hasChanged) {
          const deltaRef = db.collection(COLLECTIONS.SCAN_DELTAS).doc();
          if (writer) {
            writer.set(deltaRef, { id: deltaRef.id, uid, scanId, type: 'modified', fileId: file.id, fileName: file.name, sizeChange: entry.size - (current.size || 0), timestamp: Date.now(), processed: false });
            writer.update(docRef, { ...entry, updatedAt: Date.now() });
          } else {
            batch.set(deltaRef, { id: deltaRef.id, uid, scanId, type: 'modified', fileId: file.id, fileName: file.name, sizeChange: entry.size - (current.size || 0), timestamp: Date.now(), processed: false });
            batch.update(docRef, { ...entry, updatedAt: Date.now() });
          }
          metrics.writeOps += 2;
        }
      } else {
        const deltaRef = db.collection(COLLECTIONS.SCAN_DELTAS).doc();
        if (writer) {
          writer.set(deltaRef, { id: deltaRef.id, uid, scanId, type: 'created', fileId: file.id, fileName: file.name, timestamp: Date.now(), processed: false });
          writer.set(docRef, { ...entry, createdAt: Date.now(), updatedAt: Date.now() });
        } else {
          batch.set(deltaRef, { id: deltaRef.id, uid, scanId, type: 'created', fileId: file.id, fileName: file.name, timestamp: Date.now(), processed: false });
          batch.set(docRef, { ...entry, createdAt: Date.now(), updatedAt: Date.now() });
        }
        metrics.writeOps += 2;
      }
    }
    if (writer) {
      await writer.close();
    } else {
      await (batch as FirebaseFirestore.WriteBatch).commit();
    }

    // Simple duplicate group count per page (size + name/md5)
    duplicateGroups += countDuplicateGroups(files);

    pageToken = res.data.nextPageToken || undefined;
    if (pageToken) await sleep(100);
  } while (pageToken);

  // Mark missing files as deleted
  const writer2 = (db as any).bulkWriter ? (db as any).bulkWriter() : null;
  const batch2 = writer2 || db.batch();
  for (const [fileId, cur] of existing) {
    if (!scannedIds.has(fileId) && !cur.isDeleted) {
      const fileDoc = db.collection(COLLECTIONS.FILE_INDEX).doc(`${uid}_${fileId}`);
      if (writer2) {
        writer2.update(fileDoc, { isDeleted: true, lastScanId: scanId, updatedAt: Date.now() });
      } else {
        batch2.update(fileDoc, { isDeleted: true, lastScanId: scanId, updatedAt: Date.now() });
      }
      const deltaDoc = db.collection(COLLECTIONS.SCAN_DELTAS).doc();
      if (writer2) {
        writer2.set(deltaDoc, { id: deltaDoc.id, uid, scanId, type: 'deleted', fileId, fileName: cur.name, timestamp: Date.now(), processed: false });
      } else {
        batch2.set(deltaDoc, { id: deltaDoc.id, uid, scanId, type: 'deleted', fileId, fileName: cur.name, timestamp: Date.now(), processed: false });
      }
      metrics.writeOps += 2;
    }
  }
  if (writer2) {
    await writer2.close();
  } else {
    await (batch2 as FirebaseFirestore.WriteBatch).commit();
  }

  return { totalSize, totalFiles, duplicates: duplicateGroups };
}

// Delta scan via Drive Changes API
async function scanChangesAndIndexFiles(
  db: Firestore,
  uid: string,
  drive: any,
  config: any,
  scanId: string,
  jobRef: FirebaseFirestore.DocumentReference,
  setProgress: (p: Partial<ScanProgress>, s?: ScanStatus) => Promise<void>,
  isCancelled: () => Promise<boolean>,
  metrics: { pages: number; writeOps: number },
  startPageToken?: string,
) {
  let totalSize = 0;
  let totalFiles = 0;
  let duplicates = 0;
  const changedFilesForDup: any[] = [];

  // Load existing index for quick lookups
  const existingSnapshot = await db.collection(COLLECTIONS.FILE_INDEX)
    .where('uid', '==', uid)
    .where('isDeleted', '!=', true)
    .get();
  const existing = new Map<string, FileIndexEntry>();
  existingSnapshot.forEach(d => existing.set((d.data() as any).id, d.data() as FileIndexEntry));

  // Get or init page token
  let pageToken = startPageToken || await getSavedPageToken(db, uid);
  if (!pageToken) pageToken = await getStartPageToken(drive);

  let nextPageToken: string | undefined = pageToken;
  let newStartPageToken: string | undefined;
  const touched = new Set<string>();

  do {
    if (await isCancelled()) throw new Error('Scan cancelled by user');
    const res: any = await withBackoff(() => drive.changes.list({
      pageToken: nextPageToken,
      pageSize: 1000,
      fields: 'nextPageToken,newStartPageToken,changes(removed,fileId,file(id,name,mimeType,size,modifiedTime,parents,md5Checksum,version,trashed))',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
      restrictToMyDrive: false,
      spaces: 'drive',
    }));

    const changes: any[] = res.data.changes || [];
    newStartPageToken = res.data.newStartPageToken || newStartPageToken;
    nextPageToken = res.data.nextPageToken || undefined;

    metrics.pages++;
    const writer = (db as any).bulkWriter ? (db as any).bulkWriter() : null;
    const batch = writer || db.batch();
    for (const ch of changes) {
      const fileId = ch.fileId as string;
      touched.add(fileId);
      const file = ch.file;
      const removed = !!ch.removed || (file?.trashed === true);
      const fileRef = db.collection(COLLECTIONS.FILE_INDEX).doc(`${uid}_${fileId}`);
      if (removed) {
        if (writer) {
          writer.update(fileRef, { isDeleted: true, lastScanId: scanId, updatedAt: Date.now() });
        } else {
          batch.update(fileRef, { isDeleted: true, lastScanId: scanId, updatedAt: Date.now() });
        }
        const deltaRef = db.collection(COLLECTIONS.SCAN_DELTAS).doc();
        if (writer) {
          writer.set(deltaRef, { id: deltaRef.id, uid, scanId, type: 'deleted', fileId, fileName: existing.get(fileId)?.name || '', timestamp: Date.now(), processed: false });
        } else {
          batch.set(deltaRef, { id: deltaRef.id, uid, scanId, type: 'deleted', fileId, fileName: existing.get(fileId)?.name || '', timestamp: Date.now(), processed: false });
        }
        metrics.writeOps += 2;
        continue;
      }
      if (!file) continue;
      const entry: Omit<FileIndexEntry, 'createdAt' | 'updatedAt'> = {
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
      } as any;
      totalFiles += 1;
      totalSize += entry.size || 0;
      const current = existing.get(fileId);
      changedFilesForDup.push(file);
      if (current) {
        const hasChanged = current.modifiedTime !== entry.modifiedTime || current.size !== entry.size || current.name !== entry.name || current.parentId !== entry.parentId;
        if (hasChanged) {
          const deltaRef = db.collection(COLLECTIONS.SCAN_DELTAS).doc();
          if (writer) {
            writer.set(deltaRef, { id: deltaRef.id, uid, scanId, type: 'modified', fileId, fileName: file.name, sizeChange: entry.size - (current.size || 0), timestamp: Date.now(), processed: false });
            writer.update(fileRef, { ...entry, updatedAt: Date.now() });
          } else {
            batch.set(deltaRef, { id: deltaRef.id, uid, scanId, type: 'modified', fileId, fileName: file.name, sizeChange: entry.size - (current.size || 0), timestamp: Date.now(), processed: false });
            batch.update(fileRef, { ...entry, updatedAt: Date.now() });
          }
          metrics.writeOps += 2;
        }
      } else {
        const deltaRef = db.collection(COLLECTIONS.SCAN_DELTAS).doc();
        if (writer) {
          writer.set(deltaRef, { id: deltaRef.id, uid, scanId, type: 'created', fileId, fileName: file.name, timestamp: Date.now(), processed: false });
          writer.set(fileRef, { ...entry, createdAt: Date.now(), updatedAt: Date.now() });
        } else {
          batch.set(deltaRef, { id: deltaRef.id, uid, scanId, type: 'created', fileId, fileName: file.name, timestamp: Date.now(), processed: false });
          batch.set(fileRef, { ...entry, createdAt: Date.now(), updatedAt: Date.now() });
        }
        metrics.writeOps += 2;
      }
    }
    if (writer) {
      await writer.close();
    } else {
      await (batch as FirebaseFirestore.WriteBatch).commit();
    }

    // Progress update
    await setProgress({
      currentStep: `Delta: ${touched.size.toLocaleString()} changes (${Math.round(totalSize / 1024 / 1024 / 1024)} GB)` ,
      current: 3,
      total: 6,
      bytesProcessed: totalSize,
    });

    // Approximate duplicate groups among changed files on this page
    duplicates += countDuplicateGroups(changedFilesForDup.splice(0));
    if (nextPageToken) await sleep(100);
  } while (nextPageToken);

  // Save new start page token for future runs
  if (newStartPageToken) {
    await saveDriveState(db, uid, { pageToken: newStartPageToken });
  }

  // duplicates already aggregated per page from changed files

  return { totalSize, totalFiles, duplicates };
}

async function getSavedPageToken(db: Firestore, uid: string): Promise<string | null> {
  const ref = db.collection(COLLECTIONS.USERS).doc(uid).collection('secrets').doc('driveState');
  const snap = await ref.get();
  if (!snap.exists) return null;
  return (snap.data() as any)?.pageToken || null;
}

async function saveDriveState(db: Firestore, uid: string, state: { pageToken: string }) {
  const ref = db.collection(COLLECTIONS.USERS).doc(uid).collection('secrets').doc('driveState');
  await ref.set({ ...state, updatedAt: Date.now() }, { merge: true });
}

async function getStartPageToken(drive: any): Promise<string> {
  const res: any = await withBackoff(() => drive.changes.getStartPageToken({ supportsAllDrives: true }));
  const token = res.data.startPageToken as string;
  if (!token) throw new Error('Failed to obtain Drive start page token');
  return token;
}

function countDuplicateGroups(files: any[]): number {
  const groups = new Map<string, number>();
  for (const f of files) {
    const size = f.size || '0';
    if (size === '0') continue;
    const key = (f.md5Checksum || (f.name || '').toLowerCase().replace(/[^a-z0-9]/g, '')) + `:${size}`;
    groups.set(key, (groups.get(key) || 0) + 1);
  }
  let count = 0;
  groups.forEach(v => { if (v > 1) count++; });
  return count;
}

async function withBackoff<T>(fn: () => Promise<T>, attempt = 0): Promise<T> {
  try {
    return await fn();
  } catch (e: any) {
    const msg = e?.errors?.[0]?.reason || e?.code || e?.message || '';
    if (attempt >= 5) throw e;
    if (String(msg).includes('rateLimit') || String(msg).includes('userRateLimit') || (e?.response?.status >= 500)) {
      const delay = Math.min(2000 * Math.pow(2, attempt), 15000);
      await sleep(delay);
      return withBackoff(fn, attempt + 1);
    }
    throw e;
  }
}

function sleep(ms: number) { return new Promise(res => setTimeout(res, ms)); }
