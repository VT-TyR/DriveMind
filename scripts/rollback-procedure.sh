#!/bin/bash

# DriveMind Emergency Rollback Procedure
# ALPHA-CODENAME v1.8 Compliant
# Recovery Time Target: <5 minutes

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
PROJECT_ID="drivemind-q69b7"
ROLLBACK_LOG="rollback-$(date +%Y%m%d-%H%M%S).log"

# Logging function
log() {
    local level=$1
    shift
    echo -e "[$(date -Iseconds)] [${level}] $*" | tee -a "${ROLLBACK_LOG}"
}

# Display header
echo "================================================"
echo -e "${RED}EMERGENCY ROLLBACK PROCEDURE${NC}"
echo "================================================"
echo "Project: ${PROJECT_ID}"
echo "Timestamp: $(date -Iseconds)"
echo "Log: ${ROLLBACK_LOG}"
echo "================================================"

# Confirm rollback
echo -e "\n${YELLOW}WARNING: This will rollback the deployment to the previous version${NC}"
read -p "Are you sure you want to proceed with rollback? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    log "INFO" "Rollback cancelled by user"
    exit 0
fi

log "CRITICAL" "Rollback procedure initiated"

# Step 1: Identify rollback target
log "INFO" "Step 1: Identifying rollback target"

# Get the last known good commit
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
CURRENT_COMMIT=$(git rev-parse HEAD)
PREVIOUS_COMMIT=$(git rev-parse HEAD~1)

log "INFO" "Current branch: ${CURRENT_BRANCH}"
log "INFO" "Current commit: ${CURRENT_COMMIT}"
log "INFO" "Rollback target: ${PREVIOUS_COMMIT}"

# Step 2: Create rollback branch
ROLLBACK_BRANCH="rollback-$(date +%Y%m%d-%H%M%S)"
log "INFO" "Step 2: Creating rollback branch: ${ROLLBACK_BRANCH}"

git checkout -b "${ROLLBACK_BRANCH}"
git reset --hard "${PREVIOUS_COMMIT}"

# Step 3: Verify build integrity
log "INFO" "Step 3: Verifying build integrity"

# Quick build test
if npm run build > /dev/null 2>&1; then
    log "SUCCESS" "Build verification passed"
else
    log "ERROR" "Build verification failed - attempting force rollback"
fi

# Step 4: Database rollback (if needed)
log "INFO" "Step 4: Checking for database rollback"

echo -e "${YELLOW}Does this rollback require database changes?${NC}"
read -p "Rollback database? (y/n): " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    log "INFO" "Initiating database rollback"
    
    # Check for backup
    BACKUP_BUCKET="gs://drivemind-backups"
    echo "Available backups:"
    gsutil ls "${BACKUP_BUCKET}" 2>/dev/null || echo "No backups found"
    
    read -p "Enter backup timestamp (or 'skip' to continue): " BACKUP_TS
    
    if [ "$BACKUP_TS" != "skip" ]; then
        log "INFO" "Restoring database from ${BACKUP_TS}"
        gcloud firestore import "${BACKUP_BUCKET}/${BACKUP_TS}" --project="${PROJECT_ID}"
    fi
fi

# Step 5: Deploy rollback
log "INFO" "Step 5: Deploying rollback"

# Determine target branch
if [ "$CURRENT_BRANCH" == "main" ]; then
    TARGET_ENV="production"
    TARGET_URL="https://studio--drivemind-q69b7.us-central1.hosted.app"
elif [ "$CURRENT_BRANCH" == "staging" ]; then
    TARGET_ENV="staging"
    TARGET_URL="https://staging--drivemind-q69b7.us-central1.hosted.app"
else
    log "ERROR" "Unknown branch for rollback: ${CURRENT_BRANCH}"
    exit 1
fi

log "INFO" "Rolling back ${TARGET_ENV} environment"

# Force push rollback
git push origin "${ROLLBACK_BRANCH}:${CURRENT_BRANCH}" --force

log "INFO" "Rollback pushed, waiting for deployment..."

# Step 6: Health check verification
log "INFO" "Step 6: Verifying rollback deployment"

sleep 180  # Wait 3 minutes for deployment

MAX_RETRIES=10
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if curl -s -f "${TARGET_URL}/api/health" > /dev/null 2>&1; then
        log "SUCCESS" "Health check passed - rollback successful"
        break
    else
        RETRY_COUNT=$((RETRY_COUNT + 1))
        log "WARNING" "Health check attempt ${RETRY_COUNT}/${MAX_RETRIES} failed"
        sleep 30
    fi
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    log "ERROR" "Health checks failed after rollback"
    echo -e "${RED}CRITICAL: Rollback may have failed - manual intervention required${NC}"
    exit 1
fi

# Step 7: Notification
log "INFO" "Step 7: Sending notifications"

# Create incident report
cat > "rollback-report-$(date +%Y%m%d-%H%M%S).md" <<EOF
# Rollback Incident Report

## Summary
- **Date**: $(date -Iseconds)
- **Environment**: ${TARGET_ENV}
- **Previous Commit**: ${CURRENT_COMMIT}
- **Rolled Back To**: ${PREVIOUS_COMMIT}
- **Status**: SUCCESS

## Timeline
$(grep -E "\[INFO\]|\[SUCCESS\]|\[ERROR\]" "${ROLLBACK_LOG}")

## Health Check
- URL: ${TARGET_URL}/api/health
- Status: Responsive

## Follow-up Actions
1. Investigate root cause of failure
2. Review monitoring logs
3. Update deployment procedures
4. Schedule post-mortem meeting
EOF

log "SUCCESS" "Rollback incident report created"

# Step 8: Cleanup
log "INFO" "Step 8: Cleanup"

# Switch back to original branch
git checkout "${CURRENT_BRANCH}"

# Final summary
echo ""
echo "================================================"
echo -e "${GREEN}ROLLBACK COMPLETE${NC}"
echo "================================================"
echo "Environment: ${TARGET_ENV}"
echo "URL: ${TARGET_URL}"
echo "Rollback Time: $((SECONDS / 60)) minutes"
echo "Status: SUCCESS"
echo "================================================"
echo ""
echo "Next Steps:"
echo "1. Verify application functionality"
echo "2. Review incident report"
echo "3. Communicate status to stakeholders"
echo "4. Schedule post-mortem"
echo ""

log "SUCCESS" "Rollback procedure completed successfully"

exit 0