# ADR-004: Security Token Management and Encryption Strategy

**Status**: Accepted  
**Date**: 2025-09-12  
**Authors**: Security Team, Platform Architecture  
**Reviewers**: Privacy Officer, DevOps Team  

## Context

DriveMind handles sensitive OAuth refresh tokens that provide long-term access to user Google Drive accounts. The current implementation stores these tokens in plaintext in Firestore, creating a critical security vulnerability (T002) that requires immediate remediation to meet ALPHA security standards.

## Decision

We will implement comprehensive token encryption and management system with the following components:

### Token Security Architecture
1. **Encryption at Rest**: AES-256-GCM encryption for all refresh tokens
2. **Key Management**: Google Cloud KMS for encryption key storage
3. **Token Rotation**: Automatic refresh token rotation on each use
4. **Access Audit**: Complete audit trail for all token operations
5. **Secure Transport**: TLS 1.3 for all token communications
6. **Session Management**: Short-lived access tokens in HTTP-only cookies

### Implementation Strategy

#### Encryption Framework
```typescript
// Production-grade token encryption
import { KeyManagementServiceClient } from '@google-cloud/kms';

export class TokenEncryption {
  private static kmsClient = new KeyManagementServiceClient();
  private static readonly keyName = process.env.GOOGLE_CLOUD_KMS_TOKEN_KEY;
  
  /**
   * Encrypts refresh token using Google Cloud KMS
   * Provides additional envelope encryption for extra security
   */
  static async encryptToken(refreshToken: string, userId: string): Promise<EncryptedToken> {
    try {
      // Generate unique data encryption key (DEK) per token
      const dek = crypto.randomBytes(32);
      
      // Encrypt the refresh token with DEK using AES-256-GCM  
      const cipher = crypto.createCipher('aes-256-gcm', dek);
      const iv = crypto.randomBytes(16);
      cipher.setAAD(Buffer.from(userId)); // Authenticated additional data
      
      let encryptedToken = cipher.update(refreshToken, 'utf8', 'hex');
      encryptedToken += cipher.final('hex');
      const authTag = cipher.getAuthTag();
      
      // Encrypt DEK using Cloud KMS
      const [encryptedDEK] = await this.kmsClient.encrypt({
        name: this.keyName,
        plaintext: dek,
        additionalAuthenticatedData: Buffer.from(userId)
      });
      
      return {
        encryptedToken,
        encryptedDEK: encryptedDEK.ciphertext?.toString('base64') || '',
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        algorithm: 'aes-256-gcm',
        keyVersion: await this.getCurrentKeyVersion(),
        createdAt: new Date().toISOString()
      };
      
    } catch (error) {
      await this.auditLog('token_encryption_failed', { userId, error: error.message });
      throw new TokenEncryptionError('Failed to encrypt refresh token', error);
    }
  }
  
  /**
   * Decrypts refresh token using Cloud KMS
   */
  static async decryptToken(
    encryptedData: EncryptedToken, 
    userId: string
  ): Promise<string> {
    try {
      // Decrypt DEK using Cloud KMS
      const [decryptedDEK] = await this.kmsClient.decrypt({
        name: this.keyName,
        ciphertext: Buffer.from(encryptedData.encryptedDEK, 'base64'),
        additionalAuthenticatedData: Buffer.from(userId)
      });
      
      if (!decryptedDEK.plaintext) {
        throw new Error('Failed to decrypt data encryption key');
      }
      
      // Decrypt refresh token using DEK
      const decipher = crypto.createDecipher('aes-256-gcm', decryptedDEK.plaintext);
      decipher.setAAD(Buffer.from(userId));
      decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
      
      let decryptedToken = decipher.update(encryptedData.encryptedToken, 'hex', 'utf8');
      decryptedToken += decipher.final('utf8');
      
      await this.auditLog('token_decrypted', { userId });
      return decryptedToken;
      
    } catch (error) {
      await this.auditLog('token_decryption_failed', { userId, error: error.message });
      throw new TokenDecryptionError('Failed to decrypt refresh token', error);
    }
  }
  
  /**
   * Rotates encryption keys (called monthly via Cloud Scheduler)
   */
  static async rotateEncryptionKeys(): Promise<void> {
    // Create new key version in Cloud KMS
    const [newKeyVersion] = await this.kmsClient.createCryptoKeyVersion({
      parent: this.keyName,
      cryptoKeyVersion: {
        state: 'ENABLED'
      }
    });
    
    console.log(`Created new encryption key version: ${newKeyVersion.name}`);
    
    // Re-encrypt all existing tokens with new key (background job)
    await this.scheduleTokenReencryption(newKeyVersion.name);
  }
  
  private static async auditLog(event: string, data: any): Promise<void> {
    await admin.firestore().collection('auditLogs').add({
      event,
      timestamp: new Date().toISOString(),
      data: {
        ...data,
        userId: data.userId ? await this.hashUserId(data.userId) : undefined
      }
    });
  }
}

interface EncryptedToken {
  encryptedToken: string;
  encryptedDEK: string;
  iv: string;
  authTag: string;
  algorithm: string;
  keyVersion: string;
  createdAt: string;
}
```

#### Secure Token Storage
```typescript
// Enhanced token storage with encryption
export class SecureTokenStore {
  private static cache = new Map<string, CachedToken>();
  private static readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  
  /**
   * Stores encrypted refresh token in Firestore
   */
  static async saveRefreshToken(
    userId: string,
    refreshToken: string,
    metadata?: TokenMetadata
  ): Promise<void> {
    try {
      // Encrypt token before storage
      const encrypted = await TokenEncryption.encryptToken(refreshToken, userId);
      
      // Store in user-scoped Firestore collection
      const tokenDoc = {
        ...encrypted,
        tokenVersion: Date.now(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        metadata: {
          userAgent: metadata?.userAgent?.substring(0, 200), // Truncate for storage
          ipAddress: await this.hashIP(metadata?.ipAddress), // Hash for privacy
          grantedScopes: metadata?.grantedScopes || ['https://www.googleapis.com/auth/drive'],
          expiresAt: metadata?.expiresAt
        }
      };
      
      await admin.firestore()
        .collection('users')
        .doc(userId)
        .collection('secrets')
        .doc('googleDrive')
        .set(tokenDoc);
      
      // Invalidate cache
      this.cache.delete(userId);
      
      // Audit log
      await this.auditTokenEvent(userId, 'token_stored', {
        tokenVersion: tokenDoc.tokenVersion,
        encryptionKeyVersion: encrypted.keyVersion
      });
      
    } catch (error) {
      await this.auditTokenEvent(userId, 'token_store_failed', { error: error.message });
      throw new TokenStorageError('Failed to store refresh token', error);
    }
  }
  
  /**
   * Retrieves and decrypts refresh token from Firestore
   */
  static async getRefreshToken(userId: string): Promise<string | null> {
    try {
      // Check cache first
      const cached = this.cache.get(userId);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        await this.auditTokenEvent(userId, 'token_accessed_cache');
        return cached.token;
      }
      
      // Retrieve from Firestore
      const tokenDoc = await admin.firestore()
        .collection('users')
        .doc(userId)
        .collection('secrets')
        .doc('googleDrive')
        .get();
      
      if (!tokenDoc.exists) {
        await this.auditTokenEvent(userId, 'token_not_found');
        return null;
      }
      
      const encryptedData = tokenDoc.data() as EncryptedToken;
      
      // Decrypt token
      const refreshToken = await TokenEncryption.decryptToken(encryptedData, userId);
      
      // Cache decrypted token temporarily
      this.cache.set(userId, {
        token: refreshToken,
        timestamp: Date.now()
      });
      
      await this.auditTokenEvent(userId, 'token_accessed', {
        keyVersion: encryptedData.keyVersion
      });
      
      return refreshToken;
      
    } catch (error) {
      await this.auditTokenEvent(userId, 'token_access_failed', { error: error.message });
      return null;
    }
  }
  
  /**
   * Securely deletes refresh token (GDPR compliance)
   */
  static async deleteRefreshToken(userId: string): Promise<void> {
    try {
      // Remove from Firestore
      await admin.firestore()
        .collection('users')
        .doc(userId)
        .collection('secrets')
        .doc('googleDrive')
        .delete();
      
      // Remove from cache
      this.cache.delete(userId);
      
      // Revoke token with Google (best effort)
      try {
        const oauth2Client = new google.auth.OAuth2(
          process.env.GOOGLE_OAUTH_CLIENT_ID,
          process.env.GOOGLE_OAUTH_CLIENT_SECRET
        );
        
        const refreshToken = await this.getRefreshToken(userId);
        if (refreshToken) {
          await oauth2Client.revokeToken(refreshToken);
        }
      } catch (revokeError) {
        // Log but don't fail the deletion
        console.warn('Failed to revoke token with Google:', revokeError);
      }
      
      await this.auditTokenEvent(userId, 'token_deleted');
      
    } catch (error) {
      await this.auditTokenEvent(userId, 'token_deletion_failed', { error: error.message });
      throw new TokenDeletionError('Failed to delete refresh token', error);
    }
  }
  
  /**
   * Rotates refresh token (called on each use)
   */
  static async rotateRefreshToken(
    userId: string,
    newRefreshToken: string,
    oldTokenVersion: number
  ): Promise<void> {
    try {
      // Store new encrypted token
      await this.saveRefreshToken(userId, newRefreshToken);
      
      // Verify rotation by checking token version
      const doc = await admin.firestore()
        .collection('users')
        .doc(userId)
        .collection('secrets')
        .doc('googleDrive')
        .get();
      
      const currentVersion = doc.data()?.tokenVersion;
      if (currentVersion <= oldTokenVersion) {
        throw new Error('Token rotation verification failed');
      }
      
      await this.auditTokenEvent(userId, 'token_rotated', {
        oldVersion: oldTokenVersion,
        newVersion: currentVersion
      });
      
    } catch (error) {
      await this.auditTokenEvent(userId, 'token_rotation_failed', { error: error.message });
      throw new TokenRotationError('Failed to rotate refresh token', error);
    }
  }
  
  private static async auditTokenEvent(
    userId: string,
    event: string,
    data?: any
  ): Promise<void> {
    await admin.firestore().collection('auditLogs').add({
      event,
      userId: await this.hashUserId(userId),
      timestamp: new Date().toISOString(),
      data: data || {}
    });
  }
  
  private static async hashUserId(userId: string): Promise<string> {
    const hash = crypto.createHash('sha256');
    hash.update(userId + process.env.USER_ID_SALT);
    return hash.digest('hex').substring(0, 16); // First 16 chars for brevity
  }
  
  private static async hashIP(ip?: string): Promise<string> {
    if (!ip) return 'unknown';
    const hash = crypto.createHash('sha256');
    hash.update(ip + process.env.IP_SALT);
    return hash.digest('hex').substring(0, 12);
  }
}

interface CachedToken {
  token: string;
  timestamp: number;
}

interface TokenMetadata {
  userAgent?: string;
  ipAddress?: string;
  grantedScopes?: string[];
  expiresAt?: Date;
}
```

## Alternatives Considered

### Option 1: Database-Level Encryption (REJECTED)
**Pros**: Transparent encryption, no application changes required
**Cons**: 
- Less granular control over encryption keys
- All-or-nothing approach
- Limited audit capabilities
- Higher costs for entire database encryption

### Option 2: Client-Side Token Storage (REJECTED)
**Pros**: Tokens never leave client device
**Cons**:
- No server-side API access capability
- Complex token refresh mechanisms
- Limited to browser-only scenarios
- Poor user experience across devices

### Option 3: Hardware Security Modules (REJECTED)
**Pros**: Maximum security for key storage
**Cons**:
- Significant cost and complexity
- Over-engineered for current threat model
- Operational overhead
- Limited cloud integration

### Option 4: Third-Party Token Management Service (REJECTED)
**Pros**: Specialized security expertise
**Cons**:
- Additional vendor dependency
- Data privacy concerns
- Integration complexity
- Higher costs

## Consequences

### Positive
- **Security Enhancement**: Addresses critical T002 vulnerability (refresh token theft)
- **Compliance**: Meets GDPR encryption requirements for personal data
- **Audit Trail**: Complete visibility into token operations
- **Key Management**: Professional-grade key rotation and management
- **Performance**: Efficient caching reduces decryption overhead
- **Recovery**: Secure token rotation enables compromise recovery

### Negative
- **Complexity**: Adds encryption/decryption overhead to token operations
- **Latency**: Additional KMS calls increase response time (~50-100ms)
- **Dependencies**: Relies on Google Cloud KMS availability
- **Costs**: KMS operations incur per-request charges
- **Key Management**: Requires operational procedures for key rotation

## Security Controls Implementation

### Key Management Security
```typescript
// Secure key management with Cloud KMS
export class KeyManager {
  
  /**
   * Creates new encryption key ring and keys
   */
  static async initializeKeys(): Promise<void> {
    const kms = new KeyManagementServiceClient();
    
    // Create key ring if it doesn't exist
    try {
      await kms.createKeyRing({
        parent: `projects/${process.env.GOOGLE_CLOUD_PROJECT}/locations/global`,
        keyRingId: 'drivemind-tokens',
        keyRing: {}
      });
    } catch (error) {
      if (!error.message.includes('already exists')) {
        throw error;
      }
    }
    
    // Create encryption key
    try {
      await kms.createCryptoKey({
        parent: `projects/${process.env.GOOGLE_CLOUD_PROJECT}/locations/global/keyRings/drivemind-tokens`,
        cryptoKeyId: 'refresh-token-key',
        cryptoKey: {
          purpose: 'ENCRYPT_DECRYPT',
          versionTemplate: {
            algorithm: 'GOOGLE_SYMMETRIC_ENCRYPTION',
            protectionLevel: 'SOFTWARE' // HSM available for higher security
          },
          rotationSchedule: {
            rotationPeriod: '2592000s' // 30 days
          },
          nextRotationTime: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        }
      });
    } catch (error) {
      if (!error.message.includes('already exists')) {
        throw error;
      }
    }
  }
  
  /**
   * Monitors key usage and health
   */
  static async monitorKeyHealth(): Promise<KeyHealthStatus> {
    const kms = new KeyManagementServiceClient();
    const keyName = `projects/${process.env.GOOGLE_CLOUD_PROJECT}/locations/global/keyRings/drivemind-tokens/cryptoKeys/refresh-token-key`;
    
    try {
      const [key] = await kms.getCryptoKey({ name: keyName });
      const [keyVersions] = await kms.listCryptoKeyVersions({ parent: keyName });
      
      const activeVersions = keyVersions.filter(v => v.state === 'ENABLED');
      const nextRotation = key.nextRotationTime;
      
      return {
        status: activeVersions.length > 0 ? 'healthy' : 'unhealthy',
        activeVersions: activeVersions.length,
        nextRotation: nextRotation?.toISOString(),
        message: `${activeVersions.length} active key versions`
      };
      
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Key health check failed: ${error.message}`
      };
    }
  }
}
```

### Access Control and Monitoring
```typescript
// Advanced token access monitoring
export class TokenAccessMonitor {
  
  /**
   * Detects unusual token access patterns
   */
  static async detectAnomalousAccess(userId: string): Promise<AccessAnomaly[]> {
    const anomalies: AccessAnomaly[] = [];
    
    // Get user's token access history (last 7 days)
    const recentAccess = await this.getTokenAccessHistory(userId, 7);
    
    // Analyze access patterns
    const accessByHour = this.groupAccessByHour(recentAccess);
    const accessByIP = this.groupAccessByIP(recentAccess);
    
    // Check for unusual time patterns
    const offHoursAccess = accessByHour.filter(([hour, count]) => 
      (hour < 6 || hour > 22) && count > 3
    );
    
    if (offHoursAccess.length > 0) {
      anomalies.push({
        type: 'off_hours_access',
        severity: 'medium',
        description: `Token accessed during off hours: ${offHoursAccess.map(([h, c]) => `${h}:00 (${c} times)`).join(', ')}`,
        riskScore: 60
      });
    }
    
    // Check for unusual IP diversity
    const uniqueIPs = Object.keys(accessByIP).length;
    if (uniqueIPs > 5) {
      anomalies.push({
        type: 'multiple_ip_access',
        severity: 'high',
        description: `Token accessed from ${uniqueIPs} different IP addresses`,
        riskScore: 80
      });
    }
    
    // Check for high frequency access
    const recentHourAccess = recentAccess.filter(
      access => Date.now() - new Date(access.timestamp).getTime() < 60 * 60 * 1000
    );
    
    if (recentHourAccess.length > 50) {
      anomalies.push({
        type: 'high_frequency_access',
        severity: 'high',
        description: `${recentHourAccess.length} token accesses in the last hour`,
        riskScore: 90
      });
    }
    
    return anomalies;
  }
  
  /**
   * Implements token access rate limiting
   */
  static async checkAccessRateLimit(userId: string): Promise<RateLimitResult> {
    const rateLimitKey = `token_access_rate:${userId}`;
    const windowMs = 60 * 1000; // 1 minute
    const maxRequests = 10; // Max 10 token accesses per minute
    
    const currentCount = await this.getAccessCount(rateLimitKey, windowMs);
    
    if (currentCount >= maxRequests) {
      await this.logSecurityEvent('token_access_rate_limited', {
        userId: await this.hashUserId(userId),
        count: currentCount,
        limit: maxRequests
      });
      
      return {
        allowed: false,
        remainingRequests: 0,
        resetTime: Date.now() + windowMs
      };
    }
    
    await this.incrementAccessCount(rateLimitKey, windowMs);
    
    return {
      allowed: true,
      remainingRequests: maxRequests - currentCount - 1,
      resetTime: Date.now() + windowMs
    };
  }
  
  private static async getTokenAccessHistory(
    userId: string,
    days: number
  ): Promise<TokenAccessEvent[]> {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    const auditDocs = await admin.firestore()
      .collection('auditLogs')
      .where('userId', '==', await this.hashUserId(userId))
      .where('event', 'in', ['token_accessed', 'token_accessed_cache'])
      .where('timestamp', '>=', cutoffDate.toISOString())
      .orderBy('timestamp', 'desc')
      .limit(1000)
      .get();
    
    return auditDocs.docs.map(doc => doc.data() as TokenAccessEvent);
  }
}

interface AccessAnomaly {
  type: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  riskScore: number;
}

interface RateLimitResult {
  allowed: boolean;
  remainingRequests: number;
  resetTime: number;
}
```

## Performance Optimization

### Encryption Performance
```typescript
// Optimized encryption operations
export class PerformanceOptimizedEncryption {
  
  /**
   * Batch encryption for multiple tokens (background processing)
   */
  static async batchEncryptTokens(
    tokenData: Array<{ userId: string; token: string }>
  ): Promise<EncryptionResult[]> {
    const batchSize = 10;
    const results: EncryptionResult[] = [];
    
    for (let i = 0; i < tokenData.length; i += batchSize) {
      const batch = tokenData.slice(i, i + batchSize);
      
      const batchResults = await Promise.all(
        batch.map(async ({ userId, token }) => {
          try {
            const encrypted = await TokenEncryption.encryptToken(token, userId);
            return { userId, success: true, encrypted };
          } catch (error) {
            return { userId, success: false, error: error.message };
          }
        })
      );
      
      results.push(...batchResults);
      
      // Small delay to avoid overwhelming KMS
      if (i + batchSize < tokenData.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return results;
  }
  
  /**
   * Optimized decryption with connection pooling
   */
  static async optimizedDecryption(
    encryptedData: EncryptedToken,
    userId: string
  ): Promise<string> {
    const startTime = Date.now();
    
    try {
      // Use connection pooling for KMS client
      const decrypted = await TokenEncryption.decryptToken(encryptedData, userId);
      
      const duration = Date.now() - startTime;
      
      // Monitor decryption performance
      await this.recordPerformanceMetric('token_decryption', duration, true);
      
      return decrypted;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      await this.recordPerformanceMetric('token_decryption', duration, false);
      throw error;
    }
  }
  
  private static async recordPerformanceMetric(
    operation: string,
    duration: number,
    success: boolean
  ): Promise<void> {
    await admin.firestore().collection('performanceMetrics').add({
      operation,
      duration,
      success,
      timestamp: new Date().toISOString()
    });
  }
}
```

### Caching Strategy
```typescript
// Intelligent token caching
export class TokenCache {
  private static cache = new LRUCache<string, CachedDecryptedToken>({
    max: 1000, // Maximum 1000 cached tokens
    ttl: 5 * 60 * 1000, // 5 minute TTL
    updateAgeOnGet: true,
    allowStale: false
  });
  
  /**
   * Gets token with intelligent caching
   */
  static async getCachedToken(userId: string): Promise<string | null> {
    // Check cache first
    const cached = this.cache.get(userId);
    if (cached) {
      await this.recordCacheHit('token_cache_hit');
      return cached.token;
    }
    
    // Cache miss - decrypt and cache
    const encryptedData = await this.getEncryptedTokenFromFirestore(userId);
    if (!encryptedData) {
      await this.recordCacheHit('token_not_found');
      return null;
    }
    
    const decryptedToken = await TokenEncryption.decryptToken(encryptedData, userId);
    
    // Cache the decrypted token
    this.cache.set(userId, {
      token: decryptedToken,
      encryptedAt: encryptedData.createdAt,
      keyVersion: encryptedData.keyVersion
    });
    
    await this.recordCacheHit('token_cache_miss');
    return decryptedToken;
  }
  
  /**
   * Invalidates cache when token is rotated
   */
  static invalidateUserToken(userId: string): void {
    this.cache.delete(userId);
  }
  
  /**
   * Cache health monitoring
   */
  static getCacheStats(): CacheStats {
    const stats = {
      size: this.cache.size,
      hitRate: this.hitCount / (this.hitCount + this.missCount),
      missRate: this.missCount / (this.hitCount + this.missCount),
      totalRequests: this.hitCount + this.missCount
    };
    
    return stats;
  }
  
  private static hitCount = 0;
  private static missCount = 0;
  
  private static async recordCacheHit(event: string): Promise<void> {
    if (event.includes('hit')) {
      this.hitCount++;
    } else if (event.includes('miss')) {
      this.missCount++;
    }
  }
}

interface CachedDecryptedToken {
  token: string;
  encryptedAt: string;
  keyVersion: string;
}
```

## Monitoring and Alerting

### Security Monitoring
```yaml
# Token Security Alerts
critical_alerts:
  token_decryption_failures:
    condition: "token_decryption_failed > 5 in 10 minutes"
    severity: "CRITICAL"
    response_time: "5 minutes"
    description: "Multiple token decryption failures detected"
    
  kms_unavailable:
    condition: "kms_error_rate > 50% in 5 minutes"
    severity: "CRITICAL" 
    response_time: "5 minutes"
    description: "Cloud KMS service unavailable"
    
  suspicious_token_access:
    condition: "high_risk_anomaly_detected > 0"
    severity: "HIGH"
    response_time: "15 minutes"
    description: "Suspicious token access pattern detected"

warning_alerts:
  high_decryption_latency:
    condition: "token_decryption_p95 > 1000ms in 15 minutes"
    severity: "MEDIUM"
    response_time: "30 minutes"
    description: "Token decryption latency is high"
    
  cache_miss_rate_high:
    condition: "token_cache_miss_rate > 80% in 30 minutes"
    severity: "MEDIUM"
    response_time: "1 hour"
    description: "Token cache performance degraded"
```

### Operational Metrics
```typescript
// Token operations dashboard
export class TokenMetricsDashboard {
  
  static async getTokenMetrics(): Promise<TokenMetrics> {
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    // Query audit logs for token operations
    const auditDocs = await admin.firestore()
      .collection('auditLogs')
      .where('timestamp', '>=', last24Hours.toISOString())
      .where('event', 'in', [
        'token_stored', 'token_accessed', 'token_decryption_failed',
        'token_rotated', 'token_deleted'
      ])
      .get();
    
    const events = auditDocs.docs.map(doc => doc.data());
    
    const metrics = {
      tokenOperations: {
        stored: events.filter(e => e.event === 'token_stored').length,
        accessed: events.filter(e => e.event === 'token_accessed').length,
        rotated: events.filter(e => e.event === 'token_rotated').length,
        deleted: events.filter(e => e.event === 'token_deleted').length,
      },
      errors: {
        decryptionFailed: events.filter(e => e.event === 'token_decryption_failed').length,
        storageFailed: events.filter(e => e.event === 'token_store_failed').length,
      },
      security: {
        anomaliesDetected: await this.getAnomalyCount(last24Hours),
        rateLimited: events.filter(e => e.event === 'token_access_rate_limited').length,
      },
      performance: {
        averageDecryptionTime: await this.getAverageDecryptionTime(last24Hours),
        cacheHitRate: TokenCache.getCacheStats().hitRate,
      }
    };
    
    return metrics;
  }
}
```

## Disaster Recovery

### Token Recovery Procedures
```typescript
// Emergency token recovery
export class TokenRecovery {
  
  /**
   * Emergency procedure for mass token re-encryption
   * Used when encryption key is compromised
   */
  static async emergencyReencryption(): Promise<ReencryptionResult> {
    console.log('⚠️  STARTING EMERGENCY TOKEN RE-ENCRYPTION');
    
    const results: ReencryptionResult = {
      processed: 0,
      successful: 0,
      failed: 0,
      errors: []
    };
    
    try {
      // Get all users with stored tokens
      const usersSnapshot = await admin.firestore()
        .collection('users')
        .get();
      
      console.log(`Found ${usersSnapshot.size} users to process`);
      
      // Process in batches to avoid overwhelming system
      const batchSize = 50;
      
      for (let i = 0; i < usersSnapshot.docs.length; i += batchSize) {
        const batch = usersSnapshot.docs.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (userDoc) => {
          results.processed++;
          
          try {
            const userId = userDoc.id;
            const secretDoc = await userDoc.ref
              .collection('secrets')
              .doc('googleDrive')
              .get();
            
            if (!secretDoc.exists) return;
            
            const encryptedData = secretDoc.data() as EncryptedToken;
            
            // Decrypt with old key
            const refreshToken = await TokenEncryption.decryptToken(
              encryptedData, 
              userId
            );
            
            // Re-encrypt with new key
            const newEncrypted = await TokenEncryption.encryptToken(
              refreshToken, 
              userId
            );
            
            // Store re-encrypted token
            await secretDoc.ref.update(newEncrypted);
            
            results.successful++;
            
            console.log(`✅ Re-encrypted token for user ${userId}`);
            
          } catch (error) {
            results.failed++;
            results.errors.push({
              userId: userDoc.id,
              error: error.message
            });
            
            console.error(`❌ Failed to re-encrypt token for user ${userDoc.id}:`, error);
          }
        }));
        
        console.log(`Completed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(usersSnapshot.docs.length / batchSize)}`);
        
        // Pause between batches
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      console.log('🏁 EMERGENCY RE-ENCRYPTION COMPLETED');
      console.log(`Results: ${results.successful} successful, ${results.failed} failed`);
      
      return results;
      
    } catch (error) {
      console.error('💥 EMERGENCY RE-ENCRYPTION FAILED:', error);
      throw error;
    }
  }
  
  /**
   * Validates token encryption integrity across all users
   */
  static async validateTokenIntegrity(): Promise<IntegrityReport> {
    const report: IntegrityReport = {
      totalTokens: 0,
      validTokens: 0,
      invalidTokens: 0,
      keyVersions: new Map(),
      errors: []
    };
    
    const usersSnapshot = await admin.firestore()
      .collection('users')
      .get();
    
    for (const userDoc of usersSnapshot.docs) {
      try {
        const secretDoc = await userDoc.ref
          .collection('secrets')
          .doc('googleDrive')
          .get();
        
        if (!secretDoc.exists) continue;
        
        report.totalTokens++;
        const encryptedData = secretDoc.data() as EncryptedToken;
        
        // Try to decrypt (validation)
        await TokenEncryption.decryptToken(encryptedData, userDoc.id);
        
        report.validTokens++;
        
        // Track key versions
        const count = report.keyVersions.get(encryptedData.keyVersion) || 0;
        report.keyVersions.set(encryptedData.keyVersion, count + 1);
        
      } catch (error) {
        report.invalidTokens++;
        report.errors.push({
          userId: userDoc.id,
          error: error.message
        });
      }
    }
    
    return report;
  }
}

interface ReencryptionResult {
  processed: number;
  successful: number;
  failed: number;
  errors: Array<{ userId: string; error: string }>;
}

interface IntegrityReport {
  totalTokens: number;
  validTokens: number;
  invalidTokens: number;
  keyVersions: Map<string, number>;
  errors: Array<{ userId: string; error: string }>;
}
```

## Testing Strategy

### Security Testing
```typescript
// Comprehensive token security tests
describe('Token Security Implementation', () => {
  
  test('Token encryption is deterministic and secure', async () => {
    const userId = 'test-user-123';
    const refreshToken = 'sample_refresh_token';
    
    // Encrypt the same token twice
    const encrypted1 = await TokenEncryption.encryptToken(refreshToken, userId);
    const encrypted2 = await TokenEncryption.encryptToken(refreshToken, userId);
    
    // Should produce different ciphertexts (due to random IV)
    expect(encrypted1.encryptedToken).not.toBe(encrypted2.encryptedToken);
    expect(encrypted1.iv).not.toBe(encrypted2.iv);
    
    // But both should decrypt to the same token
    const decrypted1 = await TokenEncryption.decryptToken(encrypted1, userId);
    const decrypted2 = await TokenEncryption.decryptToken(encrypted2, userId);
    
    expect(decrypted1).toBe(refreshToken);
    expect(decrypted2).toBe(refreshToken);
  });
  
  test('Token encryption prevents tampering', async () => {
    const userId = 'test-user-123';
    const refreshToken = 'sample_refresh_token';
    
    const encrypted = await TokenEncryption.encryptToken(refreshToken, userId);
    
    // Tamper with encrypted data
    const tamperedEncrypted = {
      ...encrypted,
      encryptedToken: encrypted.encryptedToken.slice(0, -2) + 'XX'
    };
    
    // Decryption should fail
    await expect(
      TokenEncryption.decryptToken(tamperedEncrypted, userId)
    ).rejects.toThrow('Failed to decrypt refresh token');
  });
  
  test('Cross-user token access is prevented', async () => {
    const user1 = 'user-1';
    const user2 = 'user-2';
    const refreshToken = 'sample_refresh_token';
    
    const encrypted = await TokenEncryption.encryptToken(refreshToken, user1);
    
    // Attempting to decrypt with different user ID should fail
    await expect(
      TokenEncryption.decryptToken(encrypted, user2)
    ).rejects.toThrow('Failed to decrypt refresh token');
  });
  
  test('Token access rate limiting works correctly', async () => {
    const userId = 'rate-limit-test-user';
    
    // Make requests up to the limit
    for (let i = 0; i < 10; i++) {
      const result = await TokenAccessMonitor.checkAccessRateLimit(userId);
      expect(result.allowed).toBe(true);
    }
    
    // Next request should be rate limited
    const rateLimited = await TokenAccessMonitor.checkAccessRateLimit(userId);
    expect(rateLimited.allowed).toBe(false);
    expect(rateLimited.remainingRequests).toBe(0);
  });
});
```

### Performance Testing
```typescript
// Token encryption performance tests
describe('Token Encryption Performance', () => {
  
  test('Encryption performance meets SLA requirements', async () => {
    const userId = 'perf-test-user';
    const refreshToken = 'performance_test_token';
    
    const startTime = Date.now();
    
    // Perform 100 encryption operations
    const promises = Array.from({ length: 100 }, () =>
      TokenEncryption.encryptToken(refreshToken, userId)
    );
    
    await Promise.all(promises);
    
    const duration = Date.now() - startTime;
    const avgPerOperation = duration / 100;
    
    // Should average less than 100ms per encryption
    expect(avgPerOperation).toBeLessThan(100);
    
    console.log(`Average encryption time: ${avgPerOperation.toFixed(2)}ms`);
  });
  
  test('Cache performance reduces decryption calls', async () => {
    const userId = 'cache-test-user';
    const refreshToken = 'cache_test_token';
    
    // Store encrypted token
    await SecureTokenStore.saveRefreshToken(userId, refreshToken);
    
    // First access (cache miss)
    const start1 = Date.now();
    const token1 = await SecureTokenStore.getRefreshToken(userId);
    const duration1 = Date.now() - start1;
    
    // Second access (cache hit)
    const start2 = Date.now();
    const token2 = await SecureTokenStore.getRefreshToken(userId);
    const duration2 = Date.now() - start2;
    
    expect(token1).toBe(refreshToken);
    expect(token2).toBe(refreshToken);
    
    // Cache hit should be significantly faster
    expect(duration2).toBeLessThan(duration1 * 0.1);
    
    console.log(`Cache miss: ${duration1}ms, Cache hit: ${duration2}ms`);
  });
});
```

## Implementation Timeline

### Phase 1: Core Encryption (Week 1)
- [x] Cloud KMS key setup and configuration
- [x] Basic token encryption/decryption implementation
- [ ] Firestore integration for encrypted storage
- [ ] Unit tests for encryption functions

### Phase 2: Security Hardening (Week 2)
- [ ] Token rotation mechanism
- [ ] Access monitoring and anomaly detection
- [ ] Rate limiting implementation
- [ ] Audit logging enhancement

### Phase 3: Performance Optimization (Week 3)
- [ ] Intelligent caching implementation
- [ ] Batch operations for mass encryption
- [ ] Performance monitoring and metrics
- [ ] Load testing and optimization

### Phase 4: Operational Readiness (Week 4)
- [ ] Emergency recovery procedures
- [ ] Monitoring and alerting setup
- [ ] Documentation and runbooks
- [ ] Security team training

---

**Decision Rationale**: This comprehensive token security implementation addresses the critical T002 vulnerability while providing a robust, scalable foundation for secure token management. The multi-layered approach with encryption, monitoring, and operational procedures ensures both immediate security improvements and long-term operational excellence.

**Security Review Required**: This implementation requires security team approval before production deployment due to the critical nature of token security.

**Next Review Date**: 2025-12-12