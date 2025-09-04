# DriveMind Deployment Log

## 2025-09-04 - OAuth Client ID Fix

**Issue**: Google Drive OAuth was failing with 400 "malformed request" error

**Root Cause**: Firebase secret `GOOGLE_OAUTH_CLIENT_ID` had trailing newline character (`\n`)

**Fix Applied**: 
- Updated Firebase secret to remove trailing newline
- Client ID: `687330755440-cpqs6r4ncpbkapjtfss5f3v9g89923vt.apps.googleusercontent.com` (clean)
- Secret version updated to v8

**Expected Result**: Google Drive OAuth connection should now work properly

**Deployment**: Auto-triggered via git push to main branch