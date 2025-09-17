# DriveMind Production Rollback Instructions

## Quick Rollback Commands (Emergency Use)

```bash
# OPTION 1: Git Rollback (if changes were committed)
git reset --hard 412fcd6  # Reset to last known good commit
npx firebase apphosting:deploy

# OPTION 2: Firebase Rollback (recommended)
npx firebase apphosting:rollback

# OPTION 3: Manual Revert (if changes uncommitted)
git checkout -- src/components/scans/ScanManager.tsx
git checkout -- src/hooks/useAuth.ts
npm run build
npx firebase apphosting:deploy
```

## Detailed Rollback Procedure

### Step 1: Assess the Situation
```bash
# Check current deployment status
curl https://studio--drivemind-q69b7.us-central1.hosted.app/api/health

# Check authentication
curl https://studio--drivemind-q69b7.us-central1.hosted.app/api/auth/drive/status

# Check Firebase Functions
npx firebase functions:log --limit 50
```

### Step 2: Determine Rollback Type

#### Scenario A: Authentication Completely Broken
**Symptoms**: Users cannot log in, token errors in console
```bash
# Immediate rollback to previous deployment
npx firebase apphosting:rollback

# Verify rollback
curl https://studio--drivemind-q69b7.us-central1.hosted.app/api/health
```

#### Scenario B: Background Scans Failing
**Symptoms**: Scans start but immediately fail, SSE connections drop
```bash
# Check Cloud Function logs first
npx firebase functions:log --only onScanJobCreated

# If function issue, redeploy functions with previous code
git checkout 412fcd6 -- functions/
cd functions && npm run build && cd ..
npx firebase deploy --only functions
```

#### Scenario C: Partial Failures
**Symptoms**: Some features work, others don't
```bash
# Selective file revert
git checkout 412fcd6 -- src/hooks/useAuth.ts
npm run build
npx firebase apphosting:deploy
```

### Step 3: Restore from Checkpoint

```bash
# Location of checkpoint files
CHECKPOINT_DIR="/home/scottpresley/projects/drivemind/artifacts/safety/checkpoints/2025-01-16-predeploy"

# View saved state
cat $CHECKPOINT_DIR/git-status.txt
cat $CHECKPOINT_DIR/recent-commits.txt

# Apply saved diff in reverse (if needed)
git apply $CHECKPOINT_DIR/uncommitted-changes.diff --reverse
```

### Step 4: Verify Restoration

```bash
# Health check
curl -s https://studio--drivemind-q69b7.us-central1.hosted.app/api/health | jq '.'

# Test authentication flow
# 1. Open browser to https://studio--drivemind-q69b7.us-central1.hosted.app
# 2. Click "Sign in with Google"
# 3. Complete OAuth flow
# 4. Verify successful login

# Test background scan
curl -X POST https://studio--drivemind-q69b7.us-central1.hosted.app/api/workflows/background-scan \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"drive_scan"}'
```

### Step 5: Post-Rollback Actions

```bash
# Clear any bad cache
npx firebase hosting:channel:delete preview --force

# Monitor error rates
npx firebase functions:log --limit 100 | grep ERROR

# Document the incident
echo "Rollback performed at $(date)" >> rollback.log
echo "Reason: [Document reason here]" >> rollback.log
```

## Firebase-Specific Rollback

### Using Firebase Console
1. Go to https://console.firebase.google.com
2. Select project: drivemind-q69b7
3. Navigate to App Hosting
4. Click on "studio" backend
5. Select "View releases"
6. Find previous successful release
7. Click "Rollback to this release"

### Using Firebase CLI
```bash
# List recent releases
npx firebase apphosting:releases:list

# Rollback to specific release
npx firebase apphosting:rollback RELEASE_ID
```

## Cloud Function Rollback

```bash
# View function versions
gcloud functions list --project=drivemind-q69b7

# Rollback to previous version
gcloud functions deploy onScanJobCreated \
  --rollback \
  --project=drivemind-q69b7
```

## Database Rollback (if needed)

```bash
# Export current state first (backup)
npx firebase firestore:export gs://drivemind-q69b7.appspot.com/backups/$(date +%Y%m%d_%H%M%S)

# Restore from previous backup if available
npx firebase firestore:import gs://drivemind-q69b7.appspot.com/backups/BACKUP_TIMESTAMP
```

## Monitoring During Rollback

Open these in separate terminals:

```bash
# Terminal 1: Watch health endpoint
while true; do 
  curl -s https://studio--drivemind-q69b7.us-central1.hosted.app/api/health | jq '.status'
  sleep 5
done

# Terminal 2: Watch function logs
npx firebase functions:log --follow

# Terminal 3: Watch hosting logs
npx firebase hosting:channel:list
```

## Rollback Verification Checklist

- [ ] Health endpoint returns 200 OK
- [ ] OAuth login flow works
- [ ] Users can authenticate successfully
- [ ] Background scans can be started
- [ ] SSE connections establish properly
- [ ] No errors in Cloud Function logs
- [ ] No 500 errors in application logs
- [ ] Database queries work correctly
- [ ] All API endpoints respond

## Contact Information

**Firebase Support**: https://firebase.google.com/support
**Project Owner**: scott.presley@gmail.com
**Firebase Project**: drivemind-q69b7
**Deployment URL**: https://studio--drivemind-q69b7.us-central1.hosted.app

## Recovery Time Objectives

- **Critical Failure**: < 5 minutes (use Firebase rollback)
- **Partial Failure**: < 15 minutes (selective revert)
- **Non-Critical Issues**: < 30 minutes (full rebuild)

## Important Notes

1. **Always backup before rollback**: Export Firestore if data changes were made
2. **Test in preview first**: If time allows, test fixes in preview channel
3. **Document everything**: Log all actions taken during rollback
4. **Communicate**: Inform team/users if service disruption occurs
5. **Learn**: Conduct post-mortem after incident resolution

## Prevention Measures

To avoid future rollbacks:
1. Always test in local environment first
2. Deploy to preview channel before production
3. Run full test suite before deployment
4. Monitor for 30 minutes after deployment
5. Have rollback plan ready before deploying