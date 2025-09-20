import '@testing-library/jest-dom'

// Add TextEncoder/TextDecoder polyfills for Node.js environment
if (typeof TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util');
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}

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

// Mock Radix UI components
jest.mock('@radix-ui/react-dropdown-menu', () => ({
  Root: ({ children, ...props }) => <div data-testid="dropdown-root" {...props}>{children}</div>,
  Trigger: ({ children, ...props }) => <div data-testid="dropdown-trigger" {...props}>{children}</div>,
  Content: ({ children, ...props }) => <div data-testid="dropdown-content" {...props}>{children}</div>,
  Item: ({ children, onClick, ...props }) => (
    <button data-testid="dropdown-item" onClick={onClick} {...props}>
      {children}
    </button>
  ),
  Separator: () => <hr data-testid="dropdown-separator" />,
  Portal: ({ children }) => children,
  DropdownMenu: ({ children, ...props }) => <div data-testid="dropdown-menu" {...props}>{children}</div>,
  DropdownMenuTrigger: ({ children, asChild, ...props }) => {
    // If asChild, render the child element with trigger props
    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children, props);
    }
    return <button data-testid="dropdown-menu-trigger" {...props}>{children}</button>;
  },
  DropdownMenuContent: ({ children, ...props }) => (
    <div data-testid="dropdown-menu-content" {...props}>{children}</div>
  ),
  DropdownMenuItem: ({ children, onClick, ...props }) => (
    <button data-testid="dropdown-menu-item" onClick={onClick} {...props}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr data-testid="dropdown-menu-separator" />,
}));

jest.mock('@radix-ui/react-dialog', () => ({
  Root: ({ children, open, ...props }) => open ? <div data-testid="dialog-root" {...props}>{children}</div> : null,
  Trigger: ({ children, ...props }) => <button data-testid="dialog-trigger" {...props}>{children}</button>,
  Portal: ({ children }) => children,
  Overlay: ({ children, ...props }) => <div data-testid="dialog-overlay" {...props}>{children}</div>,
  Content: ({ children, ...props }) => <div data-testid="dialog-content" {...props}>{children}</div>,
  Header: ({ children, ...props }) => <div data-testid="dialog-header" {...props}>{children}</div>,
  Title: ({ children, ...props }) => <h2 data-testid="dialog-title" {...props}>{children}</h2>,
  Description: ({ children, ...props }) => <p data-testid="dialog-description" {...props}>{children}</p>,
  Footer: ({ children, ...props }) => <div data-testid="dialog-footer" {...props}>{children}</div>,
  Close: ({ children, ...props }) => <button data-testid="dialog-close" {...props}>{children}</button>,
  Dialog: ({ children, open, ...props }) => open ? <div data-testid="dialog" {...props}>{children}</div> : null,
  DialogTrigger: ({ children, ...props }) => <button data-testid="dialog-trigger-button" {...props}>{children}</button>,
  DialogContent: ({ children, ...props }) => <div data-testid="dialog-content-wrapper" {...props}>{children}</div>,
  DialogHeader: ({ children, ...props }) => <div data-testid="dialog-header-wrapper" {...props}>{children}</div>,
  DialogTitle: ({ children, ...props }) => <h2 data-testid="dialog-title-wrapper" {...props}>{children}</h2>,
  DialogDescription: ({ children, ...props }) => <p data-testid="dialog-description-wrapper" {...props}>{children}</p>,
  DialogFooter: ({ children, ...props }) => <div data-testid="dialog-footer-wrapper" {...props}>{children}</div>,
}));

// Mock Lucide React icons
jest.mock('lucide-react', () => ({
  __esModule: true, // This is important for ES modules
  AlertTriangle: ({ ...props }) => <div {...props}>AlertTriangle</div>,
  CheckCircle: ({ ...props }) => <div {...props}>CheckCircle</div>,
  XCircle: ({ ...props }) => <div {...props}>XCircle</div>,
  Info: ({ ...props }) => <div {...props}>Info</div>,
  Copy: ({ ...props }) => <div {...props}>Copy</div>,
  Download: ({ ...props }) => <div {...props}>Download</div>,
  RefreshCw: ({ ...props }) => <div {...props}>RefreshCw</div>,
  MoreHorizontal: ({ ...props }) => <div {...props}>MoreHorizontal</div>,
  Edit: ({ ...props }) => <div {...props}>Edit</div>,
  Move: ({ ...props }) => <div {...props}>Move</div>,
  Trash2: ({ ...props }) => <div {...props}>Trash2</div>,
  RotateCcw: ({ ...props }) => <div {...props}>RotateCcw</div>,
  Play: ({ ...props }) => <div {...props}>Play</div>,
  X: ({ ...props }) => <div {...props}>X</div>,
  // Scan Manager icons
  Pause: ({ ...props }) => <div {...props}>Pause</div>,
  AlertCircle: ({ ...props }) => <div {...props}>AlertCircle</div>,
  Clock: ({ ...props }) => <div {...props}>Clock</div>,
  Database: ({ ...props }) => <div {...props}>Database</div>,
  FileSearch: ({ ...props }) => <div {...props}>FileSearch</div>,
  Activity: ({ ...props }) => <div {...props}>Activity</div>,
  // Add other icons as needed
}));

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