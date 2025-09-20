import { createJobChainManager, JobChainManager } from '../job-chain';
import { ScanCheckpoint } from '../checkpoint-manager';

const PROJECT_ID = 'test-project';
const testEnv = require('firebase-functions-test')({ projectId: PROJECT_ID });

const mockFirestoreData: { [key: string]: any } = {};

jest.mock('firebase-admin', () => ({
  __esModule: true,
  initializeApp: jest.fn(),
  firestore: jest.fn(() => ({
    collection: jest.fn((collectionPath: string) => ({
      doc: jest.fn((docPath: string) => ({
        set: jest.fn((data: any) => {
          mockFirestoreData[`${collectionPath}/${docPath}`] = data;
          return Promise.resolve();
        }),
        get: jest.fn(() => {
          const data = mockFirestoreData[`${collectionPath}/${docPath}`];
          return Promise.resolve({
            exists: !!data,
            data: () => data,
          });
        }),
        update: jest.fn((data: any) => {
          mockFirestoreData[`${collectionPath}/${docPath}`] = {
            ...mockFirestoreData[`${collectionPath}/${docPath}`],
            ...data,
          };
          return Promise.resolve();
        }),
        delete: jest.fn(() => {
          delete mockFirestoreData[`${collectionPath}/${docPath}`];
          return Promise.resolve();
        }),
      })),
    })),
  })),
}));

import * as admin from 'firebase-admin';

describe('JobChainManager', () => {
  let manager: JobChainManager;
  let db: admin.firestore.Firestore;

  beforeAll(async () => {
    db = admin.firestore();
    manager = createJobChainManager(db as any);
  });

  afterEach(async () => {
    await testEnv.cleanup();
  });

  afterAll(async () => {
    // No need to explicitly delete apps here, test.cleanup() handles it
  });

  it('should create a new instance', () => {
    expect(manager).toBeInstanceOf(JobChainManager);
  });

  it('should create a chained job', async () => {
    const checkpoint: ScanCheckpoint = {
      jobId: 'job-1',
      uid: 'user-1',
      scanId: 'scan-1',
      filesProcessed: 100,
      bytesProcessed: 1000,
      scanType: 'full',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      expiresAt: Date.now() + 3600 * 1000,
      metadata: {
        duplicatesFound: 0,
        indexUpdates: {
          created: 100,
          modified: 0,
          deleted: 0,
        },
        pagesProcessed: 1,
        errors: [],
      },
    };

    const chainedJobId = await manager.createChainedJob('job-1', 'user-1', checkpoint);

    const chainedJob = await manager.getJobChain(chainedJobId);
    expect(chainedJob).not.toBeNull();
    expect(chainedJob?.parentJobId).toBe('job-1');
    expect(chainedJob?.uid).toBe('user-1');
    expect(chainedJob?.status).toBe('pending');
  });

  it('should update chain status', async () => {
    const checkpoint: ScanCheckpoint = {
      jobId: 'job-2',
      uid: 'user-2',
      scanId: 'scan-2',
      filesProcessed: 200,
      bytesProcessed: 2000,
      scanType: 'full',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      expiresAt: Date.now() + 3600 * 1000,
      metadata: {
        duplicatesFound: 0,
        indexUpdates: {
          created: 200,
          modified: 0,
          deleted: 0,
        },
        pagesProcessed: 2,
        errors: [],
      },
    };

    const chainedJobId = await manager.createChainedJob('job-2', 'user-2', checkpoint);
    await manager.updateChainStatus(chainedJobId, 'running');

    const chainedJob = await manager.getJobChain(chainedJobId);
    expect(chainedJob?.status).toBe('running');
  });
});
