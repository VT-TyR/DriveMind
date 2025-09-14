# DriveMind Persistent Scan - Deployment Procedures

## Deployment Checklist

### Pre-Deployment Validation
- [ ] All tests passing (unit, integration, E2E)
- [ ] TypeScript compilation successful
- [ ] ESLint checks passing
- [ ] Security audit completed
- [ ] Performance benchmarks met
- [ ] Code review approved

### Environment Setup
- [ ] Firebase project: `drivemind-q69b7`
- [ ] Authentication: scott.presley@gmail.com
- [ ] OAuth secrets configured
- [ ] Environment variables set

## Deployment Steps

### 1. Update Firestore Indexes (5 minutes)
```bash
# Deploy Firestore indexes
npx firebase deploy --only firestore:indexes

# Verify indexes are building
npx firebase firestore:indexes
```

### 2. Update Firestore Security Rules (2 minutes)
```bash
# Deploy security rules
npx firebase deploy --only firestore:rules

# Test rules with emulator
npx firebase emulators:start --only firestore
```

### 3. Build and Deploy Cloud Functions (10 minutes)
```bash
# Navigate to functions directory
cd functions

# Install dependencies
npm install

# Build TypeScript
npm run build

# Deploy functions
npx firebase deploy --only functions

# Verify deployment
npx firebase functions:list
```

### 4. Deploy Next.js Application (15 minutes)
```bash
# Return to project root
cd ..

# Build application
npm run build

# Test build locally
npm run start

# Deploy to Firebase App Hosting
git add .
git commit -m "Deploy persistent background scan feature"
git push origin main

# Monitor deployment
npx firebase apphosting:deployments:list
```

### 5. Post-Deployment Verification
```bash
# Check function logs
npx firebase functions:log --only onScanJobCreated

# Verify app is running
curl https://studio--drivemind-q69b7.us-central1.hosted.app/api/health

# Test SSE endpoint
curl -H "Authorization: Bearer <token>" \
  https://studio--drivemind-q69b7.us-central1.hosted.app/api/scan/stream?jobId=test
```

## Rollback Procedures

### Immediate Rollback (< 5 minutes)
If critical issues are detected immediately after deployment:

1. **Revert Cloud Functions**
```bash
# List function versions
gcloud functions list --project=drivemind-q69b7

# Rollback to previous version
npx firebase functions:delete onScanJobCreated
npx firebase deploy --only functions:onScanJobCreated --rollback
```

2. **Revert App Hosting**
```bash
# Revert to previous git commit
git revert HEAD
git push origin main

# App Hosting will auto-deploy previous version
```

3. **Restore Firestore Rules**
```bash
# Keep backup of current rules
cp firestore.rules firestore.rules.backup

# Restore previous rules
git checkout HEAD~1 firestore.rules
npx firebase deploy --only firestore:rules
```

### Data Recovery Procedures
If data corruption is detected:

1. **Pause All Scan Jobs**
```javascript
// Run in Firebase Console or Admin SDK
const db = admin.firestore();
const batch = db.batch();
const jobs = await db.collection('scanJobs')
  .where('status', 'in', ['pending', 'running'])
  .get();

jobs.forEach(doc => {
  batch.update(doc.ref, { 
    status: 'paused_for_rollback',
    pausedAt: Date.now()
  });
});

await batch.commit();
```

2. **Export Critical Data**
```bash
# Export scan checkpoints
gcloud firestore export gs://drivemind-backups/emergency-backup \
  --collection-ids=scanCheckpoints,scanJobs \
  --project=drivemind-q69b7
```

3. **Clear Corrupted Checkpoints**
```javascript
// Clear expired or corrupted checkpoints
const checkpoints = await db.collection('scanCheckpoints')
  .where('expiresAt', '<', Date.now())
  .get();

const batch = db.batch();
checkpoints.forEach(doc => {
  batch.delete(doc.ref);
});
await batch.commit();
```

## Monitoring Post-Deployment

### Key Metrics to Monitor
1. **Function Performance**
   - Execution time (P50, P95, P99)
   - Error rate (target < 1%)
   - Cold start frequency

2. **SSE Connection Health**
   - Active connections
   - Connection drop rate
   - Reconnection success rate

3. **Scan Job Metrics**
   - Jobs started vs completed
   - Average scan duration
   - Checkpoint save rate
   - Chain job creation rate

### Alert Thresholds
```yaml
alerts:
  - name: high_error_rate
    condition: error_rate > 5%
    action: Page on-call engineer
    
  - name: function_timeout
    condition: execution_time > 480s
    action: Check job chaining
    
  - name: checkpoint_failures
    condition: checkpoint_save_failures > 10/min
    action: Check Firestore quotas
    
  - name: sse_mass_disconnect
    condition: disconnections > 50/min
    action: Check server health
```

## Testing Procedures

### Smoke Tests (Run Immediately)
```bash
# 1. Start a test scan
curl -X POST https://studio--drivemind-q69b7.us-central1.hosted.app/api/workflows/background-scan \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type": "drive_scan", "config": {"maxDepth": 1}}'

# 2. Check scan status
curl https://studio--drivemind-q69b7.us-central1.hosted.app/api/workflows/background-scan \
  -H "Authorization: Bearer $TOKEN"

# 3. Test SSE stream
curl https://studio--drivemind-q69b7.us-central1.hosted.app/api/scan/stream?jobId=$JOB_ID \
  -H "Authorization: Bearer $TOKEN" \
  -N

# 4. Cancel scan
curl -X PATCH https://studio--drivemind-q69b7.us-central1.hosted.app/api/workflows/background-scan \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"action": "cancel", "jobId": "'$JOB_ID'"}'
```

### Load Tests (Within 24 hours)
```javascript
// Simulate multiple concurrent scans
async function loadTest() {
  const users = 10;
  const promises = [];
  
  for (let i = 0; i < users; i++) {
    promises.push(startScan(`user_${i}_token`));
  }
  
  const results = await Promise.allSettled(promises);
  console.log(`Success: ${results.filter(r => r.status === 'fulfilled').length}/${users}`);
}
```

## Communication Plan

### Deployment Notification
```
Subject: DriveMind Persistent Scan Feature Deployment

Team,

We are deploying the persistent background scan feature today at [TIME].

Expected Impact:
- Brief API downtime (< 30 seconds) during function deployment
- Existing scans will continue running
- New checkpoint system will be enabled

Rollback trigger conditions:
- Error rate > 5%
- Function timeouts > 10/hour
- SSE connection failures > 50/hour

Monitoring dashboard: [LINK]
Runbook: [LINK]

Contact: [YOUR_NAME] (Primary), [BACKUP] (Secondary)
```

### Success Criteria
- [ ] All smoke tests passing
- [ ] Error rate < 1%
- [ ] P95 latency < 5s
- [ ] Successful checkpoint saves > 99%
- [ ] SSE connections stable
- [ ] No user complaints in first hour

## Recovery Time Objectives

| Scenario | RTO | RPO | Procedure |
|----------|-----|-----|-----------|
| Function failure | 5 min | 0 min | Automatic restart |
| Checkpoint corruption | 15 min | 5 min | Clear and rebuild |
| Complete rollback | 30 min | 0 min | Git revert + redeploy |
| Data recovery | 1 hour | 1 hour | Restore from backup |

## Sign-Off

- [ ] Development Team Lead
- [ ] Security Review
- [ ] Operations Team
- [ ] Product Owner

---

**Document Version**: 1.0.0
**Last Updated**: 2025-09-14
**Next Review**: Post-deployment retrospective