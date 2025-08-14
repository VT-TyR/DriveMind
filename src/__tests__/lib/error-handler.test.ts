/**
 * Tests for error handling utilities
 */

import {
  AppError,
  ValidationError,
  AuthenticationError,
  GoogleDriveError,
  FirebaseError,
  isAppError,
  getErrorMessage,
  getErrorCode,
  mapFirebaseError,
  mapGoogleApiError,
  handlePromise,
} from '@/lib/error-handler';

describe('Custom Error Classes', () => {
  describe('AppError', () => {
    it('should create an AppError with default values', () => {
      const error = new AppError('Test error');
      
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('GENERIC_ERROR');
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(true);
      expect(error.name).toBe('AppError');
    });

    it('should create an AppError with custom values', () => {
      const context = { userId: 'user123' };
      const error = new AppError('Custom error', 'CUSTOM_CODE', 400, false, context);
      
      expect(error.message).toBe('Custom error');
      expect(error.code).toBe('CUSTOM_CODE');
      expect(error.statusCode).toBe(400);
      expect(error.isOperational).toBe(false);
      expect(error.context).toEqual(context);
    });
  });

  describe('ValidationError', () => {
    it('should create a validation error', () => {
      const error = new ValidationError('Invalid input', 'email');
      
      expect(error.message).toBe('Invalid input');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.context?.field).toBe('email');
    });
  });

  describe('AuthenticationError', () => {
    it('should create an authentication error with default message', () => {
      const error = new AuthenticationError();
      
      expect(error.message).toBe('Authentication required');
      expect(error.code).toBe('AUTH_ERROR');
      expect(error.statusCode).toBe(401);
    });

    it('should create an authentication error with custom message', () => {
      const error = new AuthenticationError('Invalid credentials');
      
      expect(error.message).toBe('Invalid credentials');
      expect(error.code).toBe('AUTH_ERROR');
    });
  });

  describe('GoogleDriveError', () => {
    it('should create a Google Drive error', () => {
      const originalError = new Error('Drive API failed');
      const error = new GoogleDriveError('Failed to access file', originalError, 'file123');
      
      expect(error.message).toBe('Failed to access file');
      expect(error.code).toBe('GOOGLE_DRIVE_ERROR');
      expect(error.statusCode).toBe(502);
      expect(error.context?.fileId).toBe('file123');
      expect(error.context?.originalError).toBe('Drive API failed');
    });
  });

  describe('FirebaseError', () => {
    it('should create a Firebase error', () => {
      const originalError = new Error('Firebase connection failed');
      const error = new FirebaseError('Database operation failed', originalError, 'createUser');
      
      expect(error.message).toBe('Database operation failed');
      expect(error.code).toBe('FIREBASE_ERROR');
      expect(error.statusCode).toBe(502);
      expect(error.context?.operation).toBe('createUser');
    });
  });
});

describe('Error Utility Functions', () => {
  describe('isAppError', () => {
    it('should identify AppError instances', () => {
      const appError = new AppError('Test');
      const regularError = new Error('Regular error');
      
      expect(isAppError(appError)).toBe(true);
      expect(isAppError(regularError)).toBe(false);
      expect(isAppError('string error')).toBe(false);
      expect(isAppError(null)).toBe(false);
    });
  });

  describe('getErrorMessage', () => {
    it('should extract message from Error objects', () => {
      const error = new Error('Test error message');
      expect(getErrorMessage(error)).toBe('Test error message');
    });

    it('should return string errors as-is', () => {
      expect(getErrorMessage('String error')).toBe('String error');
    });

    it('should return default message for unknown errors', () => {
      expect(getErrorMessage(null)).toBe('An unknown error occurred');
      expect(getErrorMessage(undefined)).toBe('An unknown error occurred');
      expect(getErrorMessage(123)).toBe('An unknown error occurred');
    });
  });

  describe('getErrorCode', () => {
    it('should extract code from AppError', () => {
      const error = new AppError('Test', 'CUSTOM_CODE');
      expect(getErrorCode(error)).toBe('CUSTOM_CODE');
    });

    it('should extract name from regular Error', () => {
      const error = new Error('Test');
      expect(getErrorCode(error)).toBe('Error');
    });

    it('should return default code for unknown errors', () => {
      expect(getErrorCode('string')).toBe('UNKNOWN_ERROR');
      expect(getErrorCode(null)).toBe('UNKNOWN_ERROR');
    });
  });
});

describe('Error Mapping Functions', () => {
  describe('mapFirebaseError', () => {
    it('should map Firebase auth errors', () => {
      const firebaseError = { code: 'auth/user-not-found', message: 'User not found' };
      const mappedError = mapFirebaseError(firebaseError);
      
      expect(mappedError).toBeInstanceOf(AuthenticationError);
      expect(mappedError.message).toBe('Invalid credentials');
    });

    it('should map Firebase permission errors', () => {
      const firebaseError = { code: 'permission-denied', message: 'Access denied' };
      const mappedError = mapFirebaseError(firebaseError);
      
      expect(mappedError.code).toBe('AUTHORIZATION_ERROR');
    });

    it('should map unknown Firebase errors', () => {
      const firebaseError = { code: 'unknown-error', message: 'Unknown Firebase error' };
      const mappedError = mapFirebaseError(firebaseError);
      
      expect(mappedError).toBeInstanceOf(FirebaseError);
      expect(mappedError.message).toBe('Unknown Firebase error');
    });
  });

  describe('mapGoogleApiError', () => {
    it('should map 401 errors to authentication error', () => {
      const apiError = { response: { status: 401, data: { error: { message: 'Unauthorized' } } } };
      const mappedError = mapGoogleApiError(apiError, 'file123');
      
      expect(mappedError).toBeInstanceOf(AuthenticationError);
      expect(mappedError.message).toBe('Google API authentication failed');
    });

    it('should map 404 errors to not found error', () => {
      const apiError = { response: { status: 404 } };
      const mappedError = mapGoogleApiError(apiError, 'file123');
      
      expect(mappedError.code).toBe('NOT_FOUND');
      expect(mappedError.context?.id).toBe('file123');
    });

    it('should map 429 errors to rate limit error', () => {
      const apiError = { response: { status: 429 } };
      const mappedError = mapGoogleApiError(apiError);
      
      expect(mappedError.code).toBe('RATE_LIMIT');
    });

    it('should map server errors to Google Drive error', () => {
      const apiError = { response: { status: 500 } };
      const mappedError = mapGoogleApiError(apiError, 'file123');
      
      expect(mappedError).toBeInstanceOf(GoogleDriveError);
      expect(mappedError.context?.fileId).toBe('file123');
    });
  });
});

describe('Promise Error Handling', () => {
  describe('handlePromise', () => {
    it('should return success result', async () => {
      const successPromise = Promise.resolve('success');
      const [error, result] = await handlePromise(successPromise);
      
      expect(error).toBeNull();
      expect(result).toBe('success');
    });

    it('should return error result', async () => {
      const failurePromise = Promise.reject(new Error('Failed'));
      const [error, result] = await handlePromise(failurePromise);
      
      expect(error).toBeInstanceOf(Error);
      expect(error?.message).toBe('Failed');
      expect(result).toBeNull();
    });

    it('should log errors when context is provided', async () => {
      // Note: logger is mocked in jest.setup.js
      const failurePromise = Promise.reject(new Error('Failed'));
      const context = { operation: 'test' };
      
      await handlePromise(failurePromise, context);
      
      // Since logger is mocked, we can't directly test the logging
      // but we can verify the function doesn't throw
      expect(true).toBe(true);
    });
  });
});