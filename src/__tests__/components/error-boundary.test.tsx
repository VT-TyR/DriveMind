/**
 * Tests for ErrorBoundary component
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary, ErrorFallback, withErrorBoundary } from '@/components/error-boundary';

// Component that throws an error for testing
const ThrowErrorComponent = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div>No error</div>;
};

// Mock the logger
jest.mock('@/lib/logger');

// Mock UI components
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>{children}</button>
  ),
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardHeader: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardTitle: ({ children, ...props }: any) => <h2 {...props}>{children}</h2>,
  CardDescription: ({ children, ...props }: any) => <p {...props}>{children}</p>,
  CardContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardFooter: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));

describe('ErrorBoundary', () => {
  // Suppress console.error during tests
  let originalError: typeof console.error;
  
  beforeAll(() => {
    originalError = console.error;
    console.error = jest.fn();
  });

  afterAll(() => {
    console.error = originalError;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Normal Operation', () => {
    it('should render children when no error occurs', () => {
      render(
        <ErrorBoundary>
          <ThrowErrorComponent shouldThrow={false} />
        </ErrorBoundary>
      );

      expect(screen.getByText('No error')).toBeInTheDocument();
    });

    it('should render custom fallback when provided and no error', () => {
      const customFallback = <div>Custom fallback</div>;
      
      render(
        <ErrorBoundary fallback={customFallback}>
          <ThrowErrorComponent shouldThrow={false} />
        </ErrorBoundary>
      );

      expect(screen.getByText('No error')).toBeInTheDocument();
      expect(screen.queryByText('Custom fallback')).not.toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should render error UI when child component throws', () => {
      render(
        <ErrorBoundary>
          <ThrowErrorComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      expect(screen.getByText(/An unexpected error occurred/)).toBeInTheDocument();
    });

    it('should render custom fallback when error occurs', () => {
      const customFallback = <div>Custom error message</div>;
      
      render(
        <ErrorBoundary fallback={customFallback}>
          <ThrowErrorComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Custom error message')).toBeInTheDocument();
    });

    it('should call onError callback when provided', () => {
      const onErrorMock = jest.fn();
      
      render(
        <ErrorBoundary onError={onErrorMock}>
          <ThrowErrorComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(onErrorMock).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          componentStack: expect.any(String)
        })
      );
    });

    it('should show error details in development mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      render(
        <ErrorBoundary>
          <ThrowErrorComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Error Details')).toBeInTheDocument();

      process.env.NODE_ENV = originalEnv;
    });

    it('should not show error details in production mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      render(
        <ErrorBoundary>
          <ThrowErrorComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.queryByText('Error Details')).not.toBeInTheDocument();

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Recovery Actions', () => {
    it('should reset error state when Try Again is clicked', () => {
      // Component that can be controlled to throw or not
      let shouldThrow = true;
      const ControlledComponent = () => {
        if (shouldThrow) {
          throw new Error('Test error');
        }
        return <div>No error</div>;
      };

      const { rerender } = render(
        <ErrorBoundary>
          <ControlledComponent />
        </ErrorBoundary>
      );

      // Error UI should be visible
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();

      // Change the control variable so component won't throw on retry
      shouldThrow = false;

      // Click Try Again
      fireEvent.click(screen.getByText('Try Again'));

      // The ErrorBoundary should reset and try to render children again
      // Since shouldThrow is now false, it should succeed
      expect(screen.getByText('No error')).toBeInTheDocument();
    });

    it('should provide reload page option', () => {
      // Mock window.location.reload
      const originalReload = window.location.reload;
      window.location.reload = jest.fn();

      render(
        <ErrorBoundary>
          <ThrowErrorComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      fireEvent.click(screen.getByText('Reload Page'));
      expect(window.location.reload).toHaveBeenCalled();

      // Restore original reload
      window.location.reload = originalReload;
    });
  });
});

describe('ErrorFallback', () => {
  it('should render error information', () => {
    const error = new Error('Test fallback error');
    const resetErrorBoundary = jest.fn();

    render(
      <ErrorFallback error={error} resetErrorBoundary={resetErrorBoundary} />
    );

    expect(screen.getByText('Oops! Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Test fallback error')).toBeInTheDocument();
  });

  it('should call resetErrorBoundary when Try Again is clicked', () => {
    const error = new Error('Test fallback error');
    const resetErrorBoundary = jest.fn();

    render(
      <ErrorFallback error={error} resetErrorBoundary={resetErrorBoundary} />
    );

    fireEvent.click(screen.getByText('Try Again'));
    expect(resetErrorBoundary).toHaveBeenCalled();
  });
});

describe('withErrorBoundary HOC', () => {
  const TestComponent = ({ shouldThrow }: { shouldThrow: boolean }) => {
    if (shouldThrow) {
      throw new Error('HOC test error');
    }
    return <div>HOC component working</div>;
  };

  it('should wrap component with error boundary', () => {
    const WrappedComponent = withErrorBoundary(TestComponent);

    render(<WrappedComponent shouldThrow={false} />);

    expect(screen.getByText('HOC component working')).toBeInTheDocument();
  });

  it('should catch errors in wrapped component', () => {
    const WrappedComponent = withErrorBoundary(TestComponent);

    // Suppress console.error for this test since we expect an error
    const originalError = console.error;
    console.error = jest.fn();

    render(<WrappedComponent shouldThrow={true} />);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    // Restore console.error
    console.error = originalError;
  });

  it('should use custom fallback when provided', () => {
    const customFallback = <div>Custom HOC fallback</div>;
    const WrappedComponent = withErrorBoundary(TestComponent, customFallback);

    // Suppress console.error for this test since we expect an error
    const originalError = console.error;
    console.error = jest.fn();

    render(<WrappedComponent shouldThrow={true} />);

    expect(screen.getByText('Custom HOC fallback')).toBeInTheDocument();

    // Restore console.error
    console.error = originalError;
  });

  it('should preserve component display name', () => {
    TestComponent.displayName = 'TestComponent';
    const WrappedComponent = withErrorBoundary(TestComponent);

    expect(WrappedComponent.displayName).toBe('withErrorBoundary(TestComponent)');
  });

  it('should use component name when displayName is not available', () => {
    const WrappedComponent = withErrorBoundary(TestComponent);

    expect(WrappedComponent.displayName).toBe('withErrorBoundary(TestComponent)');
  });
});
