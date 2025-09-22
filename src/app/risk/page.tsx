
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
import { ShieldAlert, Users, AlertTriangle, Sparkles } from 'lucide-react';
import { riskSensitive, scanShares } from '@/ai/flows/risk';
import { listSampleFiles } from '@/ai/flows/drive-list-sample';
import { FileSchema } from '@/lib/ai-types';
import { z } from 'zod';
import { Badge } from '@/components/ui/badge';




export default function RiskPage() {
  const { user } = useAuth();
  const { isAiEnabled } = useOperatingMode();
  const { toast } = useToast();
  const { handleAsyncError } = useErrorHandler({ component: 'RiskPage', userId: user?.uid });
  const [isLoading, setIsLoading] = React.useState(false);
  const [sensitiveCount, setSensitiveCount] = React.useState<number | null>(null);
  const [shareRiskCount, setShareRiskCount] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (user) {
      logger.info('Risk page accessed', {
        userId: user.uid,
        page: 'risk'
      });
    }
  }, [user]);

  const getUserAuth = () => {
    if (!user) {
      throw new Error('User not authenticated');
    }
    return { uid: user.uid, email: user.email || undefined };
  };

  const handleScanSensitive = async () => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Authentication Required',
        description: 'Please sign in to scan for sensitive files.',
      });
      return;
    }

    if (!isAiEnabled) {
      toast({
        variant: 'destructive',
        title: 'AI Mode Disabled',
        description: 'Please enable AI-Assisted mode to scan for sensitive content.',
      });
      return;
    }

    setIsLoading(true);
    setSensitiveCount(null);
    
    try {
      const authData = getUserAuth();
      const { files: driveFiles } = await listSampleFiles({ auth: authData });
      const mappedFiles: z.infer<typeof FileSchema>[] = driveFiles.map((f: any) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType || 'application/octet-stream',
        size: Number(f.size) || 0,
        lastModified: f.modifiedTime ? new Date(f.modifiedTime) : new Date(),
        path: [],
      }));
      
      const result = await riskSensitive({ files: mappedFiles, auth: authData });
      setSensitiveCount(result.flagged);
      
      logger.info('Sensitive file scan completed', {
        userId: user.uid,
        filesScanned: mappedFiles.length,
        flaggedFiles: result.flagged
      });
      
      toast({
        title: 'Sensitive File Scan Complete',
        description: `Scanned ${mappedFiles.length} files and found ${result.flagged} potentially sensitive files.`,
      });
    } catch (error: any) {
      await handleAsyncError(error, { operation: 'scanSensitive' });
      toast({
        variant: 'destructive',
        title: 'Scan Failed',
        description: error.message || 'Could not scan your files for sensitive content.',
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleScanShares = async () => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Authentication Required',
        description: 'Please sign in to scan sharing permissions.',
      });
      return;
    }

    if (!isAiEnabled) {
      toast({
        variant: 'destructive',
        title: 'AI Mode Disabled',
        description: 'Please enable AI-Assisted mode to analyze sharing risks.',
      });
      return;
    }

    setIsLoading(true);
    setShareRiskCount(null);
    
    try {
      const authData = getUserAuth();
      const result = await scanShares({ auth: authData });
      setShareRiskCount(result.risks);
      
      logger.info('Share risk scan completed', {
        userId: user.uid,
        risksFound: result.risks
      });
      
      toast({
        title: 'Share Risk Scan Complete',
        description: `Found ${result.risks} potential sharing risks in your Google Drive.`,
      });
    } catch (error: any) {
      await handleAsyncError(error, { operation: 'scanShares' });
      toast({
        variant: 'destructive',
        title: 'Scan Failed',
        description: error.message || 'Could not analyze your file sharing permissions.',
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
              Risk Center
            </h2>
            {isAiEnabled && <Badge variant="secondary" className="gap-1"><Sparkles className="h-3 w-3" />AI Active</Badge>}
          </div>
        </div>
        
        {!user && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Users className="text-primary"/> Authentication Required</CardTitle>
              <CardDescription>
                Sign in with your Google account to scan for security risks in your Google Drive.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Please sign in to access risk scanning features.
              </p>
            </CardContent>
          </Card>
        )}
        
        {!isAiEnabled && user && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><AlertTriangle className="text-destructive"/> AI Mode Disabled</CardTitle>
              <CardDescription>
                Enable AI-Assisted mode to perform intelligent risk analysis.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Switch to AI-Assisted mode in the sidebar to enable risk scanning.
              </p>
            </CardContent>
          </Card>
        )}

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
              <Button onClick={handleScanSensitive} disabled={isLoading || !user || !isAiEnabled}>
                {isLoading ? 'Scanning...' : 'Run Sensitive Scan'}
              </Button>
            </div>
             {sensitiveCount !== null && (
              <Card className="bg-secondary/50">
                <CardContent className="pt-6">
                  <p className="text-sm">
                    Scan result: <span className="font-bold text-lg">{sensitiveCount}</span> potentially sensitive files detected.
                  </p>
                  {sensitiveCount > 0 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Review these files to ensure they don&apos;t contain passwords, API keys, or personal information.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
            {!user && (
              <p className="text-sm text-destructive">Sign in to scan your files for sensitive information.</p>
            )}
            {!isAiEnabled && user && (
              <p className="text-sm text-destructive">Enable AI-Assisted mode to scan for sensitive content.</p>
            )}

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-lg border p-4">
              <div>
                <p className="font-semibold">Scan Sharing Risks</p>
                <p className="text-sm text-muted-foreground">
                  Checks for files that are shared publicly or with external users who may no longer need access.
                </p>
              </div>
              <Button onClick={handleScanShares} disabled={isLoading || !user || !isAiEnabled}>
                 {isLoading ? 'Scanning...' : 'Run Share Scan'}
              </Button>
            </div>
            {shareRiskCount !== null && (
              <Card className="bg-secondary/50">
                <CardContent className="pt-6">
                  <p className="text-sm">
                    Scan result: <span className="font-bold text-lg">{shareRiskCount}</span> potential sharing risks detected.
                  </p>
                  {shareRiskCount > 0 && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Review files shared publicly or with external users who may no longer need access.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
            {!user && (
              <p className="text-sm text-destructive">Sign in to scan your file sharing permissions.</p>
            )}
            {!isAiEnabled && user && (
              <p className="text-sm text-destructive">Enable AI-Assisted mode to analyze sharing risks.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
