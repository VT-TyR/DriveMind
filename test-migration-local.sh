#!/bin/bash

# Test Phase 6 Migration Endpoints Locally
# This script tests the migration endpoints in development

echo "========================================="
echo "PHASE 6 MIGRATION LOCAL TEST"
echo "========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Next.js dev server is running
echo "Checking if development server is running..."
curl -s http://localhost:3000/api/health > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo -e "${YELLOW}Development server not running. Starting it now...${NC}"
    npm run dev &
    DEV_PID=$!
    echo "Waiting for server to start..."
    sleep 10
else
    echo -e "${GREEN}✓ Development server is running${NC}"
fi

echo ""
echo "Testing Migration Endpoints..."
echo "------------------------------"

# Test 1: Health Check
echo ""
echo "1. Testing Health Check..."
HEALTH_RESPONSE=$(curl -s http://localhost:3000/api/health)
if [[ $HEALTH_RESPONSE == *"healthy"* ]]; then
    echo -e "${GREEN}✓ Health check passed${NC}"
else
    echo -e "${RED}✗ Health check failed${NC}"
    echo "Response: $HEALTH_RESPONSE"
fi

# Test 2: Migration Status
echo ""
echo "2. Testing Migration Status..."
MIGRATION_STATUS=$(curl -s http://localhost:3000/api/migration/phase6)
if [[ $MIGRATION_STATUS == *"phase"* ]] || [[ $MIGRATION_STATUS == *"status"* ]]; then
    echo -e "${GREEN}✓ Migration status endpoint working${NC}"
    echo "Current status: $MIGRATION_STATUS"
else
    echo -e "${RED}✗ Migration status endpoint failed${NC}"
    echo "Response: $MIGRATION_STATUS"
fi

# Test 3: Safety Dashboard
echo ""
echo "3. Testing Safety Dashboard..."
SAFETY_STATUS=$(curl -s http://localhost:3000/api/safety/dashboard)
if [[ $SAFETY_STATUS == *"metrics"* ]] || [[ $SAFETY_STATUS == *"performance"* ]]; then
    echo -e "${GREEN}✓ Safety dashboard endpoint working${NC}"
else
    echo -e "${RED}✗ Safety dashboard endpoint failed${NC}"
    echo "Response: $SAFETY_STATUS"
fi

# Test 4: Admin Migration Page
echo ""
echo "4. Testing Admin Migration Page..."
ADMIN_PAGE=$(curl -s http://localhost:3000/admin/migration | head -20)
if [[ $ADMIN_PAGE == *"Migration"* ]] || [[ $ADMIN_PAGE == *"Phase"* ]]; then
    echo -e "${GREEN}✓ Admin migration page accessible${NC}"
else
    echo -e "${YELLOW}⚠ Admin migration page may need authentication${NC}"
fi

echo ""
echo "========================================="
echo "LOCAL TEST COMPLETE"
echo "========================================="
echo ""
echo "Next Steps:"
echo "1. Deploy to App Hosting: git push origin main"
echo "2. Run production tests using deployed URL"
echo "3. Execute migration: npx tsx scripts/trigger-phase6-migration.ts"
echo ""

# Cleanup: Kill dev server if we started it
if [ ! -z "$DEV_PID" ]; then
    echo "Stopping development server..."
    kill $DEV_PID 2>/dev/null
fi