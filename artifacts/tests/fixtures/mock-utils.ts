/**
 * Mock Utilities for DriveMind Tests - ALPHA Standards
 * Comprehensive mocking utilities for external services and dependencies
 */

import { vi } from 'vitest';

// Types
export interface MockGoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  modifiedTime?: string;
  parents?: string[];
  owners?: Array<{ displayName: string; emailAddress: string }>;
  shared?: boolean;
  trashed?: boolean;
  webViewLink?: string;
  md5Checksum?: string;
  properties?: Record<string, string>;
}

export interface MockFirestoreDoc {
  id: string;
  data: Record<string, any>;
  exists: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface MockAuthUser {
  uid: string;
  email: string;
  displayName: string;
  role?: string;
  permissions?: string[];
}

/**
 * Google APIs Mock Factory
 */
export class GoogleAPIMockFactory {
  /**
   * Create Google Drive API mock
   */
  static createDriveAPIMock() {
    const driveFiles = new Map<string, MockGoogleDriveFile>();
    
    return {
      files: {
        list: vi.fn().mockImplementation(async (params: any = {}) => {
          const { pageSize = 100, pageToken, q: query } = params;
          
          let files = Array.from(driveFiles.values());
          
          // Apply query filtering
          if (query) {
            if (query.includes('trashed=false')) {
              files = files.filter(f => !f.trashed);
            }
            if (query.includes('mimeType=')) {
              const mimeType = query.match(/mimeType='([^']+)'/)?.[1];
              if (mimeType) {
                files = files.filter(f => f.mimeType === mimeType);
              }
            }
          }
          
          // Pagination
          const startIndex = pageToken ? parseInt(pageToken) : 0;
          const endIndex = startIndex + pageSize;
          const paginatedFiles = files.slice(startIndex, endIndex);
          
          const hasNextPage = endIndex < files.length;
          
          return {
            data: {
              files: paginatedFiles,
              nextPageToken: hasNextPage ? endIndex.toString() : null,
              incompleteSearch: false
            }
          };
        }),
        
        get: vi.fn().mockImplementation(async (params: any) => {
          const file = driveFiles.get(params.fileId);
          if (!file) {
            throw new Error('File not found');
          }
          return { data: file };
        }),
        
        // Utility methods for test setup
        addFile: (file: MockGoogleDriveFile) => {
          driveFiles.set(file.id, file);
        },
        
        removeFile: (fileId: string) => {
          driveFiles.delete(fileId);
        },
        
        clear: () => {
          driveFiles.clear();
        },
        
        getFiles: () => Array.from(driveFiles.values())
      }
    };
  }

  /**
   * Create Google OAuth2 mock
   */
  static createOAuth2Mock() {
    return vi.fn().mockImplementation(() => ({
      generateAuthUrl: vi.fn().mockReturnValue(
        'https://accounts.google.com/o/oauth2/v2/auth?test=mock'
      ),
      
      getToken: vi.fn().mockResolvedValue({
        tokens: {
          access_token: 'mock_access_token',
          refresh_token: 'mock_refresh_token',
          expiry_date: Date.now() + 3600000,
          scope: ['https://www.googleapis.com/auth/drive']
        }
      }),
      
      setCredentials: vi.fn(),
      
      refreshAccessToken: vi.fn().mockResolvedValue({
        credentials: {
          access_token: 'refreshed_access_token',
          expiry_date: Date.now() + 3600000
        }
      }),
      
      verifyIdToken: vi.fn().mockResolvedValue({
        getPayload: () => ({
          sub: 'mock-user-id',
          email: 'test@example.com',
          name: 'Test User'
        })
      })
    }));
  }

  /**
   * Create Gemini AI API mock
   */
  static createGeminiAPIMock() {
    return {
      generateContent: vi.fn().mockImplementation(async (request: any) => {
        const prompt = request.contents?.[0]?.parts?.[0]?.text || '';
        
        // Simulate AI classification response
        if (prompt.includes('classify')) {
          return {
            response: {
              text: () => JSON.stringify({
                category: 'Document',
                confidence: 0.85,
                tags: ['business', 'document'],
                reasoning: 'Mock AI classification based on content analysis'
              })
            }
          };
        }
        
        // Simulate organization suggestions
        if (prompt.includes('organize')) {
          return {
            response: {
              text: () => JSON.stringify({
                suggestions: [
                  {
                    type: 'folder_creation',
                    title: 'Create Documents folder',
                    confidence: 0.9
                  }
                ]
              })
            }
          };
        }
        
        // Default response
        return {
          response: {
            text: () => 'Mock AI response'
          }
        };
      }),
      
      // Health check simulation
      getModel: vi.fn().mockResolvedValue({
        name: 'gemini-1.5-flash',
        displayName: 'Gemini 1.5 Flash',
        version: '001'
      })
    };
  }
}

/**
 * Firebase Mock Factory
 */
export class FirebaseMockFactory {
  /**
   * Create Firestore mock
   */
  static createFirestoreMock() {
    const documents = new Map<string, MockFirestoreDoc>();
    const collections = new Map<string, Map<string, MockFirestoreDoc>>();
    
    const createDocRef = (path: string) => ({
      get: vi.fn().mockImplementation(async () => {
        const doc = documents.get(path);
        return {
          exists: !!doc,
          id: path.split('/').pop(),
          data: () => doc?.data || null,
          ref: { path }
        };
      }),
      
      set: vi.fn().mockImplementation(async (data: any, options: any = {}) => {
        const docId = path.split('/').pop() || '';
        const existingDoc = documents.get(path);
        
        const newData = options.merge 
          ? { ...existingDoc?.data, ...data }
          : data;
          
        documents.set(path, {
          id: docId,
          data: newData,
          exists: true,
          createdAt: existingDoc?.createdAt || new Date(),
          updatedAt: new Date()
        });
      }),
      
      update: vi.fn().mockImplementation(async (updates: any) => {
        const existingDoc = documents.get(path);
        if (!existingDoc) {
          throw new Error('Document does not exist');
        }
        
        documents.set(path, {
          ...existingDoc,
          data: { ...existingDoc.data, ...updates },
          updatedAt: new Date()
        });
      }),
      
      delete: vi.fn().mockImplementation(async () => {
        documents.delete(path);
      }),
      
      path
    });
    
    const createCollectionRef = (path: string) => ({
      doc: vi.fn().mockImplementation((docId?: string) => {
        const docPath = docId ? `${path}/${docId}` : `${path}/${generateId()}`;
        return createDocRef(docPath);
      }),
      
      add: vi.fn().mockImplementation(async (data: any) => {
        const docId = generateId();
        const docPath = `${path}/${docId}`;
        const docRef = createDocRef(docPath);
        await docRef.set(data);
        return docRef;
      }),
      
      get: vi.fn().mockImplementation(async () => {
        const collectionDocs = collections.get(path) || new Map();
        const docs = Array.from(collectionDocs.values()).map(doc => ({
          id: doc.id,
          exists: doc.exists,
          data: () => doc.data,
          ref: createDocRef(`${path}/${doc.id}`)
        }));
        
        return {
          docs,
          size: docs.length,
          empty: docs.length === 0,
          forEach: (callback: Function) => docs.forEach(callback)
        };
      }),
      
      where: vi.fn().mockImplementation(() => createCollectionRef(path)),
      orderBy: vi.fn().mockImplementation(() => createCollectionRef(path)),
      limit: vi.fn().mockImplementation(() => createCollectionRef(path)),
      
      path
    });
    
    return {
      doc: vi.fn().mockImplementation((path: string) => createDocRef(path)),
      collection: vi.fn().mockImplementation((path: string) => createCollectionRef(path)),
      
      // Utility methods for tests
      _setDoc: (path: string, data: any) => {
        documents.set(path, {
          id: path.split('/').pop() || '',
          data,
          exists: true,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      },
      
      _getDoc: (path: string) => documents.get(path),
      
      _clear: () => {
        documents.clear();
        collections.clear();
      },
      
      _getAllDocs: () => Array.from(documents.entries())
    };
  }

  /**
   * Create Firebase Auth mock
   */
  static createAuthMock() {
    const users = new Map<string, MockAuthUser>();
    
    return {
      verifyIdToken: vi.fn().mockImplementation(async (token: string) => {
        if (token === 'invalid-token') {
          throw new Error('Invalid token');
        }
        
        return {
          uid: 'mock-user-id',
          email: 'test@example.com',
          name: 'Test User',
          iss: 'https://securetoken.google.com/test-project',
          aud: 'test-project',
          auth_time: Date.now() / 1000,
          user_id: 'mock-user-id',
          sub: 'mock-user-id'
        };
      }),
      
      createCustomToken: vi.fn().mockImplementation(async (uid: string) => {
        return `custom-token-${uid}`;
      }),
      
      getUser: vi.fn().mockImplementation(async (uid: string) => {
        const user = users.get(uid);
        if (!user) {
          throw new Error('User not found');
        }
        return user;
      }),
      
      // Utility methods for tests
      _setUser: (user: MockAuthUser) => {
        users.set(user.uid, user);
      },
      
      _clear: () => {
        users.clear();
      }
    };
  }
}

/**
 * Test Data Generators
 */
export class TestDataGenerator {
  /**
   * Generate mock Google Drive files
   */
  static generateDriveFiles(count: number): MockGoogleDriveFile[] {
    const fileTypes = [
      { mimeType: 'application/pdf', extension: 'pdf' },
      { mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', extension: 'docx' },
      { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: 'xlsx' },
      { mimeType: 'image/jpeg', extension: 'jpg' },
      { mimeType: 'image/png', extension: 'png' },
      { mimeType: 'video/mp4', extension: 'mp4' }
    ];
    
    return Array.from({ length: count }, (_, i) => {
      const fileType = fileTypes[i % fileTypes.length];
      const size = Math.floor(Math.random() * 10000000) + 1024;
      
      return {
        id: `file_${i}_${generateId()}`,
        name: `Test_File_${i}.${fileType.extension}`,
        mimeType: fileType.mimeType,
        size: size.toString(),
        createdTime: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
        modifiedTime: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
        parents: ['parent_folder_123'],
        owners: [{
          displayName: 'Test Owner',
          emailAddress: 'owner@example.com'
        }],
        shared: Math.random() > 0.7,
        trashed: Math.random() > 0.9,
        webViewLink: `https://drive.google.com/file/d/file_${i}_${generateId()}/view`,
        md5Checksum: generateHash(),
        properties: {
          category: ['work', 'personal', 'archive'][Math.floor(Math.random() * 3)]
        }
      };
    });
  }

  /**
   * Generate duplicate file groups
   */
  static generateDuplicateGroups(groupCount: number): Array<{ files: MockGoogleDriveFile[]; type: string }> {
    return Array.from({ length: groupCount }, (_, i) => {
      const baseFile = this.generateDriveFiles(1)[0];
      const duplicateCount = Math.floor(Math.random() * 4) + 2; // 2-5 duplicates
      
      const files = Array.from({ length: duplicateCount }, (_, j) => ({
        ...baseFile,
        id: `dup_${i}_${j}_${generateId()}`,
        name: j === 0 ? baseFile.name : `${baseFile.name.replace(/\.[^.]+$/, '')} (${j})${baseFile.name.match(/\.[^.]+$/)?.[0] || ''}`,
        modifiedTime: new Date(Date.now() - j * 60000).toISOString() // Different times
      }));
      
      return {
        files,
        type: Math.random() > 0.5 ? 'exact_match' : 'fuzzy_match'
      };
    });
  }

  /**
   * Generate scan results
   */
  static generateScanResults(fileCount: number) {
    const files = this.generateDriveFiles(fileCount);
    const duplicates = this.generateDuplicateGroups(Math.floor(fileCount * 0.1));
    
    const filesByType = files.reduce((acc, file) => {
      const type = getFileTypeFromMimeType(file.mimeType);
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const totalSize = files.reduce((sum, file) => sum + parseInt(file.size || '0'), 0);
    const duplicateFiles = duplicates.reduce((sum, group) => sum + group.files.length - 1, 0);
    
    return {
      scanId: `scan_${generateId()}`,
      totalFiles: fileCount,
      totalSize,
      filesByType,
      folderDepth: Math.floor(Math.random() * 8) + 3,
      duplicateFiles,
      unusedFiles: Math.floor(fileCount * 0.15),
      largestFiles: files
        .sort((a, b) => parseInt(b.size || '0') - parseInt(a.size || '0'))
        .slice(0, 10),
      completedAt: new Date().toISOString(),
      processingTime: Math.random() * 120 + 30 // 30-150 seconds
    };
  }
}

/**
 * Mock Response Factory
 */
export class MockResponseFactory {
  /**
   * Create HTTP response mock
   */
  static createHttpResponse(status: number, data: any, headers: Record<string, string> = {}) {
    return {
      status,
      ok: status >= 200 && status < 300,
      headers: new Map(Object.entries(headers)),
      json: vi.fn().mockResolvedValue(data),
      text: vi.fn().mockResolvedValue(typeof data === 'string' ? data : JSON.stringify(data)),
      blob: vi.fn().mockResolvedValue(new Blob([JSON.stringify(data)])),
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0))
    };
  }

  /**
   * Create error response mock
   */
  static createErrorResponse(status: number, error: string, message: string, details?: string) {
    return this.createHttpResponse(status, {
      error,
      message,
      details,
      timestamp: new Date().toISOString(),
      requestId: generateId()
    });
  }

  /**
   * Create success response mock
   */
  static createSuccessResponse(data: any, headers: Record<string, string> = {}) {
    return this.createHttpResponse(200, data, headers);
  }
}

/**
 * Test Environment Utilities
 */
export class TestEnvironment {
  /**
   * Setup test environment with mocks
   */
  static async setup() {
    // Mock Google APIs
    const mockGoogleAPIs = vi.hoisted(() => ({
      google: {
        auth: {
          OAuth2: GoogleAPIMockFactory.createOAuth2Mock()
        },
        drive: GoogleAPIMockFactory.createDriveAPIMock
      }
    }));

    // Mock Firebase
    const mockFirebase = vi.hoisted(() => ({
      auth: FirebaseMockFactory.createAuthMock(),
      firestore: FirebaseMockFactory.createFirestoreMock()
    }));

    // Mock environment variables
    process.env.NODE_ENV = 'test';
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret';
    process.env.GEMINI_API_KEY = 'test-gemini-key';

    return {
      googleAPIs: mockGoogleAPIs,
      firebase: mockFirebase
    };
  }

  /**
   * Cleanup test environment
   */
  static cleanup() {
    vi.clearAllMocks();
    vi.resetAllMocks();
    
    // Reset environment variables
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    delete process.env.GEMINI_API_KEY;
  }
}

/**
 * Utility Functions
 */

function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function generateHash(): string {
  return Array.from({ length: 32 }, () => 
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
}

function getFileTypeFromMimeType(mimeType: string): string {
  const typeMap: Record<string, string> = {
    'application/pdf': 'PDF',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Spreadsheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'Presentation',
    'image/jpeg': 'Image',
    'image/png': 'Image',
    'image/gif': 'Image',
    'video/mp4': 'Video',
    'audio/mpeg': 'Audio',
    'application/zip': 'Archive'
  };
  
  return typeMap[mimeType] || 'Other';
}

/**
 * Performance Testing Utilities
 */
export class PerformanceTestUtils {
  /**
   * Measure async function execution time
   */
  static async measureExecutionTime<T>(fn: () => Promise<T>): Promise<{ result: T; time: number }> {
    const startTime = performance.now();
    const result = await fn();
    const endTime = performance.now();
    
    return {
      result,
      time: endTime - startTime
    };
  }

  /**
   * Run performance benchmark
   */
  static async benchmark(
    name: string,
    fn: () => Promise<any>,
    options: { iterations?: number; warmup?: number } = {}
  ) {
    const { iterations = 10, warmup = 2 } = options;
    
    // Warmup runs
    for (let i = 0; i < warmup; i++) {
      await fn();
    }
    
    // Actual benchmark runs
    const times: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const { time } = await this.measureExecutionTime(fn);
      times.push(time);
    }
    
    const avg = times.reduce((a, b) => a + b) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);
    const p95 = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];
    
    return {
      name,
      iterations,
      times,
      avg,
      min,
      max,
      p95
    };
  }
}

export default {
  GoogleAPIMockFactory,
  FirebaseMockFactory,
  TestDataGenerator,
  MockResponseFactory,
  TestEnvironment,
  PerformanceTestUtils
};