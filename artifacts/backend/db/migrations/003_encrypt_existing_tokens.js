/**
 * Firestore Migration 003: Encrypt Existing OAuth Tokens
 * CRITICAL SECURITY MIGRATION - SAST-001 FIX
 * 
 * Migrates existing plaintext OAuth tokens to AES-256-GCM encrypted storage
 * with Google Cloud KMS key management.
 */

const admin = require('firebase-admin');
const { TokenEncryptionService } = require('../../services/security/token-encryption-service');

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const tokenEncryptionService = new TokenEncryptionService();

const migration = {
  version: '003',
  description: 'Migrate existing OAuth tokens to encrypted storage with AES-256-GCM and KMS',
  timestamp: new Date().toISOString(),
  critical: true,
  securityImprovement: 'SAST-001',
  
  async up() {
    console.log('Running CRITICAL SECURITY migration 003: Encrypt existing OAuth tokens...');
    console.log('This migration addresses SAST-001 vulnerability by implementing AES-256-GCM token encryption');
    
    try {
      // Validate encryption service health before migration
      const healthCheck = await tokenEncryptionService.healthCheck();
      if (healthCheck.status !== 'healthy') {
        throw new Error(`Token encryption service unhealthy: ${healthCheck.lastError}`);
      }
      
      console.log('✓ Token encryption service is healthy');
      
      // Get all users with existing tokens
      const usersWithTokens = await this.findUsersWithTokens();
      console.log(`Found ${usersWithTokens.length} users with existing tokens`);
      
      if (usersWithTokens.length === 0) {
        console.log('No existing tokens found - migration completed');
        return { success: true, version: this.version, tokensEncrypted: 0 };
      }
      
      // Migrate tokens in batches to avoid timeouts
      const batchSize = 10;
      let totalEncrypted = 0;
      let totalFailed = 0;
      const failedUsers = [];
      
      for (let i = 0; i < usersWithTokens.length; i += batchSize) {
        const batch = usersWithTokens.slice(i, i + batchSize);
        console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(usersWithTokens.length/batchSize)} (${batch.length} users)`);
        
        const batchResults = await Promise.allSettled(
          batch.map(userId => this.migrateUserTokens(userId))
        );
        
        batchResults.forEach((result, index) => {
          const userId = batch[index];
          if (result.status === 'fulfilled' && result.value.success) {
            totalEncrypted++;
            console.log(`  ✓ Encrypted tokens for user: ${this.hashUserId(userId)}`);
          } else {
            totalFailed++;
            failedUsers.push(userId);
            console.error(`  ✗ Failed to encrypt tokens for user: ${this.hashUserId(userId)}`, result.reason);
          }
        });
        
        // Small delay between batches to avoid overwhelming KMS
        if (i + batchSize < usersWithTokens.length) {
          await this.sleep(1000);
        }
      }
      
      // Create migration audit record
      await this.createMigrationAudit({
        totalUsers: usersWithTokens.length,
        successful: totalEncrypted,
        failed: totalFailed,
        failedUserHashes: failedUsers.map(id => this.hashUserId(id))
      });
      
      if (totalFailed > 0) {
        console.warn(`⚠️  Migration completed with ${totalFailed} failures out of ${usersWithTokens.length} users`);
        console.warn('Failed users can be retried by running the migration again');
      } else {
        console.log('🎉 All tokens successfully encrypted!');
      }
      
      console.log('Migration 003 completed successfully');
      return { 
        success: true, 
        version: this.version, 
        tokensEncrypted: totalEncrypted,
        tokensFailed: totalFailed
      };
      
    } catch (error) {
      console.error('Critical migration 003 failed:', error);
      
      // Create failure audit record
      await this.createMigrationAudit({
        error: error.message,
        failed: true,
        timestamp: new Date().toISOString()
      });
      
      throw error;
    }
  },
  
  async down() {
    console.log('Rolling back migration 003: Decrypt tokens to plaintext...');
    console.log('⚠️  WARNING: This rollback reduces security by storing tokens in plaintext');
    
    try {
      // Get all users with encrypted tokens
      const usersWithEncryptedTokens = await this.findUsersWithEncryptedTokens();
      console.log(`Found ${usersWithEncryptedTokens.length} users with encrypted tokens`);
      
      if (usersWithEncryptedTokens.length === 0) {
        console.log('No encrypted tokens found - rollback completed');
        return { success: true, rollback: true, tokensDecrypted: 0 };
      }
      
      let totalDecrypted = 0;
      let totalFailed = 0;
      
      for (const userId of usersWithEncryptedTokens) {
        try {
          await this.rollbackUserTokens(userId);
          totalDecrypted++;
          console.log(`  ✓ Decrypted tokens for user: ${this.hashUserId(userId)}`);
        } catch (error) {
          totalFailed++;
          console.error(`  ✗ Failed to decrypt tokens for user: ${this.hashUserId(userId)}`, error.message);
        }
      }
      
      console.log(`Rollback completed: ${totalDecrypted} decrypted, ${totalFailed} failed`);
      return { 
        success: true, 
        rollback: true, 
        tokensDecrypted: totalDecrypted,
        tokensFailed: totalFailed 
      };
      
    } catch (error) {
      console.error('Migration 003 rollback failed:', error);
      throw error;
    }
  },
  
  async findUsersWithTokens() {
    console.log('Scanning for users with existing OAuth tokens...');
    
    // Query all user collections for oauth_tokens documents
    // Note: This is a simplified approach. In production, you might need
    // to use collection group queries or maintain a user index
    
    const usersSnapshot = await db.collection('users').get();
    const usersWithTokens = [];
    
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const tokenDoc = await db.doc(`users/${userId}/secrets/oauth_tokens`).get();
      
      if (tokenDoc.exists) {
        const tokenData = tokenDoc.data();
        
        // Check if tokens are already encrypted
        if (!tokenData.encrypted_access_token && tokenData.access_token) {
          usersWithTokens.push(userId);
        }
      }
    }
    
    return usersWithTokens;
  },
  
  async findUsersWithEncryptedTokens() {
    console.log('Scanning for users with encrypted OAuth tokens...');
    
    const usersSnapshot = await db.collection('users').get();
    const usersWithEncryptedTokens = [];
    
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const tokenDoc = await db.doc(`users/${userId}/secrets/oauth_tokens`).get();
      
      if (tokenDoc.exists) {
        const tokenData = tokenDoc.data();
        
        // Check if tokens are encrypted
        if (tokenData.encrypted_access_token || tokenData.encrypted_refresh_token) {
          usersWithEncryptedTokens.push(userId);
        }
      }
    }
    
    return usersWithEncryptedTokens;
  },
  
  async migrateUserTokens(userId) {
    const auditId = this.generateAuditId();
    
    try {
      const tokenDocRef = db.doc(`users/${userId}/secrets/oauth_tokens`);
      const tokenSnapshot = await tokenDocRef.get();
      
      if (!tokenSnapshot.exists) {
        throw new Error('Token document not found');
      }
      
      const tokenData = tokenSnapshot.data();
      
      // Check if already encrypted
      if (tokenData.encrypted_access_token) {
        return { success: true, alreadyEncrypted: true };
      }
      
      // Validate required token data
      if (!tokenData.access_token) {
        throw new Error('Missing access_token');
      }
      
      // Encrypt access token
      const encryptedAccessResult = await tokenEncryptionService.encryptToken(
        tokenData.access_token,
        userId,
        'access_token'
      );
      
      if (!encryptedAccessResult.success) {
        throw new Error(`Access token encryption failed: ${encryptedAccessResult.error}`);
      }
      
      // Encrypt refresh token if present
      let encryptedRefreshResult = null;
      if (tokenData.refresh_token) {
        encryptedRefreshResult = await tokenEncryptionService.encryptToken(
          tokenData.refresh_token,
          userId,
          'refresh_token'
        );
        
        if (!encryptedRefreshResult.success) {
          throw new Error(`Refresh token encryption failed: ${encryptedRefreshResult.error}`);
        }
      }
      
      // Prepare encrypted token document
      const encryptedTokenData = {
        // New encrypted fields
        encrypted_access_token: {
          encryptedData: encryptedAccessResult.encryptedToken.encryptedData,
          iv: encryptedAccessResult.encryptedToken.iv,
          authTag: encryptedAccessResult.encryptedToken.authTag,
          keyVersion: encryptedAccessResult.encryptedToken.keyVersion,
          encryptedAt: encryptedAccessResult.encryptedToken.encryptedAt,
          auditId: encryptedAccessResult.encryptedToken.auditId
        },
        
        // Metadata (preserved)
        expiry_date: tokenData.expiry_date,
        scopes: tokenData.scopes || [],
        token_type: 'Bearer',
        
        // Migration metadata
        migration: {
          version: this.version,
          migratedAt: admin.firestore.FieldValue.serverTimestamp(),
          auditId,
          encryptionService: 'TokenEncryptionService',
          algorithm: 'AES-256-GCM',
          keyManagement: 'Google Cloud KMS'
        },
        
        // Preserve timestamps
        created_at: tokenData.created_at,
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      };
      
      // Add encrypted refresh token if present
      if (encryptedRefreshResult) {
        encryptedTokenData.encrypted_refresh_token = {
          encryptedData: encryptedRefreshResult.encryptedToken.encryptedData,
          iv: encryptedRefreshResult.encryptedToken.iv,
          authTag: encryptedRefreshResult.encryptedToken.authTag,
          keyVersion: encryptedRefreshResult.encryptedToken.keyVersion,
          encryptedAt: encryptedRefreshResult.encryptedToken.encryptedAt,
          auditId: encryptedRefreshResult.encryptedToken.auditId
        };
      }
      
      // Update document with encrypted tokens and remove plaintext
      const batch = db.batch();\n      \n      // Set new encrypted document\n      batch.set(tokenDocRef, encryptedTokenData);\n      \n      // Remove plaintext fields\n      batch.update(tokenDocRef, {\n        access_token: admin.firestore.FieldValue.delete(),\n        refresh_token: admin.firestore.FieldValue.delete(),\n        id_token: admin.firestore.FieldValue.delete() // Also remove ID token for security\n      });\n      \n      await batch.commit();\n      \n      return { \n        success: true, \n        auditId,\n        encryptedTokens: encryptedRefreshResult ? 2 : 1\n      };\n      \n    } catch (error) {\n      console.error(`Token migration failed for user ${this.hashUserId(userId)}:`, error.message);\n      \n      // Log migration failure\n      try {\n        await db.collection('_system').doc('migration_failures').collection('003').add({\n          userId: this.hashUserId(userId),\n          auditId,\n          error: error.message,\n          timestamp: admin.firestore.FieldValue.serverTimestamp()\n        });\n      } catch (logError) {\n        console.warn('Failed to log migration failure:', logError.message);\n      }\n      \n      throw error;\n    }\n  },\n  \n  async rollbackUserTokens(userId) {\n    const tokenDocRef = db.doc(`users/${userId}/secrets/oauth_tokens`);\n    const tokenSnapshot = await tokenDocRef.get();\n    \n    if (!tokenSnapshot.exists) {\n      throw new Error('Token document not found');\n    }\n    \n    const tokenData = tokenSnapshot.data();\n    \n    // Check if tokens are encrypted\n    if (!tokenData.encrypted_access_token) {\n      return { success: true, alreadyDecrypted: true };\n    }\n    \n    // Decrypt access token\n    const decryptedAccessResult = await tokenEncryptionService.decryptToken(\n      tokenData.encrypted_access_token,\n      userId\n    );\n    \n    if (!decryptedAccessResult.success) {\n      throw new Error(`Access token decryption failed: ${decryptedAccessResult.error}`);\n    }\n    \n    // Decrypt refresh token if present\n    let decryptedRefreshToken = null;\n    if (tokenData.encrypted_refresh_token) {\n      const decryptedRefreshResult = await tokenEncryptionService.decryptToken(\n        tokenData.encrypted_refresh_token,\n        userId\n      );\n      \n      if (!decryptedRefreshResult.success) {\n        throw new Error(`Refresh token decryption failed: ${decryptedRefreshResult.error}`);\n      }\n      \n      decryptedRefreshToken = decryptedRefreshResult.decryptedData;\n    }\n    \n    // Restore plaintext token document\n    const plaintextTokenData = {\n      access_token: decryptedAccessResult.decryptedData,\n      refresh_token: decryptedRefreshToken,\n      expiry_date: tokenData.expiry_date,\n      scopes: tokenData.scopes || [],\n      created_at: tokenData.created_at,\n      updated_at: admin.firestore.FieldValue.serverTimestamp(),\n      \n      // Remove encrypted fields\n      encrypted_access_token: admin.firestore.FieldValue.delete(),\n      encrypted_refresh_token: admin.firestore.FieldValue.delete(),\n      migration: admin.firestore.FieldValue.delete()\n    };\n    \n    await tokenDocRef.set(plaintextTokenData, { merge: true });\n    \n    return { success: true };\n  },\n  \n  async createMigrationAudit(data) {\n    try {\n      await db.doc('_migrations/003_encryption_audit').set({\n        version: this.version,\n        description: this.description,\n        securityImprovement: this.securityImprovement,\n        completedAt: admin.firestore.FieldValue.serverTimestamp(),\n        ...data\n      });\n    } catch (error) {\n      console.warn('Failed to create migration audit:', error.message);\n    }\n  },\n  \n  hashUserId(userId) {\n    const crypto = require('crypto');\n    return crypto.createHash('sha256').update(userId).digest('hex').slice(0, 16);\n  },\n  \n  generateAuditId() {\n    return `mig003_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;\n  },\n  \n  sleep(ms) {\n    return new Promise(resolve => setTimeout(resolve, ms));\n  }\n};\n\n// Execute migration if run directly\nif (require.main === module) {\n  const command = process.argv[2];\n  \n  if (command === 'rollback') {\n    migration.down()\n      .then(result => {\n        console.log('Migration rollback completed:', result);\n        process.exit(0);\n      })\n      .catch(error => {\n        console.error('Migration rollback failed:', error);\n        process.exit(1);\n      });\n  } else {\n    migration.up()\n      .then(result => {\n        console.log('Migration completed:', result);\n        process.exit(0);\n      })\n      .catch(error => {\n        console.error('Migration failed:', error);\n        process.exit(1);\n      });\n  }\n}\n\nmodule.exports = migration;