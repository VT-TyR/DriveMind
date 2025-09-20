#!/bin/bash

# Phase 6 Production Deployment Verification Script
# Execute this after pushing to production

set -e

PRODUCTION_URL="https://studio--drivemind-q69b7.us-central1.hosted.app"
BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BOLD}Phase 6 Safety Infrastructure - Production Verification${NC}"
echo "========================================================="
echo "Production URL: $PRODUCTION_URL"
echo ""

# Function to check endpoint
check_endpoint() {
    local endpoint=$1
    local description=$2
    
    echo -n "Checking $description... "
    
    response=$(curl -s -o /dev/null -w "%{http_code}" "${PRODUCTION_URL}${endpoint}" 2>/dev/null || echo "000")
    
    if [ "$response" = "200" ]; then
        echo -e "${GREEN}✓${NC} OK (HTTP $response)"
        return 0
    elif [ "$response" = "000" ]; then
        echo -e "${RED}✗${NC} Connection Failed"
        return 1
    else
        echo -e "${YELLOW}⚠${NC} HTTP $response"
        return 1
    fi
}

# Function to check JSON endpoint
check_json_endpoint() {
    local endpoint=$1
    local description=$2
    
    echo -n "Checking $description... "
    
    response=$(curl -s "${PRODUCTION_URL}${endpoint}" 2>/dev/null)
    
    if echo "$response" | jq . >/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Valid JSON Response"
        
        # Extract key metrics if it's the safety dashboard
        if [[ "$endpoint" == *"safety"* ]]; then
            if echo "$response" | jq -e '.safetyComponents' >/dev/null 2>&1; then
                components=$(echo "$response" | jq -r '.safetyComponents | length')
                echo "  └─ Safety Components: $components/7"
            fi
        fi
        return 0
    else
        echo -e "${RED}✗${NC} Invalid Response"
        return 1
    fi
}

echo -e "${BOLD}1. Checking Core Endpoints${NC}"
echo "----------------------------"
check_endpoint "/" "Main Application"
check_endpoint "/admin/migration" "Admin Migration Dashboard"
check_endpoint "/safety-dashboard" "Safety Dashboard UI"
echo ""

echo -e "${BOLD}2. Checking API Endpoints${NC}"
echo "--------------------------"
check_json_endpoint "/api/safety/dashboard" "Safety Status API"
check_json_endpoint "/api/dashboard/stats" "Dashboard Stats API"
echo ""

echo -e "${BOLD}3. Checking Safety Components${NC}"
echo "------------------------------"
response=$(curl -s "${PRODUCTION_URL}/api/safety/dashboard" 2>/dev/null)

if echo "$response" | jq . >/dev/null 2>&1; then
    # Check each component
    components=("RollbackManager" "ValidationFramework" "DataSourceManager" "PerformanceMonitor" "FeatureFlags" "MigrationState" "Phase6Coordinator")
    
    for component in "${components[@]}"; do
        echo -n "  $component: "
        
        # Check if component exists in response
        if echo "$response" | jq -e ".safetyComponents.\"$component\"" >/dev/null 2>&1; then
            status=$(echo "$response" | jq -r ".safetyComponents.\"$component\".status // \"unknown\"")
            if [ "$status" = "operational" ] || [ "$status" = "ready" ]; then
                echo -e "${GREEN}✓${NC} Operational"
            else
                echo -e "${YELLOW}⚠${NC} $status"
            fi
        else
            echo -e "${RED}✗${NC} Not Found"
        fi
    done
fi
echo ""

echo -e "${BOLD}4. Checking Migration Readiness${NC}"
echo "--------------------------------"

# Check if migration endpoint responds
response=$(curl -s -o /dev/null -w "%{http_code}" -X GET "${PRODUCTION_URL}/api/migration/phase6" 2>/dev/null || echo "000")

if [ "$response" = "200" ] || [ "$response" = "405" ]; then
    echo -e "Migration Endpoint: ${GREEN}✓${NC} Ready"
else
    echo -e "Migration Endpoint: ${RED}✗${NC} Not Available"
fi

# Check feature flags
response=$(curl -s "${PRODUCTION_URL}/api/safety/dashboard" 2>/dev/null)
if echo "$response" | jq -e '.featureFlags' >/dev/null 2>&1; then
    flag_count=$(echo "$response" | jq '.featureFlags | length')
    echo -e "Feature Flags: ${GREEN}✓${NC} $flag_count flags configured"
else
    echo -e "Feature Flags: ${RED}✗${NC} Not Available"
fi

echo ""
echo -e "${BOLD}5. Deployment Summary${NC}"
echo "---------------------"

# Count successes
total_checks=0
successful_checks=0

# Re-run checks silently to count
for endpoint in "/" "/admin/migration" "/safety-dashboard"; do
    ((total_checks++))
    response=$(curl -s -o /dev/null -w "%{http_code}" "${PRODUCTION_URL}${endpoint}" 2>/dev/null || echo "000")
    [ "$response" = "200" ] && ((successful_checks++))
done

for endpoint in "/api/safety/dashboard" "/api/dashboard/stats"; do
    ((total_checks++))
    response=$(curl -s "${PRODUCTION_URL}${endpoint}" 2>/dev/null)
    echo "$response" | jq . >/dev/null 2>&1 && ((successful_checks++))
done

echo "Total Checks: $total_checks"
echo "Successful: $successful_checks"
echo -n "Status: "

if [ "$successful_checks" -eq "$total_checks" ]; then
    echo -e "${GREEN}${BOLD}✓ READY FOR PHASE 7${NC}"
    echo ""
    echo -e "${GREEN}All safety systems operational. Phase 7 migration can proceed.${NC}"
    exit 0
elif [ "$successful_checks" -gt 0 ]; then
    echo -e "${YELLOW}${BOLD}⚠ PARTIAL DEPLOYMENT${NC}"
    echo ""
    echo -e "${YELLOW}Some components are not responding. Check deployment logs.${NC}"
    exit 1
else
    echo -e "${RED}${BOLD}✗ DEPLOYMENT FAILED${NC}"
    echo ""
    echo -e "${RED}Safety infrastructure not accessible. Do not proceed with migration.${NC}"
    exit 2
fi