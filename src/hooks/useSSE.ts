/**
 * @fileoverview React hook for Server-Sent Events
 * Handles SSE connections with auto-reconnect and error handling
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { logger } from '@/lib/logger';

export interface SSEOptions {
  url: string;
  token?: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  onMessage?: (event: MessageEvent) => void;
  onError?: (error: Event) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

export interface SSEState {
  isConnected: boolean;
  lastMessage: any | null;
  error: string | null;
  reconnectAttempts: number;
}

export function useSSE(options: SSEOptions) {
  const [state, setState] = useState<SSEState>({
    isConnected: false,
    lastMessage: null,
    error: null,
    reconnectAttempts: 0,
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  const {
    url,
    token,
    reconnectInterval = 5000,
    maxReconnectAttempts = 5,
    onMessage,
    onError,
    onOpen,
    onClose,
  } = options;

  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    
    cleanup();

    try {
      // Build URL with auth token if provided
      const sseUrl = new URL(url, window.location.origin);
      if (token) {
        // For SSE, we typically pass auth in URL params since headers aren't supported
        sseUrl.searchParams.set('token', token);
      }

      const eventSource = new EventSource(sseUrl.toString());
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        if (!mountedRef.current) return;
        
        setState(prev => ({
          ...prev,
          isConnected: true,
          error: null,
          reconnectAttempts: 0,
        }));
        
        logger.info('SSE connected', { url });
        onOpen?.();
      };

      eventSource.onmessage = (event) => {
        if (!mountedRef.current) return;
        
        try {
          const data = JSON.parse(event.data);
          setState(prev => ({
            ...prev,
            lastMessage: data,
          }));
          onMessage?.(event);
        } catch (error) {
          logger.error('Failed to parse SSE message', { error, data: event.data });
        }
      };

      eventSource.onerror = (error) => {
        if (!mountedRef.current) return;
        
        logger.error('SSE error', { url, error });
        
        setState(prev => ({
          ...prev,
          isConnected: false,
          error: 'Connection lost',
        }));
        
        onError?.(error);
        
        // Attempt reconnection
        if (state.reconnectAttempts < maxReconnectAttempts) {
          const attempts = state.reconnectAttempts + 1;
          setState(prev => ({
            ...prev,
            reconnectAttempts: attempts,
          }));
          
          logger.info('Attempting SSE reconnect', { 
            attempt: attempts, 
            maxAttempts: maxReconnectAttempts 
          });
          
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) {
              connect();
            }
          }, reconnectInterval * Math.min(attempts, 3)); // Exponential backoff, capped at 3x
        } else {
          setState(prev => ({
            ...prev,
            error: 'Maximum reconnection attempts reached',
          }));
          onClose?.();
        }
      };

      // Add custom event listeners for specific event types
      eventSource.addEventListener('progress', (event: MessageEvent) => {
        if (!mountedRef.current) return;
        
        try {
          const data = JSON.parse(event.data);
          setState(prev => ({
            ...prev,
            lastMessage: { type: 'progress', ...data },
          }));
        } catch (error) {
          logger.error('Failed to parse progress event', { error });
        }
      });

      eventSource.addEventListener('complete', (event: MessageEvent) => {
        if (!mountedRef.current) return;
        
        try {
          const data = JSON.parse(event.data);
          setState(prev => ({
            ...prev,
            lastMessage: { type: 'complete', ...data },
          }));
          
          // Close connection after completion
          cleanup();
          onClose?.();
        } catch (error) {
          logger.error('Failed to parse complete event', { error });
        }
      });

      eventSource.addEventListener('error', (event: MessageEvent) => {
        if (!mountedRef.current) return;
        
        try {
          const data = JSON.parse(event.data);
          setState(prev => ({
            ...prev,
            lastMessage: { type: 'error', ...data },
            error: data.error || 'Unknown error',
          }));
          
          // Close connection after error
          cleanup();
          onClose?.();
        } catch (error) {
          logger.error('Failed to parse error event', { error });
        }
      });

      eventSource.addEventListener('heartbeat', () => {
        if (!mountedRef.current) return;
        
        // Update last activity time
        setState(prev => ({
          ...prev,
          lastMessage: { type: 'heartbeat', timestamp: Date.now() },
        }));
      });

    } catch (error) {
      logger.error('Failed to create EventSource', { url, error });
      setState(prev => ({
        ...prev,
        isConnected: false,
        error: 'Failed to establish connection',
      }));
    }
  }, [url, token, reconnectInterval, maxReconnectAttempts, onMessage, onError, onOpen, onClose, state.reconnectAttempts]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      cleanup();
      onClose?.();
    };
  }, [url, token]); // Only reconnect on URL or token change

  const disconnect = useCallback(() => {
    cleanup();
    setState(prev => ({
      ...prev,
      isConnected: false,
      lastMessage: null,
      error: null,
      reconnectAttempts: 0,
    }));
    onClose?.();
  }, [cleanup, onClose]);

  const reconnect = useCallback(() => {
    setState(prev => ({
      ...prev,
      reconnectAttempts: 0,
    }));
    connect();
  }, [connect]);

  return {
    ...state,
    disconnect,
    reconnect,
  };
}