
'use client';
import React from 'react';
import MainLayout from '@/components/shared/main-layout';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, AlertCircle, Loader2, Activity } from 'lucide-react';
import { validateHealth } from '@/ai/flows/validate-health';
import type { HealthValidationOutput } from '@/ai/flows/validate-health';

const mockAuth = { uid: 'user-1234' };

export default function HealthPage() {
  const [isLoading, setIsLoading] = React.useState(false);
  const [results, setResults] = React.useState<HealthValidationOutput | null>(null);
  const { toast } = useToast();

  const handleRunChecks = async () => {
    setIsLoading(true);
    setResults(null);
    try {
      const healthResults = await validateHealth({ auth: mockAuth });
      setResults(healthResults);
      toast({
        title: 'Health Check Complete',
        description: 'Review the validation results below.',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Health Check Failed',
        description: error.message,
      });
      setResults({
          envVars: { ok: false, message: 'Flow execution failed.' },
          driveApi: { ok: false, message: 'Flow execution failed.' },
          writeScope: { ok: false, message: 'Flow execution failed.' },
      });
    }
    setIsLoading(false);
  };

  const CheckResult = ({ result }: { result: { ok: boolean; message: string } | undefined }) => {
    if (!result) return null;
    return (
      <div className="flex items-center gap-3">
        {result.ok ? (
          <CheckCircle2 className="size-5 text-green-500" />
        ) : (
          <AlertCircle className="size-5 text-destructive" />
        )}
        <span className={result.ok ? '' : 'text-destructive'}>{result.message}</span>
      </div>
    );
  };


  return (
    <MainLayout>
      <div className="flex-1 space-y-4 p-4 pt-6 sm:p-8">
        <div className="flex items-center justify-between space-y-2">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="md:hidden" />
            <h2 className="text-3xl font-bold tracking-tight font-headline">
              Health &amp; Validation
            </h2>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Activity /> System Health</CardTitle>
            <CardDescription>
              Run automated pre-flight checks to ensure the application is configured correctly for production.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleRunChecks} disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 animate-spin"/> : <Activity className="mr-2"/>}
                {isLoading ? 'Running Checks...' : 'Run All Checks'}
            </Button>
            
            {results && (
                 <Card className="bg-secondary/50">
                     <CardContent className="p-6 space-y-4">
                        <div className="space-y-2">
                            <h3 className="font-semibold">Environment Configuration</h3>
                            <CheckResult result={results.envVars} />
                        </div>
                        <div className="space-y-2">
                            <h3 className="font-semibold">Google Drive API</h3>
                             <CheckResult result={results.driveApi} />
                        </div>
                         <div className="space-y-2">
                            <h3 className="font-semibold">Drive Write Scope</h3>
                             <CheckResult result={results.writeScope} />
                        </div>
                     </CardContent>
                 </Card>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}

    
