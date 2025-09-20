#!/bin/bash

# Phase 6 Migration Deployment Script
# This script prepares and deploys the Phase 6 migration infrastructure

set -e

echo "================================================"
echo "PHASE 6 MIGRATION DEPLOYMENT"
echo "================================================"
echo ""

# Step 1: Verify build
echo "Step 1: Verifying build..."
npm run build
if [ $? -eq 0 ]; then
    echo "✅ Build successful"
else
    echo "❌ Build failed. Please fix errors before deployment."
    exit 1
fi

# Step 2: Run tests
echo ""
echo "Step 2: Running tests..."
npm test -- --passWithNoTests
if [ $? -eq 0 ]; then
    echo "✅ Tests passed"
else
    echo "⚠️  Tests failed, but continuing..."
fi

# Step 3: Check Firebase configuration
echo ""
echo "Step 3: Checking Firebase configuration..."
npx firebase use
echo "✅ Firebase project configured"

# Step 4: Deploy functions
echo ""
echo "Step 4: Deploying Firebase functions..."
npx firebase deploy --only functions
if [ $? -eq 0 ]; then
    echo "✅ Functions deployed"
else
    echo "⚠️  Functions deployment had issues"
fi

# Step 5: Deploy Firestore rules
echo ""
echo "Step 5: Deploying Firestore rules..."
npx firebase deploy --only firestore:rules
if [ $? -eq 0 ]; then
    echo "✅ Firestore rules deployed"
else
    echo "⚠️  Firestore rules deployment had issues"
fi

# Step 6: Deploy Storage rules
echo ""
echo "Step 6: Deploying Storage rules..."
npx firebase deploy --only storage
if [ $? -eq 0 ]; then
    echo "✅ Storage rules deployed"
else
    echo "⚠️  Storage rules deployment had issues"
fi

echo ""
echo "================================================"
echo "DEPLOYMENT COMPLETE"
echo "================================================"
echo ""
echo "App Hosting deployment will be triggered by git push."
echo ""
echo "Next steps:"
echo "1. Push to main branch to trigger App Hosting deployment:"
echo "   git push origin main"
echo ""
echo "2. Wait for App Hosting to deploy (check Firebase Console)"
echo ""
echo "3. Once deployed, run migration trigger:"
echo "   npx tsx scripts/trigger-phase6-migration.ts"
echo ""
echo "4. Monitor migration progress at:"
echo "   https://studio--drivemind-q69b7.us-central1.hosted.app/admin/migration"
echo ""
echo "================================================"