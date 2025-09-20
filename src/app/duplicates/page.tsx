

'use client';
import React from 'react';
import MainLayout from '@/components/shared/main-layout';
import { SidebarTrigger } from '@/components/ui/sidebar';
import type { File } from '@/lib/types';
// Using existing auth context
import { useOperatingMode } from '@/contexts/operating-mode-context';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { useFileOperations } from '@/contexts/file-operations-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Copy, ScanSearch, Check, Trash, Users, PlusCircle, Sparkles, Download } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { BatchOperationsPanel } from '@/components/shared/file-actions';


interface DuplicateGroup {
  id: string;
  files: Array<{
    id: string;
    name: string;
    size: number;
    modifiedTime: string;
    confidence: number;
  }>;
  algorithm: string;
  totalSize: number;
  potentialSavings: number;
}

export default function DuplicatesPage() {
  const [duplicateGroups, setDuplicateGroups] = React.useState<DuplicateGroup[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);
  const [scanId, setScanId] = React.useState<string | null>(null);
  const { isAiEnabled } = useOperatingMode();
  const { toast } = useToast();
  const { user } = useAuth();
  // Using existing user from auth context
  const { addToBatch, isProcessing } = useFileOperations();

  const handleDetectDuplicates = async () => {
    if (!isAiEnabled) {
      toast({
        variant: 'destructive',
        title: 'AI Mode Disabled',
        description: 'Please enable AI-Assisted mode to detect duplicates.',
      });
      return;
    }

    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Sign in Required',
        description: 'Please sign in to analyze your files.',
      });
      return;
    }

    setIsLoading(true);
    setDuplicateGroups([]);
    try {
      const token = await user.getIdToken();

      // First, run a scan if we don't have a recent one
      if (!scanId) {
        const scanResponse = await fetch('/api/workflows/scan', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ maxDepth: 10, includeTrashed: false }),
        });

        if (!scanResponse.ok) {
          throw new Error('Failed to scan drive');
        }

        const scanResult = await scanResponse.json();
        setScanId(scanResult.scanId);
      }

      // Run duplicate detection
      const duplicatesResponse = await fetch('/api/workflows/duplicates', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scanId: scanId,
          algorithms: ['content_hash', 'fuzzy_match', 'version_detect'],
          confidenceThreshold: 0.8,
          maxGroups: 50
        }),
      });

      if (!duplicatesResponse.ok) {
        throw new Error('Failed to detect duplicates');
      }

      const result = await duplicatesResponse.json();
      
      // Transform the result to match our interface
      const transformedGroups: DuplicateGroup[] = result.duplicateGroups.map((group: any, index: number) => ({
        id: group.id || `group_${index}`,
        files: group.files.map((file: any) => ({
          id: file.id,
          name: file.name,
          size: file.size || 0,
          modifiedTime: file.modifiedTime || new Date().toISOString(),
          confidence: group.confidence || 0.8
        })),
        algorithm: group.algorithm || 'smart_detection',
        totalSize: group.files.reduce((sum: number, file: any) => sum + (file.size || 0), 0),
        potentialSavings: group.potentialSpaceSaved || 0
      }));

      setDuplicateGroups(transformedGroups);
      toast({
        title: 'Duplicate Scan Complete',
        description: `Found ${transformedGroups.length} potential duplicate groups in your Google Drive.`,
      });
    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'Failed to Detect Duplicates',
            description: error.message || 'Could not connect to the duplicate detection service.',
        });
        setDuplicateGroups([]);
    } finally {
        setIsLoading(false);
    }
  };

  const handleAddToBatch = (fileName: string, fileId: string, action: 'keep' | 'delete') => {
    if (!user || duplicateGroups.length === 0) return;

    if (action === 'delete') {
      addToBatch('delete', fileId, fileName);
      toast({
        title: 'Added to Batch',
        description: `${fileName} marked for deletion.`,
      });
    } else {
      toast({
        title: 'File Marked Safe',
        description: `${fileName} will be kept (not added to batch).`,
      });
    }
  };

  const handleExport = async (format: 'csv' | 'json' | 'pdf' = 'csv') => {
    if (!user) {
      toast({ variant: 'destructive', title: 'Sign in Required', description: 'Please sign in to export reports.' });
      return;
    }
    try {
      setIsExporting(true);
      const token = await user.getIdToken();
      const body: any = { format };
      if (duplicateGroups.length > 0) {
        // Normalize to API shape (keep minimal fields)
        body.groups = duplicateGroups.map(g => ({
          id: g.id,
          similarity: Math.round((g.files.reduce((acc, f) => acc + (f.confidence || 0), 0) / Math.max(1, g.files.length)) * 100) || 100,
          type: g.algorithm || 'exact',
          files: g.files.map(f => ({ id: f.id, name: f.name, size: f.size || 0 }))
        }));
      } else {
        // No groups yet – request detection-driven export on server
        body.detection = { algorithm: 'thorough', includeContentHashing: true, includeFuzzyMatching: true, minFileSize: 1024, maxFiles: 2000 };
      }

      const res = await fetch('/api/exports/duplicates', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || 'Failed to export duplicates');
      }

      const blob = await res.blob();
      // Try to parse filename from Content-Disposition
      const cd = res.headers.get('Content-Disposition') || '';
      const match = cd.match(/filename="?([^";]+)"?/i);
      const filename = match?.[1] || `duplicate-report.${format}`;

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      toast({ title: 'Export complete', description: `${filename} downloaded.` });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Export failed', description: err?.message || 'Unable to export duplicates.' });
    } finally {
      setIsExporting(false);
    }
  };

  // Keyboard shortcuts: Ctrl+E for CSV, Ctrl+Shift+E for JSON
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!user || isExporting) return;
      if (e.ctrlKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        if (e.shiftKey) handleExport('json');
        else handleExport('csv');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [user, isExporting, duplicateGroups]);


  return (
    <MainLayout>
      <div className="flex-1 space-y-4 p-4 pt-6 sm:p-8">
        <div className="flex items-center justify-between space-y-2">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="md:hidden" />
            <h2 className="text-3xl font-bold tracking-tight font-headline">
              Duplicate Detection
            </h2>
            {isAiEnabled && <Badge variant="secondary" className="gap-1"><Sparkles className="h-3 w-3" />AI Active</Badge>}
          </div>
        </div>

        {!user && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Users className="text-primary"/> Authentication Required</CardTitle>
              <CardDescription>
                Sign in with your Google account to scan for duplicate files in your Google Drive.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Please sign in to access duplicate detection features.
              </p>
            </CardContent>
          </Card>
        )}

        {user && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Users className="text-primary"/> Connected Account</CardTitle>
              <CardDescription>
                Scanning files from your authenticated Google Drive account.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 rounded-md border p-3">
                <Avatar>
                  <AvatarFallback>{user.email?.charAt(0).toUpperCase() || 'U'}</AvatarFallback>
                </Avatar>
                <span className="font-medium">{user.email}</span>
                <Badge variant="secondary">Active</Badge>
              </div>
            </CardContent>
          </Card>
        )}
        
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><Copy className="text-accent"/> AI-Powered Duplicate Finder</CardTitle>
                <CardDescription>
                    Let AI analyze your Google Drive files to find duplicates and near-duplicates based on name, size, and content hashes.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Button onClick={handleDetectDuplicates} disabled={isLoading || !isAiEnabled || !user}>
                    <ScanSearch className="mr-2"/>
                    {isLoading ? 'Scanning...' : 'Scan Your Drive'}
                </Button>
                {!isAiEnabled && (
                    <p className="text-sm text-destructive mt-4">Enable AI-Assisted mode to use this feature.</p>
                )}
                {!user && (
                    <p className="text-sm text-destructive mt-4">Sign in to scan your Google Drive files.</p>
                )}
            </CardContent>
        </Card>
        
        {duplicateGroups.length > 0 && (
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Review Duplicates</CardTitle>
                        <CardDescription>The AI found {duplicateGroups.length} groups of files that appear to be duplicates. Review each group and decide which files to keep or delete.</CardDescription>
                      </div>
                      <div className="flex gap-2 items-center">
                        <Button size="sm" variant="outline" onClick={() => handleExport('csv')} disabled={isExporting || !user}>
                          <Download className="h-4 w-4 mr-1"/>
                          Export CSV
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleExport('json')} disabled={isExporting || !user}>
                          <Download className="h-4 w-4 mr-1"/>
                          Export JSON
                        </Button>
                        <span className="text-xs text-muted-foreground hidden md:inline">(Ctrl+E CSV, Ctrl+Shift+E JSON)</span>
                      </div>
                    </div>
                </CardHeader>
                <CardContent className="grid gap-6">
                    {duplicateGroups.map((group, index) => (
                        <Card key={index} className="bg-secondary/50">
                            <CardHeader>
                                <CardTitle className="text-lg">Duplicate Group {index + 1}</CardTitle>
                            </CardHeader>
                            <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {group.files.map((file) => (
                                    <Card key={file.id} className="flex flex-col justify-between">
                                        <CardContent className="p-4">
                                            <p className="font-medium truncate">{file.name}</p>
                                            <p className="text-xs text-muted-foreground mt-1">
                                              Size: {(file.size / 1024 / 1024).toFixed(2)} MB
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                              Confidence: {Math.round(file.confidence * 100)}%
                                            </p>
                                        </CardContent>
                                        <CardHeader className="p-4 border-t flex-row items-center justify-end gap-2">
                                           <Button 
                                             size="sm" 
                                             variant="outline" 
                                             disabled={isLoading || isProcessing}
                                             onClick={() => handleAddToBatch(file.name, file.id, 'keep')}
                                           >
                                             <Check className="mr-2"/> Keep
                                           </Button>
                                           <Button 
                                             size="sm" 
                                             variant="destructive" 
                                             disabled={isLoading || isProcessing}
                                             onClick={() => handleAddToBatch(file.name, file.id, 'delete')}
                                           >
                                             <Trash className="mr-2"/> Delete
                                           </Button>
                                        </CardHeader>
                                    </Card>
                                ))}
                            </CardContent>
                        </Card>
                    ))}
                </CardContent>
            </Card>
        )}

        <BatchOperationsPanel />
      </div>
    </MainLayout>
  );
}
