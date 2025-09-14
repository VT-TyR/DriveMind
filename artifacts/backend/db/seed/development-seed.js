/**
 * Development Seed Data - ALPHA Standards
 * Minimal test data for development and testing environments
 */

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const seedData = {
  environment: 'development',
  description: 'Development seed data for testing and local development',
  timestamp: new Date().toISOString(),
  
  async seed() {
    console.log('Seeding development data...');
    
    try {
      await this.createTestUsers();
      await this.createSampleScanResults(); 
      await this.createSampleInventory();
      await this.createSampleRules();
      await this.createSystemTestData();
      
      console.log('Development seeding completed successfully');
      return { success: true, environment: this.environment };
      
    } catch (error) {
      console.error('Development seeding failed:', error);
      throw error;
    }
  },
  
  async cleanup() {
    console.log('Cleaning up development seed data...');
    
    const testUserIds = ['test_user_1', 'test_user_2'];
    
    for (const userId of testUserIds) {
      // Delete user collections
      await this.deleteCollection(`users/${userId}/scans`);
      await this.deleteCollection(`users/${userId}/inventory`);
      await this.deleteCollection(`users/${userId}/rules`);
      await this.deleteCollection(`users/${userId}/background_scans`);
      
      // Delete user document
      await db.doc(`users/${userId}`).delete();
    }
    
    // Clean up test system data
    await db.doc('_system/test_config').delete();
    
    console.log('Development seed cleanup completed');
    return { success: true, cleaned: true };
  },
  
  async createTestUsers() {
    console.log('Creating test users...');
    
    const testUsers = [
      {
        uid: 'test_user_1',
        email: 'test1@drivemind.dev',
        displayName: 'Test User One',
        createdAt: new Date('2024-01-01'),
        lastLoginAt: new Date(),
        scanCount: 3,
        totalFiles: 1250
      },
      {
        uid: 'test_user_2', 
        email: 'test2@drivemind.dev',
        displayName: 'Test User Two',
        createdAt: new Date('2024-02-15'),
        lastLoginAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
        scanCount: 1,
        totalFiles: 567
      }
    ];
    
    for (const user of testUsers) {
      await db.doc(`users/${user.uid}`).set({
        email: user.email,
        displayName: user.displayName,
        createdAt: admin.firestore.Timestamp.fromDate(user.createdAt),
        lastLoginAt: admin.firestore.Timestamp.fromDate(user.lastLoginAt),
        profile: {
          scanCount: user.scanCount,
          totalFiles: user.totalFiles,
          lastScanAt: admin.firestore.Timestamp.fromDate(user.lastLoginAt),
          preferences: {
            aiEnabled: true,
            autoOrganize: false,
            notificationEmail: user.email
          }
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    
    console.log(`Created ${testUsers.length} test users`);
  },
  
  async createSampleScanResults() {
    console.log('Creating sample scan results...');
    
    const scanResults = [
      {
        userId: 'test_user_1',
        scanId: 'scan_test_user_1_recent',
        status: 'completed',
        totalFiles: 1250,
        totalSize: 5368709120, // ~5GB
        filesByType: {
          'Document': 450,
          'Spreadsheet': 120,
          'Presentation': 80,
          'Image': 400,
          'PDF': 150,
          'Video': 30,
          'Other': 20
        },
        folderDepth: 8,
        duplicateFiles: 45,
        unusedFiles: 230,
        processingTime: 127.5,
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        completedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 127500)
      },
      {
        userId: 'test_user_1',
        scanId: 'scan_test_user_1_old',
        status: 'completed', 
        totalFiles: 890,
        totalSize: 3221225472, // ~3GB
        filesByType: {
          'Document': 320,
          'Spreadsheet': 95,
          'Image': 300,
          'PDF': 125,
          'Other': 50
        },
        folderDepth: 6,
        duplicateFiles: 32,
        unusedFiles: 180,
        processingTime: 89.2,
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
        completedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000 + 89200)
      },
      {
        userId: 'test_user_2',
        scanId: 'scan_test_user_2_first',
        status: 'completed',
        totalFiles: 567,
        totalSize: 2147483648, // ~2GB
        filesByType: {
          'Document': 200,
          'Spreadsheet': 67,
          'Image': 220,
          'PDF': 60,
          'Other': 20
        },
        folderDepth: 4,
        duplicateFiles: 18,
        unusedFiles: 90,
        processingTime: 45.8,
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
        completedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 + 45800)
      }
    ];
    
    for (const scan of scanResults) {
      await db.doc(`users/${scan.userId}/scans/${scan.scanId}`).set({
        scanId: scan.scanId,
        status: scan.status,
        totalFiles: scan.totalFiles,
        totalSize: scan.totalSize,
        filesByType: scan.filesByType,
        folderDepth: scan.folderDepth,
        duplicateFiles: scan.duplicateFiles,
        unusedFiles: scan.unusedFiles,
        processingTime: scan.processingTime,
        createdAt: admin.firestore.Timestamp.fromDate(scan.createdAt),
        completedAt: admin.firestore.Timestamp.fromDate(scan.completedAt),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    
    console.log(`Created ${scanResults.length} sample scan results`);
  },
  
  async createSampleInventory() {
    console.log('Creating sample inventory data...');
    
    const sampleFiles = [
      {
        userId: 'test_user_1',
        id: 'file_1_doc_important',
        name: 'Important Project Plan.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: 1024000,
        createdTime: '2024-01-15T10:30:00Z',
        modifiedTime: '2024-01-20T14:45:00Z',
        path: ['Projects', '2024', 'Q1'],
        webViewLink: 'https://drive.google.com/file/d/file_1_doc_important/view',
        isDuplicate: false,
        scanId: 'scan_test_user_1_recent'
      },
      {
        userId: 'test_user_1',
        id: 'file_1_sheet_budget',
        name: 'Budget 2024.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 512000,
        createdTime: '2024-01-10T09:00:00Z',
        modifiedTime: '2024-02-01T16:20:00Z',
        path: ['Finance', 'Budgets'],
        webViewLink: 'https://drive.google.com/file/d/file_1_sheet_budget/view',
        isDuplicate: false,
        scanId: 'scan_test_user_1_recent'
      },
      {
        userId: 'test_user_1',
        id: 'file_1_duplicate_1',
        name: 'IMG_20240101_001.jpg',
        mimeType: 'image/jpeg',
        size: 2048000,
        createdTime: '2024-01-01T12:00:00Z',
        modifiedTime: '2024-01-01T12:00:00Z',
        path: ['Photos', '2024', 'January'],
        webViewLink: 'https://drive.google.com/file/d/file_1_duplicate_1/view',
        isDuplicate: true,
        duplicateGroupId: 'group_1_photos',
        scanId: 'scan_test_user_1_recent'
      },
      {
        userId: 'test_user_1',
        id: 'file_1_duplicate_2',
        name: 'IMG_20240101_001 (1).jpg',
        mimeType: 'image/jpeg',
        size: 2048000,
        createdTime: '2024-01-01T12:01:00Z',
        modifiedTime: '2024-01-01T12:01:00Z',
        path: ['Photos', '2024', 'January'],
        webViewLink: 'https://drive.google.com/file/d/file_1_duplicate_2/view',
        isDuplicate: true,
        duplicateGroupId: 'group_1_photos',
        scanId: 'scan_test_user_1_recent'
      },
      {
        userId: 'test_user_2',
        id: 'file_2_presentation',
        name: 'Team Meeting Slides.pptx',
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        size: 3072000,
        createdTime: '2024-02-10T14:30:00Z',
        modifiedTime: '2024-02-15T09:15:00Z',
        path: ['Work', 'Presentations'],
        webViewLink: 'https://drive.google.com/file/d/file_2_presentation/view',
        isDuplicate: false,
        scanId: 'scan_test_user_2_first'
      }
    ];
    
    for (const file of sampleFiles) {
      await db.doc(`users/${file.userId}/inventory/${file.id}`).set({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
        createdTime: file.createdTime,
        modifiedTime: file.modifiedTime,
        path: file.path,
        webViewLink: file.webViewLink,
        isDuplicate: file.isDuplicate || false,
        duplicateGroupId: file.duplicateGroupId || null,
        scanId: file.scanId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    
    console.log(`Created ${sampleFiles.length} sample inventory items`);
  },
  
  async createSampleRules() {
    console.log('Creating sample organization rules...');
    
    const sampleRules = [
      {
        userId: 'test_user_1',
        id: 'rule_invoices',
        name: 'Organize Invoices',
        description: 'Move PDF invoices to Finance/Invoices folder',
        pattern: 'invoice.*\\.pdf',
        action: 'move',
        target: '/Finance/Invoices',
        conditions: {
          fileTypes: ['application/pdf'],
          namePattern: '.*invoice.*',
        },
        isActive: true,
        priority: 1,
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        lastApplied: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      },
      {
        userId: 'test_user_1',
        id: 'rule_screenshots',
        name: 'Organize Screenshots',
        description: 'Move screenshot images to Screenshots folder',
        pattern: '(screenshot|screen shot).*\\.(png|jpg|jpeg)',
        action: 'move',
        target: '/Screenshots',
        conditions: {
          fileTypes: ['image/png', 'image/jpeg'],
          namePattern: '.*(screenshot|screen shot).*',
        },
        isActive: true,
        priority: 2,
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        lastApplied: null
      }
    ];
    
    for (const rule of sampleRules) {
      await db.doc(`users/${rule.userId}/rules/${rule.id}`).set({
        id: rule.id,
        name: rule.name,
        description: rule.description,
        pattern: rule.pattern,
        action: rule.action,
        target: rule.target,
        conditions: rule.conditions,
        isActive: rule.isActive,
        priority: rule.priority,
        createdAt: admin.firestore.Timestamp.fromDate(rule.createdAt),
        lastApplied: rule.lastApplied ? admin.firestore.Timestamp.fromDate(rule.lastApplied) : null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    
    console.log(`Created ${sampleRules.length} sample organization rules`);
  },
  
  async createSystemTestData() {
    console.log('Creating system test data...');
    
    // Test system configuration
    await db.doc('_system/test_config').set({
      testEnvironment: true,
      testUsers: ['test_user_1', 'test_user_2'],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      seedVersion: '1.0.0'
    });
    
    // Update business metrics with test data
    await db.doc('_metrics/business').update({
      totalUsers: 2,
      totalScans: 3,
      totalFilesProcessed: 1817, // Sum of all test scan files
      totalDuplicatesDetected: 2,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log('System test data created');
  },
  
  async deleteCollection(collectionPath) {
    const query = db.collection(collectionPath);
    const snapshot = await query.get();
    
    if (snapshot.size === 0) return;
    
    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    
    console.log(`Deleted ${snapshot.size} documents from ${collectionPath}`);
  }
};

// Execute seeding if run directly
if (require.main === module) {
  const command = process.argv[2];
  
  if (command === 'cleanup') {
    seedData.cleanup()
      .then(result => {
        console.log('Cleanup completed:', result);
        process.exit(0);
      })
      .catch(error => {
        console.error('Cleanup failed:', error);
        process.exit(1);
      });
  } else {
    seedData.seed()
      .then(result => {
        console.log('Seeding completed:', result);
        process.exit(0);
      })
      .catch(error => {
        console.error('Seeding failed:', error);
        process.exit(1);
      });
  }
}

module.exports = seedData;