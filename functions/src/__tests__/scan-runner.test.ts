import { createScanRunner, ScanRunner } from '../scan-runner';
import { google } from 'googleapis';
import * as admin from 'firebase-admin';

const PROJECT_ID = 'test-project';
const testEnv = require('firebase-functions-test')({ projectId: PROJECT_ID });

jest.mock('firebase-admin', () => ({
  __esModule: true,
  initializeApp: jest.fn(),
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn(() => Promise.resolve({ exists: true, data: () => ({}) })),
        update: jest.fn(() => Promise.resolve()),
        set: jest.fn(() => Promise.resolve()),
        delete: jest.fn(() => Promise.resolve()),
      })),
    })),
  })),
}));

// Define a single mockDrive object
const mockDrive = {
  files: {
    list: jest.fn(() => ({ data: { files: [], nextPageToken: null } })),
  },
};

jest.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: jest.fn(() => ({
        setCredentials: jest.fn(),
        getAccessToken: jest.fn(() => ({ token: 'test-access-token' })),
      })),
    },
    drive: jest.fn(() => mockDrive), // Always return the same mockDrive instance
  },
}));

describe('ScanRunner', () => {
  let runner: ScanRunner;
  let db: admin.firestore.Firestore;

  afterEach(async () => {
    await testEnv.cleanup();
  });

  afterAll(async () => {
    // No need to explicitly delete apps here, test.cleanup() handles it
  });

  beforeEach(() => {
    (mockDrive.files.list as jest.Mock).mockClear();
    (mockDrive.files.list as jest.Mock).mockReset();
    db = admin.firestore();
    runner = createScanRunner(db as any, 'job-id', 'user-id', 'access-token', 'https://dataconnect.googleapis.com', mockDrive);
  });


  it('should create a new instance', () => {
    expect(runner).toBeInstanceOf(ScanRunner);
  });

  it('should run a scan', async () => {
    (mockDrive.files.list as jest.Mock).mockResolvedValueOnce({
      data: {
        files: [
          {
            id: 'file-1',
            name: 'file-1.txt',
            mimeType: 'text/plain',
            size: '100',
            modifiedTime: new Date().toISOString(),
            parents: ['root'],
            owners: [{ emailAddress: 'test@example.com' }],
            shared: false,
            starred: false,
            trashed: false,
            webViewLink: 'https://example.com/file-1',
            iconLink: 'https://example.com/icon-1',
            thumbnailLink: 'https://example.com/thumbnail-1',
          },
        ],
        nextPageToken: null,
      },
    });

    // @ts-ignore
    // @ts-ignore
    runner.callDataConnect = jest.fn(() => Promise.resolve({}));

    await runner.runScan();

    expect(mockDrive.files.list).toHaveBeenCalledTimes(1);
    // @ts-ignore
    expect(runner.callDataConnect).toHaveBeenCalledTimes(1);
  });
});
