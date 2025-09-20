/**
 * Dashboard Metrics Hook with Migration Support
 * Provides real-time metrics with automatic source switching based on migration phase
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import { dashboardMetrics, RealtimeMetrics } from '@/lib/realtime/dashboard-metrics-adapter';
import { getDataSourceManager } from '@/lib/safety/data-source-manager';
import { getMigrationCoordinator } from '@/lib/safety/phase6-migration-coordinator';
import { logger } from '@/lib/logger';

// Mock data generator for fallback
const generateMockMetrics = (): RealtimeMetrics => ({
  totalFiles: Math.floor(Math.random() * 5000) + 1000,
  duplicateFiles: Math.floor(Math.random() * 500) + 50,
  totalSize: Math.floor(Math.random() * 100000000000) + 10000000000,
  recentActivity: Math.floor(Math.random() * 100) + 10,
  vaultCandidates: Math.floor(Math.random() * 50) + 5,
  cleanupSuggestions: Math.floor(Math.random() * 20) + 3,
  qualityScore: Math.floor(Math.random() * 30) + 70,
  scanStatus: 'complete' as const,
  lastScanMode: 'full' as const,
  timestamp: new Date()
});

export function useDashboardMetrics(autoRefresh: boolean = true) {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<RealtimeMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<'mock' | 'firebase' | 'hybrid'>('mock');
  const [migrationStatus, setMigrationStatus] = useState<{
    active: boolean;
    percentage: number;
    phase: string;
  }>({
    active: false,
    percentage: 0,
    phase: 'idle'
  });

  // Fetch metrics based on current data source
  const fetchMetrics = useCallback(async () => {
    if (!user) {
      setMetrics(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Get current data source configuration
      const dataSourceManager = getDataSourceManager();
      const currentSource = dataSourceManager.getCurrentSource();
      setDataSource(currentSource);

      // Get migration status
      const coordinator = getMigrationCoordinator();
      const status = coordinator.getStatus();
      setMigrationStatus({
        active: status.active,
        percentage: status.percentage,
        phase: status.phase
      });

      let metricsData: RealtimeMetrics;

      // Determine which source to use based on migration phase
      if (currentSource === 'mock' || 
          (currentSource === 'hybrid' && Math.random() * 100 > status.percentage)) {
        // Use mock data
        metricsData = generateMockMetrics();
        logger.info('Using mock metrics', { 
          source: 'mock',
          migrationPhase: status.phase 
        });
      } else {
        // Use real Firebase data
        metricsData = await dashboardMetrics.getRealtimeMetrics(user.uid);
        logger.info('Using Firebase metrics', { 
          source: 'firebase',
          migrationPhase: status.phase 
        });
      }

      // Record metric for migration tracking
      coordinator.recordMetric({
        latency: Date.now() - metricsData.timestamp.getTime(),
        success: true,
        source: currentSource === 'mock' ? 'mock' : 'firebase'
      });

      setMetrics(metricsData);
    } catch (err) {
      logger.error('Failed to fetch dashboard metrics', err as Error);
      setError((err as Error).message);

      // Record failure metric
      const coordinator = getMigrationCoordinator();
      coordinator.recordMetric({
        latency: 1000,
        success: false,
        source: dataSource === 'mock' ? 'mock' : 'firebase'
      });

      // Fallback to mock on error if configured
      const dataSourceManager = getDataSourceManager();
      const config = dataSourceManager.getConfig();
      if (config.fallbackEnabled) {
        setMetrics(generateMockMetrics());
        logger.info('Falling back to mock metrics due to error');
      }
    } finally {
      setLoading(false);
    }
  }, [user, dataSource]);

  // Set up subscription for real-time updates
  useEffect(() => {
    if (!user || !autoRefresh) return;

    // Initial fetch
    fetchMetrics();

    // Set up subscription based on data source
    const dataSourceManager = getDataSourceManager();
    const currentSource = dataSourceManager.getCurrentSource();

    let unsubscribe: (() => void) | undefined;

    if (currentSource !== 'mock') {
      // Subscribe to real-time updates from Firebase
      unsubscribe = dashboardMetrics.subscribeToMetrics(
        user.uid,
        (updatedMetrics) => {
          setMetrics(updatedMetrics);
          
          // Record successful update
          const coordinator = getMigrationCoordinator();
          coordinator.recordMetric({
            latency: 100,
            success: true,
            source: 'firebase'
          });
        }
      );
    } else {
      // For mock data, update periodically
      const interval = setInterval(() => {
        setMetrics(generateMockMetrics());
      }, 10000); // Update every 10 seconds

      unsubscribe = () => clearInterval(interval);
    }

    // Also set up interval to check migration status
    const migrationInterval = setInterval(() => {
      const coordinator = getMigrationCoordinator();
      const status = coordinator.getStatus();
      setMigrationStatus({
        active: status.active,
        percentage: status.percentage,
        phase: status.phase
      });

      // Re-fetch if source changed
      const newSource = dataSourceManager.getCurrentSource();
      if (newSource !== dataSource) {
        fetchMetrics();
      }
    }, 5000); // Check every 5 seconds

    return () => {
      if (unsubscribe) unsubscribe();
      clearInterval(migrationInterval);
    };
  }, [user, autoRefresh, fetchMetrics, dataSource]);

  // Manual refresh function
  const refresh = useCallback(() => {
    return fetchMetrics();
  }, [fetchMetrics]);

  // Format bytes to human-readable
  const formatBytes = (bytes: number): string => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  };

  return {
    metrics,
    loading,
    error,
    refresh,
    dataSource,
    migrationStatus,
    formattedMetrics: metrics ? {
      ...metrics,
      totalSizeFormatted: formatBytes(metrics.totalSize),
      qualityGrade: metrics.qualityScore >= 90 ? 'A' :
                    metrics.qualityScore >= 80 ? 'B' :
                    metrics.qualityScore >= 70 ? 'C' :
                    metrics.qualityScore >= 60 ? 'D' : 'F'
    } : null
  };
}