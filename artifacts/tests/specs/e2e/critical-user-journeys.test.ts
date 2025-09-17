/**
 * Critical User Journey End-to-End Tests
 * Tests complete user workflows from authentication through file operations
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';

// Test configuration
const APP_URL = process.env.APP_URL || 'https://studio--drivemind-q69b7.us-central1.hosted.app';
const TEST_TIMEOUT = 30000;

test.describe('Critical User Journeys', () => {
  let page: Page;
  let context: BrowserContext;

  test.beforeEach(async ({ browser }) => {
    context = await browser.newContext();
    page = await context.newPage();
    
    // Set longer timeout for E2E tests
    test.setTimeout(TEST_TIMEOUT);
    
    // Mock network responses for testing
    await page.route('**/api/health', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'healthy',
          version: '1.0.0',
          dependencies: {
            firebase: { status: 'healthy' },
            google_auth: { status: 'healthy' },
            database: { status: 'healthy' }
          }
        })
      });
    });
  });

  test.afterEach(async () => {
    await context.close();
  });

  test.describe('Authentication Flow', () => {
    test('should complete OAuth flow successfully', async () => {
      // Navigate to application
      await page.goto(APP_URL);
      
      // Should show landing page with sign-in option
      await expect(page.locator('h1')).toContainText('DriveMind');
      
      // Find and click sign-in button
      const signInButton = page.locator('button:has-text("Sign in with Google")');
      await expect(signInButton).toBeVisible();
      
      // Mock OAuth flow
      await page.route('**/api/auth/drive/begin', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            url: 'https://accounts.google.com/oauth/authorize?mock=true'
          })
        });
      });
      
      // Mock successful OAuth callback
      await page.route('**/api/auth/drive/callback*', async route => {
        await route.fulfill({
          status: 302,
          headers: {
            'Location': '/dashboard'
          }
        });
      });
      
      // Mock auth status
      await page.route('**/api/auth/drive/status', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            authenticated: true,
            user: {
              id: 'test-user-123',
              email: 'test@example.com',
              name: 'Test User'
            }
          })
        });
      });
      
      // Start OAuth flow
      await signInButton.click();
      
      // Should redirect to dashboard after successful auth
      await expect(page).toHaveURL(/.*\/dashboard/);
      await expect(page.locator('h1')).toContainText('Dashboard');
    });

    test('should handle authentication errors gracefully', async () => {
      await page.goto(APP_URL);
      
      // Mock OAuth error
      await page.route('**/api/auth/drive/begin', async route => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Service configuration error'
          })
        });
      });
      
      const signInButton = page.locator('button:has-text("Sign in with Google")');
      await signInButton.click();
      
      // Should show error message
      await expect(page.locator('[role="alert"]')).toContainText('authentication failed');
    });

    test('should maintain session across page reloads', async () => {
      // Setup authenticated session
      await setupAuthenticatedSession(page);
      
      // Navigate to dashboard
      await page.goto(`${APP_URL}/dashboard`);
      await expect(page.locator('h1')).toContainText('Dashboard');
      
      // Reload page
      await page.reload();
      
      // Should still be authenticated
      await expect(page.locator('h1')).toContainText('Dashboard');
      await expect(page).toHaveURL(/.*\/dashboard/);
    });
  });

  test.describe('Drive Scan Workflow', () => {
    test('should initiate and monitor background scan', async () => {
      await setupAuthenticatedSession(page);
      await page.goto(`${APP_URL}/dashboard`);
      
      // Mock scan endpoints
      await page.route('**/api/workflows/background-scan', async route => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              jobId: 'scan-job-123',
              status: 'pending'
            })
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              jobId: 'scan-job-123',
              status: 'running',
              progress: {
                current: 50,
                total: 100,
                percentage: 50,
                currentStep: 'Scanning Documents folder',
                filesProcessed: 125,
                bytesProcessed: 5242880
              }
            })
          });
        }
      });
      
      // Mock SSE stream
      await page.route('**/api/scan/stream*', async route => {
        await route.fulfill({
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
          },
          body: 'data: {"type":"progress","progress":{"percentage":75,"currentStep":"Processing Images"}}\n\n'
        });
      });
      
      // Start scan
      const startScanButton = page.locator('button:has-text("Start Scan")');
      await expect(startScanButton).toBeVisible();
      await startScanButton.click();
      
      // Should show scan progress
      await expect(page.locator('[role="progressbar"]')).toBeVisible();
      await expect(page.locator('text=Scanning')).toBeVisible();
      
      // Should show progress details
      await expect(page.locator('text=50%')).toBeVisible();
      await expect(page.locator('text=125')).toBeVisible(); // Files processed
    });

    test('should handle scan completion and results', async () => {
      await setupAuthenticatedSession(page);
      await page.goto(`${APP_URL}/dashboard`);
      
      // Mock completed scan
      await page.route('**/api/workflows/background-scan', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            jobId: 'scan-job-123',
            status: 'completed',
            results: {
              filesFound: 1250,
              duplicatesDetected: 45,
              storageAnalyzed: '2.3 GB',
              recommendations: 3
            }
          })
        });
      });
      
      // Mock scan completion SSE
      await page.route('**/api/scan/stream*', async route => {
        await route.fulfill({
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream'
          },
          body: 'data: {"type":"complete","results":{"filesFound":1250,"duplicatesDetected":45}}\n\n'
        });
      });
      
      // Should show completion status
      await expect(page.locator('text=Scan Complete')).toBeVisible();
      await expect(page.locator('text=1250 files')).toBeVisible();
      await expect(page.locator('text=45 duplicate')).toBeVisible();
    });

    test('should handle scan errors and recovery', async () => {
      await setupAuthenticatedSession(page);
      await page.goto(`${APP_URL}/dashboard`);
      
      // Mock scan error
      await page.route('**/api/workflows/background-scan', async route => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'Insufficient permissions to access Drive'
            })
          });
        }
      });
      
      const startScanButton = page.locator('button:has-text("Start Scan")');
      await startScanButton.click();
      
      // Should show error message
      await expect(page.locator('[role="alert"]')).toContainText('Insufficient permissions');
      
      // Should allow retry
      await expect(page.locator('button:has-text("Try Again")')).toBeVisible();
    });
  });

  test.describe('File Operations Workflow', () => {
    test('should display file inventory and perform operations', async () => {
      await setupAuthenticatedSession(page);
      await page.goto(`${APP_URL}/inventory`);
      
      // Mock file inventory
      await page.route('**/api/files/inventory', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            files: [
              {
                id: 'file-1',
                name: 'Document.pdf',
                type: 'PDF',
                size: 1024000,
                lastModified: '2024-01-15T10:30:00Z',
                isDuplicate: false,
                path: ['Documents']
              },
              {
                id: 'file-2',
                name: 'Image.jpg',
                type: 'Image',
                size: 512000,
                lastModified: '2024-01-14T15:45:00Z',
                isDuplicate: true,
                path: ['Photos']
              }
            ],
            total: 2,
            hasMore: false
          })
        });
      });
      
      // Should show file list
      await expect(page.locator('text=Document.pdf')).toBeVisible();
      await expect(page.locator('text=Image.jpg')).toBeVisible();
      
      // Should show file metadata
      await expect(page.locator('text=1.0 MB')).toBeVisible(); // Document size
      await expect(page.locator('text=512 KB')).toBeVisible(); // Image size
      
      // Should indicate duplicates
      await expect(page.locator('[data-testid="duplicate-badge"]')).toBeVisible();
    });

    test('should perform file move operation', async () => {
      await setupAuthenticatedSession(page);
      await page.goto(`${APP_URL}/inventory`);
      
      // Setup file inventory
      await mockFileInventory(page);
      
      // Mock move operation
      await page.route('**/api/files/move', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            fileId: 'file-1',
            newPath: ['Archive', 'Documents']
          })
        });
      });
      
      // Select file and open actions menu
      await page.locator('[data-testid="file-row-file-1"]').click();
      await page.locator('button:has-text("Move")').click();
      
      // Should show move dialog
      await expect(page.locator('[role="dialog"]')).toBeVisible();
      await expect(page.locator('text=Move File')).toBeVisible();
      
      // Select destination folder
      await page.locator('input[placeholder="Destination folder"]').fill('Archive/Documents');
      await page.locator('button:has-text("Move File")').click();
      
      // Should show success message
      await expect(page.locator('text=File moved successfully')).toBeVisible();
    });

    test('should handle bulk file operations', async () => {
      await setupAuthenticatedSession(page);
      await page.goto(`${APP_URL}/inventory`);
      
      await mockFileInventory(page);
      
      // Mock bulk operation
      await page.route('**/api/files/bulk', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            processed: 2,
            errors: []
          })
        });
      });
      
      // Select multiple files
      await page.locator('[data-testid="select-file-1"]').check();
      await page.locator('[data-testid="select-file-2"]').check();
      
      // Should show bulk actions
      await expect(page.locator('text=2 files selected')).toBeVisible();
      
      // Perform bulk operation
      await page.locator('button:has-text("Bulk Actions")').click();
      await page.locator('button:has-text("Delete Selected")').click();
      
      // Confirm operation
      await page.locator('button:has-text("Confirm Delete")').click();
      
      // Should show success message
      await expect(page.locator('text=2 files deleted successfully')).toBeVisible();
    });
  });

  test.describe('AI Features Workflow', () => {
    test('should enable AI mode and show recommendations', async () => {
      await setupAuthenticatedSession(page);
      await page.goto(`${APP_URL}/ai`);
      
      // Mock AI health check
      await page.route('**/api/ai/health-check', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'healthy',
            services: {
              gemini: { status: 'available' }
            }
          })
        });
      });
      
      // Mock AI recommendations
      await page.route('**/api/ai/recommendations', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            suggestions: [
              {
                id: 'rec-1',
                type: 'folder_creation',
                title: 'Create Work Documents folder',
                description: 'Group 25 work-related PDF files',
                confidence: 0.9,
                impact: 'high',
                affectedFiles: 25
              }
            ]
          })
        });
      });
      
      // Should show AI interface
      await expect(page.locator('h1')).toContainText('AI Analysis');
      
      // Should show recommendations
      await expect(page.locator('text=Create Work Documents folder')).toBeVisible();
      await expect(page.locator('text=25 work-related PDF files')).toBeVisible();
      await expect(page.locator('text=90% confidence')).toBeVisible();
    });

    test('should handle AI service unavailable', async () => {
      await setupAuthenticatedSession(page);
      await page.goto(`${APP_URL}/ai`);
      
      // Mock AI service unavailable
      await page.route('**/api/ai/health-check', async route => {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            status: 'unhealthy',
            services: {
              gemini: { status: 'unavailable' }
            }
          })
        });
      });
      
      // Should show service unavailable message
      await expect(page.locator('text=AI services unavailable')).toBeVisible();
      await expect(page.locator('button:has-text("Retry")')).toBeVisible();
    });
  });

  test.describe('Error Recovery and Edge Cases', () => {
    test('should handle network disconnection gracefully', async () => {
      await setupAuthenticatedSession(page);
      await page.goto(`${APP_URL}/dashboard`);
      
      // Simulate network failure
      await page.route('**/api/**', async route => {
        await route.abort('failed');
      });
      
      // Try to perform an action
      const startScanButton = page.locator('button:has-text("Start Scan")');
      await startScanButton.click();
      
      // Should show offline message
      await expect(page.locator('text=Connection lost')).toBeVisible();
      await expect(page.locator('button:has-text("Retry")')).toBeVisible();
    });

    test('should handle session expiration', async () => {
      await setupAuthenticatedSession(page);
      await page.goto(`${APP_URL}/dashboard`);
      
      // Mock session expiration
      await page.route('**/api/**', async route => {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'Session expired'
          })
        });
      });
      
      // Try to perform an action
      const startScanButton = page.locator('button:has-text("Start Scan")');
      await startScanButton.click();
      
      // Should redirect to login
      await expect(page).toHaveURL(/.*\/(login|$)/);
      await expect(page.locator('text=Session expired')).toBeVisible();
    });

    test('should handle server errors with retry mechanism', async () => {
      await setupAuthenticatedSession(page);
      await page.goto(`${APP_URL}/dashboard`);
      
      let attemptCount = 0;
      await page.route('**/api/workflows/background-scan', async route => {
        attemptCount++;
        if (attemptCount < 3) {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'Internal server error'
            })
          });
        } else {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              jobId: 'scan-job-123',
              status: 'pending'
            })
          });
        }
      });
      
      // Try to start scan
      const startScanButton = page.locator('button:has-text("Start Scan")');
      await startScanButton.click();
      
      // Should show error initially
      await expect(page.locator('text=Internal server error')).toBeVisible();
      
      // Retry should eventually succeed
      const retryButton = page.locator('button:has-text("Retry")');
      await retryButton.click();
      await retryButton.click(); // Second retry
      
      // Should eventually succeed
      await expect(page.locator('[role="progressbar"]')).toBeVisible();
    });
  });

  test.describe('Cross-Browser Compatibility', () => {
    ['chromium', 'firefox', 'webkit'].forEach(browserName => {
      test(`should work correctly in ${browserName}`, async ({ browser }) => {
        if (browser.browserType().name() !== browserName) {
          test.skip();
        }
        
        await setupAuthenticatedSession(page);
        await page.goto(`${APP_URL}/dashboard`);
        
        // Basic functionality test
        await expect(page.locator('h1')).toContainText('Dashboard');
        await expect(page.locator('button:has-text("Start Scan")')).toBeVisible();
        
        // Navigation test
        await page.locator('a:has-text("AI Analysis")').click();
        await expect(page).toHaveURL(/.*\/ai/);
        await expect(page.locator('h1')).toContainText('AI Analysis');
      });
    });
  });

  test.describe('Performance Validation', () => {
    test('should load pages within performance budget', async () => {
      const startTime = Date.now();
      
      await page.goto(APP_URL);
      
      // Wait for main content to load
      await expect(page.locator('h1')).toBeVisible();
      
      const endTime = Date.now();
      const loadTime = endTime - startTime;
      
      // Should load within 3 seconds
      expect(loadTime).toBeLessThan(3000);
    });

    test('should handle large file lists efficiently', async () => {
      await setupAuthenticatedSession(page);
      
      // Mock large file list
      const largeFileList = Array.from({ length: 1000 }, (_, i) => ({
        id: `file-${i}`,
        name: `File ${i}.pdf`,
        type: 'PDF',
        size: Math.floor(Math.random() * 1000000),
        lastModified: '2024-01-15T10:30:00Z',
        isDuplicate: false,
        path: ['Documents']
      }));
      
      await page.route('**/api/files/inventory', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            files: largeFileList,
            total: largeFileList.length,
            hasMore: false
          })
        });
      });
      
      const startTime = Date.now();
      await page.goto(`${APP_URL}/inventory`);
      
      // Wait for table to render
      await expect(page.locator('table')).toBeVisible();
      await expect(page.locator('text=File 0.pdf')).toBeVisible();
      
      const endTime = Date.now();
      const renderTime = endTime - startTime;
      
      // Should render large lists within reasonable time
      expect(renderTime).toBeLessThan(5000);
    });
  });
});

// Helper functions
async function setupAuthenticatedSession(page: Page) {
  // Mock authenticated state
  await page.route('**/api/auth/drive/status', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        authenticated: true,
        user: {
          id: 'test-user-123',
          email: 'test@example.com',
          name: 'Test User'
        }
      })
    });
  });
  
  // Mock dashboard data
  await page.route('**/api/dashboard/stats', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        totalFiles: 1250,
        storageUsed: '2.3 GB',
        duplicatesFound: 45,
        lastScan: '2024-01-15T10:30:00Z'
      })
    });
  });
}

async function mockFileInventory(page: Page) {
  await page.route('**/api/files/inventory', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        files: [
          {
            id: 'file-1',
            name: 'Document.pdf',
            type: 'PDF',
            size: 1024000,
            lastModified: '2024-01-15T10:30:00Z',
            isDuplicate: false,
            path: ['Documents']
          },
          {
            id: 'file-2',
            name: 'Image.jpg',
            type: 'Image',
            size: 512000,
            lastModified: '2024-01-14T15:45:00Z',
            isDuplicate: true,
            path: ['Photos']
          }
        ],
        total: 2,
        hasMore: false
      })
    });
  });
}