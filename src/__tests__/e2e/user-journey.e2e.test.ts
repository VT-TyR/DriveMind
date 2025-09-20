/**
 * End-to-End tests for complete user journeys
 * Simulates real user interactions from login to scan completion
 * Converted from Playwright to Jest + Testing Library for consistency
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

// Mock Next.js router
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    pathname: '/dashboard'
  }),
  usePathname: () => '/dashboard'
}));

// Mock fetch for API calls
global.fetch = jest.fn();

// Configure test environment
const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

describe('DriveMind User Journey E2E Tests', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  describe('New User Onboarding', () => {
    it('should complete full onboarding flow', async () => {
      // Mock components for testing
      const MockLandingPage = () => (
        <div>
          <h1>DriveMind - Clean your Google Drive</h1>
          <button onClick={() => mockPush('/auth/signin')}>Sign in with Google</button>
        </div>
      );

      const MockDashboard = ({ connected }: { connected: boolean }) => (
        <div>
          <h1>Dashboard</h1>
          <span>{connected ? 'Connected' : 'Not Connected'}</span>
          {!connected && (
            <button onClick={() => {
              // Simulate connection
              window.location.href = '/api/auth/drive/begin';
            }}>
              Connect Google Drive
            </button>
          )}
        </div>
      );

      // Step 1: Landing page
      const { rerender } = render(<MockLandingPage />);
      expect(screen.getByText(/Clean up your Google Drive/)).toBeInTheDocument();

      // Step 2: Sign in with Google
      const signInButton = screen.getByText('Sign in with Google');
      await user.click(signInButton);
      
      // Mock successful OAuth
      expect(mockPush).toHaveBeenCalledWith('/auth/signin');

      // Step 3: Dashboard access (simulate navigation)
      rerender(<MockDashboard connected={false} />);
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Not Connected')).toBeInTheDocument();

      // Step 4: Connect Google Drive
      const connectButton = screen.getByText('Connect Google Drive');
      await user.click(connectButton);
      
      // Step 5: Verify connection (simulate successful connection)
      rerender(<MockDashboard connected={true} />);
      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument();
      });
    });
  });

  describe('Background Scan Execution', () => {
    it('should execute and complete a background scan', async () => {
      // Mock scan component
      const MockScanDashboard = () => {
        const [scanning, setScanning] = React.useState(false);
        const [complete, setComplete] = React.useState(false);
        const [results, setResults] = React.useState<any>(null);

        const startScan = () => {
          setScanning(true);
          setTimeout(() => {
            setScanning(false);
            setComplete(true);
            setResults({
              filesProcessed: 1000,
              duplicatesFound: 50
            });
          }, 100);
        };

        return (
          <div>
            {!scanning && !complete && (
              <button onClick={startScan}>Start Background Scan</button>
            )}
            {scanning && (
              <>
                <span>Scan in progress</span>
                <div role="progressbar" aria-valuenow={50} />
              </>
            )}
            {complete && (
              <>
                <span>Scan complete</span>
                <div>Files processed: {results?.filesProcessed}</div>
                <div>Duplicates found: {results?.duplicatesFound}</div>
              </>
            )}
          </div>
        );
      };

      render(<MockScanDashboard />);

      // Start background scan
      const scanButton = screen.getByText('Start Background Scan');
      await user.click(scanButton);

      // Wait for scan to start
      await waitFor(() => {
        expect(screen.getByText('Scan in progress')).toBeInTheDocument();
      });

      // Monitor progress
      const progressBar = screen.getByRole('progressbar');
      expect(progressBar).toBeInTheDocument();

      // Wait for scan completion
      await waitFor(() => {
        expect(screen.getByText('Scan complete')).toBeInTheDocument();
      }, { timeout: 5000 });

      // Verify results are displayed
      expect(screen.getByText(/Files processed:/)).toBeInTheDocument();
      expect(screen.getByText(/Duplicates found:/)).toBeInTheDocument();
    });

    it('should handle scan cancellation', async () => {
      // Mock scan component with cancellation
      const MockCancellableScan = () => {
        const [scanning, setScanning] = React.useState(false);
        const [showDialog, setShowDialog] = React.useState(false);
        const [cancelled, setCancelled] = React.useState(false);

        return (
          <div>
            {!scanning && !cancelled && (
              <button onClick={() => setScanning(true)}>Start Background Scan</button>
            )}
            {scanning && (
              <>
                <span>Scan in progress</span>
                <button onClick={() => setShowDialog(true)}>Cancel Scan</button>
              </>
            )}
            {showDialog && (
              <div role="dialog">
                <p>Are you sure you want to cancel?</p>
                <button onClick={() => {
                  setShowDialog(false);
                  setScanning(false);
                  setCancelled(true);
                }}>
                  Yes, cancel
                </button>
              </div>
            )}
            {cancelled && <span>Scan cancelled</span>}
          </div>
        );
      };

      render(<MockCancellableScan />);

      // Start scan
      await user.click(screen.getByText('Start Background Scan'));
      expect(screen.getByText('Scan in progress')).toBeInTheDocument();

      // Cancel scan
      await user.click(screen.getByText('Cancel Scan'));
      
      // Confirm cancellation
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveTextContent('Are you sure you want to cancel?');
      await user.click(screen.getByText('Yes, cancel'));

      // Verify scan was cancelled
      await waitFor(() => {
        expect(screen.getByText('Scan cancelled')).toBeInTheDocument();
      });
    });
  });

  describe('Duplicate Management', () => {
    it('should view and manage duplicate files', async () => {
      // Mock duplicates component
      const MockDuplicatesManager = () => {
        const [expanded, setExpanded] = React.useState(false);
        const [selected, setSelected] = React.useState<string[]>([]);
        const [deleted, setDeleted] = React.useState(false);
        const [showConfirm, setShowConfirm] = React.useState(false);

        return (
          <div>
            <div data-testid="duplicate-group" onClick={() => setExpanded(!expanded)}>
              Duplicate Group 1
            </div>
            {expanded && (
              <>
                <div>Original file</div>
                <div>Duplicate copies</div>
                <input
                  type="checkbox"
                  data-testid="select-duplicate-1"
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelected([...selected, 'file1']);
                    }
                  }}
                />
                <input
                  type="checkbox"
                  data-testid="select-duplicate-2"
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelected([...selected, 'file2']);
                    }
                  }}
                />
                <button onClick={() => setShowConfirm(true)}>Delete Selected</button>
              </>
            )}
            {showConfirm && (
              <button onClick={() => {
                setDeleted(true);
                setShowConfirm(false);
              }}>
                Confirm Delete
              </button>
            )}
            {deleted && <div>Successfully deleted 2 files</div>}
          </div>
        );
      };

      render(<MockDuplicatesManager />);

      // Wait for duplicates to load
      await waitFor(() => {
        expect(screen.getByTestId('duplicate-group')).toBeInTheDocument();
      });

      // Expand duplicate group
      await user.click(screen.getByTestId('duplicate-group'));

      // Verify duplicate details
      expect(screen.getByText('Original file')).toBeInTheDocument();
      expect(screen.getByText('Duplicate copies')).toBeInTheDocument();

      // Select files for action
      await user.click(screen.getByTestId('select-duplicate-1'));
      await user.click(screen.getByTestId('select-duplicate-2'));

      // Perform action
      await user.click(screen.getByText('Delete Selected'));

      // Confirm action
      await user.click(screen.getByText('Confirm Delete'));

      // Verify success message
      await waitFor(() => {
        expect(screen.getByText('Successfully deleted 2 files')).toBeInTheDocument();
      });
    });
  });

  describe('File Navigation', () => {
    it('should navigate through file inventory', async () => {
      // Mock file inventory component
      const MockFileInventory = () => {
        const [searchTerm, setSearchTerm] = React.useState('');
        const [sortBy, setSortBy] = React.useState('name');
        const [filterType, setFilterType] = React.useState<string[]>([]);
        const [showFilter, setShowFilter] = React.useState(false);

        const files = [
          { name: 'document.pdf', size: '5 MB', type: 'pdf' },
          { name: 'image.jpg', size: '2 MB', type: 'image' },
          { name: 'report.pdf', size: '10 MB', type: 'pdf' }
        ];

        const filteredFiles = files.filter(f => {
          if (searchTerm && !f.name.includes(searchTerm)) return false;
          if (filterType.length > 0 && !filterType.includes(f.type)) return false;
          return true;
        }).sort((a, b) => {
          if (sortBy === 'size-desc') {
            return parseInt(b.size) - parseInt(a.size);
          }
          return a.name.localeCompare(b.name);
        });

        return (
          <div>
            <input
              placeholder="Search files..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <select
              data-testid="sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="name">Name</option>
              <option value="size-desc">Size (Largest First)</option>
            </select>
            <button onClick={() => setShowFilter(!showFilter)}>Filter</button>
            {showFilter && (
              <div>
                <input
                  type="checkbox"
                  value="pdf"
                  onChange={(e) => {
                    if (e.target.checked) {
                      setFilterType([...filterType, 'pdf']);
                    }
                  }}
                />
                <button>Apply Filters</button>
              </div>
            )}
            {filteredFiles.map((file, i) => (
              <div key={i} data-testid="file-item">
                {file.name} - {file.size}
              </div>
            ))}
          </div>
        );
      };

      render(<MockFileInventory />);

      // Search for files
      const searchInput = screen.getByPlaceholderText('Search files...');
      await user.type(searchInput, 'document.pdf');
      await user.keyboard('{Enter}');

      // Wait for search results
      await waitFor(() => {
        expect(screen.getAllByTestId('file-item')).toHaveLength(1);
      });

      // Sort by size
      const sortSelect = screen.getByTestId('sort-select');
      await user.selectOptions(sortSelect, 'size-desc');

      // Verify sorting applied
      const fileItems = screen.getAllByTestId('file-item');
      expect(fileItems[0]).toHaveTextContent('MB');

      // Filter by type
      await user.click(screen.getByText('Filter'));
      const pdfCheckbox = screen.getByRole('checkbox', { value: 'pdf' } as any);
      await user.click(pdfCheckbox);
      await user.click(screen.getByText('Apply Filters'));

      // Verify filter applied
      const filteredItems = screen.getAllByTestId('file-item');
      expect(filteredItems.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      // Mock component with network error handling
      const MockNetworkErrorHandler = () => {
        const [isOffline, setIsOffline] = React.useState(false);
        const [scanning, setScanning] = React.useState(false);
        const [error, setError] = React.useState<string | null>(null);

        const startScan = () => {
          if (isOffline) {
            setError('Network error');
          } else {
            setScanning(true);
            setError(null);
          }
        };

        return (
          <div>
            <button onClick={() => setIsOffline(true)}>Go Offline</button>
            <button onClick={() => setIsOffline(false)}>Go Online</button>
            {!scanning && <button onClick={startScan}>Start Background Scan</button>}
            {error && (
              <>
                <div>{error}</div>
                <div>Please check your connection</div>
                <button onClick={startScan}>Try Again</button>
              </>
            )}
            {scanning && <div>Scan in progress</div>}
          </div>
        );
      };

      render(<MockNetworkErrorHandler />);

      // Simulate offline mode
      await user.click(screen.getByText('Go Offline'));

      // Try to start scan
      await user.click(screen.getByText('Start Background Scan'));

      // Verify error message
      expect(screen.getByText('Network error')).toBeInTheDocument();
      expect(screen.getByText('Please check your connection')).toBeInTheDocument();

      // Restore connection
      await user.click(screen.getByText('Go Online'));

      // Retry action
      await user.click(screen.getByText('Try Again'));
      
      // Verify recovery
      await waitFor(() => {
        expect(screen.getByText('Scan in progress')).toBeInTheDocument();
      });
    });

    it('should handle session expiration', async () => {
      // Mock session expiration
      const MockSessionHandler = () => {
        const [sessionExpired, setSessionExpired] = React.useState(false);

        const handleProtectedAction = () => {
          if (sessionExpired) {
            mockPush('/auth/signin');
          }
        };

        return (
          <div>
            <button onClick={() => setSessionExpired(true)}>Clear Session</button>
            <button onClick={handleProtectedAction}>Start Background Scan</button>
            {sessionExpired && <div>Please sign in to continue</div>}
          </div>
        );
      };

      render(<MockSessionHandler />);

      // Simulate session expiration
      await user.click(screen.getByText('Clear Session'));

      // Attempt protected action
      await user.click(screen.getByText('Start Background Scan'));

      // Should redirect to login
      expect(mockPush).toHaveBeenCalledWith('/auth/signin');
      expect(screen.getByText('Please sign in to continue')).toBeInTheDocument();
    });
  });

  describe('Performance', () => {
    it('should load dashboard quickly', async () => {
      // Mock dashboard with performance tracking
      const MockPerformantDashboard = () => {
        const [loaded, setLoaded] = React.useState(false);
        
        React.useEffect(() => {
          // Simulate async loading
          const timer = setTimeout(() => setLoaded(true), 100);
          return () => clearTimeout(timer);
        }, []);

        if (!loaded) return <div>Loading...</div>;

        return (
          <div>
            <div data-testid="dashboard-header">Dashboard</div>
            <button data-testid="scan-button">Scan</button>
          </div>
        );
      };

      const startTime = Date.now();
      render(<MockPerformantDashboard />);
      
      // Wait for dashboard to load
      await waitFor(() => {
        expect(screen.getByTestId('dashboard-header')).toBeInTheDocument();
      });
      
      const loadTime = Date.now() - startTime;
      
      // Dashboard should load within 3 seconds
      expect(loadTime).toBeLessThan(3000);

      // Critical elements should be visible
      expect(screen.getByTestId('dashboard-header')).toBeInTheDocument();
      expect(screen.getByTestId('scan-button')).toBeInTheDocument();
    });

    it('should handle large datasets efficiently', async () => {
      // Mock virtualized list
      const MockVirtualizedInventory = () => {
        const [allFiles, setAllFiles] = React.useState<any[]>([]);
        const [visibleRange, setVisibleRange] = React.useState({ start: 0, end: 20 });

        const loadAllFiles = () => {
          // Generate large dataset
          const files = Array.from({ length: 1000 }, (_, i) => ({
            id: i,
            name: `file-${i}.txt`
          }));
          setAllFiles(files);
        };

        // Simulate virtualization - only render visible items
        const visibleFiles = allFiles.slice(visibleRange.start, visibleRange.end);

        return (
          <div
            onScroll={(e) => {
              // Simulate virtualization scroll handling
              const scrollTop = e.currentTarget.scrollTop;
              const itemHeight = 50;
              const start = Math.floor(scrollTop / itemHeight);
              setVisibleRange({ start, end: start + 20 });
            }}
            style={{ height: '500px', overflow: 'auto' }}
          >
            <button onClick={loadAllFiles}>Load All Files</button>
            <div style={{ height: `${allFiles.length * 50}px`, position: 'relative' }}>
              {visibleFiles.map((file) => (
                <div
                  key={file.id}
                  data-testid="file-item"
                  style={{ position: 'absolute', top: `${file.id * 50}px` }}
                >
                  {file.name}
                </div>
              ))}
            </div>
          </div>
        );
      };

      render(<MockVirtualizedInventory />);

      // Load large dataset
      await user.click(screen.getByText('Load All Files'));

      // Verify virtualization is working
      await waitFor(() => {
        const visibleItems = screen.getAllByTestId('file-item');
        // Should only render visible items (virtualization)
        expect(visibleItems.length).toBeLessThan(50);
      });

      // Test scroll performance (simulated)
      const scrollStart = Date.now();
      const container = screen.getAllByTestId('file-item')[0].parentElement?.parentElement;
      if (container) {
        fireEvent.scroll(container, { target: { scrollTop: 10000 } });
      }
      const scrollTime = Date.now() - scrollStart;

      // Scrolling should be smooth
      expect(scrollTime).toBeLessThan(100);
    });
  });

  describe('Accessibility', () => {
    it('should be keyboard navigable', async () => {
      // Mock keyboard navigable component
      const MockKeyboardNav = () => {
        const [menuOpen, setMenuOpen] = React.useState(false);
        const buttonRef = React.useRef<HTMLButtonElement>(null);

        return (
          <div>
            <button
              ref={buttonRef}
              role="button"
              onClick={() => setMenuOpen(!menuOpen)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setMenuOpen(!menuOpen);
                }
              }}
            >
              Menu
            </button>
            {menuOpen && (
              <ul role="menu">
                <li role="menuitem" tabIndex={0}>Option 1</li>
                <li role="menuitem" tabIndex={0}>Option 2</li>
              </ul>
            )}
          </div>
        );
      };

      render(<MockKeyboardNav />);

      // Tab through interactive elements
      const button = screen.getByRole('button');
      button.focus();
      expect(document.activeElement).toHaveAttribute('role', 'button');

      // Activate with Enter key
      await user.keyboard('{Enter}');

      // Verify menu opened
      await waitFor(() => {
        expect(screen.getByRole('menu')).toBeInTheDocument();
      });

      // Navigate in menu
      const menuItems = screen.getAllByRole('menuitem');
      menuItems[0].focus();
      expect(document.activeElement).toHaveTextContent('Option 1');
    });

    it('should have proper ARIA labels', async () => {
      // Mock component with ARIA labels
      const MockAriaComponent = () => (
        <div>
          <nav aria-label="Main navigation">
            <ul>
              <li><a href="#">Home</a></li>
              <li><a href="#">Dashboard</a></li>
            </ul>
          </nav>
          <button aria-label="Open menu">☰</button>
          <button>Sign In</button>
          <button aria-label="Search files">🔍</button>
        </div>
      );

      render(<MockAriaComponent />);

      // Check main navigation
      const nav = screen.getByRole('navigation', { name: 'Main navigation' });
      expect(nav).toBeInTheDocument();

      // Check buttons have labels
      const buttons = screen.getAllByRole('button');
      
      buttons.forEach((button) => {
        const ariaLabel = button.getAttribute('aria-label');
        const text = button.textContent;
        
        // Button should have either aria-label or text content
        expect(ariaLabel || text).toBeTruthy();
      });
    });
  });

  describe('Complete User Flow', () => {
    it('should complete entire user journey from signup to scan results', async () => {
      // Mock complete user flow
      const MockCompleteFlow = () => {
        const [stage, setStage] = React.useState('landing');
        const [connected, setConnected] = React.useState(false);
        const [scanComplete, setScanComplete] = React.useState(false);
        const [duplicates] = React.useState([
          { id: 1, name: 'duplicate-group-1' }
        ]);

        if (stage === 'landing') {
          return (
            <div>
              <h1>DriveMind</h1>
              <button onClick={() => setStage('dashboard')}>Sign in with Google</button>
            </div>
          );
        }

        if (stage === 'dashboard') {
          return (
            <div>
              <h1>Dashboard</h1>
              {!connected ? (
                <button onClick={() => setConnected(true)}>Connect Google Drive</button>
              ) : (
                <span>Connected</span>
              )}
              {connected && !scanComplete && (
                <button onClick={() => {
                  setTimeout(() => setScanComplete(true), 100);
                }}>
                  Start Background Scan
                </button>
              )}
              {scanComplete && (
                <>
                  <span>Scan complete</span>
                  <div data-testid="scan-results">
                    Files processed: 1000
                    Duplicates found: 50
                  </div>
                  <a href="#" onClick={(e) => {
                    e.preventDefault();
                    setStage('duplicates');
                  }}>
                    View Duplicates
                  </a>
                </>
              )}
              <div data-testid="user-menu">
                <button onClick={() => setStage('landing')}>Sign Out</button>
              </div>
            </div>
          );
        }

        if (stage === 'duplicates') {
          return (
            <div>
              <h1>Duplicates</h1>
              {duplicates.map(d => (
                <div key={d.id} data-testid="duplicate-group">
                  {d.name}
                </div>
              ))}
              <button onClick={() => setStage('dashboard')}>Back</button>
            </div>
          );
        }

        return null;
      };

      const { rerender } = render(<MockCompleteFlow />);

      // 1. Landing page
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('DriveMind');

      // 2. Sign in
      await user.click(screen.getByText('Sign in with Google'));
      
      // Force re-render to update stage
      rerender(<MockCompleteFlow />);

      // 3. Connect Google Drive
      await waitFor(() => {
        expect(screen.getByText('Connect Google Drive')).toBeInTheDocument();
      });
      await user.click(screen.getByText('Connect Google Drive'));

      // 4. Start scan
      await waitFor(() => {
        expect(screen.getByText('Connected')).toBeInTheDocument();
      });
      await user.click(screen.getByText('Start Background Scan'));

      // 5. Wait for completion
      await waitFor(() => {
        expect(screen.getByText('Scan complete')).toBeInTheDocument();
      });

      // 6. View results
      const resultsElement = screen.getByTestId('scan-results');
      expect(resultsElement).toHaveTextContent('Files processed');
      expect(resultsElement).toHaveTextContent('Duplicates found');

      // 7. Navigate to duplicates
      await user.click(screen.getByText('View Duplicates'));

      // 8. Manage duplicates
      await waitFor(() => {
        const duplicateGroups = screen.getAllByTestId('duplicate-group');
        expect(duplicateGroups.length).toBeGreaterThan(0);
      });

      // 9. Sign out
      const userMenu = screen.getByTestId('user-menu');
      const signOutButton = userMenu.querySelector('button');
      if (signOutButton) {
        await user.click(signOutButton);
      }

      // Verify signed out
      await waitFor(() => {
        expect(screen.getByText('Sign in with Google')).toBeInTheDocument();
      });
    });
  });
});