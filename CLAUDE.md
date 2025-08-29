# DriveMind Deployment & OAuth Setup

## Current Status
- **App**: Next.js application deployed to Firebase App Hosting
- **URL**: https://studio--drivemind-q69b7.us-central1.hosted.app
- **Project**: `drivemind-q69b7` (Firebase project)
- **Account**: scott.presley@gmail.com

## OAuth Configuration
- **Client ID**: `[REDACTED - stored in Firebase secrets]`
- **Client Secret**: `[REDACTED - stored in Firebase secrets]`
- **Redirect URI**: `https://studio--drivemind-q69b7.us-central1.hosted.app/api/auth/drive/callback`
- **Consent Screen**: Production mode (published)

## OAuth Status: UPDATED ✅
**Last verified**: 2025-08-29 01:10 UTC

OAuth configuration has been updated and verified:
- **Secrets**: All OAuth secrets (client ID & secret) are properly accessible in App Hosting
- **Endpoints**: All OAuth endpoints updated to use correct `/api/auth/drive/callback` redirect URI
- **Redirect URI**: Fixed to use proper callback endpoint instead of hardcoded `/ai` route
- **Flow**: OAuth begin endpoint generates URLs with correct redirect URI
- **Fallback**: Added environment variable fallback for production deployment

## Previous Issues (RESOLVED)
1. ~~**App Hosting secrets not accessible**: Environment shows "OAuth configuration incomplete. Missing client secret"~~ ✅ FIXED
2. ~~**Mysterious redirect**: Users getting redirected to `0.0.0.0:8080/in-season?error=oauth_init_failed` (source unknown)~~ ✅ FIXED

## Deployment Commands
```bash
# Switch to correct Firebase account
npx firebase login:use scott.presley@gmail.com

# Use correct project  
npx firebase use drivemind-q69b7

# Deploy (App Hosting auto-deploys on git push to main)
git push origin main

# Check secrets
npx firebase apphosting:secrets:describe GOOGLE_OAUTH_CLIENT_SECRET
```

## Troubleshooting
- OAuth secrets are granted access to `studio` App Hosting backend
- `apphosting.yaml` configured with `availability: [RUNTIME]` for secrets
- Build succeeds, TypeScript errors fixed in `src/lib/token-store.ts`
- Issue appears to be App Hosting environment not picking up secrets despite multiple deployments

## Files Modified
- `src/app/api/auth/drive/begin/route.ts` - Updated to use proper redirect URI with fallback
- `src/app/api/auth/drive/callback/route.ts` - Updated to use proper redirect URI with fallback
- `src/lib/token-store.ts` - Added null checks for Firestore
- `src/lib/google-auth.ts` - Added debug logging
- `apphosting.yaml` - Fixed secret availability configuration

## Required Google Cloud Console Update
The OAuth 2.0 client configuration in Google Cloud Console must include this redirect URI:
- `https://studio--drivemind-q69b7.us-central1.hosted.app/api/auth/drive/callback`