import '@testing-library/jest-dom';

// Add TextEncoder/TextDecoder polyfills for Node.js environment
if (typeof TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util');
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}

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
});

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

global.fetch = jest.fn(() =>
  Promise.resolve({
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    ok: true,
    status: 200,
  })
);

global.Response = jest.fn(() => ({}));