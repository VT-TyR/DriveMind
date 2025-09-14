# ADR-001: OAuth 2.0 Authentication Architecture

**Status**: Accepted  
**Date**: 2025-09-12  
**Authors**: DriveMind Architecture Team  
**Reviewers**: Security Team, Platform Team  

## Context

DriveMind requires secure authentication with Google Drive API to access user files for analysis and organization. The system must handle OAuth 2.0 flows, token management, and maintain security while providing a seamless user experience.

## Decision

We will implement OAuth 2.0 Authorization Code flow with the following architecture:

### Authentication Flow
1. **OAuth Initiation**: Server-side generation of authorization URLs
2. **Authorization Code Exchange**: Backend token exchange for access/refresh tokens  
3. **Token Storage**: Encrypted refresh tokens in Firebase Firestore
4. **Session Management**: HTTP-only cookies for access tokens
5. **Token Refresh**: Automatic refresh token rotation

### Implementation Details

#### OAuth Configuration
```typescript
// OAuth Client Configuration
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_OAUTH_CLIENT_ID,
  process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  'https://studio--drivemind-q69b7.us-central1.hosted.app/api/auth/drive/callback'
);

// Required Scopes
const SCOPES = ['https://www.googleapis.com/auth/drive'];
```

#### Token Storage Architecture
```yaml
Firestore Structure:
  users/{uid}/secrets/googleDrive:
    refreshToken: string (encrypted)
    updatedAt: Timestamp
    tokenVersion: number (for rotation)
    
Cookie Configuration:
  google_access_token:
    httpOnly: true
    secure: true (production)
    sameSite: 'strict' 
    maxAge: 3600 (1 hour)
```

#### Security Controls
- **PKCE (Proof Key for Code Exchange)**: Protection against authorization code interception
- **State Parameter**: CSRF protection with cryptographically secure random values
- **Token Encryption**: Refresh tokens encrypted at rest using Firebase App Check
- **Secure Cookies**: HTTP-only, Secure, SameSite=Strict configuration
- **Token Rotation**: Automatic refresh token rotation on each use

## Alternatives Considered

### Option 1: Client-Side OAuth Flow (REJECTED)
**Pros**: Simpler implementation, no server-side token storage
**Cons**: 
- Security vulnerability: tokens exposed to client-side code
- No refresh token support for offline access
- Limited control over token lifecycle

### Option 2: Server-Side with Database Token Storage (REJECTED)  
**Pros**: Centralized token management
**Cons**:
- Additional database complexity  
- Firestore provides better integration with Firebase ecosystem
- Less secure than Firestore's built-in encryption

### Option 3: JWT-Based Session Management (REJECTED)
**Pros**: Stateless authentication
**Cons**:
- Cannot revoke sessions immediately
- JWT size limitations with OAuth tokens
- Complex token refresh mechanics

## Consequences

### Positive
- **Security**: Implements industry best practices for OAuth 2.0 flows
- **User Experience**: Seamless authentication with automatic token refresh
- **Scalability**: Firebase Firestore handles token storage scaling automatically
- **Compliance**: Meets Google OAuth security requirements and GDPR standards
- **Monitoring**: Comprehensive logging and error handling for debugging

### Negative  
- **Complexity**: Server-side token management adds implementation complexity
- **Dependencies**: Tight coupling with Firebase ecosystem
- **Performance**: Additional Firestore reads/writes for token operations
- **Security Risk**: Refresh tokens remain a high-value target for attackers

## Implementation Plan

### Phase 1: Core OAuth Flow (COMPLETED)
- [x] OAuth URL generation endpoint
- [x] Authorization callback handling  
- [x] Basic token storage in Firestore
- [x] Cookie-based session management

### Phase 2: Security Hardening (IN PROGRESS)
- [ ] PKCE implementation
- [ ] Refresh token encryption  
- [ ] Token rotation mechanism
- [ ] Enhanced error handling

### Phase 3: Advanced Features (PLANNED)
- [ ] Token revocation on logout
- [ ] Multi-device session management
- [ ] Audit logging for all auth events
- [ ] Anomaly detection for unusual access patterns

## Security Considerations

### Critical Vulnerabilities Identified
1. **Refresh Token Theft (T002)**: CRITICAL - Tokens stored unencrypted in Firestore
2. **Authorization Code Interception (T001)**: HIGH - Missing PKCE implementation
3. **Session Hijacking (T014)**: HIGH - Partial mitigation with secure cookies

### Security Controls Required
```typescript
// Required: Token Encryption Implementation
export async function saveUserRefreshToken(uid: string, refreshToken: string) {
  const encryptedToken = await encrypt(refreshToken, process.env.TOKEN_ENCRYPTION_KEY);
  await userRef.doc(uid).collection('secrets').doc('googleDrive').set({
    refreshToken: encryptedToken,
    tokenVersion: Date.now(),
    updatedAt: new Date(),
  });
}

// Required: PKCE Implementation
const codeVerifier = generateCodeVerifier();
const codeChallenge = generateCodeChallenge(codeVerifier);
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent', 
  scope: SCOPES,
  state: generateSecureState(),
  code_challenge: codeChallenge,
  code_challenge_method: 'S256'
});
```

## Monitoring and Alerting

### Key Metrics
- OAuth success rate (target: >99.5%)
- Token refresh success rate (target: >99.9%) 
- Average authentication latency (target: <2s)
- Failed authentication attempts per hour
- Token theft detection events

### Critical Alerts  
- OAuth failure rate >10% for 5+ minutes (P0)
- Refresh token errors >5% for 10+ minutes (P1)
- Unusual authentication patterns detected (P1)
- Security events (failed auth spikes) (P0)

## Compliance and Privacy

### GDPR Compliance
- **Consent Management**: Explicit user consent for Drive API access
- **Data Minimization**: Only store necessary tokens and metadata
- **Right to Erasure**: Complete token deletion on account termination
- **Data Portability**: OAuth tokens enable user data export

### Google API Terms of Service
- **Rate Limiting**: Respect Google Drive API quotas (10,000 requests/100s)
- **Data Usage**: Comply with restricted use requirements
- **User Permission**: Only access data with explicit user authorization

## Testing Strategy

### Unit Tests
- OAuth URL generation with proper parameters
- Token encryption/decryption functions
- Cookie configuration validation
- Error handling for various failure scenarios

### Integration Tests
- Complete OAuth flow from initiation to callback
- Token refresh functionality
- Cross-browser cookie handling
- Error recovery mechanisms

### Security Tests
- PKCE flow validation
- State parameter CSRF protection
- Token encryption at rest verification
- Session security testing

## Documentation and Training

### Developer Documentation
- OAuth integration guide
- Token management best practices  
- Security implementation checklist
- Troubleshooting common issues

### Operational Documentation
- OAuth flow monitoring procedures
- Security incident response for token compromise
- Token recovery procedures
- Performance optimization guidelines

## Review and Maintenance

### Regular Reviews
- **Monthly**: Security posture review
- **Quarterly**: Performance and scaling assessment
- **Annually**: Full architecture review and threat model update

### Update Triggers
- Google OAuth specification changes
- Security vulnerability disclosures
- Performance degradation events  
- New regulatory requirements

---

**Decision Rationale**: This OAuth architecture provides the optimal balance of security, usability, and maintainability for DriveMind's requirements. The server-side approach enables comprehensive security controls while maintaining excellent user experience through automatic token management.

**Next Review Date**: 2025-12-12