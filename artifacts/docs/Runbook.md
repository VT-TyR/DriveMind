# DriveMind Production Runbook

**Version**: 1.2.0  
**Last Updated**: 2025-09-12  
**Next Review**: 2025-12-12  
**Oncall Team**: DriveMind Platform Team  

## Table of Contents
1. [Service Overview](#service-overview)
2. [Critical Alert Response](#critical-alert-response)  
3. [OAuth Flow Troubleshooting](#oauth-flow-troubleshooting)
4. [Security Incident Response](#security-incident-response)
5. [Performance Monitoring](#performance-monitoring)
6. [Database Operations](#database-operations)
7. [AI Service Management](#ai-service-management)
8. [Deployment Procedures](#deployment-procedures)
9. [Rollback Procedures](#rollback-procedures)
10. [Monitoring & Alerting](#monitoring--alerting)

## Service Overview

### System Architecture
- **Platform**: Firebase App Hosting (Cloud Run)
- **Frontend**: Next.js 15 with React 18
- **Backend**: Node.js 18, Firebase Functions
- **Database**: Cloud Firestore
- **Authentication**: Google OAuth 2.0
- **AI Service**: Google Gemini 1.5 Flash
- **Monitoring**: Firebase Performance, Cloud Monitoring

### Key URLs
- **Production**: https://studio--drivemind-q69b7.us-central1.hosted.app
- **Health Check**: https://studio--drivemind-q69b7.us-central1.hosted.app/api/health
- **Metrics**: https://studio--drivemind-q69b7.us-central1.hosted.app/api/metrics
- **Admin Panel**: https://console.firebase.google.com/project/drivemind-q69b7

### Service Dependencies
```yaml
Critical Dependencies:
  - Firebase Authentication (99.95% SLA)
  - Cloud Firestore (99.95% SLA) 
  - Google Drive API (99.9% SLA)
  - Google Gemini AI (99% SLA)
  
Non-Critical:
  - Firebase App Hosting (99.95% SLA)
  - Cloud Functions (99.5% SLA)
```

### Performance SLOs
- **Availability**: 99.9% (8.7 hours downtime/year maximum)
- **P95 Response Time**: < 250ms for API endpoints
- **P99 Response Time**: < 500ms for complex operations
- **OAuth Success Rate**: > 99.5%
- **Error Rate**: < 1% for all endpoints

## Critical Alert Response

### P0 Alerts (Immediate Response Required)

#### Service Down (HTTP 5xx > 5% for 5+ minutes)
**Symptoms**: High error rate, failed health checks  
**Response Time**: < 5 minutes  

**Immediate Actions**:
```bash
# 1. Check service status
curl -s https://studio--drivemind-q69b7.us-central1.hosted.app/api/health | jq

# 2. Check Firebase Console
# Visit: https://console.firebase.google.com/project/drivemind-q69b7

# 3. Check recent deployments
firebase hosting:channel:list

# 4. If needed, rollback immediately
firebase hosting:channel:deploy main --expires 1h
```

**Escalation**: If not resolved in 15 minutes, page senior engineer and notify stakeholders

#### OAuth Flow Failure Rate > 10%
**Symptoms**: Users unable to connect Google Drive accounts  
**Response Time**: < 10 minutes  

**Investigation Steps**:
```bash
# 1. Check OAuth endpoint health
curl -s https://studio--drivemind-q69b7.us-central1.hosted.app/api/auth/drive/status

# 2. Verify OAuth credentials in Firebase Console
# Navigate to: App Hosting > Secrets

# 3. Check Google Cloud Console OAuth config
# Navigate to: APIs & Services > Credentials

# 4. Review recent auth errors in logs
firebase functions:log --only=auth
```

**Common Fixes**:
- Verify redirect URI matches exactly: `https://studio--drivemind-q69b7.us-central1.hosted.app/api/auth/drive/callback`
- Check OAuth client secret is properly set in Firebase secrets
- Validate OAuth consent screen is published (not in testing mode)

### P1 Alerts (Response within 1 hour)

#### High Response Time (P95 > 500ms for 15+ minutes)
**Investigation**:
```bash
# Check current metrics
curl -s https://studio--drivemind-q69b7.us-central1.hosted.app/api/metrics | jq '.performance'

# Monitor resource usage
# Firebase Console > App Hosting > Metrics

# Check for resource constraints
kubectl top pods # if applicable
```

#### Security Alert (Failed auth attempts spike)
**Investigation**:
```bash
# Check auth logs for patterns
firebase functions:log --only=auth | grep "failed"

# Review unusual access patterns
# Firebase Console > Authentication > Users

# Check for potential DDoS
# Cloud Console > Network Security > Cloud Armor
```

## OAuth Flow Troubleshooting

### Common OAuth Issues

#### Issue: "OAuth configuration incomplete. Missing client secret"
**Root Cause**: Firebase App Hosting secrets not accessible  
**Resolution**:
```bash
# 1. Verify secret exists
firebase apphosting:secrets:describe GOOGLE_OAUTH_CLIENT_SECRET

# 2. Check secret permissions
# Ensure secret is granted access to App Hosting backend

# 3. Verify apphosting.yaml configuration
cat apphosting.yaml | grep -A 5 secrets

# 4. Redeploy if needed
git push origin main
```

#### Issue: "Redirect URI mismatch"
**Root Cause**: OAuth redirect URI not matching configured value  
**Resolution**:
```bash
# 1. Check current redirect URI in logs
firebase functions:log --only=oauth | grep "redirect"

# 2. Update Google Cloud Console OAuth config
# Add: https://studio--drivemind-q69b7.us-central1.hosted.app/api/auth/drive/callback

# 3. Verify environment variable
echo $NEXT_PUBLIC_OAUTH_REDIRECT_URI
```

#### Issue: "Token refresh failed"
**Root Cause**: Stored refresh token expired or invalid  
**Resolution**:
```bash
# 1. Check token store health
# Firebase Console > Firestore > users/{uid}/secrets

# 2. Clear invalid tokens (if user consents)
# Delete documents in users/{uid}/secrets/googleDrive

# 3. Force user re-authentication
# User must complete OAuth flow again
```

### OAuth Flow Monitoring
```bash
# Monitor OAuth success rate
curl -s https://studio--drivemind-q69b7.us-central1.hosted.app/api/metrics | jq '.business.oauthSuccessRate'

# Check recent OAuth events
firebase functions:log --only=auth | tail -20

# Verify callback endpoint health
curl -I https://studio--drivemind-q69b7.us-central1.hosted.app/api/auth/drive/callback
```

## Security Incident Response

### **CRITICAL**: Token Compromise (Security Level P0)

#### Detection Signs
- Unusual API usage patterns from user accounts
- Multiple concurrent sessions from different locations
- Unexpected Drive API calls in logs
- User reports unauthorized Drive access

#### Immediate Response (< 15 minutes)
```bash
# 1. Identify affected user(s)
AFFECTED_USER_ID="user_id_here"

# 2. Revoke all tokens immediately
# Navigate to Firebase Console > Firestore
# Delete: /users/{$AFFECTED_USER_ID}/secrets/googleDrive

# 3. Force token refresh failure
# This forces re-authentication on next API call

# 4. Check for data exfiltration
firebase functions:log | grep "drive.files.get\|drive.files.download" | grep $AFFECTED_USER_ID

# 5. Notify affected user via email
# (Manual process - send security alert)
```

#### Investigation Steps
```bash
# 1. Analyze access patterns
firebase functions:log | grep $AFFECTED_USER_ID | tail -100

# 2. Check IP addresses and geolocation
# Review logs for unusual source IPs

# 3. Examine recent Drive API calls
firebase functions:log | grep "googleapis" | grep $AFFECTED_USER_ID

# 4. Verify OAuth flow integrity
firebase functions:log | grep "oauth" | grep $AFFECTED_USER_ID
```

### **HIGH**: PII Exposure to AI Service

#### Detection
- Logs showing unredacted personal information sent to Gemini
- User reports of personal data in AI responses
- Data classification errors indicating PII processing

#### Response Actions
```bash
# 1. Immediately disable AI features
# Set environment variable: AI_FEATURES_ENABLED=false

# 2. Check recent AI API calls for PII
firebase functions:log | grep "gemini" | tail -50

# 3. Review PII redaction function
# Check: src/ai/flows/ai-classify.ts

# 4. Audit affected user data
# Identify users who used AI features in last 24 hours
```

### Vulnerability Response Process

#### Critical Vulnerability (CVSS 9.0+)
1. **Immediate**: Disable affected component if possible
2. **Within 4 hours**: Deploy hotfix or mitigation
3. **Within 24 hours**: Complete fix and security review
4. **Within 72 hours**: User notification if data affected

#### High Vulnerability (CVSS 7.0-8.9)
1. **Within 24 hours**: Risk assessment and mitigation plan
2. **Within 7 days**: Deploy fix
3. **Within 14 days**: Security audit of similar issues

## Performance Monitoring

### Key Performance Metrics

#### Application Performance
```bash
# Check current performance metrics
curl -s https://studio--drivemind-q69b7.us-central1.hosted.app/api/metrics | jq '{
  responseTime: .performance.responseTime,
  errorRate: .performance.errorRate,
  requestRate: .performance.requestRate,
  uptime: .application.uptime
}'

# Monitor memory usage
curl -s https://studio--drivemind-q69b7.us-central1.hosted.app/api/health | jq '.metrics.memory'
```

#### Business Metrics
```bash
# Check business KPIs
curl -s https://studio--drivemind-q69b7.us-central1.hosted.app/api/metrics | jq '{
  activeUsers: .business.activeUsers,
  filesProcessed: .business.filesProcessed,
  duplicatesDetected: .business.duplicatesDetected,
  aiInsightsGenerated: .business.aiInsightsGenerated
}'
```

### Performance Troubleshooting

#### High Response Time
**Investigation Steps**:
1. Check Cloud Run instance scaling
2. Monitor Firestore query performance
3. Verify Google Drive API rate limiting
4. Examine AI service latency

#### Memory Leaks
```bash
# Monitor memory trends over time
curl -s https://studio--drivemind-q69b7.us-central1.hosted.app/api/health | jq '.metrics.memory.heapUsed'

# If memory continuously increasing:
# 1. Check for unclosed connections
# 2. Review large object caching
# 3. Monitor garbage collection
```

#### Database Performance
```bash
# Check Firestore operations
# Firebase Console > Firestore > Usage

# Monitor slow queries
# Firebase Console > Performance > Database queries

# Check connection pool usage
# Review admin SDK connection management
```

## Database Operations

### Backup Procedures

#### Automated Backups
- **Frequency**: Daily at 2:00 AM UTC
- **Retention**: 30 days
- **Location**: Multi-region (us-central1, us-east1)

```bash
# Verify backup status
# Firebase Console > Firestore > Backups

# Check backup history
gcloud firestore backups list --location=us-central1
```

#### Manual Backup (Emergency)
```bash
# Create immediate backup
gcloud firestore export gs://drivemind-backups/manual/$(date +%Y%m%d-%H%M%S) --collection-ids=users

# Verify backup creation
gsutil ls gs://drivemind-backups/manual/
```

### Data Recovery Procedures

#### Point-in-Time Recovery
```bash
# 1. Identify recovery point
RECOVERY_TIMESTAMP="2025-09-12T10:00:00Z"

# 2. Create new project for recovery testing
gcloud projects create drivemind-recovery-test

# 3. Import data to test project
gcloud firestore import gs://drivemind-backups/2025-09-12T02:00:00Z --project=drivemind-recovery-test

# 4. Validate recovered data integrity
# 5. If validated, import to production (EXTREME CAUTION)
```

#### User Data Deletion (GDPR Right to Erasure)
```bash
# Complete user data removal
USER_ID="user_id_to_delete"

# 1. Delete user authentication
# Firebase Console > Authentication > Delete user

# 2. Delete Firestore user data
# Firebase Console > Firestore > Delete /users/{$USER_ID}

# 3. Verify deletion in logs
firebase functions:log | grep "user_deleted" | grep $USER_ID
```

### Database Monitoring
```bash
# Check Firestore health
curl -s https://studio--drivemind-q69b7.us-central1.hosted.app/api/health | jq '.dependencies.firebase'

# Monitor read/write operations
# Firebase Console > Firestore > Usage

# Check security rule performance
# Firebase Console > Firestore > Rules > Logs
```

## AI Service Management

### Gemini AI Health Monitoring
```bash
# Check AI service status
curl -s https://studio--drivemind-q69b7.us-central1.hosted.app/api/ai/health-check

# Monitor API quota usage
# Google Cloud Console > APIs & Services > Gemini API > Quotas

# Check recent AI classification results
firebase functions:log | grep "ai_classification" | tail -10
```

### AI Service Troubleshooting

#### High Error Rate from Gemini API
**Common Causes & Solutions**:
1. **Rate Limit Exceeded**:
   ```bash
   # Check current quota usage
   # Cloud Console > IAM & Admin > Quotas & System Limits
   
   # Implement backoff strategy
   # Review: src/ai/flows/ai-classify.ts
   ```

2. **Invalid API Key**:
   ```bash
   # Verify Gemini API key
   firebase apphosting:secrets:describe GEMINI_API_KEY
   
   # Test API key manually
   curl -H "Authorization: Bearer $GEMINI_API_KEY" \
        "https://generativelanguage.googleapis.com/v1/models"
   ```

3. **Content Policy Violation**:
   ```bash
   # Check logs for safety filter triggers
   firebase functions:log | grep "safety\|blocked\|filtered"
   
   # Review PII redaction function
   # Ensure sensitive data is properly filtered
   ```

#### AI Response Quality Issues
```bash
# Monitor classification accuracy
firebase functions:log | grep "ai_confidence_score" | tail -20

# Check for prompt injection attempts
firebase functions:log | grep "prompt_injection\|suspicious_input"

# Review recent AI model responses
# Firebase Console > Functions > ai-classify > Logs
```

### AI Feature Rollback
```bash
# Emergency AI feature disable
# Set environment variable in Firebase App Hosting
firebase apphosting:config:set AI_FEATURES_ENABLED=false

# Verify AI endpoints return graceful degradation
curl -s https://studio--drivemind-q69b7.us-central1.hosted.app/api/ai/classify \
     -X POST -d '{"fileIds":["test"]}' -H "Content-Type: application/json"
```

## Deployment Procedures

### Pre-Deployment Checklist
```bash
# 1. Run all delivery gates locally
npm run lint
npm run typecheck  
npm run test:ci
npm audit --audit-level=high

# 2. Verify environment configuration
cat .env.example
# Ensure all required environment variables are set

# 3. Test build process
npm run build

# 4. Run integration tests
npm run test:integration

# 5. Verify health check endpoint
node -e "
  require('next/dist/server/next.js');
  // Test health check locally
"
```

### Production Deployment
```bash
# 1. Create deployment tag
git tag -a v$(date +%Y%m%d.%H%M) -m "Production deployment $(date)"
git push origin --tags

# 2. Deploy to Firebase App Hosting
# Automatic deployment on push to main branch
git push origin main

# 3. Monitor deployment progress
firebase apphosting:backends:list

# 4. Verify deployment health
curl -s https://studio--drivemind-q69b7.us-central1.hosted.app/api/health

# 5. Run smoke tests
npm run test:smoke

# 6. Log deployment event
curl -X POST https://studio--drivemind-q69b7.us-central1.hosted.app/api/metrics \
     -H "Content-Type: application/json" \
     -d '{
       "event": "deployment",
       "data": {
         "version": "'$(git rev-parse HEAD)'",
         "environment": "production", 
         "deployedBy": "'$(git config user.email)'"
       }
     }'
```

### Post-Deployment Validation
```bash
# 1. Health check validation
HEALTH_STATUS=$(curl -s https://studio--drivemind-q69b7.us-central1.hosted.app/api/health | jq -r '.status')
if [ "$HEALTH_STATUS" != "healthy" ]; then
  echo "❌ Health check failed: $HEALTH_STATUS"
  exit 1
fi

# 2. OAuth flow test
# Manual test: https://studio--drivemind-q69b7.us-central1.hosted.app/auth/drive

# 3. AI service test
curl -s https://studio--drivemind-q69b7.us-central1.hosted.app/api/ai/health-check

# 4. Database connectivity test
# Verify Firestore operations in Firebase Console

# 5. Monitor metrics for 30 minutes
watch -n 30 'curl -s https://studio--drivemind-q69b7.us-central1.hosted.app/api/metrics | jq ".performance.errorRate"'
```

## Rollback Procedures

### Emergency Rollback (< 5 minutes)
```bash
# 1. Identify last known good version
git log --oneline -10

# 2. Revert to previous commit
ROLLBACK_COMMIT="previous_good_commit_sha"
git checkout $ROLLBACK_COMMIT

# 3. Deploy rollback
git push origin HEAD:main --force-with-lease

# 4. Verify rollback success
curl -s https://studio--drivemind-q69b7.us-central1.hosted.app/api/health | jq '.version'

# 5. Create incident record
echo "$(date): Emergency rollback to $ROLLBACK_COMMIT due to [REASON]" >> incident_log.txt
```

### Database Rollback (EXTREME CAUTION)
```bash
# Only for critical data corruption
# Requires approval from senior engineer and product owner

# 1. Stop all write operations
# 2. Create emergency backup of current state
# 3. Restore from point-in-time backup
# 4. Validate data integrity
# 5. Resume operations with monitoring
```

### Rollback Verification
```bash
# 1. Verify service health
curl -s https://studio--drivemind-q69b7.us-central1.hosted.app/api/health

# 2. Test critical user flows
# - OAuth authentication
# - Drive file scanning
# - AI classification

# 3. Monitor error rates
watch -n 60 'curl -s https://studio--drivemind-q69b7.us-central1.hosted.app/api/metrics | jq ".performance.errorRate"'

# 4. Check user impact metrics
curl -s https://studio--drivemind-q69b7.us-central1.hosted.app/api/metrics | jq '.business'
```

## Monitoring & Alerting

### Alert Configuration

#### Critical Alerts (PagerDuty)
```yaml
Service Down:
  condition: "health_check_failures > 3 consecutive"
  response_time: "< 1 minute"
  
High Error Rate:
  condition: "error_rate > 5% over 5 minutes"  
  response_time: "< 5 minutes"
  
OAuth Failure Rate:
  condition: "oauth_failure_rate > 10% over 5 minutes"
  response_time: "< 10 minutes"
  
Security Alert:
  condition: "security_event detected"
  response_time: "< 15 minutes"
```

#### Warning Alerts (Slack)
```yaml
Performance Degradation:
  condition: "p95_response_time > 250ms over 10 minutes"
  channel: "#drivemind-alerts"
  
High Memory Usage:
  condition: "memory_usage > 80% for 15 minutes"
  channel: "#drivemind-alerts"
  
AI Service Degraded:
  condition: "gemini_error_rate > 5% over 10 minutes" 
  channel: "#drivemind-alerts"
```

### Log Analysis
```bash
# Search for specific errors
firebase functions:log | grep -i "error\|exception\|failed"

# Monitor OAuth events
firebase functions:log | grep "oauth" | tail -20

# Check AI processing logs  
firebase functions:log | grep "ai_classification" | tail -20

# Filter by time range
firebase functions:log --since="2025-09-12T10:00:00Z" --until="2025-09-12T11:00:00Z"
```

### Performance Monitoring Dashboard
Access via Firebase Console > Performance Monitoring:
- Response time percentiles (P50, P95, P99)
- Error rate trends
- Memory and CPU utilization
- Database operation latency
- AI service call duration

### Business Metrics Dashboard
```bash
# Generate daily business report
curl -s https://studio--drivemind-q69b7.us-central1.hosted.app/api/metrics | jq '{
  date: now | strftime("%Y-%m-%d"),
  active_users: .business.activeUsers,
  files_processed: .business.filesProcessed,
  duplicates_detected: .business.duplicatesDetected,
  ai_insights_generated: .business.aiInsightsGenerated,
  error_rate: .performance.errorRate,
  avg_response_time: .performance.responseTime.avg
}' >> daily_metrics_$(date +%Y%m%d).json
```

---

## Emergency Contacts

**Primary Oncall**: DriveMind Platform Team  
**Escalation**: Senior Engineering Manager  
**Security Incidents**: Security Team  
**Business Impact**: Product Owner  

**Support Channels**:
- **Slack**: #drivemind-alerts (monitoring alerts)
- **Slack**: #drivemind-incidents (active incidents)  
- **PagerDuty**: DriveMind service (critical alerts)

---

*This runbook is maintained by the DriveMind Platform Team and should be updated with each major release. All procedures have been tested and validated in production scenarios.*