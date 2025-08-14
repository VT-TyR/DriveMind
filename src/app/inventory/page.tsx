

'use client';
import React from 'react';
import MainLayout from '@/components/shared/main-layout';
import { SidebarTrigger } from '@/components/ui/sidebar';
import type { File } from '@/lib/types';
import { vaultCandidateScoring } from '@/ai/flows/vault-candidate-scoring';
import { proposeCleanupActions } from '@/ai/flows/propose-cleanup-actions';
import { listSampleFiles } from '@/ai/flows/drive-list-sample';
import { useOperatingMode } from '@/contexts/operating-mode-context';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import FileTable from '@/components/inventory/file-table';
import { Button } from '@/components/ui/button';
import { markDuplicates } from '@/lib/duplicate-detection';
import { BatchOperationsPanel } from '@/components/shared/file-actions';

function mapMimeTypeToFileType(mimeType: string): File['type'] {
  if (mimeType === 'application/vnd.google-apps.folder') return 'Folder';
  if (mimeType === 'application/vnd.google-apps.document') return 'Document';
  if (mimeType === 'application/vnd.google-apps.spreadsheet') return 'Spreadsheet';
  if (mimeType === 'application/vnd.google-apps.presentation') return 'Presentation';
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.startsWith('image/')) return 'Image';
  if (mimeType.startsWith('video/')) return 'Video';
  return 'Other';
}

type AiSuggestion = {
  action: 'trash' | 'move' | 'archive' | 'no_action';
  reason: string;
  confidence: number;
  fileName: string;
};

export default function InventoryPage() {
  const [files, setFiles] = React.useState<File[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [suggestion, setSuggestion] = React.useState<AiSuggestion | null>(
    null
  );
  const { isAiEnabled } = useOperatingMode();
  const { toast } = useToast();
  const { user } = useAuth();

  const fetchFiles = React.useCallback(async () => {
    if (!user) {
      setFiles([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const authData = { uid: user.uid, email: user.email || undefined };
      const { files: driveFiles } = await listSampleFiles({ auth: authData });
      const mappedFiles: File[] = driveFiles.map((f, i) => ({
          id: f.id,
          name: f.name,
          type: mapMimeTypeToFileType(f.mimeType || ''),
          size: Number(f.size || 0),
          lastModified: f.modifiedTime ? new Date(f.modifiedTime) : new Date(),
          isDuplicate: false,
          path: [],
          vaultScore: null,
      }));

      // Mark duplicates
      const filesWithDuplicates = markDuplicates(mappedFiles);
      setFiles(filesWithDuplicates);
    } catch (error: any) {
        toast({
            variant: 'destructive',
            title: 'Failed to fetch files',
            description: error.message || 'Could not connect to Google Drive. Please connect on the AI/Dev page.',
        });
        setFiles([]);
    } finally {
        setIsLoading(false);
    }
  }, [toast, user]);

  React.useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  const handleScoreFile = async (file: File) => {
    if (!isAiEnabled) {
      toast({
        variant: 'destructive',
        title: 'AI Mode Disabled',
        description: 'Please enable AI-Assisted mode to use this feature.',
      });
      return;
    }
    setIsProcessing(true);
    try {
      const fileDescription = `File: ${
        file.name
      }, Type: ${file.type}, Size: ${
        file.size
      } bytes, Last Modified: ${file.lastModified.toDateString()}`;
      const result = await vaultCandidateScoring({
        fileDescription,
        scoringCriteria:
          'Importance for long-term archival, uniqueness, and relevance to core business projects.',
      });
      setFiles((prev) =>
        prev.map((f) => (f.id === file.id ? { ...f, vaultScore: result.score } : f))
      );
      toast({
        title: `Scored "${file.name}"`,
        description: `Vault Score: ${result.score}. Reason: ${result.reasoning}`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Scoring Failed',
        description: (error as Error).message || 'Could not get score from AI.',
      });
    }
    setIsProcessing(false);
  };

  const handleCleanupSuggestion = async (file: File) => {
    if (!isAiEnabled) {
      toast({
        variant: 'destructive',
        title: 'AI Mode Disabled',
        description: 'Please enable AI-Assisted mode to use this feature.',
      });
      return;
    }
    setIsProcessing(true);
    try {
      const fileDescription = `File Name: ${
        file.name
      }\nFile Type: ${file.type}\nSize: ${
        file.size
      } bytes\nLast Modified: ${file.lastModified.toISOString()}\nIs Duplicate: ${
        file.isDuplicate
      }`;
      const result = await proposeCleanupActions({ fileDescription });
      setSuggestion({
        action: result.suggestedAction,
        reason: result.reason,
        confidence: result.confidenceScore,
        fileName: file.name,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Suggestion Failed',
        description: (error as Error).message ||'Could not get suggestion from AI.',
      });
    }
    setIsProcessing(false);
  };

  const getSuggestionBadgeVariant = (action: AiSuggestion['action']) => {
    switch (action) {
      case 'trash':
        return 'destructive';
      case 'archive':
        return 'secondary';
      default:
        return 'default';
    }
  };

  if (!user) {
    return (
      <MainLayout>
        <div className="flex-1 space-y-4 p-4 pt-6 sm:p-8">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="md:hidden" />
            <h2 className="text-3xl font-bold tracking-tight font-headline">
              File Inventory
            </h2>
          </div>
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <h3 className="text-lg font-medium mb-2">Sign in Required</h3>
            <p className="text-muted-foreground mb-4">
              Please sign in with your Google account to view your Drive files.
            </p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="flex-1 space-y-4 p-4 pt-6 sm:p-8">
        <div className="flex items-center justify-between space-y-2">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="md:hidden" />
            <h2 className="text-3xl font-bold tracking-tight font-headline">
              File Inventory
            </h2>
          </div>
          <Button onClick={fetchFiles} disabled={isLoading || isProcessing}>
            {isLoading ? 'Loading...' : 'Refresh Files'}
          </Button>
        </div>
        <FileTable
          files={files}
          onScoreFile={handleScoreFile}
          onCleanupSuggestion={handleCleanupSuggestion}
          isAiEnabled={isAiEnabled}
          isProcessing={isProcessing || isLoading}
          onRefresh={fetchFiles}
        />
        <BatchOperationsPanel onRefresh={fetchFiles} />
      </div>

      <AlertDialog open={!!suggestion} onOpenChange={() => setSuggestion(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              AI Cleanup Suggestion for "{suggestion?.fileName}"
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 pt-4">
                <div className="flex items-start gap-4">
                  <Badge
                    variant={getSuggestionBadgeVariant(suggestion?.action!)}
                    className="text-md capitalize py-1 px-3"
                  >
                    {suggestion?.action.replace('_', ' ')}
                  </Badge>
                  <p className="text-sm text-foreground">{suggestion?.reason}</p>
                </div>
                <div>
                  <Label htmlFor="confidence">
                    Confidence Score: {Math.round((suggestion?.confidence ?? 0) * 100)}%
                  </Label>
                  <Progress
                    value={(suggestion?.confidence ?? 0) * 100}
                    id="confidence"
                    className="mt-2 h-2"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}
