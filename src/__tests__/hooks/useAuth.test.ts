/**
 * @fileoverview Tests for useAuth hook
 */

import { renderHook, act } from '@testing-library/react';
import { useAuth } from '@/hooks/useAuth';
import { AuthContext } from '@/contexts/auth-context';
import React from 'react';

// Mock the auth context
const mockAuthContext = {
  user: null,
  loading: false,
  signInWithGoogle: jest.fn(),
  signOut: jest.fn(),
};

const AuthWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AuthContext.Provider value={mockAuthContext}>
    {children}
  </AuthContext.Provider>
);

describe('useAuth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws error when used outside AuthProvider', () => {
    const { result } = renderHook(() => useAuth());
    
    expect(result.error).toEqual(
      new Error('useAuth must be used within an AuthProvider')
    );
  });

  it('returns auth context with null token when no user', () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthWrapper,
    });

    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
    expect(result.current.tokenError).toBeNull();
  });

  it('gets token when user is available', async () => {
    const mockUser = {
      uid: 'test-uid',
      email: 'test@example.com',
      getIdToken: jest.fn().mockResolvedValue('test-token'),
    };

    mockAuthContext.user = mockUser as any;

    const { result, waitForNextUpdate } = renderHook(() => useAuth(), {
      wrapper: AuthWrapper,
    });

    await waitForNextUpdate();

    expect(result.current.token).toBe('test-token');
    expect(mockUser.getIdToken).toHaveBeenCalledWith(true); // Force refresh
  });

  it('handles token fetch error', async () => {
    const mockUser = {
      uid: 'test-uid',
      email: 'test@example.com',
      getIdToken: jest.fn().mockRejectedValue(new Error('Token error')),
    };

    mockAuthContext.user = mockUser as any;

    const { result, waitForNextUpdate } = renderHook(() => useAuth(), {
      wrapper: AuthWrapper,
    });

    await waitForNextUpdate();

    expect(result.current.token).toBeNull();
    expect(result.current.tokenError).toBe('Token error');
  });

  it('provides refreshToken function', async () => {
    const mockUser = {
      uid: 'test-uid',
      email: 'test@example.com',
      getIdToken: jest.fn().mockResolvedValue('new-token'),
    };

    mockAuthContext.user = mockUser as any;

    const { result, waitForNextUpdate } = renderHook(() => useAuth(), {
      wrapper: AuthWrapper,
    });

    await waitForNextUpdate();

    await act(async () => {
      const newToken = await result.current.refreshToken();
      expect(newToken).toBe('new-token');
    });

    expect(result.current.token).toBe('new-token');
  });

  it('clears token when user is removed', async () => {
    const mockUser = {
      uid: 'test-uid',
      email: 'test@example.com',
      getIdToken: jest.fn().mockResolvedValue('test-token'),
    };

    mockAuthContext.user = mockUser as any;

    const { result, waitForNextUpdate, rerender } = renderHook(() => useAuth(), {
      wrapper: AuthWrapper,
    });

    await waitForNextUpdate();
    expect(result.current.token).toBe('test-token');

    // Simulate user logout
    mockAuthContext.user = null;
    rerender();

    await waitForNextUpdate();
    expect(result.current.token).toBeNull();
    expect(result.current.tokenError).toBeNull();
  });

  it('returns all auth context properties', () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthWrapper,
    });

    expect(result.current).toHaveProperty('user');
    expect(result.current).toHaveProperty('loading');
    expect(result.current).toHaveProperty('signInWithGoogle');
    expect(result.current).toHaveProperty('signOut');
    expect(result.current).toHaveProperty('token');
    expect(result.current).toHaveProperty('tokenError');
    expect(result.current).toHaveProperty('refreshToken');
  });
});