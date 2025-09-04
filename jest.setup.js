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

// Mock Lucide React icons
jest.mock('lucide-react', () => ({
  AlertTriangle: 'div',
  CheckCircle: 'div',
  XCircle: 'div',
  Info: 'div',
  Copy: 'div',
  Download: 'div',
  RefreshCw: 'div',
  // Add other icons as needed
}))

// Mock react-hook-form
jest.mock('react-hook-form', () => ({
  useForm: () => ({
    register: jest.fn(),
    handleSubmit: jest.fn(),
    formState: { errors: {} },
    reset: jest.fn(),
    setValue: jest.fn(),
    watch: jest.fn(),
  }),
  Controller: ({ render }) => render({ field: {}, fieldState: {}, formState: {} }),
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

// Mock ReadableStream
global.ReadableStream = class ReadableStream {
  constructor() {}
}

// Enhanced Blob polyfill for Node.js environment
global.Blob = class Blob {
  constructor(blobParts, options) {
    this.blobParts = blobParts || [];
    this.type = options?.type || '';
    this._content = this._buildContent();
  }

  _buildContent() {
    return this.blobParts.map(part => {
      if (typeof part === 'string') return part;
      if (part && typeof part.toString === 'function') return part.toString();
      return '';
    }).join('');
  }

  text() {
    return Promise.resolve(this._content);
  }

  stream() {
    // Mock implementation
    return new ReadableStream();
  }

  arrayBuffer() {
    return Promise.resolve(new ArrayBuffer(this._content.length));
  }

  get size() {
    return this._content.length;
  }
};

// Mock FileReader for Blob polyfill  
global.FileReader = class FileReader {
  readAsText(blob) {
    if (blob && typeof blob.text === 'function') {
      blob.text().then(content => {
        this.result = content;
        if (this.onload) this.onload();
      });
    } else {
      this.result = String(blob);
      setTimeout(() => this.onload && this.onload(), 0);
    }
  }
};