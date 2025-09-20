# DriveMind Deployment Log

## 2025-09-18 - Firebase Admin Migration for Background Scans

Issue: Background scan endpoint returned 500s due to residual client-side Firebase usage in server context.

Changes:
- Completed Firebase Admin migration in server code paths.
  - `src/lib/firebase-db.ts` now uses `getAdminFirestore()` everywhere (scan jobs, file index, deltas).
  - `src/lib/token-store.ts` persists refresh tokens via Admin Firestore with in-memory cache.
  - `src/app/api/workflows/background-scan/route.ts` verifies Firebase ID tokens via `getAdminAuth()` and runs fully server-side.
  - Relaxed `rootFolderId` validation to accept Google Drive IDs (non-UUID).
- Health and metrics endpoints are available:
  - `GET /api/health` for system readiness (Firebase, OAuth, DB checks)
  - `GET /api/metrics` (JSON or `?format=prometheus`)

Deploy Steps:
1. Push to `main` to trigger App Hosting auto-deploy, or run `npm run deploy`.
2. Verify after 3–5 minutes:
   - `GET /api/health` returns 200 and `status: healthy` or `degraded`.
   - Start a scan via dashboard or `POST /api/workflows/background-scan` with a valid Firebase ID token.
   - Poll `GET /api/workflows/background-scan` for progress until `completed`.

Expected Result: Background scans initiate and complete without 500s; job state persists in Firestore.

## 2025-09-04 - OAuth Client ID Fix

**Issue**: Google Drive OAuth was failing with 400 "malformed request" error

**Root Cause**: Firebase secret `GOOGLE_OAUTH_CLIENT_ID` had trailing newline character (`\n`)

**Fix Applied**: 
- Updated Firebase secret to remove trailing newline
- Client ID: `687330755440-cpqs6r4ncpbkapjtfss5f3v9g89923vt.apps.googleusercontent.com` (clean)
- Secret version updated to v8

**Expected Result**: Google Drive OAuth connection should now work properly

**Deployment**: Auto-triggered via git push to main branch
