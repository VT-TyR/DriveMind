/**
 * Dashboard Metrics Real-Time Adapter
 * Provides real-time metrics from Firestore for dashboard components
 */

import { db } from '@/lib/firebase';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot,
  getDocs,
  Timestamp,
  DocumentData,
  QuerySnapshot
} from 'firebase/firestore';
import { logger } from '@/lib/logger';

export interface RealtimeMetrics {
  totalFiles: number;
  duplicateFiles: number;
  totalSize: number;
  recentActivity: number;
  vaultCandidates: number;
  cleanupSuggestions: number;
  qualityScore: number;
  scanStatus: 'idle' | 'scanning' | 'complete' | 'error';
  lastScanMode?: 'full' | 'delta' | null;
  timestamp: Date;
}

export interface ScanResults {
  filesScanned: number;
  duplicatesFound: number;
  totalSizeBytes: number;
  insights: {
    largeFiles: number;
    oldFiles: number;
    recommendations: string[];
  };
  completedAt: Timestamp;
}

export class DashboardMetricsAdapter {
  private listeners = new Map<string, () => void>();
  private metricsCache: RealtimeMetrics | null = null;
  private lastUpdate: Date | null = null;
  private updateInterval = 30000; // 30 seconds cache
  
  /**
   * Get real-time metrics from Firestore
   */
  async getRealtimeMetrics(userId: string): Promise<RealtimeMetrics> {
    try {
      // Check cache first
      if (this.metricsCache && this.lastUpdate) {
        const cacheAge = Date.now() - this.lastUpdate.getTime();
        if (cacheAge < this.updateInterval) {
          return this.metricsCache;
        }
      }

      // Query scan results
      const scansQuery = query(
        collection(db, 'scanJobs'),
        where('uid', '==', userId),
        where('status', '==', 'completed'),
        orderBy('completedAt', 'desc'),
        limit(1)
      );
      
      const scanSnapshot = await getDocs(scansQuery);
      
      // Query file inventory
      const inventoryQuery = query(
        collection(db, 'inventory'),
        where('uid', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(1)
      );
      
      const inventorySnapshot = await getDocs(inventoryQuery);
      
      // Process results
      let metrics: RealtimeMetrics = {
        totalFiles: 0,
        duplicateFiles: 0,
        totalSize: 0,
        recentActivity: 0,
        vaultCandidates: 0,
        cleanupSuggestions: 0,
        qualityScore: 85, // Default quality score
        scanStatus: 'idle',
        lastScanMode: null,
        timestamp: new Date()
      };
      
      if (!scanSnapshot.empty) {
        const latestScan = scanSnapshot.docs[0].data() as DocumentData;
        const results = latestScan.results as ScanResults;
        
        if (results) {
          metrics.totalFiles = results.filesScanned || 0;
          metrics.duplicateFiles = results.duplicatesFound || 0;
          metrics.totalSize = results.totalSizeBytes || 0;
          metrics.cleanupSuggestions = results.insights?.recommendations?.length || 0;
          metrics.vaultCandidates = results.insights?.largeFiles || 0;
        }
        
        metrics.scanStatus = latestScan.status || 'idle';
        metrics.lastScanMode = latestScan.config?.forceFull ? 'full' : 'delta';
      }
      
      if (!inventorySnapshot.empty) {
        const inventory = inventorySnapshot.docs[0].data() as DocumentData;
        
        // Calculate recent activity (files modified in last 7 days)
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        
        if (inventory.recentFiles) {
          metrics.recentActivity = inventory.recentFiles.filter((file: any) => {
            const modifiedTime = file.modifiedTime?.toDate();
            return modifiedTime && modifiedTime > oneWeekAgo;
          }).length;
        }
        
        // Calculate quality score based on organization metrics
        const duplicateRatio = metrics.totalFiles > 0 
          ? metrics.duplicateFiles / metrics.totalFiles 
          : 0;
        const organizationScore = Math.max(0, 100 - (duplicateRatio * 100));
        metrics.qualityScore = Math.round(organizationScore * 0.85); // Weight at 85%
      }
      
      // Update cache
      this.metricsCache = metrics;
      this.lastUpdate = new Date();
      
      logger.info('Dashboard metrics fetched', {
        userId,
        totalFiles: metrics.totalFiles,
        scanStatus: metrics.scanStatus
      });
      
      return metrics;
    } catch (error) {
      logger.error('Failed to fetch realtime metrics', error as Error);
      
      // Return default metrics on error
      return {
        totalFiles: 0,
        duplicateFiles: 0,
        totalSize: 0,
        recentActivity: 0,
        vaultCandidates: 0,
        cleanupSuggestions: 0,
        qualityScore: 0,
        scanStatus: 'error',
        lastScanMode: null,
        timestamp: new Date()
      };
    }
  }
  
  /**
   * Subscribe to real-time metric updates
   */
  subscribeToMetrics(
    userId: string, 
    callback: (metrics: RealtimeMetrics) => void
  ): () => void {
    const subscriptionId = `${userId}_${Date.now()}`;
    
    // Set up Firestore listener for scan jobs
    const scansQuery = query(
      collection(db, 'scanJobs'),
      where('uid', '==', userId),
      orderBy('updatedAt', 'desc'),
      limit(1)
    );
    
    const unsubscribe = onSnapshot(
      scansQuery,
      async (snapshot: QuerySnapshot) => {
        // Fetch updated metrics when scan status changes
        const metrics = await this.getRealtimeMetrics(userId);
        callback(metrics);
      },
      (error) => {
        logger.error('Metrics subscription error', error);
      }
    );
    
    this.listeners.set(subscriptionId, unsubscribe);
    
    // Return unsubscribe function
    return () => {
      const unsub = this.listeners.get(subscriptionId);
      if (unsub) {
        unsub();
        this.listeners.delete(subscriptionId);
      }
    };
  }
  
  /**
   * Get historical metrics for trending
   */
  async getHistoricalMetrics(
    userId: string, 
    days: number = 30
  ): Promise<RealtimeMetrics[]> {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const historyQuery = query(
        collection(db, 'metricsHistory'),
        where('uid', '==', userId),
        where('timestamp', '>=', Timestamp.fromDate(startDate)),
        orderBy('timestamp', 'asc')
      );
      
      const snapshot = await getDocs(historyQuery);
      
      return snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          totalFiles: data.totalFiles || 0,
          duplicateFiles: data.duplicateFiles || 0,
          totalSize: data.totalSize || 0,
          recentActivity: data.recentActivity || 0,
          vaultCandidates: data.vaultCandidates || 0,
          cleanupSuggestions: data.cleanupSuggestions || 0,
          qualityScore: data.qualityScore || 0,
          scanStatus: data.scanStatus || 'idle',
          lastScanMode: data.lastScanMode || null,
          timestamp: data.timestamp.toDate()
        };
      });
    } catch (error) {
      logger.error('Failed to fetch historical metrics', error as Error);
      return [];
    }
  }
  
  /**
   * Clear metrics cache
   */
  clearCache(): void {
    this.metricsCache = null;
    this.lastUpdate = null;
  }
}

// Export singleton instance
export const dashboardMetrics = new DashboardMetricsAdapter();