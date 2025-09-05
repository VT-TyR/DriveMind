
'use client';
import React from 'react';
import MainLayout from '@/components/shared/main-layout';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { useOperatingMode } from '@/contexts/operating-mode-context';
import { useErrorHandler } from '@/hooks/use-error-handler';
import { logger } from '@/lib/logger';
import { GitCommit, GitMerge, Users, AlertTriangle, Sparkles } from 'lucide-react';
import { versionsLink } from '@/ai/flows/versions-link';
import { similarityCluster } from '@/ai/flows/similarity-cluster';
import { listSampleFiles } from '@/ai/flows/drive-list-sample';
import { FileSchema } from '@/lib/ai-types';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';


export default function GraphPage() {
  const { user } = useAuth();
  const { isAiEnabled } = useOperatingMode();
  const { toast } = useToast();
  const { handleAsyncError } = useErrorHandler({ component: 'GraphPage', userId: user?.uid });
  const [isLoading, setIsLoading] = React.useState(false);
  const [versionCount, setVersionCount] = React.useState<number | null>(null);
  const [clusterCount, setClusterCount] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (user) {
      logger.info('Graph page accessed', {
        userId: user.uid,
        page: 'graph'
      });
    }
  }, [user]);

  const getUserAuth = () => {
    if (!user) {
      throw new Error('User not authenticated');
    }
    return { uid: user.uid, email: user.email || undefined };
  };

  const handleLinkVersions = async () => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Authentication Required',
        description: 'Please sign in to analyze file versions.',
      });
      return;
    }

    if (!isAiEnabled) {
      toast({
        variant: 'destructive',
        title: 'AI Mode Disabled',
        description: 'Please enable AI-Assisted mode to link file versions.',
      });
      return;
    }

    setIsLoading(true);
    setVersionCount(null);
    
    try {
      const authData = getUserAuth();
      const { files: driveFiles } = await listSampleFiles({ auth: authData });
      const mappedFiles: z.infer<typeof FileSchema>[] = driveFiles.map((f: any) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: Number(f.size) || 0,
        lastModified: f.modifiedTime ? new Date(f.modifiedTime) : new Date(),
        path: [], 
      }));
      
      const result = await versionsLink({ files: mappedFiles, auth: authData });
      setVersionCount(result.chains);
      
      logger.info('Version linking completed', {
        userId: user.uid,
        filesAnalyzed: mappedFiles.length,
        chainsFound: result.chains
      });
      
      toast({
        title: 'Version Linking Complete',
        description: `Analyzed ${mappedFiles.length} files and found ${result.chains} potential version chains.`,
      });
    } catch (error: any) {
      await handleAsyncError(error, { operation: 'linkVersions' });
      toast({
        variant: 'destructive',
        title: 'Version Linking Failed',
        description: error.message || 'Could not analyze your files for version relationships.',
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleClusterSimilarity = async () => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Authentication Required',
        description: 'Please sign in to cluster similar files.',
      });
      return;
    }

    if (!isAiEnabled) {
      toast({
        variant: 'destructive',
        title: 'AI Mode Disabled',
        description: 'Please enable AI-Assisted mode to cluster similar files.',
      });
      return;
    }

    setIsLoading(true);
    setClusterCount(null);
    
    try {
      const authData = getUserAuth();
      const { files: driveFiles } = await listSampleFiles({ auth: authData });
      const mappedFiles: z.infer<typeof FileSchema>[] = driveFiles.map((f: any) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: Number(f.size) || 0,
        lastModified: f.modifiedTime ? new Date(f.modifiedTime) : new Date(),
        path: [], 
      }));
      
      const result = await similarityCluster({ files: mappedFiles, auth: authData });
      setClusterCount(result.clusters);
      
      logger.info('Similarity clustering completed', {
        userId: user.uid,
        filesAnalyzed: mappedFiles.length,
        clustersFound: result.clusters
      });
      
      toast({
        title: 'Similarity Clustering Complete',
        description: `Analyzed ${mappedFiles.length} files and grouped them into ${result.clusters} similarity clusters.`,
      });
    } catch (error: any) {
      await handleAsyncError(error, { operation: 'clusterSimilarity' });
      toast({
        variant: 'destructive',
        title: 'Clustering Failed',
        description: error.message || 'Could not cluster your files by similarity.',
      });
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
              File Relationships
            </h2>
            {isAiEnabled && <Badge variant="secondary" className="gap-1"><Sparkles className="h-3 w-3" />AI Active</Badge>}
          </div>
        </div>
        
        {!user && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Users className="text-primary"/> Authentication Required</CardTitle>
              <CardDescription>
                Sign in with your Google account to discover relationships between your files.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Please sign in to access file relationship analysis.
              </p>
            </CardContent>
          </Card>
        )}
        
        {!isAiEnabled && user && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><AlertTriangle className="text-destructive"/> AI Mode Disabled</CardTitle>
              <CardDescription>
                Enable AI-Assisted mode to analyze file relationships and similarity patterns.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Switch to AI-Assisted mode in the sidebar to enable relationship analysis.
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Graph &amp; Similarity Analysis</CardTitle>
            <CardDescription>
              Discover hidden relationships between your files, like version history and near-duplicates.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-lg border p-4">
              <div>
                <p className="font-semibold flex items-center gap-2"><GitCommit/> Link Version Chains</p>
                <p className="text-sm text-muted-foreground">
                  Find files that look like different versions of each other (e.g., "report.docx", "report (1).docx").
                </p>
              </div>
              <Button onClick={handleLinkVersions} disabled={isLoading || !user || !isAiEnabled}>
                {isLoading ? 'Linking...' : 'Link Versions'}
              </Button>
            </div>
            {versionCount !== null && (
              <Card className="bg-secondary/50">
                <CardContent className="pt-6">
                  <p className="text-sm">
                    Analysis result: <span className="font-bold text-lg">{versionCount}</span> version chains discovered.
                  </p>
                  {versionCount > 0 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Files that appear to be different versions of the same document.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
            {!user && (
              <p className="text-sm text-destructive">Sign in to analyze your file version relationships.</p>
            )}
            {!isAiEnabled && user && (
              <p className="text-sm text-destructive">Enable AI-Assisted mode to link file versions.</p>
            )}

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-lg border p-4">
              <div>
                <p className="font-semibold flex items-center gap-2"><GitMerge/> Cluster Similar Files</p>
                <p className="text-sm text-muted-foreground">
                  Group files with very similar names and sizes that might be duplicates.
                </p>
              </div>
              <Button onClick={handleClusterSimilarity} disabled={isLoading || !user || !isAiEnabled}>
                {isLoading ? 'Clustering...' : 'Cluster Similarities'}
              </Button>
            </div>
            {clusterCount !== null && (
              <Card className="bg-secondary/50">
                <CardContent className="pt-6">
                  <p className="text-sm">
                    Analysis result: <span className="font-bold text-lg">{clusterCount}</span> similarity clusters identified.
                  </p>
                  {clusterCount > 0 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Groups of files with similar names and characteristics.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
            {!user && (
              <p className="text-sm text-destructive">Sign in to cluster your files by similarity.</p>
            )}
            {!isAiEnabled && user && (
              <p className="text-sm text-destructive">Enable AI-Assisted mode to cluster similar files.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
