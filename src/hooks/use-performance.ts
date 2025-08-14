/**
 * Custom hook for performance monitoring and timing
 */

import { useCallback, useRef } from 'react';
import { logger } from '@/lib/logger';

export interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export function usePerformance() {
  const timers = useRef<Map<string, number>>(new Map());

  const startTimer = useCallback((name: string, metadata?: Record<string, any>) => {
    const startTime = performance.now();
    timers.current.set(name, startTime);
    
    logger.debug(`Performance timer started: ${name}`, { 
      performance: { name, startTime },
      ...metadata 
    });
    
    return startTime;
  }, []);

  const endTimer = useCallback((name: string, metadata?: Record<string, any>) => {
    const startTime = timers.current.get(name);
    
    if (!startTime) {
      logger.warn(`Performance timer "${name}" was not started`, { performance: { name } });
      return null;
    }

    const endTime = performance.now();
    const duration = endTime - startTime;
    
    timers.current.delete(name);
    
    const metric: PerformanceMetric = {
      name,
      duration,
      timestamp: new Date(),
      metadata
    };

    logger.performanceLog(name, duration, {
      performance: metric,
      ...metadata
    });

    return metric;
  }, []);

  const measureAsync = useCallback(async <T>(
    name: string,
    asyncFn: () => Promise<T>,
    metadata?: Record<string, any>
  ): Promise<{ result: T; metric: PerformanceMetric }> => {
    startTimer(name, metadata);
    
    try {
      const result = await asyncFn();
      const metric = endTimer(name, { ...metadata, success: true })!;
      return { result, metric };
    } catch (error) {
      const metric = endTimer(name, { ...metadata, success: false, error: (error as Error).message })!;
      throw error;
    }
  }, [startTimer, endTimer]);

  const measureSync = useCallback(<T>(
    name: string,
    syncFn: () => T,
    metadata?: Record<string, any>
  ): { result: T; metric: PerformanceMetric } => {
    startTimer(name, metadata);
    
    try {
      const result = syncFn();
      const metric = endTimer(name, { ...metadata, success: true })!;
      return { result, metric };
    } catch (error) {
      const metric = endTimer(name, { ...metadata, success: false, error: (error as Error).message })!;
      throw error;
    }
  }, [startTimer, endTimer]);

  const getActiveTimers = useCallback(() => {
    return Array.from(timers.current.keys());
  }, []);

  const clearAllTimers = useCallback(() => {
    const activeTimers = getActiveTimers();
    if (activeTimers.length > 0) {
      logger.warn('Clearing active performance timers', { 
        performance: { activeTimers } 
      });
    }
    timers.current.clear();
  }, [getActiveTimers]);

  return {
    startTimer,
    endTimer,
    measureAsync,
    measureSync,
    getActiveTimers,
    clearAllTimers,
  };
}