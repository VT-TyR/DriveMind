# Troubleshooting Guide

## 🚨 Current Critical Issue (September 6, 2025)

### Background Scan 500 Errors
**Status**: 🔴 **ACTIVE ISSUE** - Fix staged, needs deployment  
**Symptoms**: Scan buttons return 500 server errors  
**Root Cause**: Remaining client-side Firebase calls in server-side functions  
**Solution**: Deploy staged Firebase Admin fixes in `firebase-db.ts`

```bash
# IMMEDIATE FIX (Deploy staged changes)
git add src/lib/firebase-db.ts
git commit -m "Fix remaining Firebase Admin calls"
git push origin main
# Wait 3-5 minutes for deployment
```

**Verification**:
```bash
# Test after deployment
curl -X POST https://studio--drivemind-q69b7.us-central1.hosted.app/api/workflows/background-scan \
  -H "Authorization: Bearer FIREBASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"full_analysis","config":{"maxDepth":20}}'
```

---

## 🔍 Diagnostic Tools & Commands

### Quick Health Check
```bash
# Basic app health
curl -I https://studio--drivemind-q69b7.us-central1.hosted.app/about

# API health  
curl https://studio--drivemind-q69b7.us-central1.hosted.app/api/auth/drive/status

# Firebase project status
npx firebase apphosting:backends:get studio
```

### Detailed System Check
```bash
# Check Firebase Auth
curl https://studio--drivemind-q69b7.us-central1.hosted.app/api/debug/auth

# Check OAuth configuration
curl -X POST https://studio--drivemind-q69b7.us-central1.hosted.app/api/auth/drive/begin \
  -H "Content-Type: application/json" \
  -d '{"userId":"test"}'

# Check secrets availability
npx firebase apphosting:secrets:access GOOGLE_OAUTH_CLIENT_SECRET
```

### Log Analysis
```bash
# View recent logs (Firebase Console)
# https://console.firebase.google.com/project/drivemind-q69b7/functions/logs

# Search for specific errors
grep -r "500" logs/
grep -r "Firebase Admin" logs/
grep -r "OAuth" logs/
```

---

## 🚀 Common Issues & Solutions

### 1. Authentication Issues

#### Issue: "No authorization token provided"
**Symptoms**: 401 errors on API calls  
**Causes**: 
- User not signed in with Firebase Auth
- Frontend not sending Authorization header
- Token expired

**Debug Steps**:
```javascript
// Check user authentication state (browser console)
const user = firebase.auth().currentUser;
console.log('User:', user);

if (user) {
  const token = await user.getIdToken();
  console.log('Token length:', token.length);
  
  // Test API call manually
  fetch('/api/workflows/background-scan', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({type: 'full_analysis'})
  });
}
```

**Solutions**:
```typescript
// Ensure proper token handling
const makeAuthenticatedRequest = async (url, options = {}) => {
  const user = firebase.auth().currentUser;
  if (!user) throw new Error('User not authenticated');
  
  const token = await user.getIdToken(true); // Force refresh
  
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
    }
  });
};
```

#### Issue: "Firebase Admin not initialized"
**Symptoms**: 500 errors with Firebase Admin failure  
**Causes**:
- Missing environment variables
- Incorrect service account configuration
- App Hosting credentials not available

**Debug Steps**:
```bash
# Check environment variables
env | grep GOOGLE
env | grep FIREBASE

# Test Firebase Admin initialization
node -e "
const admin = require('firebase-admin');
try {
  admin.initializeApp();
  console.log('✅ Admin initialized');
} catch (e) {
  console.log('❌ Admin failed:', e.message);
}
"
```

**Solutions**:
```typescript
// Enhanced Firebase Admin initialization
export function getAdminApp() {
  if (adminApp) return adminApp;
  
  try {
    const { initializeApp, getApps, applicationDefault } = require('firebase-admin/app');
    
    if (getApps().length > 0) {
      adminApp = getApps()[0];
    } else {
      adminApp = initializeApp({
        credential: applicationDefault(),
      });
    }
    
    logger.info('✅ Firebase Admin initialized successfully');
    return adminApp;
  } catch (error) {
    logger.error('💥 Firebase Admin initialization failed:', error);
    throw new Error('Firebase Admin setup failed');
  }
}
```

### 2. Google Drive OAuth Issues

#### Issue: OAuth flow fails or doesn't persist
**Symptoms**: 
- User gets redirected to error page after OAuth
- Connection doesn't persist between sessions
- "No Google Drive connection" errors

**Debug Steps**:
```bash
# Test OAuth begin endpoint
curl -X POST https://domain.com/api/auth/drive/begin \
  -H "Content-Type: application/json" \
  -d '{"userId":"test-uid"}' \
  -v

# Check OAuth callback URL
echo "Redirect URI: https://studio--drivemind-q69b7.us-central1.hosted.app/api/auth/drive/callback"

# Verify Google Console settings
# https://console.cloud.google.com/apis/credentials?project=drivemind-q69b7
```

**Common Fixes**:
```typescript
// 1. Ensure correct OAuth parameters
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',    // REQUIRED for refresh token
  prompt: 'consent',         // REQUIRED for new refresh token
  scope: ['https://www.googleapis.com/auth/drive'],
  state: userId,             // REQUIRED for token association
});

// 2. Verify redirect URI matches Google Console exactly
const redirectUri = `${process.env.NEXT_PUBLIC_BASE_URL}/api/auth/drive/callback`;

// 3. Check token storage
const storedToken = await getUserRefreshToken(uid);
console.log('Stored token exists:', !!storedToken);
```

#### Issue: "redirect_uri_mismatch"
**Symptoms**: OAuth callback returns redirect URI mismatch error  
**Root Cause**: Google Console redirect URIs don't match callback URL

**Solution**:
1. **Check Google Console**: https://console.cloud.google.com/apis/credentials?project=drivemind-q69b7
2. **Verify redirect URIs include**:
   - `https://studio--drivemind-q69b7.us-central1.hosted.app/api/auth/drive/callback`
   - `http://localhost:3000/api/auth/drive/callback` (development)
3. **Check environment variable**:
   ```bash
   echo $NEXT_PUBLIC_BASE_URL
   # Should be: https://studio--drivemind-q69b7.us-central1.hosted.app
   ```

### 3. Database Issues

#### Issue: Firestore operations failing
**Symptoms**: Database read/write errors, 500 responses from API  
**Causes**:
- Client-side Firebase used in server context
- Security rules blocking access
- Network connectivity issues

**Debug Client vs Server Firebase**:
```typescript
// ❌ WRONG (Client-side Firebase in API route)
import { db } from '@/lib/firebase';
const docs = await getDocs(collection(db, 'scanJobs'));

// ✅ CORRECT (Firebase Admin in API route)
import { getAdminFirestore } from '@/lib/admin';
const db = getAdminFirestore();
const docs = await db.collection('scanJobs').get();
```

**Migration Checklist**:
- [ ] Replace `collection(db, 'name')` with `db.collection('name')`
- [ ] Replace `doc(db, 'collection', 'id')` with `db.collection('collection').doc('id')`
- [ ] Replace `addDoc(collection(...))` with `db.collection(...).add()`
- [ ] Replace `updateDoc(doc(...))` with `db.collection(...).doc(...).update()`
- [ ] Replace `getDocs(query(...))` with `db.collection(...).where(...).get()`
- [ ] Replace `serverTimestamp()` with `Date.now()`

#### Issue: Security rules blocking access
**Symptoms**: "Missing or insufficient permissions" errors  
**Debug**:
```bash
# Check current security rules
npx firebase firestore:rules:get

# Test rules in Firebase Console simulator
# https://console.firebase.google.com/project/drivemind-q69b7/firestore/rules
```

**Correct Security Rules**:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // User-specific data
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Scan jobs
    match /scanJobs/{scanId} {
      allow read, write: if request.auth != null && 
        (request.auth.uid == resource.data.uid || 
         request.auth.uid == request.resource.data.uid);
    }
    
    // File index
    match /fileIndex/{fileId} {
      allow read, write: if request.auth != null && 
        (request.auth.uid == resource.data.uid || 
         request.auth.uid == request.resource.data.uid);
    }
  }
}
```

### 4. Background Scan Issues

#### Issue: Scan gets stuck in "running" state
**Symptoms**: Progress stops updating, scan never completes  
**Causes**:
- Unhandled exception in background processor
- Server restart during processing
- Google Drive API rate limiting

**Debug Steps**:
```typescript
// Check scan job status
const scanJob = await db.collection('scanJobs').doc(jobId).get();
console.log('Scan status:', scanJob.data());

// Check for recent errors in logs
grep "background-scan" /var/log/app.log

// Test Google Drive connectivity
const drive = await driveFor(uid);
const testResult = await drive.files.list({ pageSize: 1 });
console.log('Drive connection:', testResult.status);
```

**Recovery Actions**:
```typescript
// Reset stuck scan
await db.collection('scanJobs').doc(jobId).update({
  status: 'failed',
  error: 'Scan timed out - please retry',
  completedAt: Date.now(),
  updatedAt: Date.now()
});

// Add timeout protection in future scans
const scanTimeout = setTimeout(() => {
  failScanJob(jobId, 'Scan exceeded maximum duration (30 minutes)');
}, 30 * 60 * 1000);

// Clear timeout when scan completes
clearTimeout(scanTimeout);
```

#### Issue: "No Google Drive connection" during scan
**Symptoms**: Background scan fails immediately with connection error  
**Root Cause**: OAuth token not found or expired

**Debug Process**:
```typescript
// 1. Check token storage
const refreshToken = await getUserRefreshToken(uid);
console.log('Token exists:', !!refreshToken);

// 2. Test token validity
try {
  const drive = await driveFor(uid);
  await drive.files.list({ pageSize: 1 });
  console.log('✅ Token valid');
} catch (error) {
  console.log('❌ Token invalid:', error.message);
}

// 3. Check token sync
const syncResult = await fetch('/api/auth/drive/sync', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${firebaseToken}` }
});
console.log('Sync result:', await syncResult.json());
```

### 5. Frontend Issues

#### Issue: Scan buttons don't respond
**Symptoms**: Clicking scan buttons produces no visible effect  
**Debug Steps**:
```javascript
// Check console for JavaScript errors
console.log('=== SCAN BUTTON DEBUG ===');

// Test button click handler manually
const button = document.querySelector('[data-testid="scan-button"]');
button?.click();

// Check authentication state
const user = firebase.auth().currentUser;
console.log('User authenticated:', !!user);

// Test API call directly
if (user) {
  const token = await user.getIdToken();
  fetch('/api/workflows/background-scan', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({type: 'full_analysis'})
  }).then(r => r.json()).then(console.log);
}
```

**Common Solutions**:
```typescript
// Add comprehensive error handling
const startScan = async () => {
  try {
    console.log('🔥 Starting scan...');
    
    if (!user) {
      alert('Please sign in first');
      return;
    }
    
    const token = await user.getIdToken();
    console.log('✅ Got token, length:', token.length);
    
    const response = await fetch('/api/workflows/background-scan', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({type: 'full_analysis'})
    });
    
    console.log('📬 Response status:', response.status);
    const result = await response.json();
    console.log('📋 Response data:', result);
    
    if (!response.ok) {
      alert(`Scan failed: ${result.error || 'Unknown error'}`);
    }
    
  } catch (error) {
    console.error('💥 Scan error:', error);
    alert(`Error: ${error.message}`);
  }
};
```

---

## 🔧 System Recovery Procedures

### Complete System Reset
```bash
# 1. Stop all active operations
# (No manual stop needed - Firebase App Hosting is serverless)

# 2. Revert to last known good state
git log --oneline -10  # Find last working commit
git revert HEAD  # Revert latest changes
git push origin main

# 3. Wait for deployment (3-5 minutes)
# 4. Verify system health
curl -I https://studio--drivemind-q69b7.us-central1.hosted.app/about
```

### Database Recovery
```bash
# 1. Export current state (backup)
npx firebase firestore:export gs://backup-bucket/$(date +%Y%m%d_%H%M%S)

# 2. Clear problematic data (if needed)
npx firebase firestore:delete --all-collections --yes

# 3. Restore from backup (if needed)
npx firebase firestore:import gs://backup-bucket/BACKUP_TIMESTAMP
```

### OAuth System Reset
```bash
# 1. Clear all stored tokens
# (Manual process - delete user secrets in Firestore Console)

# 2. Regenerate OAuth credentials (if needed)
# Google Console > APIs & Credentials > OAuth 2.0 Client IDs

# 3. Update Firebase secrets
npx firebase apphosting:secrets:set GOOGLE_OAUTH_CLIENT_SECRET

# 4. Force users to re-authenticate
# (Tokens will be invalid, forcing re-auth flow)
```

---

## 📋 Maintenance Checklist

### Daily Monitoring
- [ ] Check application uptime: `curl -I https://studio--drivemind-q69b7.us-central1.hosted.app/about`
- [ ] Review error logs in Firebase Console
- [ ] Monitor API response times
- [ ] Check OAuth success rates

### Weekly Maintenance
- [ ] Review scan job completion rates
- [ ] Check database storage usage
- [ ] Update dependencies: `npm audit`
- [ ] Test backup/restore procedures
- [ ] Verify SSL certificate validity

### Monthly Reviews
- [ ] Analyze performance metrics
- [ ] Review and update documentation
- [ ] Test disaster recovery procedures
- [ ] Security audit and updates
- [ ] Capacity planning review

---

## 📞 Emergency Contacts & Resources

### Immediate Support
- **Firebase Status**: https://status.firebase.google.com/
- **Google Cloud Status**: https://status.cloud.google.com/
- **GitHub Status**: https://www.githubstatus.com/

### Account Access
- **Firebase Console**: https://console.firebase.google.com/project/drivemind-q69b7
- **Google Cloud Console**: https://console.cloud.google.com/home/dashboard?project=drivemind-q69b7
- **Account Owner**: scott.presley@gmail.com

### Documentation
- **Project README**: All README files in project root
- **Firebase Docs**: https://firebase.google.com/docs/app-hosting
- **Next.js Docs**: https://nextjs.org/docs
- **Google Drive API**: https://developers.google.com/drive/api

---

**🔄 Last Updated**: September 6, 2025  
**🚨 Priority Issue**: Deploy Firebase Admin fixes for background scan 500 errors  
**📊 System Status**: Partially functional - OAuth working, background scans failing  
**🎯 Next Action**: `git add . && git commit -m "Fix Firebase Admin calls" && git push origin main`