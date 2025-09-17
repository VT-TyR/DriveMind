# ROLLBACK PROCEDURES
## DriveMind Debug Deployment
## Generated: 2025-09-16
## CX-Safety-Coordinator v1.7

---

## CRITICAL SYSTEM STATE

### Current Production Status
- **URL**: https://studio--drivemind-q69b7.us-central1.hosted.app
- **Version**: Current (with broken features)
- **Firebase Project**: drivemind-q69b7
- **Modified Files**: 
  - src/components/scans/ScanManager.tsx
  - src/hooks/useAuth.ts
  - tsconfig.tsbuildinfo

### Pre-Deployment Snapshot
```bash
# Snapshot Command
git stash save "pre-deployment-snapshot-$(date +%Y%m%d-%H%M%S)"
git tag pre-debug-deployment-$(date +%Y%m%d-%H%M%S)
```

---

## ROLLBACK TRIGGERS

### Automatic Rollback Conditions
1. **Error Rate Threshold**
   - Trigger: Error rate > 5% for 2 minutes
   - Action: Immediate rollback to previous version

2. **Performance Degradation**
   - Trigger: P95 latency > 2000ms for 5 minutes
   - Action: Gradual rollback with traffic shifting

3. **Resource Exhaustion**
   - Trigger: Memory > 512MB OR CPU > 80% for 10 minutes
   - Action: Scale down and rollback

4. **Critical Feature Failure**
   - Trigger: Scan initiation failure rate > 50%
   - Action: Immediate rollback

---

## ROLLBACK PROCEDURES

### Phase 1: Detection (0-2 minutes)
```bash
# Monitor critical metrics
curl https://studio--drivemind-q69b7.us-central1.hosted.app/api/health
curl https://studio--drivemind-q69b7.us-central1.hosted.app/api/metrics

# Check error logs
npx firebase functions:log --project drivemind-q69b7 --limit 100

# Verify scan functionality
curl -X POST https://studio--drivemind-q69b7.us-central1.hosted.app/api/workflows/background-scan \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json"
```

### Phase 2: Decision (2-3 minutes)
```yaml
Decision Matrix:
  - Critical Failure (P0):
    - OAuth broken: IMMEDIATE ROLLBACK
    - Database corruption: IMMEDIATE ROLLBACK
    - Security breach: IMMEDIATE ROLLBACK
  
  - Major Issue (P1):
    - Scan not starting: ROLLBACK after 5 min
    - SSE not streaming: ROLLBACK after 10 min
    - UI unresponsive: ROLLBACK after 15 min
  
  - Minor Issue (P2):
    - Performance degradation: Monitor 30 min
    - UI glitches: Hot fix attempt
    - Non-critical errors: Log and continue
```

### Phase 3: Execution (3-5 minutes)

#### Option A: Git Revert (Fastest)
```bash
# Revert to previous commit
git revert HEAD --no-edit
git push origin main

# Firebase auto-deploys on push
# Monitor deployment
npx firebase apphosting:rollouts:list --project drivemind-q69b7
```

#### Option B: Firebase Rollback
```bash
# List recent deployments
npx firebase apphosting:rollouts:list --project drivemind-q69b7

# Rollback to specific version
npx firebase apphosting:rollouts:create \
  --project drivemind-q69b7 \
  --backend studio \
  --git-commit <PREVIOUS_COMMIT_SHA>

# Monitor rollback
npx firebase apphosting:rollouts:get <ROLLOUT_ID> --project drivemind-q69b7
```

#### Option C: Manual Restoration
```bash
# Restore from backup tag
git checkout pre-debug-deployment-<TIMESTAMP>
git checkout -b emergency-rollback
git push origin emergency-rollback

# Update Firebase to use rollback branch
npx firebase apphosting:backends:update studio \
  --project drivemind-q69b7 \
  --git-branch emergency-rollback
```

### Phase 4: Verification (5-10 minutes)
```bash
# Verify health
for i in {1..10}; do
  curl https://studio--drivemind-q69b7.us-central1.hosted.app/api/health
  sleep 30
done

# Test critical paths
npm run test:e2e:critical

# Check user reports
npx firebase analytics:metrics:get --project drivemind-q69b7
```

---

## DATABASE ROLLBACK

### Firestore Point-in-Time Recovery
```bash
# Export current state (backup)
gcloud firestore export gs://drivemind-backups/rollback-$(date +%Y%m%d-%H%M%S) \
  --project=drivemind-q69b7

# Restore from previous backup
gcloud firestore import gs://drivemind-backups/<BACKUP_TIMESTAMP> \
  --project=drivemind-q69b7
```

### Collection-Level Rollback
```javascript
// Restore specific collections
const admin = require('firebase-admin');
const backup = require('./backups/pre-deployment.json');

async function restoreCollection(collectionName, data) {
  const db = admin.firestore();
  const batch = db.batch();
  
  for (const [docId, docData] of Object.entries(data)) {
    const ref = db.collection(collectionName).doc(docId);
    batch.set(ref, docData);
  }
  
  await batch.commit();
  console.log(`Restored ${collectionName}`);
}

// Restore critical collections
await restoreCollection('scanJobs', backup.scanJobs);
await restoreCollection('fileIndex', backup.fileIndex);
await restoreCollection('actionBatches', backup.actionBatches);
```

---

## EMERGENCY CONTACTS

### Escalation Chain
1. **Level 1**: Automated rollback system
2. **Level 2**: On-call engineer (via PagerDuty)
3. **Level 3**: Engineering lead
4. **Level 4**: CTO/VP Engineering

### Communication Templates

#### User Notification
```
Subject: Temporary Service Interruption

We're currently experiencing issues with the background scan feature.
Our team is actively working on a resolution.

Affected features:
- Background inventory scans
- Progress tracking
- Real-time updates

Expected resolution: [TIME]

We apologize for the inconvenience.
```

#### Internal Alert
```
SEVERITY: [P0/P1/P2]
SERVICE: DriveMind Production
ISSUE: [Description]
IMPACT: [User-facing impact]
ACTION: Rollback initiated at [TIME]
ETA: [Resolution time]
RUNBOOK: https://docs/rollback-procedures
```

---

## POST-ROLLBACK ACTIONS

### Immediate (0-1 hour)
1. Confirm service restoration
2. Document incident timeline
3. Notify stakeholders
4. Begin root cause analysis

### Short-term (1-24 hours)
1. Complete incident report
2. Update monitoring thresholds
3. Review rollback procedures
4. Plan fix deployment

### Long-term (1-7 days)
1. Implement preventive measures
2. Update CI/CD pipeline
3. Conduct blameless postmortem
4. Share learnings with team

---

## ROLLBACK VALIDATION CHECKLIST

- [ ] Health endpoint returns 200 OK
- [ ] OAuth flow completes successfully
- [ ] Scan initiation works
- [ ] SSE streaming connects
- [ ] Database queries succeed
- [ ] UI renders correctly
- [ ] Error rate < 1%
- [ ] P95 latency < 1000ms
- [ ] Memory usage < 256MB
- [ ] CPU usage < 50%

---

## RECOVERY TIME OBJECTIVES

| Scenario | Detection | Decision | Rollback | Verification | Total RTO |
|----------|-----------|----------|----------|--------------|-----------|
| Critical | < 1 min | < 1 min | < 3 min | < 5 min | **< 10 min** |
| Major | < 2 min | < 2 min | < 5 min | < 5 min | **< 15 min** |
| Minor | < 5 min | < 5 min | < 10 min | < 10 min | **< 30 min** |

---

## APPENDIX: QUICK COMMANDS

```bash
# Emergency rollback one-liner
git revert HEAD --no-edit && git push origin main && npx firebase apphosting:rollouts:list --project drivemind-q69b7

# Health check loop
while true; do curl -s https://studio--drivemind-q69b7.us-central1.hosted.app/api/health | jq .; sleep 10; done

# Monitor errors
npx firebase functions:log --project drivemind-q69b7 --limit 50 | grep ERROR

# Force cache clear
curl -X POST https://studio--drivemind-q69b7.us-central1.hosted.app/api/cache/clear \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

**Document Status**: ACTIVE
**Last Updated**: 2025-09-16
**Next Review**: 2025-09-23

*Generated by CX-Safety-Coordinator*
*Compliant with ALPHA-CODENAME v1.8 & AEI21*