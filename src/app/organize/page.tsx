
'use client';
import React from 'react';
import MainLayout from '@/components/shared/main-layout';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { FileSchema as AiFileSchema, ProposeFoldersOutput } from '@/lib/ai-types';
import { listSampleFiles } from '@/ai/flows/drive-list-sample';
import { proposeFolders } from '@/ai/flows/ai-propose-folders';
import { useOperatingMode } from '@/contexts/operating-mode-context';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FolderSync, MoveRight, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { z } from 'zod';


// This is a temporary mock authentication object.
const mockAuth = { uid: 'user-1234' };

export default function OrganizePage() {
  const [suggestions, setSuggestions] = React.useState<ProposeFoldersOutput['suggestions']>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const { isAiEnabled } = useOperatingMode();
  const { toast } = useToast();

  const handleProposeFolders = async () => {
    if (!isAiEnabled) {
      toast({
        variant: 'destructive',
        title: 'AI Mode Disabled',
        description: 'Please enable AI-Assisted mode to use Smart Folders.',
      });
      return;
    }
    setIsLoading(true);
    setSuggestions([]);
    try {
      // First, get a list of files to analyze.
      const { files: driveFiles } = await listSampleFiles({ auth: mockAuth });
      const mappedFiles: z.infer<typeof AiFileSchema>[] = driveFiles.map((f: any) => ({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType || 'application/octet-stream',
          size: Number(f.size) || 0,
          lastModified: f.modifiedTime ? new Date(f.modifiedTime) : new Date(),
          path: [],
      }));

      // Then, get AI-powered folder suggestions for them.
      const result = await proposeFolders({ files: mappedFiles });
      setSuggestions(result.suggestions);
      toast({
        title: 'Organization Plan Ready',
        description: `AI has proposed ${result.suggestions.length} folder moves.`,
      });
    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'Failed to Get Suggestions',
            description: error.message || 'Could not connect to the AI service.',
        });
        setSuggestions([]);
    } finally {
        setIsLoading(false);
    }
  };


  return (
    <MainLayout>
      <div className="flex-1 space-y-4 p-4 pt-6 sm:p-8">
        <div className="flex items-center justify-between space-y-2">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="md:hidden" />
            <h2 className="text-3xl font-bold tracking-tight font-headline">
              Smart Folders
            </h2>
          </div>
        </div>
        
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><Sparkles className="text-accent"/> AI-Powered Organization</CardTitle>
                <CardDescription>
                    Let AI analyze your files and suggest a clean, logical folder structure. Click the button to scan your recent files and generate a proposed organization plan.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Button onClick={handleProposeFolders} disabled={isLoading || !isAiEnabled}>
                    <FolderSync className="mr-2"/>
                    {isLoading ? 'Analyzing...' : 'Generate Smart Folder Plan'}
                </Button>
                {!isAiEnabled && (
                    <p className="text-sm text-destructive mt-4">Enable AI-Assisted mode to use this feature.</p>
                )}
            </CardContent>
        </Card>
        
        {suggestions.length > 0 && (
            <Card>
                <CardHeader>
                    <CardTitle>Suggested Organization</CardTitle>
                    <CardDescription>Review the proposed changes below. You can then choose to create a batch to apply these moves.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>File</TableHead>
                                    <TableHead>Suggested Move</TableHead>
                                    <TableHead>Reason</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {suggestions.map((s) => (
                                <TableRow key={s.fileId}>
                                    <TableCell className="font-medium truncate max-w-xs">{s.fileName}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2 text-sm">
                                            <Badge variant="secondary" className="truncate">{s.currentPath}</Badge>
                                            <MoveRight className="size-4 shrink-0 text-muted-foreground"/>
                                            <Badge className="truncate">{s.suggestedPath}</Badge>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground text-xs">{s.reason}</TableCell>
                                </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                    <Button className="mt-4">
                        Create Action Batch
                    </Button>
                </CardContent>
            </Card>
        )}

      </div>
    </MainLayout>
  );
}
