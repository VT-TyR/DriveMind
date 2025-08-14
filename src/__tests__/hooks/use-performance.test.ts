/**
 * Tests for usePerformance hook
 */

import { renderHook, act } from '@testing-library/react';
import { usePerformance } from '@/hooks/use-performance';

// Mock the logger
jest.mock('@/lib/logger');

// Mock performance.now()
const mockPerformanceNow = jest.fn();
Object.defineProperty(window, 'performance', {
  writable: true,
  value: {
    now: mockPerformanceNow,
  },
});

describe('usePerformance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPerformanceNow.mockReset();
  });

  describe('Timer operations', () => {
    it('should start and end timers correctly', () => {
      mockPerformanceNow
        .mockReturnValueOnce(1000) // start time
        .mockReturnValueOnce(1500); // end time

      const { result } = renderHook(() => usePerformance());

      let startTime, metric;

      act(() => {
        startTime = result.current.startTimer('testOperation');
      });

      act(() => {
        metric = result.current.endTimer('testOperation');
      });

      expect(startTime).toBe(1000);
      expect(metric).toEqual({
        name: 'testOperation',
        duration: 500,
        timestamp: expect.any(Date),
        metadata: undefined
      });
    });

    it('should handle timer with metadata', () => {
      mockPerformanceNow
        .mockReturnValueOnce(2000) // start time
        .mockReturnValueOnce(2250); // end time

      const { result } = renderHook(() => usePerformance());

      const metadata = { userId: 'user123', operation: 'fileUpload' };

      act(() => {
        result.current.startTimer('uploadOperation', metadata);
      });

      let metric;
      act(() => {
        metric = result.current.endTimer('uploadOperation', { fileSize: 1024 });
      });

      expect(metric).toEqual({
        name: 'uploadOperation',
        duration: 250,
        timestamp: expect.any(Date),
        metadata: { fileSize: 1024 }
      });
    });

    it('should return null when ending non-existent timer', () => {
      const { result } = renderHook(() => usePerformance());

      let metric;
      act(() => {
        metric = result.current.endTimer('nonExistentTimer');
      });

      expect(metric).toBeNull();
    });

    it('should clear timer after ending', () => {
      mockPerformanceNow
        .mockReturnValueOnce(1000)
        .mockReturnValueOnce(1100)
        .mockReturnValueOnce(1200);

      const { result } = renderHook(() => usePerformance());

      act(() => {
        result.current.startTimer('testTimer');
      });

      act(() => {
        result.current.endTimer('testTimer');
      });

      // Try to end the same timer again
      let secondMetric;
      act(() => {
        secondMetric = result.current.endTimer('testTimer');
      });

      expect(secondMetric).toBeNull();
    });
  });

  describe('Async measurement', () => {
    it('should measure successful async operations', async () => {
      mockPerformanceNow
        .mockReturnValueOnce(3000) // start time
        .mockReturnValueOnce(3500); // end time

      const { result } = renderHook(() => usePerformance());

      const asyncFn = jest.fn().mockResolvedValue('async result');
      const metadata = { operation: 'dataFetch' };

      let measureResult;
      await act(async () => {
        measureResult = await result.current.measureAsync('fetchOperation', asyncFn, metadata);
      });

      expect(measureResult).toEqual({
        result: 'async result',
        metric: {
          name: 'fetchOperation',
          duration: 500,
          timestamp: expect.any(Date),
          metadata: { ...metadata, success: true }
        }
      });

      expect(asyncFn).toHaveBeenCalled();
    });

    it('should measure failed async operations', async () => {
      mockPerformanceNow
        .mockReturnValueOnce(4000) // start time
        .mockReturnValueOnce(4300); // end time

      const { result } = renderHook(() => usePerformance());

      const error = new Error('Async operation failed');
      const asyncFn = jest.fn().mockRejectedValue(error);
      const metadata = { operation: 'failedFetch' };

      await act(async () => {
        try {
          await result.current.measureAsync('failedOperation', asyncFn, metadata);
        } catch (thrownError) {
          expect(thrownError).toBe(error);
        }
      });

      expect(asyncFn).toHaveBeenCalled();
    });

    it('should handle async operations without metadata', async () => {
      mockPerformanceNow
        .mockReturnValueOnce(5000)
        .mockReturnValueOnce(5100);

      const { result } = renderHook(() => usePerformance());

      const asyncFn = jest.fn().mockResolvedValue('no metadata result');

      let measureResult;
      await act(async () => {
        measureResult = await result.current.measureAsync('simpleOperation', asyncFn);
      });

      expect(measureResult.result).toBe('no metadata result');
      expect(measureResult.metric.metadata).toEqual({ success: true });
    });
  });

  describe('Sync measurement', () => {
    it('should measure successful sync operations', () => {
      mockPerformanceNow
        .mockReturnValueOnce(6000) // start time
        .mockReturnValueOnce(6200); // end time

      const { result } = renderHook(() => usePerformance());

      const syncFn = jest.fn().mockReturnValue('sync result');
      const metadata = { operation: 'calculation' };

      let measureResult;
      act(() => {
        measureResult = result.current.measureSync('calcOperation', syncFn, metadata);
      });

      expect(measureResult).toEqual({
        result: 'sync result',
        metric: {
          name: 'calcOperation',
          duration: 200,
          timestamp: expect.any(Date),
          metadata: { ...metadata, success: true }
        }
      });

      expect(syncFn).toHaveBeenCalled();
    });

    it('should measure failed sync operations', () => {
      mockPerformanceNow
        .mockReturnValueOnce(7000) // start time
        .mockReturnValueOnce(7150); // end time

      const { result } = renderHook(() => usePerformance());

      const error = new Error('Sync operation failed');
      const syncFn = jest.fn().mockImplementation(() => {
        throw error;
      });

      act(() => {
        try {
          result.current.measureSync('failedSync', syncFn);
        } catch (thrownError) {
          expect(thrownError).toBe(error);
        }
      });

      expect(syncFn).toHaveBeenCalled();
    });
  });

  describe('Timer management', () => {
    it('should track active timers', () => {
      mockPerformanceNow
        .mockReturnValueOnce(8000)
        .mockReturnValueOnce(8100)
        .mockReturnValueOnce(8200);

      const { result } = renderHook(() => usePerformance());

      act(() => {
        result.current.startTimer('timer1');
        result.current.startTimer('timer2');
      });

      let activeTimers;
      act(() => {
        activeTimers = result.current.getActiveTimers();
      });

      expect(activeTimers).toEqual(['timer1', 'timer2']);

      act(() => {
        result.current.endTimer('timer1');
      });

      act(() => {
        activeTimers = result.current.getActiveTimers();
      });

      expect(activeTimers).toEqual(['timer2']);
    });

    it('should clear all active timers', () => {
      mockPerformanceNow
        .mockReturnValueOnce(9000)
        .mockReturnValueOnce(9100)
        .mockReturnValueOnce(9200);

      const { result } = renderHook(() => usePerformance());

      act(() => {
        result.current.startTimer('timer1');
        result.current.startTimer('timer2');
        result.current.startTimer('timer3');
      });

      let activeTimers;
      act(() => {
        activeTimers = result.current.getActiveTimers();
      });

      expect(activeTimers).toHaveLength(3);

      act(() => {
        result.current.clearAllTimers();
      });

      act(() => {
        activeTimers = result.current.getActiveTimers();
      });

      expect(activeTimers).toHaveLength(0);
    });

    it('should handle clearing timers when none are active', () => {
      const { result } = renderHook(() => usePerformance());

      act(() => {
        result.current.clearAllTimers();
      });

      let activeTimers;
      act(() => {
        activeTimers = result.current.getActiveTimers();
      });

      expect(activeTimers).toHaveLength(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle multiple timers with same name', () => {
      mockPerformanceNow
        .mockReturnValueOnce(10000)
        .mockReturnValueOnce(10100)
        .mockReturnValueOnce(10200);

      const { result } = renderHook(() => usePerformance());

      act(() => {
        result.current.startTimer('duplicateTimer');
      });

      // Starting timer with same name should overwrite
      act(() => {
        result.current.startTimer('duplicateTimer');
      });

      let metric;
      act(() => {
        metric = result.current.endTimer('duplicateTimer');
      });

      // Should measure from the second start time
      expect(metric?.duration).toBe(100);
    });

    it('should handle large time differences', () => {
      mockPerformanceNow
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(999999);

      const { result } = renderHook(() => usePerformance());

      act(() => {
        result.current.startTimer('longTimer');
      });

      let metric;
      act(() => {
        metric = result.current.endTimer('longTimer');
      });

      expect(metric?.duration).toBe(999999);
    });
  });
});