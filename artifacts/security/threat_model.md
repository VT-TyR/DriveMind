# DriveMind Threat Model v1.0

## Executive Summary

This document provides a comprehensive threat model for DriveMind, a Google Drive AI analysis tool that integrates OAuth 2.0 authentication, Firebase backend services, and Gemini AI for document classification. The analysis identifies critical security threats and provides mitigation strategies aligned with ALPHA security standards.

## System Architecture Overview

### Core Components
- **Frontend**: Next.js React application hosted on Firebase App Hosting
- **Backend**: Firebase Functions with Node.js runtime
- **Authentication**: Google OAuth 2.0 (Google Drive API access)
- **Database**: Cloud Firestore with user-scoped security rules  
- **AI Integration**: Google Gemini AI via Genkit framework
- **External APIs**: Google Drive API v3, Google AI Studio API

### Data Flow
1. User authenticates via Google OAuth 2.0
2. OAuth tokens stored in Firestore (`users/{uid}/secrets/`)
3. Drive API calls made server-side using stored tokens
4. File metadata sent to Gemini AI for classification (PII-redacted)
5. Results stored in user-scoped Firestore collections

## Threat Analysis by Component

### 1. OAuth 2.0 Authentication Flow

#### Threats Identified

**T001: Authorization Code Interception (HIGH)**
- **Description**: Malicious actors intercepting authorization codes during OAuth callback
- **Impact**: Complete account takeover, unauthorized Drive access
- **Likelihood**: Medium (requires network position or redirect URI manipulation)
- **Mitigations**: 
  - PKCE implementation (currently missing)
  - Strict redirect URI validation
  - Short-lived authorization codes (Google default: 10 minutes)

**T002: Refresh Token Theft (CRITICAL)**
- **Description**: Long-lived refresh tokens stored in Firestore or browser cookies
- **Impact**: Persistent unauthorized access to Google Drive
- **Likelihood**: High (tokens stored in plaintext)
- **Current State**: VULNERABLE - tokens stored unencrypted in Firestore
- **Mitigations Required**:
  - Encrypt refresh tokens at rest using Firebase App Check
  - Implement token rotation
  - Add token invalidation on logout

**T003: Client Secret Exposure (HIGH)**
- **Description**: OAuth client secret exposed in client-side code or logs
- **Impact**: Impersonation of application, unauthorized token exchanges
- **Likelihood**: Low (secrets in Firebase App Hosting environment)
- **Mitigations**: Secrets stored in Firebase App Hosting secrets (current implementation correct)

#### Current Implementation Status
```typescript
// VULNERABLE: No PKCE implementation
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/drive']
});

// VULNERABLE: Refresh tokens stored in plaintext
await ref.set({ refreshToken, updatedAt: new Date() });
```

### 2. AI/LLM Integration (Gemini)

#### Threats Identified

**T004: Prompt Injection Attacks (HIGH)**
- **Description**: Malicious file names or metadata designed to manipulate AI responses
- **Impact**: Data exfiltration, unauthorized classification, system prompts disclosure
- **Likelihood**: High (file names user-controlled)
- **Current Mitigations**: Basic email redaction only
- **Required Mitigations**:
  - Comprehensive input sanitization
  - Structured prompts with clear delimiters
  - Output validation against expected schema

**T005: PII Leakage to AI Service (CRITICAL)**
- **Description**: Personal information sent to external AI service
- **Impact**: Privacy violations, GDPR compliance issues
- **Likelihood**: High (file names and paths contain PII)
- **Current State**: PARTIALLY MITIGATED - basic email redaction
- **Enhanced Mitigations Required**:
  - Comprehensive PII detection and redaction
  - User consent for AI processing
  - On-premises AI option

**T006: AI Model Manipulation (MEDIUM)**
- **Description**: Adversarial inputs designed to cause model failures
- **Impact**: Service degradation, incorrect classifications
- **Likelihood**: Medium
- **Mitigations**: Fallback classification system (implemented)

#### Current Implementation Analysis
```typescript
// VULNERABLE: Insufficient PII redaction
function buildMetadataString(files: z.infer<typeof FileMetadataSchema>[], opts: { redact: boolean }) {
  const rows = files.map(f => ({
    name: opts.redact ? (f.name || '').replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g, "[redacted-email]") : (f.name || ''),
    // Missing: phone numbers, SSN, addresses, names, etc.
  }));
}
```

### 3. Firebase Security

#### Threats Identified

**T007: Firestore Security Rules Bypass (HIGH)**
- **Description**: Inadequate security rules allowing cross-user data access
- **Impact**: Unauthorized access to scan results, file metadata, OAuth tokens
- **Likelihood**: Low (rules appear properly scoped)
- **Current State**: SECURE - user-scoped rules implemented

**T008: Admin SDK Privilege Escalation (MEDIUM)**
- **Description**: Backend functions with excessive Firebase Admin privileges
- **Impact**: Unauthorized data modification, rule bypass
- **Likelihood**: Low (admin SDK usage limited to backend)
- **Mitigations**: Principle of least privilege in function deployment

**T009: Client-Side Security Rule Reliance (LOW)**
- **Description**: Over-reliance on client-side security rule enforcement
- **Impact**: Limited - rules enforced server-side
- **Likelihood**: Low
- **Current State**: SECURE - proper server-side enforcement

#### Firestore Rules Analysis
```javascript
// SECURE: Proper user scoping
match /users/{userId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
  
  match /secrets/{docId} {
    allow read, write: if request.auth != null && request.auth.uid == userId;
  }
}
```

### 4. API Security

#### Threats Identified

**T010: Rate Limiting Bypass (MEDIUM)**
- **Description**: Automated attacks overwhelming Google Drive API quotas
- **Impact**: Service disruption, quota exhaustion
- **Likelihood**: Medium
- **Current Mitigations**: Client-side rate limiting implemented
- **Enhanced Mitigations**: Server-side rate limiting, user-based quotas

**T011: API Key Exposure (HIGH)**
- **Description**: Gemini API keys exposed in client code or logs
- **Impact**: Unauthorized AI service usage, quota theft
- **Likelihood**: Low (keys in environment variables)
- **Current State**: SECURE - proper environment variable usage

**T012: CORS Misconfiguration (MEDIUM)**
- **Description**: Overly permissive CORS allowing unauthorized origins
- **Impact**: Cross-origin request forgery, data exposure
- **Likelihood**: Medium
- **Current State**: Needs review - CORS configuration not visible

### 5. Client-Side Security

#### Threats Identified

**T013: XSS via File Names (HIGH)**
- **Description**: Malicious JavaScript in file names rendered without sanitization
- **Impact**: Session hijacking, unauthorized actions
- **Likelihood**: High (file names user-controlled)
- **Mitigations Required**: 
  - Content Security Policy implementation
  - Input sanitization on display
  - React's built-in XSS protection (current)

**T014: Session Hijacking (HIGH)**
- **Description**: OAuth tokens in cookies vulnerable to XSS/CSRF
- **Impact**: Account takeover, unauthorized Drive access
- **Likelihood**: Medium
- **Current Mitigations**: HttpOnly, Secure, SameSite cookies
- **Status**: PARTIALLY SECURE

```typescript
// SECURE: Proper cookie configuration
res.cookies.set('google_access_token', tokens.access_token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 3600
});
```

## Risk Assessment Matrix

| Threat ID | Threat | Likelihood | Impact | Risk Level | Status |
|-----------|--------|------------|--------|------------|---------|
| T002 | Refresh Token Theft | High | Critical | **CRITICAL** | VULNERABLE |
| T005 | PII Leakage to AI | High | Critical | **CRITICAL** | VULNERABLE |
| T001 | Auth Code Interception | Medium | High | **HIGH** | VULNERABLE |
| T004 | Prompt Injection | High | High | **HIGH** | VULNERABLE |
| T007 | Firestore Rules Bypass | Low | High | **MEDIUM** | SECURE |
| T010 | Rate Limiting Bypass | Medium | Medium | **MEDIUM** | PARTIAL |
| T011 | API Key Exposure | Low | High | **MEDIUM** | SECURE |
| T013 | XSS via File Names | High | High | **HIGH** | PARTIAL |

## Critical Vulnerabilities Requiring Immediate Action

### 1. Refresh Token Encryption (T002)
**Priority**: P0
**Timeline**: 1 week
**Implementation**:
```typescript
// Required implementation
import { encrypt, decrypt } from '@/lib/encryption';

export async function saveUserRefreshToken(uid: string, refreshToken: string) {
  const encryptedToken = encrypt(refreshToken);
  await ref.set({
    refreshToken: encryptedToken,
    updatedAt: new Date(),
  });
}
```

### 2. PII Redaction Enhancement (T005)
**Priority**: P0
**Timeline**: 2 weeks
**Implementation**: Comprehensive PII detection covering names, phone numbers, addresses, SSNs

### 3. PKCE Implementation (T001)
**Priority**: P1
**Timeline**: 1 week
**Implementation**: Add code_challenge and code_verifier to OAuth flow

## Security Controls Inventory

### Current Controls (Implemented)
- ✅ User-scoped Firestore security rules
- ✅ HttpOnly cookie configuration
- ✅ Client-side rate limiting for Drive API
- ✅ Basic email redaction for AI input
- ✅ Environment variable secret management
- ✅ Error handling and logging
- ✅ OAuth token refresh mechanism

### Missing Controls (Critical)
- ❌ Refresh token encryption at rest
- ❌ PKCE for OAuth flow
- ❌ Comprehensive PII redaction
- ❌ Content Security Policy
- ❌ Server-side rate limiting
- ❌ Token rotation on logout
- ❌ Input sanitization for file names
- ❌ API endpoint authentication

### Recommended Controls (Enhancement)
- 🔶 Multi-factor authentication option
- 🔶 Audit logging for all data access
- 🔶 Anomaly detection for unusual access patterns
- 🔶 Data retention policies
- 🔶 Secure backup and recovery procedures

## Compliance Considerations

### GDPR (EU General Data Protection Regulation)
- **User Consent**: Required for AI processing of personal data
- **Data Minimization**: Limit file metadata sent to AI service
- **Right to Erasure**: Implement data deletion workflows
- **Data Processing Records**: Log all PII processing activities

### Google API Terms of Service
- **Rate Limiting**: Respect API quotas and implement backoff
- **Data Usage**: Don't cache Drive data beyond reasonable session limits
- **User Permission**: Only access data with explicit user consent

## Incident Response Plan

### High Severity Incidents
1. **Token Compromise**: Immediately revoke all user tokens, force re-authentication
2. **Data Breach**: Isolate affected systems, notify users within 72 hours
3. **AI Manipulation**: Disable AI classification, switch to fallback mode

### Detection Mechanisms
- Monitor for unusual API usage patterns
- Alert on multiple failed authentication attempts
- Track token refresh failures
- Log all admin operations

## Security Testing Strategy

### Static Analysis (SAST)
- ESLint security rules
- Dependency vulnerability scanning (npm audit)
- Secrets detection in code

### Dynamic Analysis (DAST)
- OWASP ZAP scanning of API endpoints
- Authentication flow testing
- Input validation testing

### Penetration Testing Focus Areas
1. OAuth flow security
2. API authentication bypass
3. Firestore security rule testing
4. XSS in file name display
5. Prompt injection attacks

## Conclusion

DriveMind has a solid security foundation with proper Firebase configuration and OAuth implementation. However, **CRITICAL** vulnerabilities exist in token storage and PII handling that must be addressed immediately to meet ALPHA standards. The system requires additional hardening in client-side security and comprehensive input validation.

**Immediate Actions Required**:
1. Implement refresh token encryption (1 week)
2. Enhance PII redaction for AI service (2 weeks)  
3. Add PKCE to OAuth flow (1 week)
4. Implement Content Security Policy (1 week)

**Risk Assessment**: Currently **HIGH RISK** due to unencrypted token storage and PII exposure. With recommended mitigations: **MEDIUM RISK**.

---

*Document Version: 1.0*  
*Last Updated: 2025-09-12*  
*Next Review: 2025-10-12*