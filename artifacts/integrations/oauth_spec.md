# OAuth 2.0 Integration Specification

**Version**: 1.0.0  
**Project**: DriveMind  
**Last Updated**: 2025-01-12  

## Overview

DriveMind implements OAuth 2.0 authorization code flow with Google Drive API for secure access to user files. This specification covers the complete OAuth implementation, security considerations, and production deployment requirements.

## Authentication Flow

### 1. OAuth 2.0 Authorization Code Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant API
    participant Google
    participant Firebase

    User->>Frontend: Clicks "Connect Drive"
    Frontend->>API: POST /api/auth/drive/begin
    API->>Google: Generate auth URL
    Google-->>API: Return auth URL
    API-->>Frontend: Return auth URL
    Frontend->>Google: Redirect to consent screen
    User->>Google: Grant permissions
    Google->>API: GET /api/auth/drive/callback?code=...
    API->>Google: Exchange code for tokens
    Google-->>API: Access & refresh tokens
    API->>Firebase: Store refresh token
    API->>Frontend: Set HTTP-only cookies
    API-->>User: Redirect to /ai?drive_connected=true
```

### 2. OAuth Configuration

#### Environment Variables
```bash
# Required OAuth credentials
GOOGLE_OAUTH_CLIENT_ID="xxx.apps.googleusercontent.com"
GOOGLE_OAUTH_CLIENT_SECRET="GOCSPX-xxx"

# Base URL for redirect URIs
NEXT_PUBLIC_BASE_URL="https://studio--drivemind-q69b7.us-central1.hosted.app"

# Firebase configuration
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----..."
FIREBASE_CLIENT_EMAIL="firebase-adminsdk-xxx@drivemind-q69b7.iam.gserviceaccount.com"
```

#### Google Cloud Console Setup
- **Authorized JavaScript origins**: 
  - `https://studio--drivemind-q69b7.us-central1.hosted.app`
  - `http://localhost:3000` (development)
- **Authorized redirect URIs**:
  - `https://studio--drivemind-q69b7.us-central1.hosted.app/api/auth/drive/callback`
  - `http://localhost:3000/api/auth/drive/callback` (development)
- **Scopes**: `https://www.googleapis.com/auth/drive`

## API Endpoints

### POST /api/auth/drive/begin

Initiates OAuth flow by generating authorization URL.

#### Request
```json
{
  "userId": "optional_user_id"
}
```

#### Response (200)
```json
{
  "url": "https://accounts.google.com/o/oauth2/v2/auth?client_id=..."
}
```

#### Implementation
- Validates OAuth credentials exist
- Generates state parameter for CSRF protection
- Sets proper scope and access_type parameters
- Forces consent to ensure refresh token

### GET|POST /api/auth/drive/callback

Handles OAuth callback and token exchange.

#### GET Parameters
- `code`: Authorization code from Google
- `state`: CSRF protection state
- `error`: OAuth error code (if any)

#### POST Body
```json
{
  "code": "authorization_code",
  "state": "csrf_state",
  "error": "optional_error"
}
```

#### Success Response (200/302)
- **GET**: Redirects to `/ai?drive_connected=true`
- **POST**: Returns JSON `{"success": true}`
- Sets HTTP-only cookies with tokens
- Stores refresh token in Firebase

#### Error Handling
- Invalid credentials → `invalid_client_credentials`
- Expired code → `invalid_authorization_code`
- URI mismatch → `redirect_uri_mismatch`
- Missing code → `no_auth_code`

### GET /api/auth/drive/status

Returns current authentication status.

#### Response (200)
```json
{
  "authenticated": true,
  "hasValidToken": true,
  "tokenExpiry": "2024-12-13T10:30:00Z",
  "scopes": ["https://www.googleapis.com/auth/drive"]
}
```

### POST /api/auth/drive/sync

Synchronizes tokens to Firebase for server-side operations.

#### Request
```json
{
  "userId": "user_identifier"
}
```

#### Response (200)
```json
{
  "success": true,
  "message": "Tokens synchronized to persistent storage"
}
```

## Token Management

### Cookie Storage
- **Access Token**: `google_access_token`
  - HTTP-only, Secure, SameSite=Strict
  - Expires: 1 hour
- **Refresh Token**: `google_refresh_token`
  - HTTP-only, Secure, SameSite=Strict  
  - Expires: 30 days

### Firebase Persistence
- Collection: `users/{userId}/secrets`
- Document: `googleDrive`
- Fields: `refreshToken`, `updatedAt`
- In-memory cache: 5-minute TTL

### Token Refresh Strategy
```typescript
async function refreshAccessToken(userId: string) {
  const refreshToken = await getUserRefreshToken(userId);
  
  if (!refreshToken) {
    throw new Error('No refresh token found');
  }
  
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET
  );
  
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  
  const { credentials } = await oauth2Client.refreshAccessToken();
  
  return credentials.access_token;
}
```

## Security Considerations

### 1. CSRF Protection
- State parameter used for all OAuth flows
- State contains user ID when available
- Validates state parameter in callback

### 2. Token Security
- HTTP-only cookies prevent XSS access
- Secure flag enforced in production
- SameSite=Strict prevents CSRF
- Short access token lifetime (1 hour)

### 3. Credential Validation
```typescript
function validateOAuthCredentials() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  
  if (!clientId || !clientSecret) {
    throw new Error('OAuth credentials missing');
  }
  
  if (clientId.includes(' ') || clientSecret.includes('\n')) {
    throw new Error('OAuth credentials contain whitespace');
  }
  
  return { clientId, clientSecret };
}
```

### 4. Redirect URI Validation
- Hardcoded allowed domains
- Environment-based URI construction
- Prevents open redirect vulnerabilities

### 5. Error Information Leakage
- Generic error messages for public endpoints
- Detailed logging server-side only
- No sensitive data in error responses

## Rate Limiting

### OAuth Endpoints
- **Begin**: 100 requests/minute per IP
- **Callback**: 50 requests/minute per IP  
- **Status**: 200 requests/minute per IP
- **Sync**: 20 requests/minute per user

### Implementation
```typescript
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(100, "1 m"),
  analytics: true,
});

export async function rateLimitMiddleware(request: NextRequest) {
  const identifier = request.ip ?? "127.0.0.1";
  const { success, pending, limit, reset, remaining } = 
    await ratelimit.limit(identifier);
    
  if (!success) {
    return NextResponse.json(
      { error: 'rate_limit_exceeded' },
      { 
        status: 429,
        headers: {
          'X-RateLimit-Limit': limit.toString(),
          'X-RateLimit-Remaining': remaining.toString(),
          'X-RateLimit-Reset': reset.toString(),
          'Retry-After': Math.round(reset / 1000).toString(),
        }
      }
    );
  }
  
  return null; // Continue processing
}
```

## Error Handling

### Error Taxonomy
```typescript
interface OAuthError {
  error: string;
  message: string;
  details?: string;
  timestamp: string;
  requestId?: string;
}
```

### Error Codes
- `oauth_config_missing` - Missing client credentials
- `invalid_client_credentials` - Invalid client ID/secret
- `invalid_authorization_code` - Code expired/invalid
- `redirect_uri_mismatch` - URI not in whitelist
- `no_auth_code` - Missing authorization code
- `oauth_callback_failed` - Generic callback failure
- `token_refresh_failed` - Refresh token invalid
- `rate_limit_exceeded` - Too many requests

### Error Recovery
```typescript
async function handleOAuthError(error: any, method: string) {
  const errorMap = {
    'invalid_client': 'invalid_client_credentials',
    'invalid_grant': 'invalid_authorization_code',
    'redirect_uri_mismatch': 'redirect_uri_mismatch'
  };
  
  const errorType = errorMap[error.message] || 'oauth_callback_failed';
  
  console.error('OAuth Error:', {
    type: errorType,
    message: error.message,
    timestamp: new Date().toISOString()
  });
  
  if (method === 'POST') {
    return NextResponse.json(
      { error: errorType, message: 'OAuth authentication failed' },
      { status: 400 }
    );
  }
  
  return NextResponse.redirect(
    `/ai?error=${errorType}`
  );
}
```

## Monitoring and Observability

### Metrics
```typescript
interface OAuthMetrics {
  oauth_flows_initiated: number;
  oauth_flows_completed: number;
  oauth_flows_failed: number;
  token_refreshes_successful: number;
  token_refreshes_failed: number;
  active_authenticated_users: number;
}
```

### Logging
```typescript
function logOAuthEvent(event: string, data: any) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'info',
    service: 'oauth',
    event,
    data: {
      ...data,
      // Remove sensitive data
      accessToken: undefined,
      refreshToken: undefined,
      clientSecret: undefined
    }
  }));
}
```

### Health Checks
```typescript
export async function validateOAuthHealth() {
  try {
    const { clientId, clientSecret } = validateOAuthCredentials();
    
    // Test basic OAuth client creation
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      'http://localhost:3000/callback'
    );
    
    // Generate test URL (doesn't make network call)
    oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/drive']
    });
    
    return { status: 'healthy', message: 'OAuth configuration valid' };
  } catch (error) {
    return { 
      status: 'unhealthy', 
      message: error.message || 'OAuth validation failed' 
    };
  }
}
```

## Testing Strategy

### Unit Tests
```typescript
describe('OAuth Service', () => {
  test('should generate valid auth URL', async () => {
    const response = await request(app)
      .post('/api/auth/drive/begin')
      .send({ userId: 'test-user' })
      .expect(200);
      
    expect(response.body.url).toMatch(/^https:\/\/accounts\.google\.com/);
  });
  
  test('should handle missing credentials', async () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = '';
    
    await request(app)
      .post('/api/auth/drive/begin')
      .expect(500)
      .expect(res => {
        expect(res.body.error).toBe('OAuth configuration incomplete');
      });
  });
});
```

### Integration Tests
```typescript
describe('OAuth Flow Integration', () => {
  test('should complete full OAuth flow', async () => {
    // Mock Google OAuth response
    nock('https://oauth2.googleapis.com')
      .post('/token')
      .reply(200, {
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        expires_in: 3600
      });
    
    const response = await request(app)
      .post('/api/auth/drive/callback')
      .send({ code: 'mock-auth-code' })
      .expect(200);
      
    expect(response.body.success).toBe(true);
  });
});
```

## Production Deployment

### Checklist
- [ ] OAuth credentials configured in Firebase secrets
- [ ] Redirect URIs updated in Google Cloud Console
- [ ] Rate limiting configured
- [ ] Monitoring dashboards created
- [ ] Error alerting configured
- [ ] Token rotation strategy documented

### Firebase App Hosting Configuration
```yaml
# apphosting.yaml
runConfig:
  concurrency: 80
  cpu: 1
  memoryMiB: 512
  maxInstances: 10
  minInstances: 0
  
secrets:
  - variable: GOOGLE_OAUTH_CLIENT_SECRET
    availability:
      - RUNTIME
```

### Rollback Strategy
1. Revert to previous deployment
2. Validate OAuth credentials
3. Clear token cache
4. Force user re-authentication if needed

### Disaster Recovery
- OAuth credentials backed up in secure storage
- Firestore token data replicated across regions
- Alternative authentication method available
- User notification system for outages

## Compliance and Security

### Data Protection
- No PII stored in OAuth tokens
- Refresh tokens encrypted at rest in Firebase
- Token data retention: 30 days maximum
- GDPR-compliant token deletion

### Audit Requirements
- All OAuth events logged with request IDs
- Failed authentication attempts tracked
- Administrative access to tokens logged
- Regular credential rotation scheduled

### Security Scanning
- SAST scan on OAuth implementation
- Dependency vulnerability scanning
- Penetration testing on auth endpoints
- Security headers validation