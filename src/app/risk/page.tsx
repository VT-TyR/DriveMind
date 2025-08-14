
'use client';
import React from 'react';
import MainLayout from '@/components/shared/main-layout';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { ShieldAlert } from 'lucide-react';
import { riskSensitive, scanShares } from '@/ai/flows/risk';
import { listSampleFiles } from '@/ai/flows/drive-list-sample';
import { FileSchema } from '@/lib/ai-types';
import { z } from 'zod';


// This is a temporary mock authentication object.
const mockAuth = { uid: 'user-1234' };


export default function RiskPage() {
  const [isLoading, setIsLoading] = React.useState(false);
  const [sensitiveCount, setSensitiveCount] = React.useState<number | null>(null);
  const [shareRiskCount, setShareRiskCount] = React.useState<number | null>(null);
  const { toast } = useToast();

  const handleScanSensitive = async () => {
    setIsLoading(true);
    setSensitiveCount(null);
    try {
      const { files: driveFiles } = await listSampleFiles({ auth: mockAuth });
       const mappedFiles: z.infer<typeof FileSchema>[] = driveFiles.map((f: any) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType || 'application/octet-stream',
        size: Number(f.size) || 0,
        lastModified: f.modifiedTime ? new Date(f.modifiedTime) : new Date(),
        path: [],
      }));
      const result = await riskSensitive({ files: mappedFiles, auth: mockAuth });
      setSensitiveCount(result.flagged);
      toast({
        title: 'Sensitive File Scan Complete',
        description: `Found ${result.flagged} potentially sensitive files.`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Scan Failed',
        description: error.message,
      });
    }
    setIsLoading(false);
  };
  
  const handleScanShares = async () => {
    setIsLoading(true);
    setShareRiskCount(null);
    try {
      const result = await scanShares({ auth: mockAuth });
      setShareRiskCount(result.risks);
       toast({
        title: 'Share Risk Scan Complete',
        description: `Found ${result.risks} potential sharing risks.`,
      });
    } catch (error: any) {
       toast({
        variant: 'destructive',
        title: 'Scan Failed',
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
              Risk Center
            </h2>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldAlert className="text-destructive"/> Security & Risk Analysis</CardTitle>
            <CardDescription>
              Scan for potential risks in your Google Drive, such as sensitive files or insecure sharing settings.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-lg border p-4">
              <div>
                <p className="font-semibold">Scan for Sensitive Information</p>
                <p className="text-sm text-muted-foreground">
                  Looks for files with names that suggest they might contain secrets, keys, or PII.
                </p>
              </div>
              <Button onClick={handleScanSensitive} disabled={isLoading}>
                {isLoading ? 'Scanning...' : 'Run Sensitive Scan'}
              </Button>
            </div>
             {sensitiveCount !== null && (
                <p className="text-sm">Scan result: <span className="font-bold">{sensitiveCount}</span> files flagged.</p>
            )}

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-lg border p-4">
              <div>
                <p className="font-semibold">Scan Sharing Risks</p>
                <p className="text-sm text-muted-foreground">
                  Checks for files that are shared publicly or with external users who may no longer need access.
                </p>
              </div>
              <Button onClick={handleScanShares} disabled={isLoading}>
                 {isLoading ? 'Scanning...' : 'Run Share Scan'}
              </Button>
            </div>
             {shareRiskCount !== null && (
                <p className="text-sm">Scan result: <span className="font-bold">{shareRiskCount}</span> sharing risks found.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
