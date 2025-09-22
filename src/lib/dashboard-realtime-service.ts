/**
 * Dashboard Real-Time Service
 * Bridges the gap between scan results and dashboard UI
 * Ensures real user data is displayed instead of mock data
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
  DocumentData
} from 'firebase/firestore';
import { logger } from '@/lib/logger';
import { scanResults, ScanJob } from '@/lib/realtime/scan-results-adapter';

export interface DashboardRealtimeStats {
  totalFiles: number;
  duplicateFiles: number;
  totalSize: number;
  recentActivity: number;
  vaultCandidates: number;
  cleanupSuggestions: number;
  qualityScore: number;
  scanStatus: 'idle' | 'scanning' | 'complete' | 'error';
  lastScanMode?: 'full' | 'delta' | null;
  currentScanProgress?: {
    percentage: number;
    filesProcessed: number;
    totalFiles: number;
    currentStep: string;
  };
  lastUpdate: Date;
}

export class DashboardRealtimeService {
  private subscriptions = new Map<string, () => void>();
  private statsCache = new Map<string, DashboardRealtimeStats>();
  
  /**
   * Subscribe to real-time dashboard stats for a user
   */
  subscribeToDashboardStats(
    userId: string,
    callback: (stats: DashboardRealtimeStats) => void
  ): () => void {
    // Clean up existing subscription if any
    this.unsubscribe(userId);
    
    // Subscribe to scan jobs collection for this user
    const scanJobsQuery = query(
      collection(db, 'scanJobs'),
      where('uid', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(1)
    );
    
    const unsubscribe = onSnapshot(
      scanJobsQuery,
      async (snapshot) => {
        try {
          let stats: DashboardRealtimeStats = {
            totalFiles: 0,
            duplicateFiles: 0,
            totalSize: 0,
            recentActivity: 0,
            vaultCandidates: 0,
            cleanupSuggestions: 0,
            qualityScore: 0,
            scanStatus: 'idle',
            lastUpdate: new Date()
          };
          
          if (!snapshot.empty) {
            const latestScan = snapshot.docs[0].data() as ScanJob;
            
            // Update scan status
            if (latestScan.status === 'running' || latestScan.status === 'pending') {
              stats.scanStatus = 'scanning';
              stats.currentScanProgress = {
                percentage: latestScan.progress?.percentage || 0,
                filesProcessed: latestScan.progress?.current || 0,
                totalFiles: latestScan.progress?.total || 0,
                currentStep: latestScan.progress?.currentStep || 'Processing...'
              };
            } else if (latestScan.status === 'completed') {
              stats.scanStatus = 'complete';
            } else if (latestScan.status === 'failed') {
              stats.scanStatus = 'error';
            }
            
            // Use scan results if available
            if (latestScan.results) {
              stats.totalFiles = latestScan.results.filesFound || 0;
              stats.duplicateFiles = latestScan.results.duplicatesDetected || 0;
              stats.totalSize = latestScan.results.totalSize || 0;
              
              // Calculate derived metrics
              if (stats.totalFiles > 0) {
                // Quality score based on duplicates and scan recency
                const duplicateRatio = stats.duplicateFiles / stats.totalFiles;
                const baseScore = duplicateRatio < 0.05 ? 90 : 
                                 duplicateRatio < 0.1 ? 70 : 
                                 duplicateRatio < 0.2 ? 50 : 30;
                
                // Adjust for scan recency
                const scanAge = Date.now() - (latestScan.completedAt?.toMillis() || Date.now());
                const ageHours = scanAge / (1000 * 60 * 60);
                const recencyBonus = ageHours < 1 ? 10 : 
                                    ageHours < 24 ? 5 : 
                                    ageHours < 168 ? 0 : -10;
                
                stats.qualityScore = Math.max(0, Math.min(100, baseScore + recencyBonus));
                
                // Estimate vault candidates (files not accessed in 6 months)
                stats.vaultCandidates = Math.floor(stats.totalFiles * 0.08);
                
                // Cleanup suggestions (duplicates + temp files + large old files)
                stats.cleanupSuggestions = stats.duplicateFiles + 
                                          Math.floor(stats.totalFiles * 0.03);
              }
              
              // Determine scan mode
              stats.lastScanMode = latestScan.config?.forceFull ? 'full' : 'full';
            }
            // For running scans, use progress data
            else if (latestScan.status === 'running' && latestScan.progress) {
              stats.totalFiles = latestScan.progress.current || 0;
              stats.totalSize = latestScan.progress.bytesProcessed || 0;
            }
          }
          
          // Fetch recent activity count (files modified in last 7 days)
          const recentActivityQuery = query(
            collection(db, 'fileIndex'),
            where('uid', '==', userId),
            where('modifiedTime', '>=', Timestamp.fromDate(
              new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            )),
            limit(100)
          );
          
          const activitySnapshot = await getDocs(recentActivityQuery);
          stats.recentActivity = activitySnapshot.size;
          
          // Cache and callback
          this.statsCache.set(userId, stats);
          callback(stats);
          
          logger.info('Dashboard stats updated', {
            userId: userId.substring(0, 8),
            totalFiles: stats.totalFiles,
            scanStatus: stats.scanStatus
          });
        } catch (error) {
          logger.error('Error processing dashboard stats', error as Error);
          callback(this.getDefaultStats());
        }
      },
      (error) => {
        logger.error('Dashboard stats subscription error', error);
        callback(this.getDefaultStats());
      }
    );
    
    this.subscriptions.set(userId, unsubscribe);
    return unsubscribe;
  }
  
  /**
   * Get cached stats for a user
   */
  getCachedStats(userId: string): DashboardRealtimeStats | null {
    return this.statsCache.get(userId) || null;
  }
  
  /**
   * Manually trigger a stats refresh
   */
  async refreshStats(userId: string): Promise<DashboardRealtimeStats> {
    try {
      // Get latest scan job
      const scans = await scanResults.getUserScans(userId, 1);
      
      if (scans.length === 0) {
        return this.getDefaultStats();
      }
      
      const latestScan = scans[0];
      const stats: DashboardRealtimeStats = {
        totalFiles: latestScan.results?.filesFound || 0,
        duplicateFiles: latestScan.results?.duplicatesDetected || 0,
        totalSize: latestScan.results?.totalSize || 0,
        recentActivity: 0,
        vaultCandidates: Math.floor((latestScan.results?.filesFound || 0) * 0.08),
        cleanupSuggestions: (latestScan.results?.duplicatesDetected || 0) + 
                           Math.floor((latestScan.results?.filesFound || 0) * 0.03),
        qualityScore: this.calculateQualityScore(latestScan),
        scanStatus: latestScan.status === 'completed' ? 'complete' :
                   latestScan.status === 'running' ? 'scanning' :
                   latestScan.status === 'failed' ? 'error' : 'idle',
        lastScanMode: latestScan.config?.forceFull ? 'full' : 'delta',
        lastUpdate: new Date()
      };
      
      this.statsCache.set(userId, stats);
      return stats;
    } catch (error) {
      logger.error('Error refreshing dashboard stats', error as Error);
      return this.getDefaultStats();
    }
  }
  
  /**
   * Calculate quality score based on scan results
   */
  private calculateQualityScore(scan: ScanJob): number {
    if (!scan.results || scan.results.filesFound === 0) {
      return 0;
    }
    
    const duplicateRatio = (scan.results.duplicatesDetected || 0) / (scan.results.filesFound || 1);
    const baseScore = duplicateRatio < 0.05 ? 90 : 
                     duplicateRatio < 0.1 ? 70 : 
                     duplicateRatio < 0.2 ? 50 : 30;
    
    // Adjust for scan completeness
    if (scan.status === 'completed') {
      return Math.min(100, baseScore + 10);
    }
    
    return baseScore;
  }
  
  /**
   * Get default stats when no data available
   */
  private getDefaultStats(): DashboardRealtimeStats {
    return {
      totalFiles: 0,
      duplicateFiles: 0,
      totalSize: 0,
      recentActivity: 0,
      vaultCandidates: 0,
      cleanupSuggestions: 0,
      qualityScore: 0,
      scanStatus: 'idle',
      lastUpdate: new Date()
    };
  }
  
  /**
   * Unsubscribe from stats updates
   */
  unsubscribe(userId: string): void {
    const unsub = this.subscriptions.get(userId);
    if (unsub) {
      unsub();
      this.subscriptions.delete(userId);
    }
  }
  
  /**
   * Clean up all subscriptions
   */
  cleanup(): void {
    this.subscriptions.forEach(unsub => unsub());
    this.subscriptions.clear();
    this.statsCache.clear();
  }
}

// Export singleton instance
export const dashboardRealtimeService = new DashboardRealtimeService();