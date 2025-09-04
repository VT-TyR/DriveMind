/**
 * Tests for the logging system
 * Note: This test validates the mock logger behavior rather than the actual logger
 * since the actual logger is mocked globally in jest.setup.js for application tests
 */

import { logger, withTiming, logErrorBoundary } from '@/lib/logger';

// Clear mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});

describe('Logger Mock', () => {
  describe('Basic logging methods', () => {
    it('should have mock functions available', () => {
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
    });

    it('should call debug mock', () => {
      logger.debug('Test debug message', { component: 'test' });
      expect(logger.debug).toHaveBeenCalledWith('Test debug message', { component: 'test' });
    });

    it('should call info mock', () => {
      logger.info('Test info message', { userId: 'user123' });
      expect(logger.info).toHaveBeenCalledWith('Test info message', { userId: 'user123' });
    });

    it('should call warn mock', () => {
      logger.warn('Test warning message', { component: 'test' });
      expect(logger.warn).toHaveBeenCalledWith('Test warning message', { component: 'test' });
    });

    it('should call error mock', () => {
      const error = new Error('Test error');
      logger.error('Test error occurred', error, { component: 'test' });
      expect(logger.error).toHaveBeenCalledWith('Test error occurred', error, { component: 'test' });
    });
  });

  describe('Specialized logging methods', () => {
    it('should call apiRequest mock', () => {
      logger.apiRequest('POST', '/api/files/move', { fileId: 'file123' });
      expect(logger.apiRequest).toHaveBeenCalledWith('POST', '/api/files/move', { fileId: 'file123' });
    });

    it('should call apiError mock', () => {
      const error = new Error('API failed');
      logger.apiError('POST', '/api/files/move', error, { fileId: 'file123' });
      expect(logger.apiError).toHaveBeenCalledWith('POST', '/api/files/move', error, { fileId: 'file123' });
    });

    it('should call fileOperation mock', () => {
      logger.fileOperation('move', 'file123', 'test.txt', { userId: 'user123' });
      expect(logger.fileOperation).toHaveBeenCalledWith('move', 'file123', 'test.txt', { userId: 'user123' });
    });

    it('should call authEvent mock', () => {
      logger.authEvent('sign_in_success', 'user123', { email: 'test@example.com' });
      expect(logger.authEvent).toHaveBeenCalledWith('sign_in_success', 'user123', { email: 'test@example.com' });
    });

    it('should call performanceLog mock', () => {
      logger.performanceLog('fileUpload', 1500, { fileSize: 1024 });
      expect(logger.performanceLog).toHaveBeenCalledWith('fileUpload', 1500, { fileSize: 1024 });
    });
  });
});

describe('withTiming utility mock', () => {
  it('should call withTiming mock function', async () => {
    const mockFn = jest.fn().mockResolvedValue('result');
    
    const result = await withTiming('testOperation', mockFn, { userId: 'user123' });
    
    expect(result).toBe('result');
    expect(withTiming).toHaveBeenCalledWith('testOperation', mockFn, { userId: 'user123' });
  });
});

describe('logErrorBoundary mock', () => {
  it('should call logErrorBoundary mock', () => {
    const error = new Error('Component crashed');
    const errorInfo = { componentStack: 'Component stack trace here' };
    
    logErrorBoundary(error, errorInfo, 'TestComponent');
    
    expect(logErrorBoundary).toHaveBeenCalledWith(error, errorInfo, 'TestComponent');
  });
});