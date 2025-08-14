

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
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Copy, ScanSearch, Check, Trash, Users, PlusCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';


// This is a temporary mock authentication object.
const mockAuth = { uid: 'user-1234' };

const initialAccounts = [
    { id: 1, email: 'work.account@example.com', initials: 'WA' },
    { id: 2, email: 'personal.account@example.com', initials: 'PA' },
];

export default function DuplicatesPage() {
  const [accounts, setAccounts] = React.useState(initialAccounts);
  const [duplicateGroups, setDuplicateGroups] = React.useState<DetectNearDuplicateFilesOutput['nearDuplicateGroups']>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const { isAiEnabled } = useOperatingMode();
  const { toast } = useToast();

  const handleDetectDuplicates = async () => {
    if (!isAiEnabled) {
      toast({
        variant: 'destructive',
        title: 'AI Mode Disabled',
        description: 'Please enable AI-Assisted mode to detect duplicates.',
      });
      return;
    }
    setIsLoading(true);
    setDuplicateGroups([]);
    try {
      // In a real app, this would iterate through each authorized account
      // and fetch files, then combine them. We simulate this by calling
      // listSampleFiles multiple times.
      let allFiles: any[] = [];
      for (const account of accounts) {
        console.log(`Simulating file fetch for ${account.email}`);
        const { files: driveFiles } = await listSampleFiles({ auth: mockAuth });
        allFiles = [...allFiles, ...driveFiles];
      }

      const fileMetadatas = allFiles.map((f: any, i: number) => ({
        name: f.name || `Untitled_${i}`,
        size: Number(f.size) || Math.floor(Math.random() * 10000), // Mock size
        hash: `mock_hash_${f.id || i}`,
      }));

      const result = await detectNearDuplicateFiles({ fileMetadatas });
      setDuplicateGroups(result.nearDuplicateGroups);
      toast({
        title: 'Cross-Drive Scan Complete',
        description: `AI found ${result.nearDuplicateGroups.length} potential duplicate groups across ${accounts.length} accounts.`,
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
  
  const handleAddAccount = () => {
    // In a real app, this would trigger the OAuth flow for a new account.
    const newId = accounts.length + 1;
    setAccounts([...accounts, { id: newId, email: `new.account${newId}@example.com`, initials: `NA${newId}`}]);
    toast({ title: "Account Added", description: "In a real app, you would now authorize this new account with Google."});
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
          </div>
        </div>
        
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><Users className="text-primary"/> Connected Accounts</CardTitle>
                <CardDescription>
                    Manage the Google accounts you want to scan. DriveMind can find duplicates across all connected drives.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-3">
                    {accounts.map(account => (
                        <div key={account.id} className="flex items-center gap-3 rounded-md border p-3">
                             <Avatar>
                                <AvatarFallback>{account.initials}</AvatarFallback>
                            </Avatar>
                            <span className="font-medium">{account.email}</span>
                        </div>
                    ))}
                </div>
                <Button variant="outline" onClick={handleAddAccount}>
                    <PlusCircle className="mr-2"/> Connect Another Account
                </Button>
            </CardContent>
        </Card>
        
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><Copy className="text-accent"/> Cross-Drive Duplicate Finder</CardTitle>
                <CardDescription>
                    Let AI analyze your files to find duplicates and near-duplicates based on name, size, and content hashes across all connected accounts.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Button onClick={handleDetectDuplicates} disabled={isLoading || !isAiEnabled || accounts.length === 0}>
                    <ScanSearch className="mr-2"/>
                    {isLoading ? 'Scanning...' : `Scan ${accounts.length} Accounts`}
                </Button>
                {!isAiEnabled && (
                    <p className="text-sm text-destructive mt-4">Enable AI-Assisted mode to use this feature.</p>
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
                                {group.map((fileName) => (
                                    <Card key={fileName} className="flex flex-col justify-between">
                                        <CardContent className="p-4">
                                            <p className="font-medium truncate">{fileName}</p>
                                            <p className="text-xs text-muted-foreground mt-1">Size: {(Math.random() * 5).toFixed(2)} MB</p>
                                        </CardContent>
                                        <CardHeader className="p-4 border-t flex-row items-center justify-end gap-2">
                                           <Button size="sm" variant="outline" disabled={isLoading}><Check className="mr-2"/> Keep</Button>
                                           <Button size="sm" variant="destructive" disabled={isLoading}><Trash className="mr-2"/> Delete</Button>
                                        </CardHeader>
                                    </Card>
                                ))}
                            </CardContent>
                        </Card>
                    ))}
                </CardContent>
            </Card>
        )}
      </div>
    </MainLayout>
  );
}

    
