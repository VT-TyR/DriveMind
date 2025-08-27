# DriveMind Deployment & OAuth Setup

## Current Status
- **App**: Next.js application deployed to Firebase App Hosting
- **URL**: https://studio--drivemind-q69b7.us-central1.hosted.app
- **Project**: `drivemind-q69b7` (Firebase project)
- **Account**: scott.presley@gmail.com

## OAuth Configuration
- **Client ID**: `[REDACTED - stored in Firebase secrets]`
- **Client Secret**: `[REDACTED - stored in Firebase secrets]`
- **Redirect URI**: `https://studio--drivemind-q69b7.us-central1.hosted.app/ai`
- **Consent Screen**: Production mode (published)

## Known Issues
1. **App Hosting secrets not accessible**: Environment shows "OAuth configuration incomplete. Missing client secret"
2. **Mysterious redirect**: Users getting redirected to `0.0.0.0:8080/in-season?error=oauth_init_failed` (source unknown)

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
- `src/lib/token-store.ts` - Added null checks for Firestore
- `src/lib/google-auth.ts` - Added debug logging
- `apphosting.yaml` - Fixed secret availability configuration