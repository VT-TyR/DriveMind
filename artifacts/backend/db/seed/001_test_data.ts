/**
 * @fileoverview Seed Data 001: Test Data for Backend Repair Validation
 * 
 * PURPOSE:
 * - Create test data to validate backend repairs
 * - Provide sample scan jobs and file index entries
 * - Test token sync and API restoration
 * 
 * VERSION: 1.0.0-REPAIR
 * PRIORITY: P0-EMERGENCY
 */

import { Firestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';

interface SeedResult {
  success: boolean;
  itemsCreated: number;
  collections: string[];
  errors: string[];
  testUserId?: string;
}

export class TestDataSeeder {
  private db: Firestore;
  private testUserId = 'test_user_repair_validation';

  constructor(db: Firestore) {
    this.db = db;
  }

  /**
   * SEED: Create test data for backend repair validation
   */
  async seed(): Promise<SeedResult> {
    const result: SeedResult = {
      success: false,
      itemsCreated: 0,
      collections: [],
      errors: [],
      testUserId: this.testUserId
    };

    try {
      logger.info('Starting test data seeding');

      // Create test user tokens
      await this.createTestTokens(result);

      // Create test scan jobs
      await this.createTestScanJobs(result);

      // Create test file index
      await this.createTestFileIndex(result);

      // Create test audit logs
      await this.createTestAuditLogs(result);

      // Create health check data
      await this.createHealthCheckData(result);

      result.success = result.errors.length === 0;
      
      logger.info('Test data seeding completed', {
        success: result.success,
        itemsCreated: result.itemsCreated,
        collections: result.collections,
        errors: result.errors.length
      });

      return result;

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      result.errors.push(`Seeding failed: ${errorMsg}`);
      logger.error('Test data seeding failed', { error: errorMsg });
      return result;
    }
  }

  /**
   * Create test user tokens in correct format
   */
  private async createTestTokens(result: SeedResult): Promise<void> {
    try {
      const tokenData = {
        refreshToken: 'test_refresh_token_' + Date.now(),
        accessToken: 'test_access_token_' + Date.now(),
        accessTokenExpiry: Date.now() + (60 * 60 * 1000), // 1 hour
        scopes: [
          'https://www.googleapis.com/auth/drive',
          'https://www.googleapis.com/auth/drive.metadata.readonly'
        ],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        encryptionVersion: 'v1',
        testData: true
      };

      await this.db
        .collection('users')
        .doc(this.testUserId)
        .collection('secrets')
        .doc('googleDrive')
        .set(tokenData);

      result.itemsCreated++;
      if (!result.collections.includes('users/{uid}/secrets')) {
        result.collections.push('users/{uid}/secrets');
      }

      logger.info('Test tokens created', { userId: this.testUserId });

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      result.errors.push(`Failed to create test tokens: ${errorMsg}`);
      logger.error('Test token creation failed', { error: errorMsg });
    }
  }

  /**
   * Create test scan jobs with various states
   */
  private async createTestScanJobs(result: SeedResult): Promise<void> {
    try {
      const scanJobs = [
        {
          uid: this.testUserId,
          status: 'completed',
          type: 'drive_scan',
          progress: {
            current: 100,
            total: 100,
            percentage: 100,
            currentStep: 'Scan completed',
            filesProcessed: 150,
            bytesProcessed: 1024 * 1024 * 50 // 50MB
          },
          config: {
            maxDepth: 20,
            includeTrashed: false
          },
          results: {
            scanId: 'scan_test_' + Date.now(),
            filesFound: 150,
            duplicatesDetected: 5,
            totalSize: 1024 * 1024 * 50,
            insights: {
              totalFiles: 150,
              duplicateGroups: 5,
              totalSize: 1024 * 1024 * 50,
              archiveCandidates: 7,
              qualityScore: 85,
              recommendedActions: [
                'Remove 5 duplicate files to save storage',
                'Archive 7 old files to improve organization'
              ],
              scanType: 'full',
              indexChanges: {
                created: 150,
                updated: 0,
                deleted: 0
              }
            }
          },
          createdAt: Date.now() - (24 * 60 * 60 * 1000), // 1 day ago
          updatedAt: Date.now() - (23 * 60 * 60 * 1000),
          startedAt: Date.now() - (24 * 60 * 60 * 1000),
          completedAt: Date.now() - (23 * 60 * 60 * 1000),
          testData: true
        },
        {
          uid: this.testUserId,
          status: 'running',
          type: 'full_analysis',
          progress: {
            current: 45,
            total: 100,
            percentage: 45,
            currentStep: 'Scanning: 67 files found (25.3 MB)',
            filesProcessed: 67,
            bytesProcessed: 1024 * 1024 * 25
          },
          config: {
            maxDepth: 20,
            includeTrashed: false
          },
          createdAt: Date.now() - (10 * 60 * 1000), // 10 minutes ago
          updatedAt: Date.now() - (2 * 60 * 1000), // 2 minutes ago
          startedAt: Date.now() - (10 * 60 * 1000),
          testData: true
        },
        {
          uid: this.testUserId,
          status: 'failed',
          type: 'duplicate_detection',
          progress: {
            current: 0,
            total: 1,
            percentage: 0,
            currentStep: 'Failed: Token refresh failed'
          },
          config: {
            maxDepth: 10,
            includeTrashed: false
          },
          error: 'Token refresh failed for user. Please re-authorize your Google Drive.',
          createdAt: Date.now() - (2 * 24 * 60 * 60 * 1000), // 2 days ago
          updatedAt: Date.now() - (2 * 24 * 60 * 60 * 1000),
          startedAt: Date.now() - (2 * 24 * 60 * 60 * 1000),
          completedAt: Date.now() - (2 * 24 * 60 * 60 * 1000),
          testData: true
        }
      ];

      for (const job of scanJobs) {
        const docRef = await this.db.collection('scanJobs').add(job);
        result.itemsCreated++;
        
        logger.info('Test scan job created', { 
          jobId: docRef.id,
          status: job.status,
          type: job.type 
        });
      }

      if (!result.collections.includes('scanJobs')) {
        result.collections.push('scanJobs');
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      result.errors.push(`Failed to create test scan jobs: ${errorMsg}`);
      logger.error('Test scan job creation failed', { error: errorMsg });
    }
  }

  /**
   * Create test file index entries
   */
  private async createTestFileIndex(result: SeedResult): Promise<void> {
    try {
      const fileEntries = [
        {
          id: 'test_file_1',
          uid: this.testUserId,
          name: 'Important Document.pdf',
          mimeType: 'application/pdf',
          size: 1024 * 1024 * 2, // 2MB
          modifiedTime: new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)).toISOString(), // 1 week ago
          parentId: 'root',
          md5Checksum: 'test_checksum_1',
          version: 1,
          lastScanId: 'scan_test_' + Date.now(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          testData: true
        },
        {
          id: 'test_file_2',
          uid: this.testUserId,
          name: 'Duplicate Image.jpg',
          mimeType: 'image/jpeg',
          size: 1024 * 512, // 512KB
          modifiedTime: new Date(Date.now() - (3 * 24 * 60 * 60 * 1000)).toISOString(), // 3 days ago
          parentId: 'test_folder_1',
          md5Checksum: 'duplicate_checksum',
          version: 1,
          lastScanId: 'scan_test_' + Date.now(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          testData: true
        },
        {
          id: 'test_file_3',
          uid: this.testUserId,
          name: 'Duplicate Image Copy.jpg',
          mimeType: 'image/jpeg',
          size: 1024 * 512, // 512KB (same as above)
          modifiedTime: new Date(Date.now() - (3 * 24 * 60 * 60 * 1000)).toISOString(),
          parentId: 'test_folder_2',
          md5Checksum: 'duplicate_checksum', // Same checksum = duplicate
          version: 1,
          lastScanId: 'scan_test_' + Date.now(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          testData: true
        }
      ];

      for (const file of fileEntries) {
        await this.db
          .collection('fileIndex')
          .doc(`${this.testUserId}_${file.id}`)
          .set(file);
        
        result.itemsCreated++;
      }

      if (!result.collections.includes('fileIndex')) {
        result.collections.push('fileIndex');
      }

      logger.info('Test file index created', { 
        files: fileEntries.length,
        duplicates: 1 
      });

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      result.errors.push(`Failed to create test file index: ${errorMsg}`);
      logger.error('Test file index creation failed', { error: errorMsg });
    }
  }

  /**
   * Create test audit logs
   */
  private async createTestAuditLogs(result: SeedResult): Promise<void> {
    try {
      const auditLogs = [
        {
          uid: this.testUserId,
          operation: 'move',
          details: {
            fileId: 'test_file_1',
            newParentId: 'test_folder_1',
            oldParentId: 'root',
            timestamp: Date.now()
          },
          timestamp: Date.now() - (60 * 60 * 1000), // 1 hour ago
          userAgent: 'backend-api',
          source: 'file-operations',
          testData: true
        },
        {
          uid: this.testUserId,
          operation: 'rename',
          details: {
            fileId: 'test_file_2',
            oldName: 'Old Name.jpg',
            newName: 'Duplicate Image.jpg',
            timestamp: Date.now()
          },
          timestamp: Date.now() - (30 * 60 * 1000), // 30 minutes ago
          userAgent: 'backend-api',
          source: 'file-operations',
          testData: true
        }
      ];

      for (const log of auditLogs) {
        await this.db.collection('auditLogs').add(log);
        result.itemsCreated++;
      }

      if (!result.collections.includes('auditLogs')) {
        result.collections.push('auditLogs');
      }

      logger.info('Test audit logs created', { logs: auditLogs.length });

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      result.errors.push(`Failed to create test audit logs: ${errorMsg}`);
      logger.error('Test audit log creation failed', { error: errorMsg });
    }
  }

  /**
   * Create health check data
   */
  private async createHealthCheckData(result: SeedResult): Promise<void> {
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
        services: {
          tokenSync: 'healthy',
          apiRestoration: 'healthy',
          scanCompletion: 'healthy'
        },
        testData: true
      };

      await this.db.collection('functionsHealth').doc('latest').set(healthData);
      result.itemsCreated++;

      if (!result.collections.includes('functionsHealth')) {
        result.collections.push('functionsHealth');
      }

      logger.info('Health check data created');

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      result.errors.push(`Failed to create health check data: ${errorMsg}`);
      logger.error('Health check data creation failed', { error: errorMsg });
    }
  }

  /**
   * Clean up test data
   */
  async cleanup(): Promise<{ success: boolean; itemsDeleted: number; errors: string[] }> {
    const errors: string[] = [];
    let itemsDeleted = 0;

    try {
      logger.info('Starting test data cleanup');

      // Delete test user data
      const userRef = this.db.collection('users').doc(this.testUserId);
      const secretsSnapshot = await userRef.collection('secrets').get();
      
      for (const doc of secretsSnapshot.docs) {
        await doc.ref.delete();
        itemsDeleted++;
      }

      // Delete test scan jobs
      const scanJobsSnapshot = await this.db
        .collection('scanJobs')
        .where('uid', '==', this.testUserId)
        .get();
      
      for (const doc of scanJobsSnapshot.docs) {
        await doc.ref.delete();
        itemsDeleted++;
      }

      // Delete test file index
      const fileIndexSnapshot = await this.db
        .collection('fileIndex')
        .where('uid', '==', this.testUserId)
        .get();
      
      for (const doc of fileIndexSnapshot.docs) {
        await doc.ref.delete();
        itemsDeleted++;
      }

      // Delete test audit logs
      const auditLogsSnapshot = await this.db
        .collection('auditLogs')
        .where('uid', '==', this.testUserId)
        .get();
      
      for (const doc of auditLogsSnapshot.docs) {
        await doc.ref.delete();
        itemsDeleted++;
      }

      logger.info('Test data cleanup completed', { itemsDeleted });
      
      return { success: true, itemsDeleted, errors };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(`Cleanup failed: ${errorMsg}`);
      logger.error('Test data cleanup failed', { error: errorMsg });
      return { success: false, itemsDeleted, errors };
    }
  }
}

/**
 * FACTORY: Create test data seeder
 */
export function createTestDataSeeder(db: Firestore): TestDataSeeder {
  return new TestDataSeeder(db);
}

/**
 * RUNNER: Execute seeding
 */
export async function seedTestData(db: Firestore): Promise<SeedResult> {
  const seeder = createTestDataSeeder(db);
  return await seeder.seed();
}