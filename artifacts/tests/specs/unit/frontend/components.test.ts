/**
 * Frontend Component Unit Tests - ALPHA Standards
 * Comprehensive testing of React components with accessibility and responsive design validation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import userEvent from '@testing-library/user-event';

// Component imports
import MainLayout from '../../../../frontend/src/components/layout/main-layout';
import DashboardPage from '../../../../frontend/src/app/dashboard/page';
import AIPage from '../../../../frontend/src/app/ai/page';
import InventoryPage from '../../../../frontend/src/app/inventory/page';
import ErrorBoundary from '../../../../frontend/src/components/error-boundary';
import RouteGuard from '../../../../frontend/src/components/auth/route-guard';

// Context and provider imports
import { AuthProvider } from '../../../../frontend/src/contexts/auth-provider';
import { OperatingModeProvider } from '../../../../frontend/src/contexts/operating-mode-context';

// Test utilities and mocks
import { createMockApiClient } from '../../fixtures/api-client-mock';
import { createMockAuthContext } from '../../fixtures/auth-context-mock';
import { mockFirebaseAuth } from '../../fixtures/firebase-mock';

expect.extend(toHaveNoViolations);

// Mock Next.js router
const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock Firebase
vi.mock('firebase/auth', () => mockFirebaseAuth);

// Mock API client
const mockApiClient = createMockApiClient();
vi.mock('../../../../frontend/src/lib/api-client', () => ({
  default: mockApiClient,
}));

describe('Frontend Components - Unit Tests', () => {
  let user: ReturnType<typeof userEvent.setup>;
  
  beforeEach(() => {
    user = userEvent.setup();
    vi.clearAllMocks();
    
    // Setup viewport for responsive testing
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });
    
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 768,
    });
    
    // Mock matchMedia for responsive hooks
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('MainLayout Component', () => {
    const renderMainLayout = (props = {}) => {
      const defaultProps = {
        children: <div>Test Content</div>,
        ...props,
      };

      return render(
        <AuthProvider>
          <OperatingModeProvider>
            <MainLayout {...defaultProps} />
          </OperatingModeProvider>
        </AuthProvider>
      );
    };

    it('should render layout with navigation and content', () => {
      renderMainLayout();
      
      expect(screen.getByRole('navigation')).toBeInTheDocument();
      expect(screen.getByText('Test Content')).toBeInTheDocument();
      expect(screen.getByRole('main')).toBeInTheDocument();
    });

    it('should display sidebar navigation items', () => {
      renderMainLayout();
      
      const navigation = screen.getByRole('navigation');
      
      expect(within(navigation).getByText('Dashboard')).toBeInTheDocument();
      expect(within(navigation).getByText('AI Analysis')).toBeInTheDocument();
      expect(within(navigation).getByText('File Inventory')).toBeInTheDocument();
      expect(within(navigation).getByText('Duplicates')).toBeInTheDocument();
      expect(within(navigation).getByText('Organize')).toBeInTheDocument();
    });

    it('should handle mobile responsive layout', async () => {
      // Simulate mobile viewport
      window.innerWidth = 640;
      window.matchMedia = vi.fn().mockImplementation(query => ({
        matches: query === '(max-width: 768px)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      renderMainLayout();

      // Should show mobile menu button
      const menuButton = screen.getByRole('button', { name: /menu/i });
      expect(menuButton).toBeInTheDocument();

      // Sidebar should be hidden initially on mobile
      const sidebar = screen.getByRole('navigation');
      expect(sidebar).toHaveClass('hidden', 'md:block');
    });

    it('should toggle mobile sidebar menu', async () => {
      window.innerWidth = 640;
      renderMainLayout();

      const menuButton = screen.getByRole('button', { name: /menu/i });
      
      await user.click(menuButton);
      
      // Sidebar should become visible
      const sidebar = screen.getByRole('navigation');
      expect(sidebar).not.toHaveClass('hidden');
    });

    it('should display operating mode toggle', () => {
      renderMainLayout();
      
      const modeToggle = screen.getByRole('button', { name: /ai mode/i });
      expect(modeToggle).toBeInTheDocument();
    });

    it('should toggle AI mode when clicked', async () => {
      renderMainLayout();
      
      const modeToggle = screen.getByRole('button', { name: /ai mode/i });
      
      await user.click(modeToggle);
      
      // Should trigger mode change (implementation depends on context)
      expect(modeToggle).toHaveAttribute('aria-pressed');
    });

    it('should meet accessibility standards', async () => {
      const { container } = renderMainLayout();
      
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('should have proper ARIA labels and roles', () => {
      renderMainLayout();
      
      expect(screen.getByRole('navigation')).toHaveAttribute('aria-label', 'Main navigation');
      expect(screen.getByRole('main')).toHaveAttribute('aria-label', 'Main content');
      
      // Navigation items should have proper roles
      const navItems = screen.getAllByRole('link');
      expect(navItems.length).toBeGreaterThan(0);
      navItems.forEach(item => {
        expect(item).toHaveAttribute('href');
      });
    });

    it('should support keyboard navigation', async () => {
      renderMainLayout();
      
      const firstNavItem = screen.getByRole('link', { name: 'Dashboard' });
      firstNavItem.focus();
      
      expect(firstNavItem).toHaveFocus();
      
      await user.keyboard('{Tab}');
      
      const nextNavItem = screen.getByRole('link', { name: 'AI Analysis' });
      expect(nextNavItem).toHaveFocus();
    });
  });

  describe('DashboardPage Component', () => {
    const renderDashboardPage = (authContext = createMockAuthContext()) => {
      return render(
        <AuthProvider value={authContext}>
          <OperatingModeProvider>
            <DashboardPage />
          </OperatingModeProvider>
        </AuthProvider>
      );
    };

    it('should render dashboard with authenticated user', () => {
      const authContext = createMockAuthContext({ isAuthenticated: true });
      renderDashboardPage(authContext);
      
      expect(screen.getByRole('heading', { name: /dashboard/i })).toBeInTheDocument();
      expect(screen.getByText(/welcome back/i)).toBeInTheDocument();
    });

    it('should display user statistics cards', () => {
      const authContext = createMockAuthContext({ isAuthenticated: true });
      renderDashboardPage(authContext);
      
      expect(screen.getByText(/total files/i)).toBeInTheDocument();
      expect(screen.getByText(/storage used/i)).toBeInTheDocument();
      expect(screen.getByText(/duplicates found/i)).toBeInTheDocument();
      expect(screen.getByText(/last scan/i)).toBeInTheDocument();
    });

    it('should show recent activity feed', () => {
      const authContext = createMockAuthContext({ isAuthenticated: true });
      renderDashboardPage(authContext);
      
      expect(screen.getByRole('heading', { name: /recent activity/i })).toBeInTheDocument();
    });

    it('should handle loading state', () => {
      mockApiClient.getDashboardStats.mockReturnValue(new Promise(() => {}));
      
      const authContext = createMockAuthContext({ isAuthenticated: true });
      renderDashboardPage(authContext);
      
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    it('should handle error state', async () => {
      mockApiClient.getDashboardStats.mockRejectedValue(new Error('API Error'));
      
      const authContext = createMockAuthContext({ isAuthenticated: true });
      renderDashboardPage(authContext);
      
      await waitFor(() => {
        expect(screen.getByText(/error loading dashboard/i)).toBeInTheDocument();
      });
    });

    it('should trigger scan when button clicked', async () => {
      const authContext = createMockAuthContext({ isAuthenticated: true });
      renderDashboardPage(authContext);
      
      const scanButton = screen.getByRole('button', { name: /start scan/i });
      await user.click(scanButton);
      
      expect(mockApiClient.startBackgroundScan).toHaveBeenCalledWith(
        authContext.user.uid,
        expect.any(Object)
      );
    });

    it('should meet accessibility standards', async () => {
      const authContext = createMockAuthContext({ isAuthenticated: true });
      const { container } = renderDashboardPage(authContext);
      
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('AIPage Component', () => {
    const renderAIPage = (authContext = createMockAuthContext()) => {
      return render(
        <AuthProvider value={authContext}>
          <OperatingModeProvider>
            <AIPage />
          </OperatingModeProvider>
        </AuthProvider>
      );
    };

    it('should render AI analysis interface', () => {
      const authContext = createMockAuthContext({ isAuthenticated: true });
      renderAIPage(authContext);
      
      expect(screen.getByRole('heading', { name: /ai analysis/i })).toBeInTheDocument();
      expect(screen.getByText(/intelligent file organization/i)).toBeInTheDocument();
    });

    it('should show file classification section', () => {
      const authContext = createMockAuthContext({ isAuthenticated: true });
      renderAIPage(authContext);
      
      expect(screen.getByRole('heading', { name: /file classification/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /classify files/i })).toBeInTheDocument();
    });

    it('should display organization suggestions', async () => {
      mockApiClient.getOrganizationSuggestions.mockResolvedValue({
        suggestions: [
          {
            id: '1',
            type: 'folder_creation',
            title: 'Create Documents folder',
            description: 'Organize PDF files into Documents folder',
            confidence: 0.9,
            impact: 'high',
            affectedFiles: 25
          }
        ]
      });

      const authContext = createMockAuthContext({ isAuthenticated: true });
      renderAIPage(authContext);

      await waitFor(() => {
        expect(screen.getByText('Create Documents folder')).toBeInTheDocument();
        expect(screen.getByText('25 files affected')).toBeInTheDocument();
      });
    });

    it('should handle AI service unavailable', async () => {
      mockApiClient.checkAiHealth.mockResolvedValue({
        status: 'unhealthy',
        services: {
          gemini: { status: 'unavailable' }
        }
      });

      const authContext = createMockAuthContext({ isAuthenticated: true });
      renderAIPage(authContext);

      await waitFor(() => {
        expect(screen.getByText(/ai services unavailable/i)).toBeInTheDocument();
      });
    });

    it('should show operating mode disabled message', () => {
      const authContext = createMockAuthContext({ isAuthenticated: true });
      
      render(
        <AuthProvider value={authContext}>
          <OperatingModeProvider value={{ isAiEnabled: false, toggleAiMode: vi.fn() }}>
            <AIPage />
          </OperatingModeProvider>
        </AuthProvider>
      );

      expect(screen.getByText(/ai features disabled/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /enable ai mode/i })).toBeInTheDocument();
    });

    it('should meet accessibility standards', async () => {
      const authContext = createMockAuthContext({ isAuthenticated: true });
      const { container } = renderAIPage(authContext);
      
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe('RouteGuard Component', () => {
    const renderRouteGuard = (props = {}, authContext = createMockAuthContext()) => {
      const defaultProps = {
        children: <div>Protected Content</div>,
        requireAuth: true,
        ...props,
      };

      return render(
        <AuthProvider value={authContext}>
          <RouteGuard {...defaultProps} />
        </AuthProvider>
      );
    };

    it('should render children when authenticated', () => {
      const authContext = createMockAuthContext({ isAuthenticated: true });
      renderRouteGuard({}, authContext);
      
      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });

    it('should redirect when not authenticated', () => {
      const authContext = createMockAuthContext({ isAuthenticated: false });
      renderRouteGuard({}, authContext);
      
      expect(mockPush).toHaveBeenCalledWith('/');
    });

    it('should show loading spinner during auth check', () => {
      const authContext = createMockAuthContext({ isLoading: true });
      renderRouteGuard({}, authContext);
      
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });

    it('should handle admin-only routes', () => {
      const authContext = createMockAuthContext({ 
        isAuthenticated: true,
        user: { uid: 'user123', role: 'user' }
      });
      
      renderRouteGuard({ requireAdmin: true }, authContext);
      
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });

    it('should allow admin access to admin routes', () => {
      const authContext = createMockAuthContext({ 
        isAuthenticated: true,
        user: { uid: 'admin123', role: 'admin' }
      });
      
      renderRouteGuard({ requireAdmin: true }, authContext);
      
      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });
  });

  describe('ErrorBoundary Component', () => {
    const ThrowError = ({ shouldThrow = false }) => {
      if (shouldThrow) {
        throw new Error('Test error');
      }
      return <div>No Error</div>;
    };

    const renderWithErrorBoundary = (shouldThrow = false) => {
      return render(
        <ErrorBoundary>
          <ThrowError shouldThrow={shouldThrow} />
        </ErrorBoundary>
      );
    };

    it('should render children when no error', () => {
      renderWithErrorBoundary(false);
      
      expect(screen.getByText('No Error')).toBeInTheDocument();
    });

    it('should catch and display errors', () => {
      // Suppress console error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      renderWithErrorBoundary(true);
      
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
      
      consoleSpy.mockRestore();
    });

    it('should allow retry after error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const { rerender } = renderWithErrorBoundary(true);
      
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
      
      const retryButton = screen.getByRole('button', { name: /try again/i });
      await user.click(retryButton);
      
      // Simulate component re-render without error
      rerender(
        <ErrorBoundary>
          <ThrowError shouldThrow={false} />
        </ErrorBoundary>
      );
      
      expect(screen.getByText('No Error')).toBeInTheDocument();
      
      consoleSpy.mockRestore();
    });

    it('should meet accessibility standards', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const { container } = renderWithErrorBoundary(true);
      
      const results = await axe(container);
      expect(results).toHaveNoViolations();
      
      consoleSpy.mockRestore();
    });
  });

  describe('Responsive Design Tests', () => {
    const viewports = [
      { name: 'mobile', width: 375, height: 667 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1024, height: 768 },
      { name: 'large', width: 1440, height: 900 },
    ];

    viewports.forEach(({ name, width, height }) => {
      it(`should render correctly on ${name} viewport`, () => {
        // Set viewport dimensions
        window.innerWidth = width;
        window.innerHeight = height;
        
        // Update matchMedia mock
        window.matchMedia = vi.fn().mockImplementation(query => {
          const breakpoints = {
            '(max-width: 640px)': width <= 640,
            '(max-width: 768px)': width <= 768,
            '(max-width: 1024px)': width <= 1024,
          };
          
          return {
            matches: breakpoints[query] || false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
          };
        });

        const authContext = createMockAuthContext({ isAuthenticated: true });
        
        render(
          <AuthProvider value={authContext}>
            <OperatingModeProvider>
              <MainLayout>
                <DashboardPage />
              </MainLayout>
            </OperatingModeProvider>
          </AuthProvider>
        );

        // Basic rendering test - more specific responsive tests would be in component-specific tests
        expect(screen.getByRole('main')).toBeInTheDocument();
        expect(screen.getByRole('navigation')).toBeInTheDocument();
      });
    });
  });

  describe('Performance Tests', () => {
    it('should render large datasets efficiently', async () => {
      // Mock large dataset
      const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
        id: `file-${i}`,
        name: `File ${i}.pdf`,
        size: Math.floor(Math.random() * 1000000),
        type: 'PDF',
        lastModified: new Date().toISOString(),
      }));

      mockApiClient.getFileInventory.mockResolvedValue({
        files: largeDataset,
        total: largeDataset.length,
        hasMore: false,
      });

      const startTime = performance.now();
      
      const authContext = createMockAuthContext({ isAuthenticated: true });
      render(
        <AuthProvider value={authContext}>
          <OperatingModeProvider>
            <InventoryPage />
          </OperatingModeProvider>
        </AuthProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('File 0.pdf')).toBeInTheDocument();
      });

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      // Should render within reasonable time
      expect(renderTime).toBeLessThan(1000); // 1 second
    });
  });
});