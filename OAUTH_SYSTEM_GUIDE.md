# OAuth System Implementation Guide

## 🎯 Overview
DriveMind uses a sophisticated dual-authentication system combining Firebase Auth (user identity) with Google OAuth (Drive access). This ensures both user authentication persistence and Google Drive API access across sessions.

## 🏗️ Architecture

### Dual Authentication Flow
```
┌─────────────────┐    ┌─────────────────────┐    ┌──────────────────┐
│  Firebase Auth  │    │   Google OAuth 2.0  │    │  Google Drive    │
│  (User Identity)│────│   (API Access)      │────│     API          │
└─────────────────┘    └─────────────────────┘    └──────────────────┘
         │                        │                         │
         │                        │                         │
    ┌─────────────────────────────────────────────────────────────────┐
    │                Token Storage System                             │
    │  ┌──────────────────┐    ┌─────────────────┐                   │
    │  │   Cookie Store   │    │   Firestore     │                   │
    │  │  (Browser Only)  │    │  (Server-Side)  │                   │
    │  └──────────────────┘    └─────────────────┘                   │
    └─────────────────────────────────────────────────────────────────┘
```

### Token Storage Strategy
```typescript
// Cookie Storage (Browser Sessions)
interface CookieStorage {
  name: 'google_refresh_token';
  value: string;
  httpOnly: true;
  secure: true; // Production only
  sameSite: 'strict';
  maxAge: 30 * 24 * 60 * 60; // 30 days
}

// Firestore Storage (Server Operations)
interface FirestoreStorage {
  collection: 'users/{uid}/secrets';
  document: 'googleDrive';
  fields: {
    refreshToken: string;
    updatedAt: Date;
  };
}

// In-Memory Cache (Performance)
interface CacheEntry {
  token: string;
  timestamp: number;
  ttl: 5 * 60 * 1000; // 5 minutes
}
```

## 🔑 OAuth Implementation

### 1. OAuth Begin Endpoint
**File**: `src/app/api/auth/drive/begin/route.ts`

```typescript
export async function POST(request: NextRequest) {
  const { userId } = await request.json();
  
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    `${baseUrl}/api/auth/drive/callback`
  );
  
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',        // Get refresh token
    prompt: 'consent',             // Force consent to get refresh token
    scope: ['https://www.googleapis.com/auth/drive'],
    state: userId || undefined,    // Pass userId for token association
  });

  return NextResponse.json({ url: authUrl });
}
```

**Key Features:**
- ✅ `access_type: 'offline'` - Ensures refresh token is provided
- ✅ `prompt: 'consent'` - Forces new consent to get fresh refresh token
- ✅ State parameter - Associates token with Firebase user
- ✅ Proper error handling and logging

### 2. OAuth Callback Endpoint  
**File**: `src/app/api/auth/drive/callback/route.ts`

```typescript
export async function POST(request: NextRequest) {
  const { code, state } = await request.json();
  
  // Exchange authorization code for tokens
  const { tokens } = await oauth2Client.getToken(code);
  
  // Dual storage approach
  const response = NextResponse.json({ success: true });
  
  // Store in cookies (browser sessions)
  if (tokens.refresh_token) {
    response.cookies.set('google_refresh_token', tokens.refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });
  }
  
  // Store in Firestore (server operations)
  if (state && tokens.refresh_token) {
    await saveUserRefreshToken(state, tokens.refresh_token);
  }
  
  return response;
}
```

**Key Features:**
- ✅ Handles both GET (direct redirect) and POST (frontend) requests
- ✅ Dual token storage (cookies + Firestore)
- ✅ Graceful error handling for missing userId
- ✅ Comprehensive logging for debugging

### 3. Status Check Endpoint
**File**: `src/app/api/auth/drive/status/route.ts`

```typescript
export async function GET(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  let uid: string | null = null;
  
  // Method 1: Check Firestore token (authenticated users)
  if (token) {
    try {
      const decodedToken = await getAdminAuth().verifyIdToken(token);
      uid = decodedToken.uid;
      
      const storedToken = await getUserRefreshToken(uid);
      if (storedToken) {
        const drive = await driveFor(uid);
        await drive.files.list({ pageSize: 1 }); // Test connection
        
        return NextResponse.json({ 
          connected: true, 
          source: 'firestore',
          uid 
        });
      }
    } catch (error) {
      // Continue to cookie check
    }
  }
  
  // Method 2: Check cookie token (fallback)
  const cookieToken = (await cookies()).get('google_refresh_token')?.value;
  if (cookieToken) {
    // Test cookie token...
  }
  
  return NextResponse.json({ connected: false });
}
```

**Key Features:**
- ✅ Checks both Firestore and cookie storage
- ✅ Firebase Auth integration
- ✅ Actually tests Drive connection
- ✅ Returns connection source for debugging

### 4. Token Sync Endpoint
**File**: `src/app/api/auth/drive/sync/route.ts`

```typescript
export async function POST(request: NextRequest) {
  // Get Firebase user
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  const decodedToken = await getAdminAuth().verifyIdToken(token);
  const uid = decodedToken.uid;
  
  // Get tokens from both sources
  const cookieToken = (await cookies()).get('google_refresh_token')?.value;
  const firestoreToken = await getUserRefreshToken(uid);
  
  // Sync logic: prioritize Firestore, use cookies as backup
  if (firestoreToken && (!cookieToken || cookieToken !== firestoreToken)) {
    // Update cookies to match Firestore
    const response = NextResponse.json({ synced: true });
    response.cookies.set('google_refresh_token', firestoreToken, {
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60,
    });
    return response;
  } else if (cookieToken && !firestoreToken) {
    // Save cookie token to Firestore
    await saveUserRefreshToken(uid, cookieToken);
  }
  
  return NextResponse.json({ synced: true });
}
```

**Key Features:**
- ✅ Reconciles token differences between storage methods
- ✅ Prioritizes Firestore for server operations
- ✅ Automatic sync on user authentication
- ✅ Detailed logging for troubleshooting

## 🗄️ Token Storage Implementation

### Firestore Token Store
**File**: `src/lib/token-store.ts`

```typescript
// Storage path: users/{uid}/secrets/googleDrive
export async function saveUserRefreshToken(uid: string, refreshToken: string) {
  const db = getAdminFirestore();
  const ref = db.collection(`users/${uid}/secrets`).doc('googleDrive');
  
  await ref.set({
    refreshToken,
    updatedAt: new Date(),
  }, { merge: true });
  
  // Update cache
  tokenCache.set(uid, { token: refreshToken, ts: Date.now() });
}

export async function getUserRefreshToken(uid: string): Promise<string | null> {
  // Check cache first (5 minute TTL)
  const cached = tokenCache.get(uid);
  if (cached && Date.now() - cached.ts < 5 * 60 * 1000) {
    return cached.token;
  }

  // Fetch from Firestore
  const db = getAdminFirestore();
  const doc = await db.collection(`users/${uid}/secrets`).doc('googleDrive').get();
  
  const token = doc.exists ? doc.data()?.refreshToken : null;
  if (token) {
    tokenCache.set(uid, { token, ts: Date.now() });
  }
  
  return token;
}
```

**Key Features:**
- ✅ Firebase Admin SDK for server-side security
- ✅ In-memory cache for performance (5-minute TTL)
- ✅ Secure document path under user's private collection
- ✅ Merge updates to preserve other secrets

### Drive Client Creation
**File**: `src/lib/google-drive.ts`

```typescript
export async function driveFor(uid: string) {
  // Get refresh token (cache → Firestore)
  const refreshToken = await getUserRefreshToken(uid);
  if (!refreshToken) {
    throw new Error(`No Google Drive connection for user '${uid}'`);
  }
  
  // Create authenticated client
  const oauth = getOAuthClient();
  oauth.setCredentials({ refresh_token: refreshToken });
  
  return google.drive({ version: "v3", auth: oauth });
}
```

**Key Features:**
- ✅ Automatic token refresh by Google client library
- ✅ Clear error messages for debugging
- ✅ Centralized OAuth client configuration

## 🎨 Frontend Integration

### DriveAuth Component
**File**: `src/components/drive-auth.tsx`

```typescript
export function DriveAuth() {
  const { user } = useAuth();
  const [driveConnected, setDriveConnected] = useState(false);

  // Enhanced status checking with Firebase token
  const checkDriveStatus = async () => {
    const headers: HeadersInit = {};
    
    if (user) {
      const token = await user.getIdToken();
      headers.Authorization = `Bearer ${token}`;
    }
    
    const response = await fetch('/api/auth/drive/status', { headers });
    const result = await response.json();
    
    setDriveConnected(result.connected);
  };

  // Automatic token sync when user authenticates
  const syncTokens = async () => {
    if (user) {
      const token = await user.getIdToken();
      await fetch('/api/auth/drive/sync', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    }
  };

  // OAuth flow initiation
  const handleConnectToDrive = async () => {
    if (!user) {
      await signInWithGoogle();
    }

    const response = await fetch('/api/auth/drive/begin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user?.uid })
    });

    const { url } = await response.json();
    window.location.href = url;
  };

  return (
    <Card>
      {driveConnected ? (
        <div className="text-green-600">✅ Connected to Google Drive</div>
      ) : (
        <Button onClick={handleConnectToDrive}>
          Connect to Google Drive
        </Button>
      )}
    </Card>
  );
}
```

**Key Features:**
- ✅ Firebase Auth integration
- ✅ Automatic status checking with authentication
- ✅ Token synchronization on user authentication
- ✅ OAuth flow initiation with userId passing

## 🔧 Configuration & Environment

### Required Environment Variables
```bash
# OAuth Credentials (Firebase Secrets)
GOOGLE_OAUTH_CLIENT_ID=123456789-abcdef.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-secretkeyhere

# Base URL (for redirect URI)
NEXT_PUBLIC_BASE_URL=https://studio--drivemind-q69b7.us-central1.hosted.app

# Firebase Configuration (auto-provided in App Hosting)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

### Google Cloud Console Setup
```
OAuth 2.0 Client Configuration:
├── Application Type: Web Application
├── Name: DriveMind OAuth Client
├── Authorized redirect URIs:
│   ├── https://studio--drivemind-q69b7.us-central1.hosted.app/api/auth/drive/callback
│   └── http://localhost:3000/api/auth/drive/callback (development)
├── OAuth Consent Screen: Published
├── Scopes: 
│   ├── https://www.googleapis.com/auth/drive
│   └── https://www.googleapis.com/auth/userinfo.email
└── Test Users: scott.presley@gmail.com
```

## 🐛 Common Issues & Debugging

### Issue 1: No Refresh Token Received
**Symptoms**: OAuth flow completes but no refresh token in response
**Causes**:
- Missing `access_type: 'offline'`
- User has already granted consent (Google skips refresh token)
- Missing `prompt: 'consent'`

**Solutions**:
```typescript
// Force fresh consent
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent', // This forces new refresh token
  scope: scopes,
});
```

### Issue 2: Token Not Persisting Between Sessions  
**Symptoms**: User needs to re-authenticate after browser restart
**Causes**:
- Cookies not being set properly
- Firestore token not saved
- Token sync not working

**Debug Steps**:
```typescript
// Check cookie storage
console.log('Cookie token:', document.cookie);

// Check Firestore storage  
const response = await fetch('/api/auth/drive/status', {
  headers: { 'Authorization': `Bearer ${firebaseToken}` }
});
console.log('Status:', await response.json());

// Test token sync
await fetch('/api/auth/drive/sync', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${firebaseToken}` }
});
```

### Issue 3: Server-Side Operations Failing
**Symptoms**: Background scans fail with "No Google Drive connection"
**Causes**:
- Firebase Admin not finding token
- Token not associated with correct user ID
- Cache invalidation issues

**Debug Steps**:
```typescript
// Test direct token retrieval
const token = await getUserRefreshToken(uid);
console.log('Firestore token:', token ? 'Found' : 'Missing');

// Test drive client creation
try {
  const drive = await driveFor(uid);
  const result = await drive.files.list({ pageSize: 1 });
  console.log('Drive connection:', result.data.files?.length || 0, 'files');
} catch (error) {
  console.error('Drive connection failed:', error.message);
}
```

### Issue 4: OAuth Redirect URI Mismatch
**Symptoms**: OAuth callback returns redirect_uri_mismatch error
**Causes**:
- Redirect URI in Google Console doesn't match callback URL
- Environment variable mismatch
- HTTP vs HTTPS mismatch

**Solutions**:
1. Verify Google Console redirect URIs match exactly
2. Check environment variables: `NEXT_PUBLIC_BASE_URL`
3. Ensure consistent protocol (https in production)

## 🔍 Testing & Verification

### Manual Testing Checklist
```bash
# 1. Test OAuth begin endpoint
curl -X POST https://domain.com/api/auth/drive/begin \
  -H "Content-Type: application/json" \
  -d '{"userId":"test-uid"}'

# 2. Test status check (unauthenticated)
curl https://domain.com/api/auth/drive/status

# 3. Test status check (authenticated)
curl -H "Authorization: Bearer FIREBASE_TOKEN" \
  https://domain.com/api/auth/drive/status

# 4. Test token sync
curl -X POST -H "Authorization: Bearer FIREBASE_TOKEN" \
  https://domain.com/api/auth/drive/sync
```

### Frontend Testing
```typescript
// Test in browser console after authentication
const user = firebase.auth().currentUser;
const token = await user.getIdToken();

// Test status
const status = await fetch('/api/auth/drive/status', {
  headers: { 'Authorization': `Bearer ${token}` }
}).then(r => r.json());
console.log('Drive status:', status);

// Test sync
const sync = await fetch('/api/auth/drive/sync', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
}).then(r => r.json());
console.log('Token sync:', sync);
```

## 📊 Monitoring & Analytics

### Key Metrics to Track
```typescript
// OAuth flow completion rate
const oauthMetrics = {
  initiated: 0,      // OAuth begin calls
  completed: 0,      // Successful callbacks
  failed: 0,         // Failed callbacks
  refreshed: 0,      // Token refreshes
};

// Connection persistence
const persistenceMetrics = {
  sessionStart: 0,   // Users starting sessions
  alreadyConnected: 0, // Users already connected
  syncRequired: 0,   // Token sync operations
};
```

### Error Tracking
```typescript
// Common error patterns to monitor
const errorPatterns = {
  'invalid_client': 'OAuth credentials mismatch',
  'invalid_grant': 'Authorization code expired/invalid',
  'redirect_uri_mismatch': 'Redirect URI configuration error',
  'access_denied': 'User denied permissions',
  'No Google Drive connection': 'Token storage/retrieval failure',
};
```

---

**🔄 Last Updated**: September 6, 2025  
**✅ Status**: Fully implemented and tested  
**🔗 Related**: BACKGROUND_SCAN_GUIDE.md (uses this OAuth system)  
**🎯 Key Success**: Persistent authorization between sessions achieved