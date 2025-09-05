'use client';

import React, { useState, useEffect } from 'react';
import MainLayout from '@/components/shared/main-layout';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
  Clock,
  RefreshCw,
  AlertTriangle,
  Sparkles
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useErrorHandler } from '@/hooks/use-error-handler';
import { useToast } from '@/hooks/use-toast';
import { useOperatingMode } from '@/contexts/operating-mode-context';
import { File } from '@/lib/types';
import { detectNearDuplicateFiles } from '@/ai/flows/detect-near-duplicate-files';
import { listSampleFiles } from '@/ai/flows/drive-list-sample';

interface DuplicateGroup {
  id: string;
  files: Array<{
    id: string;
    name: string;
    path: string;
    size: number;
  }>;
  similarity: number;
  type: 'exact' | 'similar';
}

interface AnalysisResults {
  fileTypes: Record<string, number>;
  categories: Record<string, number>;
  recommendations: string[];
  insights: {
    totalSize: string;
    oldestFile: string;
    largestFile: string;
    mostCommonType: string;
  };
}

export default function VaultPage() {
  const { user } = useAuth();
  const { isAiEnabled } = useOperatingMode();
  const { handleAsyncError } = useErrorHandler({ component: 'VaultPage', userId: user?.uid });
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [fileInventory, setFileInventory] = useState<File[]>([]);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [analysisResults, setAnalysisResults] = useState<AnalysisResults | null>(null);
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);

  useEffect(() => {
    if (user) {
      console.log('Vault page accessed', {
        userId: user.uid,
        page: 'vault'
      });
    }
  }, [user]);

  const loadFileInventory = async () => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Authentication Required',
        description: 'Please sign in to load your file inventory.',
      });
      return;
    }

    setIsLoading(true);
    try {
      const authData = { uid: user.uid, email: user.email || undefined };
      const result = await listSampleFiles({ auth: authData }); // Load files for vault
      setFileInventory(result.files);
      setLastScanTime(new Date());
      
      console.log('File inventory loaded', {
        userId: user.uid,
        fileCount: result.files.length
      });
      
      toast({
        title: 'Inventory Updated',
        description: `Loaded ${result.files.length} files from your Google Drive.`,
      });
    } catch (error: any) {
      await handleAsyncError(error, { operation: 'loadFileInventory' });
      toast({
        variant: 'destructive',
        title: 'Failed to Load Files',
        description: error.message || 'Could not connect to your Google Drive.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const scanForDuplicates = async () => {
    if (!user || !isAiEnabled) {
      toast({
        variant: 'destructive',
        title: 'AI Mode Required',
        description: 'Enable AI-Assisted mode to scan for duplicates.',
      });
      return;
    }

    if (fileInventory.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No Files Loaded',
        description: 'Please load your file inventory first.',
      });
      return;
    }

    setIsLoading(true);
    try {
      const fileMetadatas = fileInventory.map(f => ({
        id: f.id,
        name: f.name,
        size: f.size,
        hash: `hash_${f.id}` // In production, this would be actual file hash
      }));

      const result = await detectNearDuplicateFiles({ fileMetadatas });
      
      const groups: DuplicateGroup[] = result.nearDuplicateGroups.map((group, index) => ({
        id: `group-${index}`,
        files: group.map((fileName) => {
          const file = fileInventory.find(f => f.name === fileName);
          return {
            id: file?.id || `unknown_${fileName}`,
            name: fileName,
            path: file?.path.join('/') || '/Unknown',
            size: file?.size || 0
          };
        }),
        similarity: 100, // AI detection result
        type: 'exact' as const
      }));
      
      setDuplicateGroups(groups);
      
      console.log('Duplicate scan completed', {
        userId: user.uid,
        groupsFound: groups.length
      });
      
      toast({
        title: 'Duplicate Scan Complete',
        description: `Found ${groups.length} groups of potential duplicates.`,
      });
    } catch (error: any) {
      await handleAsyncError(error, { operation: 'scanForDuplicates' });
      toast({
        variant: 'destructive',
        title: 'Duplicate Scan Failed',
        description: error.message || 'Could not analyze files for duplicates.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const generateAnalysisReport = () => {
    if (fileInventory.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No Files to Analyze',
        description: 'Please load your file inventory first.',
      });
      return;
    }

    const fileTypes: Record<string, number> = {};
    const categories: Record<string, number> = {
      documents: 0,
      images: 0,
      videos: 0,
      other: 0
    };
    
    let totalSize = 0;
    let oldestFile: File | null = null;
    let largestFile: File | null = null;
    const mimeTypeCounts: Record<string, number> = {};

    fileInventory.forEach(file => {
      // Count file types
      const type = file.type.toLowerCase();
      fileTypes[type] = (fileTypes[type] || 0) + 1;
      
      // Categorize files
      if (['document', 'pdf'].includes(type)) {
        categories.documents++;
      } else if (type === 'image') {
        categories.images++;
      } else if (type === 'video') {
        categories.videos++;
      } else {
        categories.other++;
      }
      
      // Track statistics
      totalSize += file.size;
      
      if (!oldestFile || file.lastModified < oldestFile.lastModified) {
        oldestFile = file;
      }
      
      if (!largestFile || file.size > largestFile.size) {
        largestFile = file;
      }
      
      // Count MIME types (would be actual MIME types in production)
      const mimeType = `${type}/*`;
      mimeTypeCounts[mimeType] = (mimeTypeCounts[mimeType] || 0) + 1;
    });

    const mostCommonType = Object.entries(mimeTypeCounts)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'unknown';

    const analysis: AnalysisResults = {
      fileTypes,
      categories,
      recommendations: [
        fileInventory.filter(f => new Date().getTime() - f.lastModified.getTime() > 365 * 24 * 60 * 60 * 1000).length > 0 
          ? 'Consider archiving files older than 1 year' 
          : 'File ages look reasonable',
        categories.images > 50 ? 'Consider organizing photos into dated folders' : 'Photo organization looks good',
        duplicateGroups.length > 0 ? `Remove ${duplicateGroups.length} duplicate file groups` : 'No duplicates detected'
      ],
      insights: {
        totalSize: formatFileSize(totalSize),
        oldestFile: oldestFile ? oldestFile.lastModified.toISOString().split('T')[0] : 'N/A',
        largestFile: largestFile ? `${largestFile.name} (${formatFileSize(largestFile.size)})` : 'N/A',
        mostCommonType
      }
    };

    setAnalysisResults(analysis);
    
    console.log('Analysis report generated', {
      userId: user?.uid,
      totalFiles: fileInventory.length,
      totalSize
    });
    
    toast({
      title: 'Analysis Complete',
      description: 'Generated comprehensive file analysis report.',
    });
  };

  const vaultStats = {
    totalFiles: fileInventory.length,
    totalSize: fileInventory.reduce((sum, file) => sum + (file.size || 0), 0),
    duplicateGroups: duplicateGroups.length,
    potentialSavings: duplicateGroups.reduce((sum, group) => 
      sum + (group.files.slice(1).reduce((groupSum, file) => groupSum + (file.size || 0), 0)), 0
    ),
    lastScan: lastScanTime
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (!user) {
    return (
      <MainLayout>
        <div className="flex-1 space-y-4 p-4 pt-6 sm:p-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="text-destructive" />
                Access Denied
              </CardTitle>
              <CardDescription>
                Please sign in to access the vault.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="flex-1 space-y-4 p-4 pt-6 sm:p-8">
        {/* Header */}
        <div className="flex items-center justify-between space-y-2">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="md:hidden" />
            <h2 className="text-3xl font-bold tracking-tight font-headline">
              Data Vault
            </h2>
            {isAiEnabled && <Badge variant="secondary" className="gap-1"><Sparkles className="h-3 w-3" />AI Active</Badge>}
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant="outline">
              {vaultStats.totalFiles} files tracked
            </Badge>
            <Button onClick={loadFileInventory} disabled={isLoading} variant="outline">
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              {isLoading ? 'Loading...' : 'Refresh'}
            </Button>
          </div>
        </div>
        
        {fileInventory.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="text-primary" />
                No Data Available
              </CardTitle>
              <CardDescription>
                Load your Google Drive files to begin analyzing and exporting your data.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={loadFileInventory} disabled={isLoading}>
                <Database className="h-4 w-4 mr-2" />
                {isLoading ? 'Loading Files...' : 'Load File Inventory'}
              </Button>
            </CardContent>
          </Card>
        )}
        
        {!isAiEnabled && fileInventory.length > 0 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Enable AI-Assisted mode to unlock duplicate detection and advanced analysis features.
            </AlertDescription>
          </Alert>
        )}

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
                      <Button disabled={fileInventory.length === 0}>
                        <Download className="h-4 w-4 mr-2" />
                        Export Inventory
                      </Button>
                    }
                    exportType="inventory"
                    data={fileInventory}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Total files:</span>
                      <span className="ml-2 font-medium">{fileInventory.length}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Total size:</span>
                      <span className="ml-2 font-medium">{formatFileSize(vaultStats.totalSize)}</span>
                    </div>
                    {vaultStats.lastScan && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Last scan:</span>
                        <span className="ml-2 font-medium">{vaultStats.lastScan.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                  
                  <ScrollArea className="h-48 w-full border rounded-md p-4">
                    <div className="space-y-2">
                      {fileInventory.slice(0, 10).map((file) => (
                        <div key={file.id} className="flex items-center justify-between text-sm">
                          <div className="flex items-center space-x-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="truncate max-w-[200px]">{file.name}</span>
                          </div>
                          <div className="text-muted-foreground">
                            {formatFileSize(file.size)}
                          </div>
                        </div>
                      ))}
                      {fileInventory.length > 10 && (
                        <div className="text-center text-sm text-muted-foreground pt-2">
                          And {fileInventory.length - 10} more files...
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                  
                  {fileInventory.length === 0 && (
                    <div className="text-center text-sm text-muted-foreground py-8">
                      No files loaded. Click "Load File Inventory" to begin.
                    </div>
                  )}
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
                      <Button disabled={duplicateGroups.length === 0}>
                        <Download className="h-4 w-4 mr-2" />
                        Export Duplicates
                      </Button>
                    }
                    exportType="duplicates"
                    data={duplicateGroups}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Duplicate groups:</span>
                      <span className="ml-2 font-medium">{duplicateGroups.length}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Potential savings:</span>
                      <span className="ml-2 font-medium">{formatFileSize(vaultStats.potentialSavings)}</span>
                    </div>
                  </div>
                  
                  {duplicateGroups.length === 0 && (
                    <div className="text-center py-8">
                      <div className="text-sm text-muted-foreground mb-4">
                        No duplicate scan results available.
                      </div>
                      <Button 
                        onClick={scanForDuplicates} 
                        disabled={!isAiEnabled || fileInventory.length === 0 || isLoading}
                        variant="outline"
                      >
                        <Sparkles className="h-4 w-4 mr-2" />
                        Scan for Duplicates
                      </Button>
                      {!isAiEnabled && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Enable AI-Assisted mode to scan for duplicates
                        </p>
                      )}
                    </div>
                  )}

                  {duplicateGroups.length > 0 && (
                    <ScrollArea className="h-48 w-full border rounded-md p-4">
                      <div className="space-y-3">
                        {duplicateGroups.map((group) => (
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
                                <span>{formatFileSize(file.size)}</span>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
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
                  <div className="flex gap-2">
                    <ExportDialog
                      trigger={
                        <Button disabled={!analysisResults}>
                          <Download className="h-4 w-4 mr-2" />
                          Export Analysis
                        </Button>
                      }
                      exportType="analysis"
                      data={analysisResults}
                    />
                    {!analysisResults && (
                      <Button 
                        onClick={generateAnalysisReport} 
                        disabled={fileInventory.length === 0 || isLoading}
                        variant="outline"
                      >
                        <BarChart3 className="h-4 w-4 mr-2" />
                        Generate Analysis
                      </Button>
                    )}
                  </div>
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
                          {analysisResults ? (
                            Object.entries(analysisResults.fileTypes).map(([type, count]) => (
                              <div key={type} className="flex justify-between">
                                <span className="capitalize">{type}:</span>
                                <span className="font-medium">{count}</span>
                              </div>
                            ))
                          ) : (
                            <div className="text-muted-foreground">Generate analysis report to view file types</div>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">Categories</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-1 text-sm">
                          {analysisResults ? (
                            Object.entries(analysisResults.categories).map(([category, count]) => (
                              <div key={category} className="flex justify-between">
                                <span className="capitalize">{category}:</span>
                                <span className="font-medium">{count}</span>
                              </div>
                            ))
                          ) : (
                            <div className="text-muted-foreground">Generate analysis report to view categories</div>
                          )}
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
                        {analysisResults ? (
                          <>
                            <div>Total Size: <span className="font-medium">{analysisResults.insights.totalSize}</span></div>
                            <div>Oldest File: <span className="font-medium">{analysisResults.insights.oldestFile}</span></div>
                            <div className="col-span-2">Largest File: <span className="font-medium">{analysisResults.insights.largestFile}</span></div>
                            <div className="col-span-2">Most Common Type: <span className="font-medium">{analysisResults.insights.mostCommonType}</span></div>
                          </>
                        ) : (
                          <div className="col-span-2 text-muted-foreground">Generate analysis report to view insights</div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}