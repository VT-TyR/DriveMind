#!/bin/bash

# Phase 6 Dashboard Validation Script
# Validates real-time data integration and safety infrastructure

set -e

echo "🔍 Phase 6 Dashboard Validation"
echo "================================"
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Production URL
PROD_URL="https://studio--drivemind-q69b7.us-central1.hosted.app"
LOCAL_URL="http://localhost:3000"

# Function to check endpoint
check_endpoint() {
    local url=$1
    local endpoint=$2
    local expected_code=$3
    local description=$4
    
    response=$(curl -s -o /dev/null -w "%{http_code}" "${url}${endpoint}")
    
    if [ "$response" == "$expected_code" ]; then
        echo -e "${GREEN}✅ ${description}: ${response}${NC}"
        return 0
    else
        echo -e "${RED}❌ ${description}: ${response} (expected ${expected_code})${NC}"
        return 1
    fi
}

# Function to check dashboard data
check_dashboard_data() {
    local url=$1
    local token=$2
    
    if [ -z "$token" ]; then
        echo -e "${YELLOW}⚠️  No auth token provided, skipping authenticated checks${NC}"
        return 1
    fi
    
    response=$(curl -s -H "Authorization: Bearer ${token}" "${url}/api/dashboard/stats")
    
    # Check if response contains real data
    if echo "$response" | grep -q '"totalFiles":0'; then
        echo -e "${RED}❌ Dashboard shows 0 files - mock data issue detected${NC}"
        echo "   Response: ${response:0:200}..."
        return 1
    else
        files=$(echo "$response" | grep -oP '"totalFiles":\K[0-9]+' || echo "0")
        echo -e "${GREEN}✅ Dashboard shows ${files} files - real data active${NC}"
        return 0
    fi
}

# 1. Check build status
echo "📦 Checking build status..."
if [ -f ".next/BUILD_ID" ]; then
    BUILD_ID=$(cat .next/BUILD_ID)
    echo -e "${GREEN}✅ Build ID: ${BUILD_ID}${NC}"
else
    echo -e "${YELLOW}⚠️  No build found, running build...${NC}"
    npm run build
fi

# 2. Check TypeScript compilation
echo ""
echo "📝 Checking TypeScript compilation..."
npm run type-check > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ TypeScript compilation successful${NC}"
else
    echo -e "${RED}❌ TypeScript compilation failed${NC}"
    exit 1
fi

# 3. Check local endpoints (if server is running)
echo ""
echo "🌐 Checking local endpoints..."
LOCAL_RUNNING=$(curl -s -o /dev/null -w "%{http_code}" "${LOCAL_URL}" || echo "000")

if [ "$LOCAL_RUNNING" != "000" ]; then
    check_endpoint "$LOCAL_URL" "/api/health" "200" "Health endpoint"
    check_endpoint "$LOCAL_URL" "/api/migration/phase6" "200" "Migration endpoint"
    check_endpoint "$LOCAL_URL" "/api/safety/dashboard" "200" "Safety dashboard"
    check_endpoint "$LOCAL_URL" "/api/dashboard/stats" "401" "Dashboard stats (requires auth)"
else
    echo -e "${YELLOW}⚠️  Local server not running, skipping local checks${NC}"
fi

# 4. Check production endpoints
echo ""
echo "🌍 Checking production endpoints..."
check_endpoint "$PROD_URL" "/api/health" "200" "Health endpoint"
check_endpoint "$PROD_URL" "/api/migration/phase6" "200" "Migration endpoint"  
check_endpoint "$PROD_URL" "/api/safety/dashboard" "200" "Safety dashboard"
check_endpoint "$PROD_URL" "/api/dashboard/stats" "401" "Dashboard stats (requires auth)"

# 5. Check real-time services
echo ""
echo "🔄 Checking real-time services..."
if [ -f "src/lib/dashboard-realtime-service.ts" ]; then
    echo -e "${GREEN}✅ Dashboard real-time service exists${NC}"
else
    echo -e "${RED}❌ Dashboard real-time service missing${NC}"
fi

if [ -f "src/lib/realtime/scan-results-adapter.ts" ]; then
    echo -e "${GREEN}✅ Scan results adapter exists${NC}"
else
    echo -e "${RED}❌ Scan results adapter missing${NC}"
fi

# 6. Check safety infrastructure
echo ""
echo "🛡️ Checking safety infrastructure..."
SAFETY_FILES=(
    "src/lib/safety/rollback-manager.ts"
    "src/lib/safety/validation-framework.ts"
    "src/lib/safety/data-source-manager.ts"
    "src/lib/safety/performance-monitor.ts"
    "src/lib/safety/feature-flags.ts"
    "src/lib/safety/migration-state.ts"
    "src/lib/safety/phase6-migration-coordinator.ts"
)

SAFETY_OK=true
for file in "${SAFETY_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✅ $(basename $file)${NC}"
    else
        echo -e "${RED}❌ $(basename $file) missing${NC}"
        SAFETY_OK=false
    fi
done

# 7. Check Firebase configuration
echo ""
echo "🔥 Checking Firebase configuration..."
if [ -f "firebase.json" ]; then
    echo -e "${GREEN}✅ Firebase configuration exists${NC}"
else
    echo -e "${RED}❌ Firebase configuration missing${NC}"
fi

if [ -f "firestore.rules" ]; then
    echo -e "${GREEN}✅ Firestore rules exist${NC}"
else
    echo -e "${RED}❌ Firestore rules missing${NC}"
fi

# 8. Check git status
echo ""
echo "📋 Checking git status..."
UNCOMMITTED=$(git status --porcelain | wc -l)
if [ "$UNCOMMITTED" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  ${UNCOMMITTED} uncommitted changes found${NC}"
    echo "   Files:"
    git status --porcelain | head -5 | sed 's/^/     /'
    if [ "$UNCOMMITTED" -gt 5 ]; then
        echo "     ... and $((UNCOMMITTED - 5)) more"
    fi
else
    echo -e "${GREEN}✅ Working directory clean${NC}"
fi

# 9. Performance check
echo ""
echo "⚡ Checking performance targets..."
if [ "$LOCAL_RUNNING" != "000" ]; then
    START_TIME=$(date +%s%N)
    curl -s "${LOCAL_URL}/api/health" > /dev/null
    END_TIME=$(date +%s%N)
    ELAPSED=$((($END_TIME - $START_TIME) / 1000000))
    
    if [ "$ELAPSED" -lt 250 ]; then
        echo -e "${GREEN}✅ Health endpoint response: ${ELAPSED}ms (< 250ms P95 target)${NC}"
    else
        echo -e "${YELLOW}⚠️  Health endpoint response: ${ELAPSED}ms (exceeds 250ms P95 target)${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  Local server not running, skipping performance check${NC}"
fi

# 10. Summary
echo ""
echo "📊 VALIDATION SUMMARY"
echo "===================="

ISSUES=0

if [ "$UNCOMMITTED" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Uncommitted changes need to be committed${NC}"
    ISSUES=$((ISSUES + 1))
fi

if [ "$SAFETY_OK" != "true" ]; then
    echo -e "${RED}❌ Safety infrastructure incomplete${NC}"
    ISSUES=$((ISSUES + 1))
fi

if [ "$ISSUES" -eq 0 ]; then
    echo -e "${GREEN}✅ All validation checks passed!${NC}"
    echo ""
    echo "Ready for deployment:"
    echo "  1. Commit changes: git add -A && git commit -m 'Phase 6 Dashboard integration'"
    echo "  2. Push to deploy: git push origin main"
    echo "  3. Monitor at: ${PROD_URL}/admin/migration"
else
    echo -e "${RED}❌ ${ISSUES} issues found - review above${NC}"
    exit 1
fi

echo ""
echo "🚀 Phase 6 Dashboard Validation Complete"
exit 0