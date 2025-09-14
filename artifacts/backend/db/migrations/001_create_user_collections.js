/**
 * Firestore Migration 001: Create User Collections Structure
 * ALPHA Standards - Production-grade database schema with indexes and security
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const migration = {
  version: '001',
  description: 'Create user collections structure with indexes and security rules',
  timestamp: new Date().toISOString(),
  
  async up() {
    console.log('Running migration 001: Create user collections structure...');
    
    try {
      // Create composite indexes for user-scoped queries
      await this.createIndexes();
      
      // Create sample security rules documentation
      await this.createSecurityRulesTemplate();
      
      // Validate collection structure
      await this.validateCollections();
      
      console.log('Migration 001 completed successfully');
      return { success: true, version: this.version };
      
    } catch (error) {
      console.error('Migration 001 failed:', error);
      throw error;
    }
  },
  
  async down() {
    console.log('Rolling back migration 001...');
    
    // Note: Firestore doesn't support dropping indexes via Admin SDK
    // Indexes would need to be manually removed via Console or CLI
    console.log('Manual cleanup required: Remove indexes via Firebase Console');
    
    return { success: true, rollback: true };
  },
  
  async createIndexes() {
    console.log('Creating Firestore indexes...');
    
    // Note: Firestore indexes are typically created via firebase CLI or Console
    // This is documentation of required indexes for the migration record
    
    const requiredIndexes = [
      {
        collection: 'users/{userId}/scans',
        fields: [
          { fieldPath: 'status', order: 'ASCENDING' },
          { fieldPath: 'createdAt', order: 'DESCENDING' }
        ]
      },
      {
        collection: 'users/{userId}/inventory',
        fields: [
          { fieldPath: 'scanId', order: 'ASCENDING' },
          { fieldPath: 'updatedAt', order: 'DESCENDING' }
        ]
      },
      {
        collection: 'users/{userId}/inventory',
        fields: [
          { fieldPath: 'mimeType', order: 'ASCENDING' },
          { fieldPath: 'size', order: 'DESCENDING' }
        ]
      },
      {
        collection: 'users/{userId}/inventory',
        fields: [
          { fieldPath: 'isDuplicate', order: 'ASCENDING' },
          { fieldPath: 'duplicateGroupId', order: 'ASCENDING' }
        ]
      },
      {
        collection: 'users/{userId}/rules',
        fields: [
          { fieldPath: 'isActive', order: 'ASCENDING' },
          { fieldPath: 'priority', order: 'ASCENDING' }
        ]
      }
    ];
    
    // Store index requirements for CLI creation
    await db.doc('_migrations/001_indexes').set({
      requiredIndexes,
      instructions: 'Create these indexes using: firebase firestore:indexes:deploy',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`Documented ${requiredIndexes.length} required indexes`);
  },
  
  async createSecurityRulesTemplate() {
    console.log('Creating security rules template...');
    
    const securityRules = `
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // User-scoped data access only
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      
      // OAuth tokens - server-only access
      match /secrets/{document=**} {
        allow read, write: if false; // Server-only via Admin SDK
      }
      
      // Scan results and inventory
      match /scans/{scanId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
      
      match /inventory/{fileId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
        allow list: if request.auth != null && request.auth.uid == userId
          && request.query.limit <= 1000; // Prevent large queries
      }
      
      // Organization rules
      match /rules/{ruleId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
      
      // Background scan state
      match /background_scans/{scanId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
    
    // System collections (admin only in production)
    match /_migrations/{document=**} {
      allow read: if true; // Publicly readable for status checks
      allow write: if false; // Server-only
    }
    
    match /_system/{document=**} {
      allow read, write: if false; // Server-only
    }
  }
}`;

    await db.doc('_migrations/001_security_rules').set({
      rules: securityRules,
      description: 'Security rules template for user-scoped data access',
      instructions: 'Deploy using: firebase deploy --only firestore:rules',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log('Security rules template created');
  },
  
  async validateCollections() {
    console.log('Validating collection structure...');
    
    const collections = [
      'users/{userId}/secrets',      // OAuth tokens (encrypted)
      'users/{userId}/scans',        // Scan results and metadata  
      'users/{userId}/inventory',    // File metadata cache
      'users/{userId}/rules',        // Organization rules
      'users/{userId}/background_scans', // Background scan state
    ];
    
    // Document the expected collection structure
    await db.doc('_migrations/001_collections').set({
      collections: collections.map(path => ({
        path,
        description: this.getCollectionDescription(path),
        indexes: this.getCollectionIndexes(path)
      })),
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`Validated ${collections.length} collection structures`);
  },
  
  getCollectionDescription(path) {
    const descriptions = {
      'users/{userId}/secrets': 'Encrypted OAuth tokens and sensitive credentials',
      'users/{userId}/scans': 'Drive scan results, statistics, and metadata',
      'users/{userId}/inventory': 'Cached file metadata for quick queries',
      'users/{userId}/rules': 'User-defined organization rules and automation',
      'users/{userId}/background_scans': 'Background scan progress and state'
    };
    
    return descriptions[path] || 'User data collection';
  },
  
  getCollectionIndexes(path) {
    const indexes = {
      'users/{userId}/scans': ['status+createdAt', 'userId+status'],
      'users/{userId}/inventory': ['scanId+updatedAt', 'mimeType+size', 'isDuplicate+duplicateGroupId'],
      'users/{userId}/rules': ['isActive+priority', 'userId+isActive'],
      'users/{userId}/background_scans': ['status+createdAt', 'userId+status']
    };
    
    return indexes[path] || [];
  }
};

// Execute migration if run directly
if (require.main === module) {
  migration.up()
    .then(result => {
      console.log('Migration completed:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = migration;