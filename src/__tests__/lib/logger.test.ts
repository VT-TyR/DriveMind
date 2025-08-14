/**
 * Tests for the logging system
 */

import { logger, withTiming, logErrorBoundary } from '@/lib/logger';

// Clear mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
  // Restore original console methods for logger tests
  jest.restoreAllMocks();
});

describe('Logger', () => {
  describe('Basic logging methods', () => {
    it('should log debug messages', () => {
      const consoleSpy = jest.spyOn(console, 'debug').mockImplementation();
      
      logger.debug('Test debug message', { component: 'test' });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG]: Test debug message')
      );
    });

    it('should log info messages', () => {
      const consoleSpy = jest.spyOn(console, 'info').mockImplementation();
      
      logger.info('Test info message', { userId: 'user123' });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[INFO]: Test info message')
      );
    });

    it('should log warning messages', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      logger.warn('Test warning message', { component: 'test' });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[WARN]: Test warning message')
      );
    });

    it('should log error messages with stack trace', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const error = new Error('Test error');
      
      logger.error('Test error occurred', error, { component: 'test' });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR]: Test error occurred')
      );
    });
  });

  describe('Specialized logging methods', () => {
    it('should log API requests', () => {
      const consoleSpy = jest.spyOn(console, 'info').mockImplementation();
      
      logger.apiRequest('POST', '/api/files/move', { fileId: 'file123' });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('API POST /api/files/move')
      );
    });

    it('should log API errors', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const error = new Error('API failed');
      
      logger.apiError('POST', '/api/files/move', error, { fileId: 'file123' });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('API POST /api/files/move failed')
      );
    });

    it('should log file operations', () => {
      const consoleSpy = jest.spyOn(console, 'info').mockImplementation();
      
      logger.fileOperation('move', 'file123', 'test.txt', { userId: 'user123' });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('File operation: move')
      );
    });

    it('should log authentication events', () => {
      const consoleSpy = jest.spyOn(console, 'info').mockImplementation();
      
      logger.authEvent('sign_in_success', 'user123', { email: 'test@example.com' });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Auth event: sign_in_success')
      );
    });

    it('should log performance metrics', () => {
      const consoleSpy = jest.spyOn(console, 'info').mockImplementation();
      
      logger.performanceLog('fileUpload', 1500, { fileSize: 1024 });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Performance: fileUpload took 1500ms')
      );
    });
  });

  describe('Context and metadata handling', () => {
    it('should include context in log entries', () => {
      const consoleSpy = jest.spyOn(console, 'info').mockImplementation();
      
      const context = {
        userId: 'user123',
        fileId: 'file456',
        operation: 'delete'
      };
      
      logger.info('File deleted successfully', context);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining(JSON.stringify(context))
      );
    });

    it('should handle null and undefined context gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'info').mockImplementation();
      
      expect(() => {
        logger.info('Message without context');
        logger.info('Message with null context', null as any);
        logger.info('Message with undefined context', undefined);
      }).not.toThrow();
      
      expect(consoleSpy).toHaveBeenCalledTimes(3);
    });
  });
});

describe('withTiming utility', () => {
  it('should measure execution time of sync functions', async () => {
    const consoleSpy = jest.spyOn(console, 'info').mockImplementation();
    
    const mockFn = jest.fn().mockResolvedValue('result');
    
    const result = await withTiming('testOperation', mockFn, { userId: 'user123' });
    
    expect(result).toBe('result');
    expect(mockFn).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Performance: testOperation took')
    );
  });

  it('should handle errors in timed operations', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    const error = new Error('Operation failed');
    
    const mockFn = jest.fn().mockRejectedValue(error);
    
    await expect(
      withTiming('failingOperation', mockFn, { userId: 'user123' })
    ).rejects.toThrow('Operation failed');
    
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Operation failed: failingOperation')
    );
  });
});

describe('logErrorBoundary', () => {
  it('should log React error boundary information', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    
    const error = new Error('Component crashed');
    const errorInfo = {
      componentStack: 'Component stack trace here'
    };
    
    logErrorBoundary(error, errorInfo, 'TestComponent');
    
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('React Error Boundary caught error')
    );
  });
});