import { createCheckpointManager, CheckpointManager, ScanCheckpoint } from '../checkpoint-manager';

const PROJECT_ID = 'test-project';
const testEnv = require('firebase-functions-test')({ projectId: PROJECT_ID });
jest.mock('firebase-admin');
import * as admin from 'firebase-admin';

describe('CheckpointManager', () => {
  let manager: CheckpointManager;
  let db: admin.firestore.Firestore;
  const MOCK_TIMESTAMP = 1758159306000; // A fixed timestamp for consistent testing

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(MOCK_TIMESTAMP);

    const mockGetData: Record<string, any> = {};
    
    const mockDocRefs: Record<string, any> = {};

    const mockCollection = {
      doc: jest.fn((docId: string) => {
        if (!mockDocRefs[docId]) {
          mockDocRefs[docId] = {
            set: jest.fn((data) => {
              mockGetData[docId] = { ...mockGetData[docId], ...data };
              return Promise.resolve();
            }),
            get: jest.fn(() => {
              const data = mockGetData[docId];
              return Promise.resolve({
                exists: !!data,
                data: () => data
              });
            }),
            delete: jest.fn(() => {
              delete mockGetData[docId];
              return Promise.resolve();
            }),
          };
        }
        return mockDocRefs[docId];
      }),
    };

    const mockDb = {
      collection: jest.fn(() => mockCollection),
    };

    admin.firestore = jest.fn(() => mockDb as any);
    db = admin.firestore(); // Assign to db variable
    manager = createCheckpointManager(db);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await testEnv.cleanup();
  });

  

  it('should create a new instance', () => {
    expect(manager).toBeInstanceOf(CheckpointManager);
  });

  it('should save and retrieve a checkpoint', async () => {
    const checkpoint: ScanCheckpoint = {
      jobId: 'job-1',
      uid: 'user-1',
      scanId: 'scan-1',
      filesProcessed: 100,
      bytesProcessed: 1000,
      scanType: 'full',
      createdAt: MOCK_TIMESTAMP,
      updatedAt: MOCK_TIMESTAMP,
      expiresAt: MOCK_TIMESTAMP + 3600 * 1000,
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

    await manager.saveCheckpoint(checkpoint);

    const retrieved = await manager.getCheckpoint('user-1', 'job-1');
    expect(retrieved).toMatchObject({
      ...checkpoint,
      updatedAt: MOCK_TIMESTAMP,
      expiresAt: MOCK_TIMESTAMP + (24 * 60 * 60 * 1000), // 24 hours as per CHECKPOINT_TTL
    });
  });

  it('should delete a checkpoint', async () => {
    const checkpoint: ScanCheckpoint = {
      jobId: 'job-2',
      uid: 'user-2',
      scanId: 'scan-2',
      filesProcessed: 200,
      bytesProcessed: 2000,
      scanType: 'full',
      createdAt: MOCK_TIMESTAMP,
      updatedAt: MOCK_TIMESTAMP,
      expiresAt: MOCK_TIMESTAMP + 3600 * 1000,
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

    await manager.saveCheckpoint(checkpoint);
    await manager.deleteCheckpoint('user-2', 'job-2');

    const retrieved = await manager.getCheckpoint('user-2', 'job-2');
    expect(retrieved).toBeNull();
  });
});
