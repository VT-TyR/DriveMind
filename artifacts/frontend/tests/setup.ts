/**
 * Test setup configuration
 * Implements ALPHA-CODENAME v1.4 testing standards
 */

import { beforeAll, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock environment variables
vi.stubEnv('NODE_ENV', 'test');
vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000');
vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'test-client-id');
vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', 'test-client-secret');

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    href: 'http://localhost:3000/',
    origin: 'http://localhost:3000',
    pathname: '/',
    search: '',
    hash: '',
  },
  writable: true,
});

// Mock navigator
Object.defineProperty(window, 'navigator', {
  value: {
    userAgent: 'Mozilla/5.0 (Node.js) Test Environment',
    language: 'en-US',
    onLine: true,
  },
  writable: true,
});

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock sessionStorage
const sessionStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock,
});

// Mock IntersectionObserver
class IntersectionObserverMock {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}
Object.defineProperty(window, 'IntersectionObserver', {
  value: IntersectionObserverMock,
  writable: true,
});

// Mock ResizeObserver
class ResizeObserverMock {
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}
Object.defineProperty(window, 'ResizeObserver', {
  value: ResizeObserverMock,
  writable: true,
});

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
  writable: true,
});

// Mock console methods for testing
const originalConsole = { ...console };

beforeAll(() => {
  // Suppress console.error and console.warn in tests unless testing error handling
  global.console = {
    ...console,
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  };
});

// Clean up after each test
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  
  // Reset localStorage and sessionStorage
  localStorageMock.clear();
  sessionStorageMock.clear();
  
  // Reset console
  global.console = originalConsole;
});

// Global test utilities
export const mockUser = {
  uid: 'test-user-123',
  email: 'test@example.com',
  displayName: 'Test User',
  photoURL: null,
  emailVerified: true,
  getIdToken: vi.fn().mockResolvedValue('mock-id-token'),
};

export const mockFileInfo = {
  id: 'file-123',
  name: 'test-document.pdf',
  type: 'PDF' as const,
  size: 1024000,
  lastModified: '2024-01-15T10:30:00Z',
  path: ['Documents', 'Test'],
  isDuplicate: false,
  vaultScore: 85,
  mimeType: 'application/pdf',
  webViewLink: 'https://drive.google.com/file/d/file-123/view',
};

export const mockScanResult = {
  scanId: 'scan-123',
  totalFiles: 1000,
  totalSize: 1024000000,
  filesByType: {
    Document: 400,
    Image: 300,
    Video: 200,
    Other: 100,
  },
  folderDepth: 5,
  duplicateFiles: 25,
  unusedFiles: 150,
  largestFiles: [mockFileInfo],
  completedAt: '2024-01-15T12:00:00Z',
  processingTime: 120.5,
};

// Test helper to wait for async operations
export const waitForAsync = () => new Promise(resolve => setTimeout(resolve, 0));

// Test helper for creating mock API responses
export const createMockResponse = (data: any, status = 200, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: status === 200 ? 'OK' : 'Error',
  headers: new Headers({
    'content-type': 'application/json',
    ...headers,
  }),
  json: vi.fn().mockResolvedValue(data),
  text: vi.fn().mockResolvedValue(JSON.stringify(data)),
});

// Test helper for mocking fetch responses
export const mockFetchSuccess = (data: any) => {
  (global.fetch as any) = vi.fn().mockResolvedValue(createMockResponse(data));
};

export const mockFetchError = (status: number, error: any) => {
  (global.fetch as any) = vi.fn().mockResolvedValue(createMockResponse(error, status));
};

export const mockFetchNetworkError = () => {
  (global.fetch as any) = vi.fn().mockRejectedValue(new Error('Network error'));
};

// Test helper for creating mock Firebase auth state
export const mockAuthState = (user = mockUser, loading = false) => ({
  user,
  loading,
  authenticated: !!user,
  hasValidDriveToken: !!user,
  tokenExpiry: user ? new Date(Date.now() + 3600000).toISOString() : undefined,
  scopes: user ? ['https://www.googleapis.com/auth/drive'] : [],
});

// Test helper for creating mock operating mode context
export const mockOperatingModeContext = (isAiEnabled = true) => ({
  isAiEnabled,
  toggleAiMode: vi.fn(),
});

// Test helper for creating mock toast context
export const mockToastContext = {
  toast: vi.fn(),
  dismiss: vi.fn(),
  toasts: [],
};

// Error boundary test helper
export class ErrorBoundaryTest extends Error {
  constructor(message = 'Test error boundary') {
    super(message);
    this.name = 'ErrorBoundaryTest';
  }
}

// Async error helper for testing error boundaries
export const throwAsync = async (error: Error) => {
  throw error;
};
