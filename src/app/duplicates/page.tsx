

'use client';
import React from 'react';
import MainLayout from '@/components/shared/main-layout';
import { SidebarTrigger } from '@/components/ui/sidebar';
import type { File } from '@/lib/types';
import { listSampleFiles } from '@/ai/flows/drive-list-sample';
import { detectNearDuplicateFiles } from '@/ai/flows/detect-near-duplicate-files';
import type { DetectNearDuplicateFilesOutput } from '@/ai/flows/detect-near-duplicate-files';
import { useOperatingMode } from '@/contexts/operating-mode-context';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { useFileOperations } from '@/contexts/file-operations-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Copy, ScanSearch, Check, Trash, Users, PlusCircle, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { BatchOperationsPanel } from '@/components/shared/file-actions';


export default function DuplicatesPage() {
  const [duplicateGroups, setDuplicateGroups] = React.useState<DetectNearDuplicateFilesOutput['nearDuplicateGroups']>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isCreatingBatch, setIsCreatingBatch] = React.useState(false);
  const { isAiEnabled } = useOperatingMode();
  const { toast } = useToast();
  const { user } = useAuth();
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
      const authData = { uid: user.uid, email: user.email || undefined };
      const { files: driveFiles } = await listSampleFiles({ auth: authData });

      const fileMetadatas = driveFiles.map((f: any) => ({
        id: f.id,
        name: f.name || `Untitled_${f.id}`,
        size: Number(f.size) || 0,
        hash: f.md5Checksum || `hash_${f.id}`,
      }));

      const result = await detectNearDuplicateFiles({ fileMetadatas });
      setDuplicateGroups(result.nearDuplicateGroups);
      toast({
        title: 'Duplicate Scan Complete',
        description: `AI found ${result.nearDuplicateGroups.length} potential duplicate groups in your Google Drive.`,
      });
    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'Failed to Detect Duplicates',
            description: error.message || 'Could not connect to the AI service.',
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
                    <CardTitle>Review Duplicates</CardTitle>
                    <CardDescription>The AI found {duplicateGroups.length} groups of files that appear to be duplicates. Review each group and decide which files to keep or delete.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-6">
                    {duplicateGroups.map((group, index) => (
                        <Card key={index} className="bg-secondary/50">
                            <CardHeader>
                                <CardTitle className="text-lg">Duplicate Group {index + 1}</CardTitle>
                            </CardHeader>
                            <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {group.map((fileInfo) => {
                                  const fileName = typeof fileInfo === 'string' ? fileInfo : fileInfo.name;
                                  const fileId = typeof fileInfo === 'string' ? `file_${fileInfo.replace(/[^a-zA-Z0-9]/g, '_')}` : fileInfo.id;
                                  return (
                                    <Card key={`${fileName}_${fileId}`} className="flex flex-col justify-between">
                                        <CardContent className="p-4">
                                            <p className="font-medium truncate">{fileName}</p>
                                            <p className="text-xs text-muted-foreground mt-1">Detected by AI analysis</p>
                                        </CardContent>
                                        <CardHeader className="p-4 border-t flex-row items-center justify-end gap-2">
                                           <Button 
                                             size="sm" 
                                             variant="outline" 
                                             disabled={isLoading || isProcessing}
                                             onClick={() => handleAddToBatch(fileName, fileId, 'keep')}
                                           >
                                             <Check className="mr-2"/> Keep
                                           </Button>
                                           <Button 
                                             size="sm" 
                                             variant="destructive" 
                                             disabled={isLoading || isProcessing}
                                             onClick={() => handleAddToBatch(fileName, fileId, 'delete')}
                                           >
                                             <Trash className="mr-2"/> Delete
                                           </Button>
                                        </CardHeader>
                                    </Card>
                                  );
                                })}
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
