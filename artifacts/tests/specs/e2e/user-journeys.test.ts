/**
 * End-to-End User Journey Tests - ALPHA Standards
 * Complete workflow testing with Playwright automation
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import { chromium, firefox, webkit } from '@playwright/test';

// Test configuration
const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';
const TEST_USER_EMAIL = process.env.TEST_USER_EMAIL || 'drivemind.test@gmail.com';
const TEST_USER_PASSWORD = process.env.TEST_USER_PASSWORD || 'TestPassword123!';

// Page object models
import { LandingPage } from '../fixtures/page-objects/landing-page';
import { DashboardPage } from '../fixtures/page-objects/dashboard-page';
import { AIPage } from '../fixtures/page-objects/ai-page';
import { InventoryPage } from '../fixtures/page-objects/inventory-page';
import { AuthFlow } from '../fixtures/page-objects/auth-flow';

describe('DriveMind E2E User Journeys', () => {
  let browser: any;
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async () => {
    browser = await chromium.launch({
      headless: process.env.CI === 'true',
      slowMo: process.env.CI ? 0 : 100,
    });
  });

  test.afterAll(async () => {
    await browser.close();
  });

  test.beforeEach(async () => {
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      // Mock geolocation if needed
      geolocation: { longitude: -122.4194, latitude: 37.7749 },
      permissions: ['geolocation'],
    });
    
    page = await context.newPage();
    
    // Add request/response logging for debugging
    page.on('request', request => {
      if (process.env.DEBUG) {
        console.log(`Request: ${request.method()} ${request.url()}`);
      }
    });
    
    page.on('response', response => {
      if (process.env.DEBUG && !response.ok()) {
        console.log(`Failed response: ${response.status()} ${response.url()}`);
      }
    });

    // Mock external services in test environment
    if (process.env.NODE_ENV === 'test') {
      await mockExternalServices(page);
    }
  });

  test.afterEach(async () => {
    await context.close();
  });

  test.describe('Complete OAuth Authentication Journey', () => {
    test('should complete full OAuth flow successfully', async () => {
      const landingPage = new LandingPage(page);
      const authFlow = new AuthFlow(page);
      const dashboardPage = new DashboardPage(page);

      // Step 1: Navigate to landing page
      await test.step('Navigate to landing page', async () => {
        await page.goto(BASE_URL);
        await expect(page).toHaveTitle(/DriveMind/);
        
        // Check accessibility
        await expect(page.locator('[role="main"]')).toBeVisible();
        await expect(page.locator('h1')).toContainText('DriveMind');
      });

      // Step 2: Initiate OAuth flow
      await test.step('Initiate OAuth flow', async () => {
        await landingPage.clickGetStarted();
        
        // Should redirect to OAuth initiation
        await page.waitForURL(/auth\/drive\/begin/, { timeout: 10000 });
        
        // Should receive OAuth URL and redirect
        await expect(page).toHaveURL(/accounts\.google\.com/);
      });

      // Step 3: Complete Google OAuth (mocked in test environment)
      await test.step('Complete Google OAuth', async () => {
        if (process.env.NODE_ENV === 'test') {
          // In test environment, mock OAuth completion
          await authFlow.completeOAuthMock();
        } else {
          // In staging/production, use real OAuth
          await authFlow.completeOAuthReal(TEST_USER_EMAIL, TEST_USER_PASSWORD);
        }
        
        // Should redirect back to application
        await page.waitForURL(/dashboard/, { timeout: 15000 });
      });

      // Step 4: Verify successful authentication
      await test.step('Verify dashboard access', async () => {
        await expect(dashboardPage.welcomeMessage).toBeVisible();
        await expect(dashboardPage.userAvatar).toBeVisible();
        
        // Check that user stats are loaded
        await expect(dashboardPage.totalFilesCard).toBeVisible();
        await expect(dashboardPage.storageUsedCard).toBeVisible();
      });

      // Step 5: Verify token synchronization
      await test.step('Verify token sync', async () => {
        // Check that auth status endpoint returns authenticated
        const response = await page.request.get(`${BASE_URL}/api/auth/drive/status`);
        expect(response.ok()).toBeTruthy();
        
        const authStatus = await response.json();
        expect(authStatus.authenticated).toBe(true);
        expect(authStatus.hasValidToken).toBe(true);
      });
    });

    test('should handle OAuth errors gracefully', async () => {
      const landingPage = new LandingPage(page);
      const authFlow = new AuthFlow(page);

      await page.goto(BASE_URL);
      await landingPage.clickGetStarted();

      // Simulate OAuth denial
      await authFlow.denyOAuth();

      // Should redirect back with error message
      await page.waitForURL(/\?error=/, { timeout: 10000 });
      
      // Should display user-friendly error message
      await expect(page.locator('[data-testid="error-message"]')).toContainText(/authentication/i);
      
      // Should provide retry option
      const retryButton = page.locator('[data-testid="retry-auth"]');
      await expect(retryButton).toBeVisible();
      
      // Retry should work
      await retryButton.click();
      await expect(page).toHaveURL(/auth\/drive\/begin/);
    });

    test('should maintain authentication across page reloads', async () => {
      // First, authenticate
      await authenticateTestUser(page);
      
      const dashboardPage = new DashboardPage(page);
      await page.goto(`${BASE_URL}/dashboard`);
      await expect(dashboardPage.welcomeMessage).toBeVisible();

      // Reload page
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Should still be authenticated
      await expect(dashboardPage.welcomeMessage).toBeVisible();
      
      // Auth status should still be valid
      const response = await page.request.get(`${BASE_URL}/api/auth/drive/status`);
      const authStatus = await response.json();
      expect(authStatus.authenticated).toBe(true);
    });
  });

  test.describe('Drive Analysis Workflow', () => {
    test.beforeEach(async () => {
      await authenticateTestUser(page);
    });

    test('should complete full drive analysis workflow', async () => {
      const dashboardPage = new DashboardPage(page);
      const inventoryPage = new InventoryPage(page);
      
      await page.goto(`${BASE_URL}/dashboard`);

      // Step 1: Initiate drive scan
      await test.step('Start drive scan', async () => {
        await dashboardPage.clickStartScan();
        
        // Should show scan configuration dialog
        const scanDialog = page.locator('[data-testid="scan-config-dialog"]');
        await expect(scanDialog).toBeVisible();
        
        // Configure scan options
        await page.locator('[data-testid="max-depth-input"]').fill('20');
        await page.locator('[data-testid="include-trashed"]').check();
        
        // Start scan
        await page.locator('[data-testid="start-scan-button"]').click();
      });

      // Step 2: Monitor scan progress
      await test.step('Monitor scan progress', async () => {
        // Should show progress indicator
        const progressBar = page.locator('[data-testid="scan-progress"]');
        await expect(progressBar).toBeVisible();
        
        // Wait for scan completion (or timeout)
        await page.waitForFunction(
          () => {
            const progress = document.querySelector('[data-testid="scan-progress"]');
            return progress?.getAttribute('aria-valuenow') === '100';
          },
          { timeout: 60000 }
        );
        
        // Should show completion message
        await expect(page.locator('[data-testid="scan-complete"]')).toBeVisible();
      });

      // Step 3: View scan results
      await test.step('View scan results', async () => {
        await page.locator('[data-testid="view-results"]').click();
        await page.waitForURL(/inventory/, { timeout: 10000 });
        
        // Should display file inventory
        await expect(inventoryPage.fileTable).toBeVisible();
        
        // Should show scan statistics
        const totalFiles = await inventoryPage.totalFilesCount.textContent();
        expect(parseInt(totalFiles || '0')).toBeGreaterThan(0);
      });

      // Step 4: Filter and search results
      await test.step('Filter scan results', async () => {
        // Apply file type filter
        await inventoryPage.selectFileTypeFilter('PDF');
        await page.waitForLoadState('networkidle');
        
        // Should filter results
        const filteredRows = page.locator('[data-testid="file-row"]');
        const count = await filteredRows.count();
        expect(count).toBeGreaterThan(0);
        
        // Search by filename
        await inventoryPage.searchFiles('invoice');
        await page.waitForLoadState('networkidle');
        
        // Should show search results
        const searchResults = page.locator('[data-testid="file-row"]:visible');
        await expect(searchResults.first()).toContainText(/invoice/i);
      });
    });

    test('should handle large drive scans with background processing', async () => {
      const dashboardPage = new DashboardPage(page);
      
      await page.goto(`${BASE_URL}/dashboard`);

      // Mock large drive that requires background processing
      await page.route('**/api/workflows/scan', async route => {
        await route.fulfill({
          status: 202,
          contentType: 'application/json',
          body: JSON.stringify({
            scanId: 'large-scan-123',
            status: 'initiated',
            message: 'Large drive scan initiated in background'
          })
        });
      });

      // Start scan
      await dashboardPage.clickStartScan();
      await page.locator('[data-testid="start-scan-button"]').click();

      // Should show background processing message
      await expect(page.locator('[data-testid="background-scan-message"]')).toBeVisible();
      
      // Should provide scan ID for tracking
      const scanId = await page.locator('[data-testid="scan-id"]').textContent();
      expect(scanId).toBe('large-scan-123');

      // Should allow checking scan status
      await page.locator('[data-testid="check-status"]').click();
      
      // Should poll for status updates
      await expect(page.locator('[data-testid="scan-status"]')).toContainText(/running|completed/);
    });

    test('should handle scan failures gracefully', async () => {
      const dashboardPage = new DashboardPage(page);
      
      await page.goto(`${BASE_URL}/dashboard`);

      // Mock scan failure
      await page.route('**/api/workflows/scan', async route => {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'service_unavailable',
            message: 'Google Drive API temporarily unavailable'
          })
        });
      });

      await dashboardPage.clickStartScan();
      await page.locator('[data-testid="start-scan-button"]').click();

      // Should show error message
      await expect(page.locator('[data-testid="error-message"]')).toContainText(/unavailable/i);
      
      // Should provide retry option
      const retryButton = page.locator('[data-testid="retry-scan"]');
      await expect(retryButton).toBeVisible();
      
      // Should suggest alternative actions
      await expect(page.locator('[data-testid="alternative-actions"]')).toBeVisible();
    });
  });

  test.describe('AI-Powered Organization Workflow', () => {
    test.beforeEach(async () => {
      await authenticateTestUser(page);
      // Ensure AI mode is enabled
      await enableAIMode(page);
    });

    test('should generate and apply organization suggestions', async () => {
      const aiPage = new AIPage(page);
      
      await page.goto(`${BASE_URL}/ai`);

      // Step 1: Load AI analysis interface
      await test.step('Load AI interface', async () => {
        await expect(aiPage.analysisContainer).toBeVisible();
        await expect(aiPage.classificationSection).toBeVisible();
        await expect(aiPage.organizationSection).toBeVisible();
      });

      // Step 2: Get organization suggestions
      await test.step('Generate suggestions', async () => {
        await aiPage.clickGetSuggestions();
        
        // Should show loading state
        await expect(aiPage.loadingSpinner).toBeVisible();
        
        // Wait for suggestions to load
        await page.waitForFunction(
          () => document.querySelectorAll('[data-testid="suggestion-card"]').length > 0,
          { timeout: 30000 }
        );
        
        // Should display suggestions
        const suggestions = page.locator('[data-testid="suggestion-card"]');
        expect(await suggestions.count()).toBeGreaterThan(0);
      });

      // Step 3: Review suggestions
      await test.step('Review suggestions', async () => {
        const firstSuggestion = page.locator('[data-testid="suggestion-card"]').first();
        
        // Should show suggestion details
        await expect(firstSuggestion.locator('[data-testid="suggestion-title"]')).toBeVisible();
        await expect(firstSuggestion.locator('[data-testid="confidence-score"]')).toBeVisible();
        await expect(firstSuggestion.locator('[data-testid="affected-files"]')).toBeVisible();
        
        // Should provide preview
        await firstSuggestion.locator('[data-testid="preview-suggestion"]').click();
        await expect(page.locator('[data-testid="preview-dialog"]')).toBeVisible();
      });

      // Step 4: Apply suggestions
      await test.step('Apply suggestions', async () => {
        await page.locator('[data-testid="apply-suggestion"]').click();
        
        // Should show confirmation dialog
        const confirmDialog = page.locator('[data-testid="confirm-apply-dialog"]');
        await expect(confirmDialog).toBeVisible();
        
        // Confirm application
        await confirmDialog.locator('[data-testid="confirm-apply"]').click();
        
        // Should show progress
        await expect(page.locator('[data-testid="apply-progress"]')).toBeVisible();
        
        // Should show completion
        await expect(page.locator('[data-testid="apply-complete"]')).toBeVisible();
      });

      // Step 5: Verify results
      await test.step('Verify organization results', async () => {
        // Navigate to inventory to see changes
        await page.goto(`${BASE_URL}/inventory`);
        
        // Should reflect organizational changes
        const organizedBadges = page.locator('[data-testid="organized-badge"]');
        expect(await organizedBadges.count()).toBeGreaterThan(0);
      });
    });

    test('should classify files with AI', async () => {
      const aiPage = new AIPage(page);
      
      await page.goto(`${BASE_URL}/ai`);

      // Step 1: Select files for classification
      await test.step('Select files', async () => {
        await aiPage.clickSelectFiles();
        
        // Should show file selector
        const fileSelector = page.locator('[data-testid="file-selector"]');
        await expect(fileSelector).toBeVisible();
        
        // Select multiple files
        const fileCheckboxes = page.locator('[data-testid="file-checkbox"]');
        const count = Math.min(await fileCheckboxes.count(), 5);
        
        for (let i = 0; i < count; i++) {
          await fileCheckboxes.nth(i).click();
        }
        
        // Confirm selection
        await page.locator('[data-testid="confirm-selection"]').click();
      });

      // Step 2: Configure classification
      await test.step('Configure classification', async () => {
        // Should show classification options
        await expect(aiPage.classificationOptions).toBeVisible();
        
        // Select custom categories
        await page.locator('[data-testid="custom-categories"]').check();
        await page.locator('[data-testid="category-input"]').fill('Invoice,Contract,Receipt');
        
        // Enable content analysis
        await page.locator('[data-testid="include-content"]').check();
      });

      // Step 3: Run classification
      await test.step('Run classification', async () => {
        await page.locator('[data-testid="classify-files"]').click();
        
        // Should show progress
        await expect(page.locator('[data-testid="classification-progress"]')).toBeVisible();
        
        // Wait for completion
        await page.waitForFunction(
          () => document.querySelectorAll('[data-testid="classification-result"]').length > 0,
          { timeout: 45000 }
        );
      });

      // Step 4: Review classification results
      await test.step('Review results', async () => {
        const results = page.locator('[data-testid="classification-result"]');
        const count = await results.count();
        expect(count).toBeGreaterThan(0);
        
        // Each result should have required fields
        for (let i = 0; i < count; i++) {
          const result = results.nth(i);
          await expect(result.locator('[data-testid="file-name"]')).toBeVisible();
          await expect(result.locator('[data-testid="assigned-category"]')).toBeVisible();
          await expect(result.locator('[data-testid="confidence-score"]')).toBeVisible();
          await expect(result.locator('[data-testid="ai-reasoning"]')).toBeVisible();
        }
      });

      // Step 5: Apply classification tags
      await test.step('Apply tags', async () => {
        await page.locator('[data-testid="apply-all-tags"]').click();
        
        // Should show confirmation
        await expect(page.locator('[data-testid="tags-applied"]')).toBeVisible();
        
        // Tags should be visible in inventory
        await page.goto(`${BASE_URL}/inventory`);
        const taggedFiles = page.locator('[data-testid="file-tags"]');
        expect(await taggedFiles.count()).toBeGreaterThan(0);
      });
    });

    test('should handle AI service unavailable gracefully', async () => {
      const aiPage = new AIPage(page);
      
      // Mock AI service unavailable
      await page.route('**/api/ai/**', async route => {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'service_unavailable',
            message: 'AI services are temporarily unavailable'
          })
        });
      });

      await page.goto(`${BASE_URL}/ai`);

      // Should show AI unavailable message
      await expect(page.locator('[data-testid="ai-unavailable"]')).toBeVisible();
      
      // Should suggest fallback options
      await expect(page.locator('[data-testid="manual-organization"]')).toBeVisible();
      
      // Should provide service status link
      await expect(page.locator('[data-testid="ai-status-link"]')).toBeVisible();
    });
  });

  test.describe('Duplicate Detection and Management', () => {
    test.beforeEach(async () => {
      await authenticateTestUser(page);
    });

    test('should detect and resolve duplicates', async () => {
      await page.goto(`${BASE_URL}/duplicates`);

      // Step 1: Start duplicate detection
      await test.step('Start duplicate detection', async () => {
        await page.locator('[data-testid="detect-duplicates"]').click();
        
        // Should show configuration options
        const configDialog = page.locator('[data-testid="duplicate-config"]');
        await expect(configDialog).toBeVisible();
        
        // Configure detection algorithm
        await page.locator('[data-testid="algorithm-select"]').selectOption('combined');
        await page.locator('[data-testid="similarity-threshold"]').fill('0.85');
        
        // Start detection
        await page.locator('[data-testid="start-detection"]').click();
      });

      // Step 2: View duplicate groups
      await test.step('View duplicate results', async () => {
        // Wait for detection to complete
        await page.waitForFunction(
          () => document.querySelectorAll('[data-testid="duplicate-group"]').length > 0,
          { timeout: 30000 }
        );
        
        // Should show duplicate groups
        const duplicateGroups = page.locator('[data-testid="duplicate-group"]');
        const groupCount = await duplicateGroups.count();
        expect(groupCount).toBeGreaterThan(0);
        
        // Should show summary statistics
        await expect(page.locator('[data-testid="duplicates-summary"]')).toBeVisible();
        await expect(page.locator('[data-testid="space-wasted"]')).toContainText(/MB|GB/);
      });

      // Step 3: Review duplicate group details
      await test.step('Review duplicate details', async () => {
        const firstGroup = page.locator('[data-testid="duplicate-group"]').first();
        
        // Should show group metadata
        await expect(firstGroup.locator('[data-testid="similarity-score"]')).toBeVisible();
        await expect(firstGroup.locator('[data-testid="duplicate-type"]')).toBeVisible();
        
        // Should list duplicate files
        const duplicateFiles = firstGroup.locator('[data-testid="duplicate-file"]');
        expect(await duplicateFiles.count()).toBeGreaterThanOrEqual(2);
        
        // Should show AI recommendation
        await expect(firstGroup.locator('[data-testid="ai-recommendation"]')).toBeVisible();
      });

      // Step 4: Resolve duplicates
      await test.step('Resolve duplicates', async () => {
        const firstGroup = page.locator('[data-testid="duplicate-group"]').first();
        
        // Accept AI recommendation
        await firstGroup.locator('[data-testid="accept-recommendation"]').click();
        
        // Should show confirmation dialog
        const confirmDialog = page.locator('[data-testid="confirm-resolution"]');
        await expect(confirmDialog).toBeVisible();
        
        // Confirm resolution
        await confirmDialog.locator('[data-testid="confirm-resolve"]').click();
        
        // Should show progress
        await expect(page.locator('[data-testid="resolution-progress"]')).toBeVisible();
        
        // Should update group status
        await expect(firstGroup.locator('[data-testid="resolved-badge"]')).toBeVisible();
      });

      // Step 5: Verify space recovery
      await test.step('Verify space recovery', async () => {
        // Should update summary statistics
        const spaceRecovered = page.locator('[data-testid="space-recovered"]');
        await expect(spaceRecovered).toContainText(/MB|GB/);
        
        // Should provide undo option
        await expect(page.locator('[data-testid="undo-resolution"]')).toBeVisible();
      });
    });

    test('should handle manual duplicate resolution', async () => {
      await page.goto(`${BASE_URL}/duplicates`);

      // Start detection (mocked to return results immediately)
      await mockDuplicateDetection(page);
      
      await page.locator('[data-testid="detect-duplicates"]').click();
      
      // Wait for results
      await page.waitForSelector('[data-testid="duplicate-group"]');
      
      const firstGroup = page.locator('[data-testid="duplicate-group"]').first();
      
      // Switch to manual mode
      await firstGroup.locator('[data-testid="manual-resolution"]').click();
      
      // Should show manual selection interface
      await expect(firstGroup.locator('[data-testid="manual-selector"]')).toBeVisible();
      
      // Select file to keep
      const filesToKeep = firstGroup.locator('[data-testid="keep-file-checkbox"]');
      await filesToKeep.first().check();
      
      // Apply manual resolution
      await firstGroup.locator('[data-testid="apply-manual-resolution"]').click();
      
      // Should confirm selection
      await expect(page.locator('[data-testid="resolution-confirmed"]')).toBeVisible();
    });
  });

  test.describe('Cross-Browser Compatibility', () => {
    const browsers = [
      { name: 'chromium', engine: chromium },
      { name: 'firefox', engine: firefox },
      { name: 'webkit', engine: webkit }
    ];

    browsers.forEach(({ name, engine }) => {
      test(`should work correctly in ${name}`, async () => {
        const testBrowser = await engine.launch({ 
          headless: process.env.CI === 'true' 
        });
        const testContext = await testBrowser.newContext();
        const testPage = await testContext.newPage();

        try {
          // Test basic functionality
          await testPage.goto(BASE_URL);
          await expect(testPage).toHaveTitle(/DriveMind/);
          
          // Test responsive design
          await testPage.setViewportSize({ width: 320, height: 568 }); // Mobile
          await expect(testPage.locator('[data-testid="mobile-menu"]')).toBeVisible();
          
          await testPage.setViewportSize({ width: 1280, height: 720 }); // Desktop
          await expect(testPage.locator('[data-testid="desktop-nav"]')).toBeVisible();
          
          // Test authentication flow
          await authenticateTestUser(testPage);
          await testPage.goto(`${BASE_URL}/dashboard`);
          await expect(testPage.locator('[data-testid="dashboard-content"]')).toBeVisible();
          
        } finally {
          await testContext.close();
          await testBrowser.close();
        }
      });
    });
  });

  test.describe('Performance and Accessibility', () => {
    test('should meet performance benchmarks', async () => {
      // Navigate to dashboard and measure performance
      await authenticateTestUser(page);
      
      const startTime = Date.now();
      await page.goto(`${BASE_URL}/dashboard`);
      await page.waitForLoadState('networkidle');
      const loadTime = Date.now() - startTime;
      
      // Should load within 3 seconds
      expect(loadTime).toBeLessThan(3000);
      
      // Run Lighthouse performance audit
      const performance = await page.evaluate(() => {
        return performance.getEntriesByType('navigation')[0];
      });
      
      // Check key performance metrics
      expect(performance.loadEventEnd - performance.loadEventStart).toBeLessThan(2000);
      expect(performance.domContentLoadedEventEnd - performance.domContentLoadedEventStart).toBeLessThan(1000);
    });

    test('should meet accessibility standards', async () => {
      await page.goto(BASE_URL);
      
      // Inject axe-core for accessibility testing
      await page.addScriptTag({ path: require.resolve('axe-core') });
      
      // Run accessibility audit
      const accessibilityResults = await page.evaluate(() => {
        return axe.run();
      });
      
      // Should have no accessibility violations
      expect(accessibilityResults.violations).toHaveLength(0);
      
      // Test keyboard navigation
      await page.keyboard.press('Tab');
      const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
      expect(['BUTTON', 'A', 'INPUT', 'SELECT']).toContain(focusedElement);
    });

    test('should handle slow network conditions', async () => {
      // Simulate slow 3G network
      await context.route('**/*', async (route) => {
        await new Promise(resolve => setTimeout(resolve, 200)); // Add 200ms delay
        await route.continue();
      });

      await authenticateTestUser(page);
      await page.goto(`${BASE_URL}/dashboard`);
      
      // Should show loading states appropriately
      await expect(page.locator('[data-testid="loading-skeleton"]')).toBeVisible();
      
      // Should eventually load content
      await page.waitForSelector('[data-testid="dashboard-content"]', { timeout: 15000 });
      await expect(page.locator('[data-testid="loading-skeleton"]')).not.toBeVisible();
    });
  });

  // Helper functions
  async function authenticateTestUser(page: Page) {
    // Mock authentication for test environment
    if (process.env.NODE_ENV === 'test') {
      await page.addInitScript(() => {
        window.localStorage.setItem('test-auth-token', 'mock-firebase-token');
        window.localStorage.setItem('test-user-id', 'test-user-123');
      });
      
      // Mock auth API responses
      await page.route('**/api/auth/drive/status', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            authenticated: true,
            hasValidToken: true,
            tokenExpiry: new Date(Date.now() + 3600000).toISOString(),
            scopes: ['https://www.googleapis.com/auth/drive']
          })
        });
      });
    } else {
      // Use real OAuth flow in staging/production
      const authFlow = new AuthFlow(page);
      await page.goto(`${BASE_URL}`);
      await page.locator('[data-testid="get-started"]').click();
      await authFlow.completeOAuthReal(TEST_USER_EMAIL, TEST_USER_PASSWORD);
    }
  }

  async function enableAIMode(page: Page) {
    await page.evaluate(() => {
      window.localStorage.setItem('ai-mode-enabled', 'true');
    });
  }

  async function mockExternalServices(page: Page) {
    // Mock Google Drive API responses
    await page.route('**/api/workflows/**', async route => {
      const url = route.request().url();
      
      if (url.includes('/scan')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            scanId: 'mock-scan-123',
            totalFiles: 150,
            totalSize: 1024000000,
            filesByType: { PDF: 50, Image: 30, Document: 70 },
            folderDepth: 5,
            duplicateFiles: 12,
            completedAt: new Date().toISOString(),
            processingTime: 45.2
          })
        });
      }
      
      if (url.includes('/duplicates')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            duplicateGroups: [
              {
                groupId: 'group-1',
                files: [
                  { id: 'file1', name: 'Document.pdf', size: 1024000 },
                  { id: 'file2', name: 'Document_copy.pdf', size: 1024000 }
                ],
                duplicateType: 'exact_match',
                similarityScore: 1.0,
                recommendation: 'keep_newest'
              }
            ],
            summary: {
              totalFiles: 150,
              duplicateFiles: 12,
              spaceWasted: 24000000,
              duplicateGroups: 6
            }
          })
        });
      }
    });

    // Mock AI API responses
    await page.route('**/api/ai/**', async route => {
      const url = route.request().url();
      
      if (url.includes('/classify')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            classifications: [
              {
                fileId: 'file1',
                fileName: 'Invoice_2024.pdf',
                category: 'Invoice',
                confidence: 0.95,
                tags: ['finance', 'document', '2024'],
                reasoning: 'Document contains invoice-related content including amounts, dates, and vendor information'
              }
            ]
          })
        });
      }
      
      if (url.includes('/health-check')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'healthy',
            services: {
              gemini: {
                status: 'operational',
                latency: 250,
                quotaRemaining: 1000
              }
            }
          })
        });
      }
    });
  }

  async function mockDuplicateDetection(page: Page) {
    await page.route('**/api/workflows/duplicates', async route => {
      // Add realistic delay for detection process
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          duplicateGroups: [
            {
              groupId: 'group-1',
              files: [
                { 
                  id: 'file1', 
                  name: 'Annual_Report_2024.pdf', 
                  size: 2048000,
                  lastModified: '2024-12-01T10:00:00Z',
                  path: ['Documents', 'Reports']
                },
                { 
                  id: 'file2', 
                  name: 'Annual Report 2024 (1).pdf', 
                  size: 2048000,
                  lastModified: '2024-12-01T10:05:00Z',
                  path: ['Downloads']
                }
              ],
              duplicateType: 'content_hash',
              similarityScore: 1.0,
              recommendation: 'keep_newest',
              spaceWasted: 2048000
            }
          ],
          summary: {
            totalFiles: 150,
            duplicateFiles: 8,
            spaceWasted: 16000000,
            duplicateGroups: 4
          }
        })
      });
    });
  }
});