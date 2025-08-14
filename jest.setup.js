import '@testing-library/jest-dom'

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      refresh: jest.fn(),
      pathname: '/',
      query: {},
    }
  },
  useSearchParams() {
    return new URLSearchParams()
  },
  usePathname() {
    return '/'
  },
}))

// Mock Firebase
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(),
  signInWithPopup: jest.fn(),
  signOut: jest.fn(),
  onAuthStateChanged: jest.fn(),
  GoogleAuthProvider: jest.fn(),
}))

jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(),
  collection: jest.fn(),
  doc: jest.fn(),
  getDocs: jest.fn(),
  getDoc: jest.fn(),
  addDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
}))

// Mock Google APIs
jest.mock('googleapis', () => ({
  google: {
    drive: jest.fn(),
    auth: {
      GoogleAuth: jest.fn(),
    },
  },
}))

// Mock logger - simplified to avoid circular dependencies in setup
const mockLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  performanceLog: jest.fn(),
  apiRequest: jest.fn(),
  apiError: jest.fn(),
  fileOperation: jest.fn(),
  fileOperationError: jest.fn(),
  authEvent: jest.fn(),
  authError: jest.fn(),
};

const mockWithTiming = jest.fn((name, fn) => fn());
const mockLogErrorBoundary = jest.fn();

// Set up module mocks
jest.doMock('./src/lib/logger', () => ({
  logger: mockLogger,
  withTiming: mockWithTiming,
  logErrorBoundary: mockLogErrorBoundary,
}));

// Export for test access
global.mockLogger = mockLogger;
global.mockWithTiming = mockWithTiming;
global.mockLogErrorBoundary = mockLogErrorBoundary;

// Mock window APIs
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
})

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
}

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor(cb) {
    this.cb = cb;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Add Blob.text() polyfill for Node.js environment
if (typeof Blob !== 'undefined' && !Blob.prototype.text) {
  Blob.prototype.text = function() {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsText(this);
    });
  };
}

// Mock FileReader for Blob polyfill
global.FileReader = class FileReader {
  readAsText(blob) {
    // Convert blob to text (simplified for testing)
    this.result = blob.constructor.name === 'Blob' ? '[object Blob]' : String(blob);
    setTimeout(() => this.onload && this.onload(), 0);
  }
};