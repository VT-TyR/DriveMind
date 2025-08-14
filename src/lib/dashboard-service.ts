/**
 * Dashboard data service for aggregating file statistics and insights
 */
import { File } from './types';
import { DuplicateGroup, detectDuplicates } from './duplicate-detection';

export interface DashboardStats {
  totalFiles: number;
  totalSize: number;
  duplicateFiles: number;
  duplicateSize: number;
  folderCount: number;
  fileTypeDistribution: Array<{ type: string; count: number; size: number }>;
  recentActivity: Array<{ file: File; action: string; date: Date }>;
  largestFiles: File[];
  oldestFiles: File[];
  duplicateGroups: DuplicateGroup[];
}

export interface StorageTimelineData {
  date: string;
  files: number;
  totalSize: number;
}

/**
 * Calculate dashboard statistics from file data
 */
export function calculateDashboardStats(files: File[]): DashboardStats {
  const duplicateGroups = detectDuplicates(files);
  const duplicateFileIds = new Set(
    duplicateGroups.flatMap(group => group.files.slice(1).map(f => f.id))
  );

  // Calculate basic stats
  const totalFiles = files.filter(f => f.type !== 'Folder').length;
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  const duplicateFiles = duplicateFileIds.size;
  const duplicateSize = files
    .filter(f => duplicateFileIds.has(f.id))
    .reduce((sum, file) => sum + file.size, 0);
  const folderCount = files.filter(f => f.type === 'Folder').length;

  // File type distribution
  const typeMap = new Map<string, { count: number; size: number }>();
  files.forEach(file => {
    if (file.type === 'Folder') return;
    
    const existing = typeMap.get(file.type) || { count: 0, size: 0 };
    typeMap.set(file.type, {
      count: existing.count + 1,
      size: existing.size + file.size
    });
  });

  const fileTypeDistribution = Array.from(typeMap.entries()).map(([type, data]) => ({
    type,
    count: data.count,
    size: data.size
  }));

  // Recent activity (mock for now - in real app would come from Drive API activity)
  const recentActivity = files
    .filter(f => f.type !== 'Folder')
    .sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime())
    .slice(0, 10)
    .map(file => ({
      file,
      action: 'modified',
      date: file.lastModified
    }));

  // Largest files
  const largestFiles = files
    .filter(f => f.type !== 'Folder')
    .sort((a, b) => b.size - a.size)
    .slice(0, 10);

  // Oldest files
  const oldestFiles = files
    .filter(f => f.type !== 'Folder')
    .sort((a, b) => a.lastModified.getTime() - b.lastModified.getTime())
    .slice(0, 10);

  return {
    totalFiles,
    totalSize,
    duplicateFiles,
    duplicateSize,
    folderCount,
    fileTypeDistribution,
    recentActivity,
    largestFiles,
    oldestFiles,
    duplicateGroups
  };
}

/**
 * Generate mock storage timeline data
 * In a real app, this would come from historical data
 */
export function generateStorageTimelineData(files: File[]): StorageTimelineData[] {
  const timeline: StorageTimelineData[] = [];
  const now = new Date();
  
  // Generate 30 days of mock data
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    
    // Simulate gradual growth in files and storage
    const baseFiles = Math.max(1, files.length - (i * 2));
    const dailyFiles = baseFiles + Math.floor(Math.random() * 10);
    const dailySize = files.reduce((sum, file) => sum + file.size, 0) * (dailyFiles / files.length);
    
    timeline.push({
      date: date.toISOString().split('T')[0],
      files: dailyFiles,
      totalSize: Math.floor(dailySize)
    });
  }
  
  return timeline;
}

/**
 * Format bytes for display
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Get color for file type
 */
export function getFileTypeColor(type: string): string {
  const colors: Record<string, string> = {
    'Document': '#3b82f6',
    'Spreadsheet': '#10b981',
    'Presentation': '#f59e0b',
    'Image': '#ec4899',
    'Video': '#8b5cf6',
    'PDF': '#ef4444',
    'Other': '#6b7280'
  };
  
  return colors[type] || colors['Other'];
}