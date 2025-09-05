
'use client';

import React, { useState, useEffect } from 'react';
import MainLayout from '@/components/shared/main-layout';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/auth-context';
import { useOperatingMode } from '@/contexts/operating-mode-context';
import { useErrorHandler } from '@/hooks/use-error-handler';
import { logger } from '@/lib/logger';
// AI flows now accessed via API routes to prevent SSR issues
import { simulateActions } from '@/ai/flows/ai-simulate-actions';
import { DriveAuth } from '@/components/drive-auth';
import { listSampleFiles } from '@/ai/flows/drive-list-sample';
import { preflightActions } from '@/ai/flows/actions-preflight';
import { confirmActions } from '@/ai/flows/actions-confirm';
import { executeActions } from '@/ai/flows/actions-execute';
import { restoreActions } from '@/ai/flows/actions-restore';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Users, AlertTriangle } from 'lucide-react';


import type {
  ProposeRulesOutput,
  SimulateActionsOutput,
  ListSampleFilesOutput,
  ExecuteActionsOutput,
  RestoreActionsOutput,
} from '@/lib/ai-types';



export default function AIPage() {
  const { user } = useAuth();
  const { isAiEnabled } = useOperatingMode();
  const { toast } = useToast();
  const { handleAsyncError } = useErrorHandler({ component: 'AIPage', userId: user?.uid });
  const [status, setStatus] = useState('Idle');
  const [ruleId, setRuleId] = useState<string>('');
  const [batchId, setBatchId] = useState<string>('');
  const [proposals, setProposals] = useState<any[]>([]);
  const [compiledRule, setCompiledRule] = useState<any>(null);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [challengeResponse, setChallengeResponse] = useState('');
  const [executionResults, setExecutionResults] = useState<ExecuteActionsOutput['results'] | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);

  React.useEffect(() => {
    if (user) {
      logger.info('AI test page accessed', {
        userId: user.uid,
        page: 'ai-test'
      });
    }
  }, [user]);

  const getUserAuth = () => {
    if (!user) {
      throw new Error('User not authenticated');
    }
    return { uid: user.uid, email: user.email || undefined };
  };


  function resetFlow() {
    setStatus('Idle');
    setRuleId('');
    setBatchId('');
    setProposals([]);
    setCompiledRule(null);
    setChallenge(null);
    setChallengeResponse('');
    setExecutionResults(null);
    setIsConfirmed(false);
    setIsSimulating(false);
    toast({ title: 'Flow Reset', description: 'Ready to start a new test.' });
  }

  async function classifySample() {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Authentication Required',
        description: 'Please sign in to test AI classification.',
      });
      return;
    }

    if (!isAiEnabled) {
      toast({
        variant: 'destructive',
        title: 'AI Mode Disabled',
        description: 'Please enable AI-Assisted mode to test classification.',
      });
      return;
    }

    setStatus('Classifying...');
    try {
      const authData = getUserAuth();
      const response = await fetch('/api/ai/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: [], redact: true, auth: authData })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Classification request failed');
      }
      
      const result = await response.json();
      setStatus(`Labeled ${result.labels.length} files.`);
      
      logger.info('AI classification completed', {
        userId: user.uid,
        labelsCount: result.labels.length
      });
      
      toast({
        title: 'Classification Complete',
        description: `Successfully labeled ${result.labels.length} files. Check the console for details.`,
      });
      console.log('Classification results:', result.labels);
    } catch (error: any) {
      setStatus(`Error: ${error.message}`);
      await handleAsyncError(error, { operation: 'classifySample' });
      toast({ variant: 'destructive', title: 'Classification Failed', description: error.message });
    }
  }

  async function handleProposeRules() {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Authentication Required',
        description: 'Please sign in to propose rules.',
      });
      return;
    }

    if (!isAiEnabled) {
      toast({
        variant: 'destructive',
        title: 'AI Mode Disabled',
        description: 'Please enable AI-Assisted mode to propose rules.',
      });
      return;
    }

    resetFlow();
    setStatus('Proposing rule...');
    try {
      const prompt = "Move all PDFs older than 6 months with 'invoice' in the name to Finance/Invoices/Archive.";
      const authData = getUserAuth();
      const response = await fetch('/api/ai/propose-rule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, auth: authData })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Rule proposal request failed');
      }
      
      const result = await response.json();
      setRuleId(result.ruleId);
      setCompiledRule(result.compiledRule);
      setStatus('Rule drafted successfully.');
      
      logger.info('Rule proposed', {
        userId: user.uid,
        ruleId: result.ruleId
      });
      
      toast({ title: 'Rule Proposed', description: `Rule ID: ${result.ruleId}` });
    } catch (error: any) {
      setStatus(`Error: ${error.message}`);
      await handleAsyncError(error, { operation: 'proposeRules' });
      toast({ variant: 'destructive', title: 'Rule Proposal Failed', description: error.message });
    }
  }

  async function handleSimulate() {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Authentication Required',
        description: 'Please sign in to simulate actions.',
      });
      return;
    }

    if (!compiledRule) {
      setStatus('No rule to simulate.');
      toast({ variant: 'destructive', title: 'Simulation Failed', description: 'First, propose a rule.' });
      return;
    }
    
    setStatus('Simulating actions...');
    setIsSimulating(true);
    try {
      const result: SimulateActionsOutput = await simulateActions({ rule: compiledRule, limit: 200 });
      setBatchId(result.batchId);
      setProposals(result.proposals);
      setStatus(`Simulated ${result.proposals.length} proposals.`);
      
      logger.info('Actions simulated', {
        userId: user.uid,
        batchId: result.batchId,
        proposalsCount: result.proposals.length
      });
      
      toast({ title: 'Simulation Complete', description: `${result.proposals.length} actions proposed.` });
    } catch (error: any) {
      setStatus(`Error: ${error.message}`);
      await handleAsyncError(error, { operation: 'simulateActions' });
      toast({ variant: 'destructive', title: 'Simulation Failed', description: error.message });
    } finally {
      setIsSimulating(false);
    }
  }

  async function handlePreflight() {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Authentication Required',
        description: 'Please sign in to run preflight checks.',
      });
      return;
    }

    if (!batchId) return;
    setStatus('Running preflight checks...');
    try {
      const authData = getUserAuth();
      const result = await preflightActions({ batchId, auth: authData });
      setChallenge(result.challenge);
      setStatus('Preflight complete. Please confirm.');
      
      logger.info('Preflight completed', {
        userId: user.uid,
        batchId
      });
      
      toast({ title: 'Preflight Complete', description: 'Ready for confirmation.' });
    } catch (error: any) {
      setStatus(`Error: ${error.message}`);
      await handleAsyncError(error, { operation: 'preflightActions', batchId });
      toast({ variant: 'destructive', title: 'Preflight Failed', description: error.message });
    }
  }

  async function handleConfirm() {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Authentication Required',
        description: 'Please sign in to confirm actions.',
      });
      return;
    }

    if (!batchId || !challenge) return;
    setStatus('Confirming...');
    try {
      const authData = getUserAuth();
      await confirmActions({ batchId, challengeResponse, auth: authData });
      setIsConfirmed(true);
      setStatus('Confirmation successful.');
      
      logger.info('Actions confirmed', {
        userId: user.uid,
        batchId
      });
      
      toast({ title: 'Confirmation Success', description: 'Batch confirmed.' });
    } catch (error: any) {
      setStatus(`Error: ${error.message}`);
      await handleAsyncError(error, { operation: 'confirmActions', batchId });
      toast({ variant: 'destructive', title: 'Confirmation Failed', description: error.message });
    }
  }

  async function handleExecute() {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Authentication Required',
        description: 'Please sign in to execute actions.',
      });
      return;
    }

    if (!batchId || !isConfirmed) return;
    setStatus('Executing actions...');
    try {
      const authData = getUserAuth();
      const result = await executeActions({ batchId, auth: authData });
      setExecutionResults(result.results);
      setStatus(`Execution complete: ${result.status}`);
      
      logger.info('Actions executed', {
        userId: user.uid,
        batchId,
        status: result.status
      });
      
      toast({ title: 'Execution Complete', description: `Status: ${result.status}` });
    } catch (error: any) {
      setStatus(`Error: ${error.message}`);
      await handleAsyncError(error, { operation: 'executeActions', batchId });
      toast({ variant: 'destructive', title: 'Execution Failed', description: error.message });
    }
  }

  async function handleRestore() {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Authentication Required',
        description: 'Please sign in to restore files.',
      });
      return;
    }

    if (!batchId) return;
    setStatus('Restoring files...');
    try {
      const authData = getUserAuth();
      const result: RestoreActionsOutput = await restoreActions({ batchId, auth: authData });
      setStatus(`Restored ${result.restored.length} files.`);
      
      logger.info('Files restored', {
        userId: user.uid,
        batchId,
        restoredCount: result.restored.length
      });
      
      toast({ title: 'Restore Complete', description: `Restored ${result.restored.length} files.` });
      setExecutionResults(null); // Clear old results
    } catch (error: any) {
      setStatus(`Error: ${error.message}`);
      await handleAsyncError(error, { operation: 'restoreActions', batchId });
      toast({ variant: 'destructive', title: 'Restore Failed', description: error.message });
    }
  }


  return (
    <MainLayout>
      <div className="flex-1 space-y-4 p-4 pt-6 sm:p-8">
        <div className="flex items-center justify-between space-y-2">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="md:hidden" />
            <h2 className="text-3xl font-bold tracking-tight font-headline">
              AI & Drive Test
            </h2>
            {isAiEnabled && <Badge variant="secondary" className="gap-1"><Sparkles className="h-3 w-3" />AI Active</Badge>}
          </div>
           <Button onClick={resetFlow} variant="outline">Reset Flow</Button>
        </div>
        
        {!user && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Users className="text-primary"/> Authentication Required</CardTitle>
              <CardDescription>
                Sign in with your Google account to test AI features and Google Drive integration.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Please sign in to access AI testing features.
              </p>
            </CardContent>
          </Card>
        )}
        
        {!isAiEnabled && user && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><AlertTriangle className="text-destructive"/> AI Mode Disabled</CardTitle>
              <CardDescription>
                Enable AI-Assisted mode to test AI features.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Switch to AI-Assisted mode in the sidebar to enable these features.
              </p>
            </CardContent>
          </Card>
        )}
        
        <DriveAuth />
        
        <Card>
          <CardHeader>
            <CardTitle>Drive Testing</CardTitle>
            <CardDescription>Test Google Drive API functionality after connecting.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <Button 
                onClick={() => {
                  if (!user) {
                    toast({ variant: 'destructive', title: 'Authentication Required', description: 'Please sign in first.' });
                    return;
                  }
                  const authData = getUserAuth();
                  listSampleFiles({ auth: authData }).then(res => {
                    console.log('Sample files:', res.files);
                    toast({ title: 'Files Logged', description: `Logged ${res.files.length} files to console.` });
                  }).catch(err => {
                    console.error('Error listing files:', err);
                    toast({ variant: 'destructive', title: 'Error', description: err.message });
                  });
                }}
                disabled={!user}
              >
                Log Sample Files to Console
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI Actions</CardTitle>
            <CardDescription>Use AI to help organize your files. This is a step-by-step test flow.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
             <div className="flex flex-wrap gap-3">
              <Button onClick={classifySample} disabled={!user || !isAiEnabled}>Test Classification</Button>
              <Button onClick={handleProposeRules} disabled={!user || !isAiEnabled}>1. Propose Rule</Button>
              <Button onClick={handleSimulate} disabled={!user || !compiledRule || isSimulating}>2. Simulate Rule</Button>
              <Button onClick={handlePreflight} disabled={!user || proposals.length === 0}>3. Preflight Actions</Button>
              <Button onClick={handleExecute} disabled={!user || !isConfirmed}>5. Execute</Button>
            </div>
            {!user && (
              <p className="text-sm text-destructive mt-4">Sign in to test AI features.</p>
            )}
            {!isAiEnabled && user && (
              <p className="text-sm text-destructive mt-4">Enable AI-Assisted mode to test AI features.</p>
            )}
            {proposals.length > 0 && challenge && !isConfirmed && (
                <Card className="mt-4 bg-secondary">
                    <CardHeader>
                        <CardTitle>4. Confirmation</CardTitle>
                        <CardDescription>
                            Type the following challenge text exactly to approve these actions. This is a critical safety step.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <p className="font-mono text-center p-3 rounded-md bg-background text-destructive font-bold tracking-wider">{challenge}</p>
                        <Input 
                            value={challengeResponse}
                            onChange={(e) => setChallengeResponse(e.target.value)}
                            placeholder="Enter challenge phrase here"
                        />
                        <Button onClick={handleConfirm} disabled={challengeResponse !== challenge}>
                            Confirm Actions
                        </Button>
                    </CardContent>
                </Card>
            )}
          </CardContent>
        </Card>

        <p className="text-sm text-muted-foreground">Status: {status}</p>

        {compiledRule && (
          <Card>
            <CardHeader>
              <CardTitle>Drafted Rule</CardTitle>
            </CardHeader>
            <CardContent>
                <pre className="p-4 bg-muted rounded-md text-xs overflow-auto">
                    {JSON.stringify(compiledRule, null, 2)}
                </pre>
            </CardContent>
          </Card>
        )}

        {proposals.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Simulated Proposals</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground mb-2">Batch ID: {batchId}</div>
              <div className="max-h-60 overflow-auto rounded-md border">
                 <pre className="p-4 text-xs">
                    {JSON.stringify(proposals, null, 2)}
                 </pre>
              </div>
            </CardContent>
          </Card>
        )}

        {executionResults && (
            <Card>
                <CardHeader>
                    <CardTitle>Execution Results</CardTitle>
                    <CardDescription>
                        The actions have been performed. You can restore the trashed files if needed.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Button onClick={handleRestore} variant="outline" className="mb-4">Restore Trashed Files</Button>
                    <div className="max-h-60 overflow-auto rounded-md border">
                        <pre className="p-4 text-xs">
                            {JSON.stringify(executionResults, null, 2)}
                        </pre>
                    </div>
                </CardContent>
            </Card>
        )}
      </div>
    </MainLayout>
  );
}
