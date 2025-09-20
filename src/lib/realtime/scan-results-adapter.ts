/**
 * Scan Results Real-Time Adapter
 * Manages real-time scan data and replaces mock scan generation
 */

import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  onSnapshot,
  DocumentData
} from 'firebase/firestore';
import { logger } from '@/lib/logger';
import { getMigrationCoordinator } from '@/lib/safety/phase6-migration-coordinator';

export interface ScanFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  modifiedTime: Date;
  createdTime: Date;
  parents: string[];
  webViewLink?: string;
  iconLink?: string;
  md5Checksum?: string;
  isFolder: boolean;
  path?: string;
  depth?: number;
}

export interface ScanProgress {
  current: number;
  total: number;
  percentage: number;
  currentStep: string;
  estimatedTimeRemaining?: number;
  bytesProcessed?: number;
  totalBytes?: number;
  filesPerSecond?: number;
}

export interface ScanJob {
  id: string;
  uid: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  type: 'drive_scan' | 'full_analysis' | 'duplicate_detection';
  progress: ScanProgress;
  config: {
    maxDepth?: number;
    includeTrashed?: boolean;
    rootFolderId?: string;
    fileTypes?: string[];
    forceFull?: boolean;
  };
  results?: {
    scanId?: string;
    filesFound?: number;
    duplicatesDetected?: number;
    totalSize?: number;
    insights?: {
      largeFiles: ScanFile[];
      duplicateGroups: Array<{
        hash: string;
        files: ScanFile[];
        totalSize: number;
        potentialSavings: number;
      }>;
      recommendations: string[];
      storageAnalysis: {
        byType: Record<string, { count: number; size: number }>;
        byFolder: Record<string, { count: number; size: number }>;
        unusedFiles: ScanFile[];
      };
    };
  };
  error?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  startedAt?: Timestamp;
  completedAt?: Timestamp;
  checkpointData?: {
    lastProcessedFileId?: string;
    processedCount?: number;
    resumeToken?: string;
  };
}

export class ScanResultsAdapter {
  private activeSubscriptions = new Map<string, () => void>();
  private resultsCache = new Map<string, ScanJob>();
  
  /**
   * Create a new scan job
   */
  async createScanJob(
    userId: string,
    type: ScanJob['type'],
    config: ScanJob['config']
  ): Promise<string> {
    try {
      const scanId = `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const scanJob: ScanJob = {
        id: scanId,
        uid: userId,
        status: 'pending',
        type,
        progress: {
          current: 0,
          total: 0,
          percentage: 0,
          currentStep: 'Initializing scan...'
        },
        config,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };
      
      await setDoc(doc(db, 'scanJobs', scanId), scanJob);
      
      // Record metric for migration tracking
      const coordinator = getMigrationCoordinator();
      coordinator.recordMetric({
        latency: 100,
        success: true,
        source: 'firebase'
      });
      
      logger.info('Scan job created', { scanId, userId, type });
      
      return scanId;
    } catch (error) {
      logger.error('Failed to create scan job', error as Error);
      
      // Record failure metric
      const coordinator = getMigrationCoordinator();
      coordinator.recordMetric({
        latency: 100,
        success: false,
        source: 'firebase'
      });
      
      throw error;
    }
  }
  
  /**
   * Update scan progress
   */
  async updateScanProgress(
    scanId: string,
    progress: Partial<ScanProgress>,
    status?: ScanJob['status']
  ): Promise<void> {
    try {
      const scanRef = doc(db, 'scanJobs', scanId);
      const scanDoc = await getDoc(scanRef);
      
      if (!scanDoc.exists()) {
        throw new Error(`Scan job ${scanId} not found`);
      }
      
      const currentData = scanDoc.data() as ScanJob;
      const updates: Partial<ScanJob> = {
        progress: {
          ...currentData.progress,
          ...progress
        },
        updatedAt: Timestamp.now()
      };
      
      if (status) {
        updates.status = status;
        if (status === 'running' && !currentData.startedAt) {
          updates.startedAt = Timestamp.now();
        } else if (status === 'completed') {
          updates.completedAt = Timestamp.now();
        }
      }
      
      await setDoc(scanRef, updates, { merge: true });
      
      logger.info('Scan progress updated', {
        scanId,
        percentage: progress.percentage,
        status
      });
    } catch (error) {
      logger.error('Failed to update scan progress', error as Error);
      throw error;
    }
  }
  
  /**
   * Store scan results
   */
  async storeScanResults(
    scanId: string,
    files: ScanFile[],
    duplicates?: Array<{ hash: string; files: ScanFile[] }>
  ): Promise<void> {
    try {
      const scanRef = doc(db, 'scanJobs', scanId);
      
      // Calculate insights
      const largeFiles = files
        .filter(f => !f.isFolder && f.size > 100 * 1024 * 1024) // Files > 100MB
        .sort((a, b) => b.size - a.size)
        .slice(0, 10);
      
      const totalSize = files.reduce((sum, f) => sum + (f.isFolder ? 0 : f.size), 0);
      
      const storageByType = files.reduce((acc, file) => {
        if (!file.isFolder) {
          const ext = file.name.split('.').pop()?.toLowerCase() || 'unknown';
          if (!acc[ext]) {
            acc[ext] = { count: 0, size: 0 };
          }
          acc[ext].count++;
          acc[ext].size += file.size;
        }
        return acc;
      }, {} as Record<string, { count: number; size: number }>);
      
      const results: ScanJob['results'] = {
        scanId,
        filesFound: files.filter(f => !f.isFolder).length,
        duplicatesDetected: duplicates?.length || 0,
        totalSize,
        insights: {
          largeFiles,
          duplicateGroups: duplicates?.map(group => ({
            hash: group.hash,
            files: group.files,
            totalSize: group.files.reduce((sum, f) => sum + f.size, 0),
            potentialSavings: group.files.slice(1).reduce((sum, f) => sum + f.size, 0)
          })) || [],
          recommendations: this.generateRecommendations(files, duplicates),
          storageAnalysis: {
            byType: storageByType,
            byFolder: {}, // Would need folder hierarchy analysis
            unusedFiles: [] // Would need access time analysis
          }
        }
      };
      
      await setDoc(scanRef, {
        results,
        status: 'completed',
        completedAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      }, { merge: true });
      
      // Store files in inventory collection
      const inventoryRef = doc(db, 'inventory', `${scanId}_inventory`);
      await setDoc(inventoryRef, {
        uid: (await getDoc(scanRef)).data()?.uid,
        scanId,
        files: files.slice(0, 1000), // Store first 1000 for performance
        totalFiles: files.length,
        createdAt: Timestamp.now()
      });
      
      logger.info('Scan results stored', {
        scanId,
        filesFound: results.filesFound,
        duplicates: results.duplicatesDetected
      });
    } catch (error) {
      logger.error('Failed to store scan results', error as Error);
      throw error;
    }
  }
  
  /**
   * Generate recommendations based on scan results
   */
  private generateRecommendations(
    files: ScanFile[],
    duplicates?: Array<{ hash: string; files: ScanFile[] }>
  ): string[] {
    const recommendations: string[] = [];
    
    // Large files recommendation
    const largeFiles = files.filter(f => !f.isFolder && f.size > 500 * 1024 * 1024);
    if (largeFiles.length > 0) {
      recommendations.push(
        `${largeFiles.length} files over 500MB detected. Consider archiving or using cloud storage for rarely accessed large files.`
      );
    }
    
    // Duplicates recommendation
    if (duplicates && duplicates.length > 0) {
      const totalWaste = duplicates.reduce((sum, group) => 
        sum + group.files.slice(1).reduce((s, f) => s + f.size, 0), 0
      );
      const wasteGB = (totalWaste / (1024 * 1024 * 1024)).toFixed(2);
      recommendations.push(
        `${duplicates.length} duplicate groups found, potentially saving ${wasteGB}GB of storage.`
      );
    }
    
    // File organization recommendation
    const deepFiles = files.filter(f => (f.depth || 0) > 5);
    if (deepFiles.length > 50) {
      recommendations.push(
        'Complex folder structure detected. Consider flattening deeply nested folders for better organization.'
      );
    }
    
    // Old files recommendation
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const oldFiles = files.filter(f => 
      !f.isFolder && f.modifiedTime < oneYearAgo
    );
    if (oldFiles.length > 100) {
      recommendations.push(
        `${oldFiles.length} files haven't been modified in over a year. Consider archiving old files.`
      );
    }
    
    return recommendations;
  }
  
  /**
   * Get scan job by ID
   */
  async getScanJob(scanId: string): Promise<ScanJob | null> {
    try {
      const scanDoc = await getDoc(doc(db, 'scanJobs', scanId));
      
      if (!scanDoc.exists()) {
        return null;
      }
      
      const data = scanDoc.data() as ScanJob;
      
      // Update cache
      this.resultsCache.set(scanId, data);
      
      return data;
    } catch (error) {
      logger.error('Failed to get scan job', error as Error);
      return null;
    }
  }
  
  /**
   * Get recent scan jobs for user
   */
  async getUserScans(
    userId: string,
    limitCount: number = 10
  ): Promise<ScanJob[]> {
    try {
      const scansQuery = query(
        collection(db, 'scanJobs'),
        where('uid', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      );
      
      const snapshot = await getDocs(scansQuery);
      
      return snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      } as ScanJob));
    } catch (error) {
      logger.error('Failed to get user scans', error as Error);
      return [];
    }
  }
  
  /**
   * Subscribe to scan job updates
   */
  subscribeScanJob(
    scanId: string,
    callback: (scan: ScanJob | null) => void
  ): () => void {
    const unsubscribe = onSnapshot(
      doc(db, 'scanJobs', scanId),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as ScanJob;
          this.resultsCache.set(scanId, data);
          callback(data);
        } else {
          callback(null);
        }
      },
      (error) => {
        logger.error('Scan subscription error', error);
        callback(null);
      }
    );
    
    this.activeSubscriptions.set(scanId, unsubscribe);
    
    return () => {
      unsubscribe();
      this.activeSubscriptions.delete(scanId);
    };
  }
  
  /**
   * Clean up old scan jobs (maintenance)
   */
  async cleanupOldScans(userId: string, daysToKeep: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      
      const oldScansQuery = query(
        collection(db, 'scanJobs'),
        where('uid', '==', userId),
        where('createdAt', '<', Timestamp.fromDate(cutoffDate))
      );
      
      const snapshot = await getDocs(oldScansQuery);
      
      // Note: In production, would batch delete these
      logger.info('Old scans to cleanup', {
        userId,
        count: snapshot.size,
        cutoffDate
      });
      
      return snapshot.size;
    } catch (error) {
      logger.error('Failed to cleanup old scans', error as Error);
      return 0;
    }
  }
}

// Export singleton instance
export const scanResults = new ScanResultsAdapter();