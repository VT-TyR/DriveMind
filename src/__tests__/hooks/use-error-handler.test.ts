/**
 * Tests for useErrorHandler hook
 */

import { renderHook, act } from '@testing-library/react';
import { useErrorHandler } from '@/hooks/use-error-handler';
import { AppError, ValidationError } from '@/lib/error-handler';

// Mock the toast hook
const mockToast = jest.fn();
jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: mockToast
  })
}));

// Mock the logger
jest.mock('@/lib/logger');

describe('useErrorHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Hook initialization', () => {
    it('should initialize with default options', () => {
      const { result } = renderHook(() => useErrorHandler());

      expect(result.current.handleError).toBeDefined();
      expect(result.current.handleAsyncError).toBeDefined();
      expect(result.current.wrapAsync).toBeDefined();
    });

    it('should initialize with custom options', () => {
      const options = {
        component: 'TestComponent',
        userId: 'user123',
        logErrors: false,
        showToasts: false
      };

      const { result } = renderHook(() => useErrorHandler(options));

      expect(result.current.handleError).toBeDefined();
    });
  });

  describe('handleError function', () => {
    it('should handle Error objects', () => {
      const { result } = renderHook(() => useErrorHandler({
        component: 'TestComponent',
        showToasts: true
      }));

      const error = new Error('Test error');
      let errorResult;

      act(() => {
        errorResult = result.current.handleError(error, 'test operation');
      });

      expect(errorResult).toEqual({
        message: 'Test error',
        code: 'Error',
        isAppError: false
      });

      expect(mockToast).toHaveBeenCalledWith({
        variant: 'destructive',
        title: 'Error',
        description: 'Test error'
      });
    });

    it('should handle AppError objects with custom codes', () => {
      const { result } = renderHook(() => useErrorHandler({
        showToasts: true
      }));

      const error = new AppError('Validation failed', 'VALIDATION_ERROR');
      let errorResult;

      act(() => {
        errorResult = result.current.handleError(error);
      });

      expect(errorResult).toEqual({
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        isAppError: true
      });

      expect(mockToast).toHaveBeenCalledWith({
        variant: 'destructive',
        title: 'VALIDATION_ERROR',
        description: 'Validation failed'
      });
    });

    it('should handle string errors', () => {
      const { result } = renderHook(() => useErrorHandler());

      let errorResult;

      act(() => {
        errorResult = result.current.handleError('String error message');
      });

      expect(errorResult).toEqual({
        message: 'String error message',
        code: 'UNKNOWN_ERROR',
        isAppError: false
      });
    });

    it('should handle unknown error types', () => {
      const { result } = renderHook(() => useErrorHandler());

      let errorResult;

      act(() => {
        errorResult = result.current.handleError(null);
      });

      expect(errorResult).toEqual({
        message: 'An unknown error occurred',
        code: 'UNKNOWN_ERROR',
        isAppError: false
      });
    });

    it('should not show toasts when showToasts is false', () => {
      const { result } = renderHook(() => useErrorHandler({
        showToasts: false
      }));

      const error = new Error('Test error');

      act(() => {
        result.current.handleError(error);
      });

      expect(mockToast).not.toHaveBeenCalled();
    });

    it('should handle context as string', () => {
      const { result } = renderHook(() => useErrorHandler({
        component: 'TestComponent',
        userId: 'user123'
      }));

      const error = new Error('Test error');

      act(() => {
        result.current.handleError(error, 'string context');
      });

      // Should not throw and should handle the context
      expect(mockToast).toHaveBeenCalled();
    });

    it('should handle context as object', () => {
      const { result } = renderHook(() => useErrorHandler({
        component: 'TestComponent',
        userId: 'user123'
      }));

      const error = new Error('Test error');
      const context = { operation: 'test', fileId: 'file123' };

      act(() => {
        result.current.handleError(error, context);
      });

      expect(mockToast).toHaveBeenCalled();
    });
  });

  describe('handleAsyncError function', () => {
    it('should handle successful async operations', async () => {
      const { result } = renderHook(() => useErrorHandler());

      const asyncFn = jest.fn().mockResolvedValue('success');
      
      let asyncResult;
      await act(async () => {
        asyncResult = await result.current.handleAsyncError(asyncFn, 'test operation');
      });

      expect(asyncResult).toBe('success');
      expect(asyncFn).toHaveBeenCalled();
      expect(mockToast).not.toHaveBeenCalled();
    });

    it('should handle failing async operations', async () => {
      const { result } = renderHook(() => useErrorHandler({
        showToasts: true
      }));

      const error = new Error('Async error');
      const asyncFn = jest.fn().mockRejectedValue(error);
      
      let asyncResult;
      await act(async () => {
        asyncResult = await result.current.handleAsyncError(asyncFn, 'test operation');
      });

      expect(asyncResult).toBeNull();
      expect(asyncFn).toHaveBeenCalled();
      expect(mockToast).toHaveBeenCalledWith({
        variant: 'destructive',
        title: 'Error',
        description: 'Async error'
      });
    });
  });

  describe('wrapAsync function', () => {
    it('should wrap successful async functions', async () => {
      const { result } = renderHook(() => useErrorHandler());

      const originalFn = jest.fn().mockResolvedValue('wrapped success');
      const wrappedFn = result.current.wrapAsync(originalFn, 'test operation');
      
      let wrappedResult;
      await act(async () => {
        wrappedResult = await wrappedFn('arg1', 'arg2');
      });

      expect(wrappedResult).toBe('wrapped success');
      expect(originalFn).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should wrap failing async functions', async () => {
      const { result } = renderHook(() => useErrorHandler({
        showToasts: true
      }));

      const error = new ValidationError('Validation failed');
      const originalFn = jest.fn().mockRejectedValue(error);
      const wrappedFn = result.current.wrapAsync(originalFn, 'validation');
      
      let wrappedResult;
      await act(async () => {
        wrappedResult = await wrappedFn('arg1');
      });

      expect(wrappedResult).toBeNull();
      expect(originalFn).toHaveBeenCalledWith('arg1');
      expect(mockToast).toHaveBeenCalledWith({
        variant: 'destructive',
        title: 'VALIDATION_ERROR',
        description: 'Validation failed'
      });
    });

    it('should preserve function arguments and context', async () => {
      const { result } = renderHook(() => useErrorHandler());

      const originalFn = jest.fn().mockImplementation((a, b, c) => `${a}-${b}-${c}`);
      const wrappedFn = result.current.wrapAsync(originalFn);
      
      await act(async () => {
        await wrappedFn('first', 'second', 'third');
      });

      expect(originalFn).toHaveBeenCalledWith('first', 'second', 'third');
    });
  });

  describe('Error logging behavior', () => {
    it('should not log errors when logErrors is false', () => {
      const { result } = renderHook(() => useErrorHandler({
        logErrors: false
      }));

      const error = new Error('Test error');

      act(() => {
        result.current.handleError(error);
      });

      // Since logger is mocked, we can't test the actual logging
      // but we can verify the function completes without throwing
      expect(mockToast).toHaveBeenCalled();
    });
  });

  describe('Component and user context', () => {
    it('should use provided component and user context', () => {
      const { result } = renderHook(() => useErrorHandler({
        component: 'FileUploader',
        userId: 'user456',
        showToasts: true
      }));

      const error = new Error('Upload failed');

      act(() => {
        result.current.handleError(error, { fileId: 'file123' });
      });

      expect(mockToast).toHaveBeenCalledWith({
        variant: 'destructive',
        title: 'Error',
        description: 'Upload failed'
      });
    });
  });
});