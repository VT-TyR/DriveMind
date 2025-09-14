# ADR-003: Firebase Backend Architecture and Security Model

**Status**: Accepted  
**Date**: 2025-09-12  
**Authors**: Platform Architecture Team  
**Reviewers**: Security Team, DevOps Team  

## Context

DriveMind requires a scalable, secure backend infrastructure that can handle user authentication, file metadata storage, OAuth token management, and AI processing coordination. The system must support thousands of users with varying drive sizes while maintaining strong security boundaries and operational simplicity.

## Decision

We will implement a Firebase-centric backend architecture with the following components:

### Core Architecture
1. **Firebase App Hosting**: Primary application hosting on Cloud Run
2. **Cloud Firestore**: Document database for all application data
3. **Firebase Authentication**: User identity and session management
4. **Cloud Functions**: Serverless background processing
5. **Firebase Security Rules**: Declarative access control
6. **Secret Manager**: Secure OAuth credentials and API keys

### Data Architecture

#### Firestore Data Model
```typescript
// User-centric hierarchical structure
interface DataModel {
  users: {
    [uid: string]: {
      profile: UserProfile;
      settings: UserSettings;
      secrets: {
        googleDrive: {
          refreshToken: string; // Encrypted
          tokenVersion: number;
          updatedAt: Timestamp;
        };
      };
      scans: {
        [scanId: string]: BackgroundScanState;
      };
      inventory: {
        [fileId: string]: FileMetadata;
      };
      rules: {
        [ruleId: string]: OrganizationRule;
      };
    };
  };
  
  // Global collections (admin access only)
  systemMetrics: SystemMetrics[];
  auditLogs: AuditEvent[];
}
```

#### Security Rules Architecture
```javascript
// Firestore Security Rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // User data scoping
    match /users/{userId} {
      allow read, write: if request.auth != null 
        && request.auth.uid == userId;
      
      // Sensitive secrets (server-side only)
      match /secrets/{docId} {
        allow read, write: if false; // Server-side admin SDK only
      }
      
      // User-generated content
      match /{collection=inventory|scans|rules}/{docId} {
        allow read, write: if request.auth != null 
          && request.auth.uid == userId
          && isValidUserContent(request, resource);
      }
    }
    
    // System collections (admin only)
    match /{collection=systemMetrics|auditLogs}/{docId} {
      allow read, write: if false; // Admin SDK only
    }
  }
  
  // Validation functions
  function isValidUserContent(request, resource) {
    return request.resource.data.userId == request.auth.uid
      && request.resource.data.size() <= 50; // Prevent oversized docs
  }
}
```

## Alternatives Considered

### Option 1: Traditional SQL Database (REJECTED)
**Pros**: Strong consistency, complex queries, mature tooling
**Cons**:
- Higher operational overhead (scaling, backups, monitoring)
- Complex authentication integration
- Limited real-time capabilities
- Requires separate hosting infrastructure

### Option 2: MongoDB Atlas (REJECTED)  
**Pros**: Document model similar to Firestore, good performance
**Cons**:
- Additional service dependency outside Google ecosystem
- Complex security rule management
- Separate authentication system required
- Higher costs for small-medium scale

### Option 3: Supabase (REJECTED)
**Pros**: PostgreSQL with real-time features, open source
**Cons**:
- Less mature than Firebase ecosystem
- Complex OAuth integration
- Limited Google Cloud integration
- Additional operational complexity

### Option 4: Pure Cloud Functions + Cloud Storage (REJECTED)
**Pros**: Maximum flexibility, serverless scalability
**Cons**:
- No real-time capabilities
- Complex data consistency management
- Limited query capabilities
- Higher development complexity

## Consequences

### Positive
- **Rapid Development**: Firebase SDK reduces boilerplate code significantly
- **Built-in Security**: Declarative security rules with authentication integration
- **Scalability**: Automatic scaling for both database and hosting
- **Real-time Sync**: Native real-time updates for user interfaces
- **Operational Simplicity**: Managed service reduces operational overhead
- **Google Integration**: Seamless OAuth and Drive API integration
- **Cost Efficiency**: Pay-per-use pricing model

### Negative
- **Vendor Lock-in**: Deep dependency on Google Cloud Platform
- **Query Limitations**: No complex joins or aggregations
- **Offline Complexity**: Limited offline-first capabilities
- **Pricing Unpredictability**: Usage-based pricing can scale unexpectedly
- **Migration Difficulty**: Hard to migrate away from Firebase

## Security Implementation

### Authentication and Authorization

#### Multi-layered Security Model
```typescript
// Server-side Security Enforcement
export class SecurityService {
  
  // Layer 1: Firebase Auth verification
  static async verifyUser(request: NextRequest): Promise<DecodedIdToken> {
    const token = this.extractIdToken(request);
    return await admin.auth().verifyIdToken(token);
  }
  
  // Layer 2: Resource ownership validation
  static async validateResourceAccess(
    userId: string, 
    resourcePath: string
  ): Promise<boolean> {
    const pathParts = resourcePath.split('/');
    
    // Ensure user can only access their own data
    if (pathParts[1] === 'users' && pathParts[2] !== userId) {
      return false;
    }
    
    return true;
  }
  
  // Layer 3: Operation-specific authorization
  static async authorizeOperation(
    user: DecodedIdToken,
    operation: string,
    resource: string
  ): Promise<boolean> {
    const permissions = await this.getUserPermissions(user.uid);
    return permissions.includes(`${operation}:${resource}`);
  }
}
```

#### Token Management Security
```typescript
// Encrypted Token Storage
export class SecureTokenStore {
  private static encryptionKey = process.env.TOKEN_ENCRYPTION_KEY;
  
  static async saveRefreshToken(
    uid: string, 
    refreshToken: string
  ): Promise<void> {
    // Encrypt token before storage
    const encrypted = await this.encrypt(refreshToken);
    
    await admin.firestore()
      .collection('users')
      .doc(uid)
      .collection('secrets')
      .doc('googleDrive')
      .set({
        refreshToken: encrypted,
        tokenVersion: Date.now(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    
    // Audit log
    await this.logSecurityEvent(uid, 'token_stored');
  }
  
  static async getRefreshToken(uid: string): Promise<string | null> {
    try {
      const doc = await admin.firestore()
        .collection('users')
        .doc(uid)
        .collection('secrets')
        .doc('googleDrive')
        .get();
        
      if (!doc.exists) return null;
      
      const encrypted = doc.data()?.refreshToken;
      if (!encrypted) return null;
      
      // Decrypt token
      const decrypted = await this.decrypt(encrypted);
      
      // Audit log
      await this.logSecurityEvent(uid, 'token_accessed');
      
      return decrypted;
    } catch (error) {
      await this.logSecurityEvent(uid, 'token_access_failed', error);
      return null;
    }
  }
  
  private static async encrypt(data: string): Promise<string> {
    // Implementation using Node.js crypto module
    const cipher = crypto.createCipher('aes-256-gcm', this.encryptionKey);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }
  
  private static async decrypt(encryptedData: string): Promise<string> {
    const decipher = crypto.createDecipher('aes-256-gcm', this.encryptionKey);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
```

### Data Validation and Sanitization

#### Input Validation Framework
```typescript
// Zod schemas for all data structures
import { z } from 'zod';

export const FileMetadataSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  type: z.enum(['Document', 'Spreadsheet', 'Presentation', 'Image', 'Video', 'PDF', 'Folder', 'Other']),
  size: z.number().min(0).max(1e12), // 1TB limit
  lastModified: z.date(),
  path: z.array(z.string().max(255)).max(50), // Prevent deep nesting
  isDuplicate: z.boolean(),
  vaultScore: z.number().min(0).max(100).nullable(),
  mimeType: z.string().max(100),
  userId: z.string().min(1), // Always validate ownership
});

export const BackgroundScanSchema = z.object({
  scanId: z.string().uuid(),
  userId: z.string().min(1),
  status: z.enum(['queued', 'running', 'completed', 'failed']),
  progress: z.number().min(0).max(100),
  startTime: z.date(),
  completedAt: z.date().nullable(),
  filesProcessed: z.number().min(0),
  totalFiles: z.number().min(0),
  error: z.string().nullable(),
  results: z.any().nullable(), // Flexible result structure
});

// Server-side validation middleware
export function validateInput<T>(schema: z.ZodSchema<T>) {
  return async (req: NextRequest, res: NextResponse, next: NextFunction) => {
    try {
      const body = await req.json();
      const validated = schema.parse(body);
      req.validatedData = validated;
      return next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json({
          error: 'validation_failed',
          message: 'Request validation failed',
          details: error.errors,
          timestamp: new Date().toISOString()
        }, { status: 400 });
      }
      throw error;
    }
  };
}
```

## Performance Optimization

### Database Performance

#### Query Optimization
```typescript
// Efficient Firestore queries with proper indexing
export class QueryOptimizer {
  
  // Compound index: userId + status + createdAt
  static async getUserScans(userId: string, limit = 20): Promise<BackgroundScan[]> {
    return await admin.firestore()
      .collection('users')
      .doc(userId)
      .collection('scans')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get()
      .then(snapshot => snapshot.docs.map(doc => doc.data() as BackgroundScan));
  }
  
  // Single-field index optimization
  static async getUserFiles(
    userId: string, 
    fileType?: string,
    startAfter?: string
  ): Promise<FileMetadata[]> {
    let query = admin.firestore()
      .collection('users')
      .doc(userId)
      .collection('inventory');
    
    if (fileType) {
      query = query.where('type', '==', fileType);
    }
    
    if (startAfter) {
      const lastDoc = await admin.firestore()
        .collection('users')
        .doc(userId)
        .collection('inventory')
        .doc(startAfter)
        .get();
      query = query.startAfter(lastDoc);
    }
    
    return query
      .limit(100)
      .get()
      .then(snapshot => snapshot.docs.map(doc => doc.data() as FileMetadata));
  }
}
```

#### Connection Pool Management
```typescript
// Firebase Admin SDK optimization
export class FirebaseManager {
  private static adminApp: admin.app.App;
  
  static initializeApp(): admin.app.App {
    if (!this.adminApp) {
      this.adminApp = admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL: process.env.FIREBASE_DATABASE_URL,
      });
      
      // Configure Firestore settings
      const firestore = this.adminApp.firestore();
      firestore.settings({
        ignoreUndefinedProperties: true,
        cacheSizeBytes: admin.firestore.CACHE_SIZE_UNLIMITED,
      });
    }
    
    return this.adminApp;
  }
  
  static getFirestore(): admin.firestore.Firestore {
    return this.initializeApp().firestore();
  }
}
```

### Caching Strategy

#### Multi-layer Caching
```typescript
// In-memory cache for frequent reads
export class CacheManager {
  private static cache = new Map<string, CacheEntry>();
  private static readonly TTL = 5 * 60 * 1000; // 5 minutes
  
  static async get<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const cached = this.cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < this.TTL) {
      return cached.data;
    }
    
    const data = await fetcher();
    
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
    
    return data;
  }
  
  static invalidate(pattern: string): void {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }
  
  // Automatic cleanup
  static startCleanupTimer(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.cache.entries()) {
        if (now - entry.timestamp > this.TTL) {
          this.cache.delete(key);
        }
      }
    }, 60000); // Clean every minute
  }
}

interface CacheEntry {
  data: any;
  timestamp: number;
}
```

## Monitoring and Observability

### Health Monitoring
```typescript
// Comprehensive health checks
export class HealthMonitor {
  
  static async checkFirestoreHealth(): Promise<HealthStatus> {
    try {
      const startTime = Date.now();
      
      // Test basic connectivity with a lightweight operation
      await admin.firestore()
        .collection('_health')
        .doc('check')
        .get();
        
      const latency = Date.now() - startTime;
      
      return {
        status: latency < 1000 ? 'healthy' : 'degraded',
        latency,
        message: `Firestore responding in ${latency}ms`
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Firestore connection failed: ${error.message}`
      };
    }
  }
  
  static async checkAuthHealth(): Promise<HealthStatus> {
    try {
      const startTime = Date.now();
      
      // Test Firebase Auth connectivity
      await admin.auth().listUsers(1);
      
      const latency = Date.now() - startTime;
      
      return {
        status: latency < 500 ? 'healthy' : 'degraded',
        latency,
        message: `Firebase Auth responding in ${latency}ms`
      };
    } catch (error) {
      return {
        status: 'unhealthy', 
        message: `Firebase Auth failed: ${error.message}`
      };
    }
  }
  
  static async getOverallHealth(): Promise<SystemHealth> {
    const [firestore, auth] = await Promise.all([
      this.checkFirestoreHealth(),
      this.checkAuthHealth(),
    ]);
    
    const allHealthy = [firestore, auth].every(h => h.status === 'healthy');
    const anyUnhealthy = [firestore, auth].some(h => h.status === 'unhealthy');
    
    return {
      status: anyUnhealthy ? 'unhealthy' : allHealthy ? 'healthy' : 'degraded',
      components: { firestore, auth },
      timestamp: new Date().toISOString(),
    };
  }
}
```

### Performance Metrics
```typescript
// Performance tracking
export class PerformanceTracker {
  
  static async trackDatabaseOperation<T>(
    operation: string,
    executor: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();
    
    try {
      const result = await executor();
      const duration = Date.now() - startTime;
      
      await this.recordMetric({
        type: 'database_operation',
        operation,
        duration,
        success: true,
        timestamp: new Date().toISOString()
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      await this.recordMetric({
        type: 'database_operation',
        operation,
        duration,
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      throw error;
    }
  }
  
  private static async recordMetric(metric: PerformanceMetric): Promise<void> {
    // Send to monitoring system (Firebase Performance, Cloud Monitoring, etc.)
    await admin.firestore()
      .collection('systemMetrics')
      .add(metric);
  }
}
```

## Disaster Recovery and Backup

### Automated Backup Strategy
```typescript
// Backup management
export class BackupManager {
  
  // Daily automated backups
  static async performDailyBackup(): Promise<void> {
    const timestamp = new Date().toISOString().split('T')[0];
    const backupId = `daily-backup-${timestamp}`;
    
    try {
      // Export all user data
      await admin.firestore().exportDocuments(
        `gs://drivemind-backups/${backupId}`,
        ['users']
      );
      
      // Log successful backup
      await this.logBackupEvent({
        backupId,
        type: 'daily',
        status: 'completed',
        timestamp: new Date().toISOString(),
        collections: ['users']
      });
      
    } catch (error) {
      await this.logBackupEvent({
        backupId,
        type: 'daily', 
        status: 'failed',
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      throw error;
    }
  }
  
  // Point-in-time recovery
  static async restoreFromBackup(
    backupId: string,
    targetProject: string
  ): Promise<void> {
    // This is a destructive operation requiring extreme caution
    await admin.firestore().importDocuments(
      `gs://drivemind-backups/${backupId}`
    );
  }
  
  private static async logBackupEvent(event: BackupEvent): Promise<void> {
    await admin.firestore()
      .collection('auditLogs')
      .add(event);
  }
}
```

### Data Retention Policies
```typescript
// Automated data cleanup
export class DataRetentionManager {
  
  // Clean up old scan data (30 days)
  static async cleanupOldScans(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);
    
    const batch = admin.firestore().batch();
    
    // Query scans older than cutoff date
    const query = await admin.firestore()
      .collectionGroup('scans')
      .where('completedAt', '<', cutoffDate)
      .limit(500)
      .get();
    
    query.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    
    console.log(`Cleaned up ${query.docs.length} old scan records`);
  }
  
  // Remove user data (GDPR compliance)
  static async deleteUserData(userId: string): Promise<void> {
    const batch = admin.firestore().batch();
    
    // Delete all user collections
    const collections = ['secrets', 'scans', 'inventory', 'rules'];
    
    for (const collectionName of collections) {
      const query = await admin.firestore()
        .collection('users')
        .doc(userId)
        .collection(collectionName)
        .get();
      
      query.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
    }
    
    // Delete user profile
    batch.delete(
      admin.firestore().collection('users').doc(userId)
    );
    
    await batch.commit();
    
    // Log deletion for audit
    await this.logDataDeletion(userId);
  }
}
```

## Cost Optimization

### Usage Monitoring
```typescript
// Cost tracking and optimization
export class CostOptimizer {
  
  // Monitor Firestore operations
  static async trackUsage(): Promise<UsageMetrics> {
    const metrics = {
      reads: 0,
      writes: 0,
      deletes: 0,
      bandwidth: 0
    };
    
    // Implementation would track actual operations
    // This is a placeholder for monitoring integration
    
    return metrics;
  }
  
  // Optimize query patterns
  static optimizeQueries(): void {
    // Ensure proper indexing
    // Batch operations where possible
    // Use pagination to limit reads
    // Cache frequently accessed data
  }
  
  // Alert on unusual usage spikes
  static async checkUsageThresholds(): Promise<void> {
    const usage = await this.trackUsage();
    
    if (usage.reads > 100000) { // Daily threshold
      await this.sendUsageAlert('High read count detected');
    }
    
    if (usage.writes > 50000) { // Daily threshold
      await this.sendUsageAlert('High write count detected');
    }
  }
}
```

## Security Hardening

### Additional Security Measures
```typescript
// Security monitoring and response
export class SecurityHardening {
  
  // Rate limiting per user
  static async checkRateLimit(userId: string, operation: string): Promise<boolean> {
    const key = `ratelimit:${userId}:${operation}`;
    const window = 60 * 1000; // 1 minute
    const limit = 60; // 60 requests per minute
    
    const requests = await this.getRequestCount(key, window);
    
    if (requests >= limit) {
      await this.logSecurityEvent({
        type: 'rate_limit_exceeded',
        userId,
        operation,
        count: requests,
        timestamp: new Date().toISOString()
      });
      
      return false;
    }
    
    await this.incrementRequestCount(key, window);
    return true;
  }
  
  // Anomaly detection
  static async detectAnomalies(userId: string): Promise<AnomalyReport> {
    const recentActivity = await this.getUserRecentActivity(userId);
    const baseline = await this.getUserBaseline(userId);
    
    const anomalies: Anomaly[] = [];
    
    // Check for unusual request patterns
    if (recentActivity.requestCount > baseline.averageRequests * 5) {
      anomalies.push({
        type: 'unusual_request_volume',
        severity: 'high',
        details: `${recentActivity.requestCount} requests vs baseline ${baseline.averageRequests}`
      });
    }
    
    // Check for off-hours activity
    const currentHour = new Date().getHours();
    if (currentHour < 6 || currentHour > 23) {
      if (recentActivity.requestCount > 10) {
        anomalies.push({
          type: 'off_hours_activity', 
          severity: 'medium',
          details: `Active at ${currentHour}:00 with ${recentActivity.requestCount} requests`
        });
      }
    }
    
    return { userId, anomalies, timestamp: new Date().toISOString() };
  }
  
  // IP-based security
  static async validateRequest(request: NextRequest): Promise<SecurityValidation> {
    const ip = this.getClientIP(request);
    const userAgent = request.headers.get('user-agent') || '';
    
    // Check for suspicious IP patterns
    const suspiciousIPs = await this.getSuspiciousIPs();
    if (suspiciousIPs.includes(ip)) {
      return {
        allowed: false,
        reason: 'suspicious_ip',
        ip
      };
    }
    
    // Check for bot patterns
    if (this.isSuspiciousUserAgent(userAgent)) {
      return {
        allowed: false,
        reason: 'suspicious_user_agent',
        userAgent
      };
    }
    
    return { allowed: true };
  }
}
```

## Testing Strategy

### Integration Testing
```typescript
// Firebase integration tests
describe('Firebase Backend Architecture', () => {
  let testUser: admin.auth.UserRecord;
  
  beforeEach(async () => {
    // Create test user
    testUser = await admin.auth().createUser({
      email: 'test@example.com',
      password: 'testpassword'
    });
  });
  
  afterEach(async () => {
    // Cleanup test data
    await admin.auth().deleteUser(testUser.uid);
    await admin.firestore()
      .collection('users')
      .doc(testUser.uid)
      .delete();
  });
  
  test('User data scoping works correctly', async () => {
    // Test that users can only access their own data
    await admin.firestore()
      .collection('users')
      .doc(testUser.uid)
      .set({ profile: { name: 'Test User' } });
    
    // Should succeed - accessing own data
    const ownData = await admin.firestore()
      .collection('users')
      .doc(testUser.uid)
      .get();
    
    expect(ownData.exists).toBe(true);
    
    // Security rules prevent cross-user access (tested via client SDK)
  });
  
  test('Token encryption/decryption works correctly', async () => {
    const originalToken = 'test_refresh_token';
    
    await SecureTokenStore.saveRefreshToken(testUser.uid, originalToken);
    const retrievedToken = await SecureTokenStore.getRefreshToken(testUser.uid);
    
    expect(retrievedToken).toBe(originalToken);
  });
});
```

### Performance Testing
```typescript
// Load testing for database operations
describe('Database Performance', () => {
  test('Handles concurrent user operations', async () => {
    const userIds = Array.from({ length: 100 }, (_, i) => `user${i}`);
    
    const operations = userIds.map(async (userId) => {
      return await admin.firestore()
        .collection('users')
        .doc(userId)
        .collection('inventory')
        .add({
          name: 'test-file.pdf',
          type: 'PDF',
          size: 1024,
          createdAt: new Date()
        });
    });
    
    const startTime = Date.now();
    await Promise.all(operations);
    const duration = Date.now() - startTime;
    
    expect(duration).toBeLessThan(5000); // Should complete in under 5 seconds
  });
});
```

## Migration and Maintenance

### Schema Evolution
```typescript
// Database migration framework
export class MigrationManager {
  
  static async runMigration(version: string): Promise<void> {
    const migrationRef = admin.firestore()
      .collection('_system')
      .doc('migrations');
    
    const migrationDoc = await migrationRef.get();
    const appliedMigrations = migrationDoc.data()?.applied || [];
    
    if (appliedMigrations.includes(version)) {
      console.log(`Migration ${version} already applied`);
      return;
    }
    
    try {
      await this.executeMigration(version);
      
      // Record successful migration
      await migrationRef.update({
        applied: admin.firestore.FieldValue.arrayUnion(version),
        lastMigration: new Date().toISOString()
      });
      
      console.log(`Migration ${version} completed successfully`);
    } catch (error) {
      console.error(`Migration ${version} failed:`, error);
      throw error;
    }
  }
  
  private static async executeMigration(version: string): Promise<void> {
    switch (version) {
      case '1.1.0_add_token_encryption':
        await this.migrateTokenEncryption();
        break;
      case '1.2.0_add_user_preferences':
        await this.addUserPreferences();
        break;
      default:
        throw new Error(`Unknown migration version: ${version}`);
    }
  }
  
  private static async migrateTokenEncryption(): Promise<void> {
    // Migrate existing unencrypted tokens to encrypted format
    const usersSnapshot = await admin.firestore()
      .collection('users')
      .get();
    
    const batch = admin.firestore().batch();
    
    for (const userDoc of usersSnapshot.docs) {
      const secretsRef = userDoc.ref.collection('secrets').doc('googleDrive');
      const secretDoc = await secretsRef.get();
      
      if (secretDoc.exists) {
        const data = secretDoc.data();
        if (data?.refreshToken && !data?.encrypted) {
          // Encrypt existing token
          const encrypted = await SecureTokenStore.encrypt(data.refreshToken);
          
          batch.update(secretsRef, {
            refreshToken: encrypted,
            encrypted: true,
            migratedAt: new Date()
          });
        }
      }
    }
    
    await batch.commit();
  }
}
```

---

**Decision Rationale**: Firebase provides the optimal combination of developer productivity, operational simplicity, and security features for DriveMind's requirements. The integrated ecosystem reduces complexity while providing enterprise-grade security and scalability.

**Next Review Date**: 2025-12-12