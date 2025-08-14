
'use client';
import React from 'react';
import MainLayout from '@/components/shared/main-layout';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { GitCommit, GitMerge } from 'lucide-react';
import { versionsLink } from '@/ai/flows/versions-link';
import { similarityCluster } from '@/ai/flows/similarity-cluster';
import { listSampleFiles } from '@/ai/flows/drive-list-sample';
import { FileSchema } from '@/lib/ai-types';
import { z } from 'zod';

const mockAuth = { uid: 'user-1234' };


export default function GraphPage() {
  const [isLoading, setIsLoading] = React.useState(false);
  const [versionCount, setVersionCount] = React.useState<number | null>(null);
  const [clusterCount, setClusterCount] = React.useState<number | null>(null);
  const { toast } = useToast();

  const handleLinkVersions = async () => {
    setIsLoading(true);
    setVersionCount(null);
    try {
        const { files: driveFiles } = await listSampleFiles({ auth: mockAuth });
        const mappedFiles: z.infer<typeof FileSchema>[] = driveFiles.map((f: any) => ({
            id: f.id,
            name: f.name,
            mimeType: f.mimeType,
            size: Number(f.size) || 0,
            lastModified: f.modifiedTime ? new Date(f.modifiedTime) : new Date(),
            path: [], 
        }));
      const result = await versionsLink({ files: mappedFiles, auth: mockAuth });
      setVersionCount(result.chains);
      toast({
        title: 'Version Linking Complete',
        description: `Found ${result.chains} potential version chains.`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Version Linking Failed',
        description: error.message,
      });
    }
    setIsLoading(false);
  };
  
   const handleClusterSimilarity = async () => {
    setIsLoading(true);
    setClusterCount(null);
    try {
      const { files: driveFiles } = await listSampleFiles({ auth: mockAuth });
      const mappedFiles: z.infer<typeof FileSchema>[] = driveFiles.map((f: any) => ({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          size: Number(f.size) || 0,
          lastModified: f.modifiedTime ? new Date(f.modifiedTime) : new Date(),
          path: [], 
      }));
      const result = await similarityCluster({ files: mappedFiles, auth: mockAuth });
      setClusterCount(result.clusters);
       toast({
        title: 'Similarity Clustering Complete',
        description: `Grouped files into ${result.clusters} clusters.`,
      });
    } catch (error: any) {
       toast({
        variant: 'destructive',
        title: 'Clustering Failed',
        description: error.message,
      });
    }
    setIsLoading(false);
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
          </div>
        </div>

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
              <Button onClick={handleLinkVersions} disabled={isLoading}>
                {isLoading ? 'Linking...' : 'Link Versions'}
              </Button>
            </div>
            {versionCount !== null && (
                <p>Scan result: <strong>{versionCount}</strong> version chains found.</p>
            )}

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-lg border p-4">
              <div>
                <p className="font-semibold flex items-center gap-2"><GitMerge/> Cluster Similar Files</p>
                <p className="text-sm text-muted-foreground">
                  Group files with very similar names and sizes that might be duplicates.
                </p>
              </div>
              <Button onClick={handleClusterSimilarity} disabled={isLoading}>
                {isLoading ? 'Clustering...' : 'Cluster Similarities'}
              </Button>
            </div>
             {clusterCount !== null && (
                <p>Scan result: <strong>{clusterCount}</strong> similarity clusters found.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
