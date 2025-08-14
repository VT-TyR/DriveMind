'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ExportDialog } from '@/components/export-dialog';
import { 
  Download, 
  Database, 
  FileText, 
  BarChart3, 
  FolderTree,
  Calendar,
  TrendingUp,
  Users,
  HardDrive,
  Clock
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useErrorHandler } from '@/hooks/use-error-handler';
import { logger } from '@/lib/logger';

// Mock data - in a real app, this would come from your data services
const mockFileInventory = [
  {
    id: '1',
    name: 'Project Proposal.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size: 245760,
    modifiedTime: '2024-01-15T10:30:00Z',
    path: '/Work/Documents/Project Proposal.docx',
    analysisResults: { category: 'document', confidence: 0.95 }
  },
  {
    id: '2',
    name: 'vacation-photo-1.jpg',
    mimeType: 'image/jpeg',
    size: 1024000,
    modifiedTime: '2024-01-10T14:20:00Z',
    path: '/Personal/Photos/vacation-photo-1.jpg',
    analysisResults: { category: 'image', confidence: 0.98 }
  },
  {
    id: '3',
    name: 'backup-data.zip',
    mimeType: 'application/zip',
    size: 5242880,
    modifiedTime: '2024-01-05T09:15:00Z',
    path: '/Backups/backup-data.zip'
  }
];

const mockDuplicateGroups = [
  {
    id: 'group-1',
    files: [
      {
        id: '4',
        name: 'document-copy.pdf',
        path: '/Work/document-copy.pdf',
        size: 512000
      },
      {
        id: '5',
        name: 'document (1).pdf',
        path: '/Work/Duplicates/document (1).pdf',
        size: 512000
      }
    ],
    similarity: 100,
    type: 'exact'
  },
  {
    id: 'group-2',
    files: [
      {
        id: '6',
        name: 'IMG_001.jpg',
        path: '/Photos/IMG_001.jpg',
        size: 2048000
      },
      {
        id: '7',
        name: 'IMG_001_edited.jpg',
        path: '/Photos/Edited/IMG_001_edited.jpg',
        size: 2100000
      }
    ],
    similarity: 95,
    type: 'similar'
  }
];

const mockAnalysisResults = {
  fileTypes: {
    documents: 45,
    images: 120,
    videos: 23,
    archives: 8
  },
  categories: {
    work: 89,
    personal: 76,
    backups: 31
  },
  recommendations: [
    'Consider archiving files older than 1 year',
    'Organize photos into dated folders',
    'Remove duplicate backup files'
  ],
  insights: {
    totalSize: '15.2 GB',
    oldestFile: '2019-03-15',
    largestFile: 'video-presentation.mp4 (2.1 GB)',
    mostCommonType: 'image/jpeg'
  }
};

export default function VaultPage() {
  const { user } = useAuth();
  const { handleAsyncError } = useErrorHandler({ component: 'VaultPage', userId: user?.uid });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user) {
      logger.info('Vault page accessed', {
        userId: user.uid,
        page: 'vault'
      });
      
      // Simulate data loading
      setTimeout(() => setIsLoading(false), 1000);
    }
  }, [user]);

  if (!user) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
          <p className="text-muted-foreground">Please sign in to access the vault.</p>
        </div>
      </div>
    );
  }

  const vaultStats = {
    totalFiles: mockFileInventory.length,
    totalSize: mockFileInventory.reduce((sum, file) => sum + (file.size || 0), 0),
    duplicateGroups: mockDuplicateGroups.length,
    potentialSavings: mockDuplicateGroups.reduce((sum, group) => 
      sum + (group.files.slice(1).reduce((groupSum, file) => groupSum + (file.size || 0), 0)), 0
    ),
    lastExport: null
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="container mx-auto p-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Data Vault</h1>
            <p className="text-muted-foreground">
              Export and manage your organized file data
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant="outline">
              {vaultStats.totalFiles} files tracked
            </Badge>
          </div>
        </div>

        {/* Vault Statistics */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Files</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{vaultStats.totalFiles.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                Across all folders
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Size</CardTitle>
              <HardDrive className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatFileSize(vaultStats.totalSize)}</div>
              <p className="text-xs text-muted-foreground">
                Storage used
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Duplicate Groups</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{vaultStats.duplicateGroups}</div>
              <p className="text-xs text-muted-foreground">
                Found by analysis
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Potential Savings</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatFileSize(vaultStats.potentialSavings)}</div>
              <p className="text-xs text-muted-foreground">
                From removing duplicates
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Export Sections */}
        <Tabs defaultValue="inventory" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="inventory">File Inventory</TabsTrigger>
            <TabsTrigger value="duplicates">Duplicate Report</TabsTrigger>
            <TabsTrigger value="analysis">Analysis Report</TabsTrigger>
          </TabsList>

          <TabsContent value="inventory" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center space-x-2">
                      <Database className="h-5 w-5" />
                      <span>File Inventory Export</span>
                    </CardTitle>
                    <CardDescription>
                      Export your complete file inventory with metadata, paths, and analysis results
                    </CardDescription>
                  </div>
                  <ExportDialog
                    trigger={
                      <Button>
                        <Download className="h-4 w-4 mr-2" />
                        Export Inventory
                      </Button>
                    }
                    exportType="inventory"
                    data={mockFileInventory}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Total files:</span>
                      <span className="ml-2 font-medium">{mockFileInventory.length}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Total size:</span>
                      <span className="ml-2 font-medium">{formatFileSize(vaultStats.totalSize)}</span>
                    </div>
                  </div>
                  
                  <ScrollArea className="h-48 w-full border rounded-md p-4">
                    <div className="space-y-2">
                      {mockFileInventory.slice(0, 10).map((file, index) => (
                        <div key={file.id} className="flex items-center justify-between text-sm">
                          <div className="flex items-center space-x-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="truncate max-w-[200px]">{file.name}</span>
                          </div>
                          <div className="text-muted-foreground">
                            {formatFileSize(file.size || 0)}
                          </div>
                        </div>
                      ))}
                      {mockFileInventory.length > 10 && (
                        <div className="text-center text-sm text-muted-foreground pt-2">
                          And {mockFileInventory.length - 10} more files...
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="duplicates" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center space-x-2">
                      <BarChart3 className="h-5 w-5" />
                      <span>Duplicate Files Report</span>
                    </CardTitle>
                    <CardDescription>
                      Export duplicate file detection results and space-saving recommendations
                    </CardDescription>
                  </div>
                  <ExportDialog
                    trigger={
                      <Button>
                        <Download className="h-4 w-4 mr-2" />
                        Export Duplicates
                      </Button>
                    }
                    exportType="duplicates"
                    data={mockDuplicateGroups}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Duplicate groups:</span>
                      <span className="ml-2 font-medium">{mockDuplicateGroups.length}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Potential savings:</span>
                      <span className="ml-2 font-medium">{formatFileSize(vaultStats.potentialSavings)}</span>
                    </div>
                  </div>

                  <ScrollArea className="h-48 w-full border rounded-md p-4">
                    <div className="space-y-3">
                      {mockDuplicateGroups.map((group) => (
                        <div key={group.id} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="font-medium text-sm">Group {group.id}</div>
                            <Badge variant={group.similarity === 100 ? 'destructive' : 'secondary'}>
                              {group.similarity}% match
                            </Badge>
                          </div>
                          {group.files.map((file) => (
                            <div key={file.id} className="ml-4 flex items-center justify-between text-sm text-muted-foreground">
                              <span className="truncate max-w-[200px]">{file.name}</span>
                              <span>{formatFileSize(file.size || 0)}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analysis" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center space-x-2">
                      <BarChart3 className="h-5 w-5" />
                      <span>AI Analysis Report</span>
                    </CardTitle>
                    <CardDescription>
                      Export AI-powered insights, categorization, and recommendations
                    </CardDescription>
                  </div>
                  <ExportDialog
                    trigger={
                      <Button>
                        <Download className="h-4 w-4 mr-2" />
                        Export Analysis
                      </Button>
                    }
                    exportType="analysis"
                    data={mockAnalysisResults}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">File Types</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-1 text-sm">
                          {Object.entries(mockAnalysisResults.fileTypes).map(([type, count]) => (
                            <div key={type} className="flex justify-between">
                              <span className="capitalize">{type}:</span>
                              <span className="font-medium">{count}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">Categories</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-1 text-sm">
                          {Object.entries(mockAnalysisResults.categories).map(([category, count]) => (
                            <div key={category} className="flex justify-between">
                              <span className="capitalize">{category}:</span>
                              <span className="font-medium">{count}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Key Insights</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>Total Size: <span className="font-medium">{mockAnalysisResults.insights.totalSize}</span></div>
                        <div>Oldest File: <span className="font-medium">{mockAnalysisResults.insights.oldestFile}</span></div>
                        <div className="col-span-2">Largest File: <span className="font-medium">{mockAnalysisResults.insights.largestFile}</span></div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}