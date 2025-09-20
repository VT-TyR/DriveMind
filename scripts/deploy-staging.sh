#!/bin/bash

# DriveMind Staging Deployment Script
# This script validates prerequisites and deploys to staging environment

set -e # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "================================================"
echo "DriveMind Staging Deployment Script"
echo "================================================"

# Function to check command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo -e "\n${YELLOW}Checking prerequisites...${NC}"

if ! command_exists "npm"; then
    echo -e "${RED}Error: npm is not installed${NC}"
    exit 1
fi

if ! command_exists "firebase"; then
    echo -e "${RED}Error: Firebase CLI is not installed${NC}"
    echo "Run: npm install -g firebase-tools"
    exit 1
fi

# Run tests
echo -e "\n${YELLOW}Running tests...${NC}"
npm test 2>&1 | tail -5

# Check test results
if [ $? -ne 0 ]; then
    echo -e "${YELLOW}Warning: Some tests are failing${NC}"
    read -p "Continue with deployment? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}Deployment cancelled${NC}"
        exit 1
    fi
fi

# Check test coverage
echo -e "\n${YELLOW}Checking test coverage...${NC}"
npm run test:coverage 2>&1 | grep -E "All files" | tail -1

# Security audit
echo -e "\n${YELLOW}Running security audit...${NC}"
npm audit --production 2>&1 | grep -E "found.*vulnerabilities" || echo "No vulnerabilities found"

# Check for critical vulnerabilities
CRITICAL_VULNS=$(npm audit --json 2>&1 | jq -r '.metadata.vulnerabilities.critical // 0')
if [ "$CRITICAL_VULNS" -gt 0 ]; then
    echo -e "${RED}Error: $CRITICAL_VULNS critical vulnerabilities found${NC}"
    echo "Run: npm audit fix --force"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}Deployment cancelled${NC}"
        exit 1
    fi
fi

# Build the application
echo -e "\n${YELLOW}Building application...${NC}"
npm run build

if [ $? -ne 0 ]; then
    echo -e "${RED}Build failed!${NC}"
    exit 1
fi

echo -e "${GREEN}Build successful!${NC}"

# Check Firebase project
echo -e "\n${YELLOW}Checking Firebase configuration...${NC}"
CURRENT_PROJECT=$(npx firebase use 2>&1 | grep "Active Project:" | cut -d: -f2 | tr -d ' ')

if [ "$CURRENT_PROJECT" != "drivemind-q69b7" ]; then
    echo -e "${YELLOW}Switching to correct Firebase project...${NC}"
    npx firebase use drivemind-q69b7
fi

# Deploy to staging
echo -e "\n${YELLOW}Deploying to staging environment...${NC}"
echo "Using configuration: apphosting.staging.yaml"

# Create staging branch if it doesn't exist
if ! git show-ref --verify --quiet refs/heads/staging; then
    echo -e "${YELLOW}Creating staging branch...${NC}"
    git checkout -b staging
else
    git checkout staging
fi

# Merge main into staging
echo -e "${YELLOW}Merging main branch into staging...${NC}"
git merge main -m "Merge main into staging for deployment"

# Push to trigger App Hosting deployment
echo -e "\n${YELLOW}Pushing to staging branch...${NC}"
git push origin staging

echo -e "\n${GREEN}Deployment initiated!${NC}"
echo "================================================"
echo "Staging URL: https://staging--drivemind-q69b7.us-central1.hosted.app"
echo "Monitor deployment: https://console.firebase.google.com/project/drivemind-q69b7/apphosting"
echo "================================================"

# Switch back to main branch
git checkout main

echo -e "\n${GREEN}Staging deployment script completed!${NC}"
echo "Note: It may take 3-5 minutes for the deployment to complete."
echo ""
echo "Post-deployment checklist:"
echo "1. [ ] Verify staging site is accessible"
echo "2. [ ] Test OAuth flow"
echo "3. [ ] Test background scan"
echo "4. [ ] Check error handling"
echo "5. [ ] Verify monitoring endpoints (/health, /metrics)"
echo ""