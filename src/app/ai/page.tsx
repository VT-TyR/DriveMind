
'use client';

import React, { useState, useEffect } from 'react';
import MainLayout from '@/components/shared/main-layout';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { classifyFiles } from '@/ai/flows/ai-classify';
import { proposeRules } from '@/ai/flows/ai-propose-rules';
import { simulateActions } from '@/ai/flows/ai-simulate-actions';
import { beginOAuth } from '@/ai/flows/auth-begin-oauth';
import { listSampleFiles } from '@/ai/flows/drive-list-sample';
import { preflightActions } from '@/ai/flows/actions-preflight';
import { confirmActions } from '@/ai/flows/actions-confirm';
import { executeActions } from '@/ai/flows/actions-execute';
import { restoreActions } from '@/ai/flows/actions-restore';
import { completeOAuth } from '@/ai/flows/auth-complete-oauth';


import type {
  ProposeRulesOutput,
  SimulateActionsOutput,
  ListSampleFilesOutput,
  ExecuteActionsOutput,
  RestoreActionsOutput,
} from '@/lib/ai-types';

// This is a temporary mock authentication object.
// In a real app, you would get the current user's ID from your auth system.
const mockAuth = { uid: 'user-1234' };


export default function AIPage() {
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
  const { toast } = useToast();

  // Effect to handle the OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');

    if (code && state) {
      setStatus('Completing authentication...');
      completeOAuth({ code, state, auth: { uid: state } })
        .then(result => {
          if (result.ok) {
            setStatus('Drive connected successfully!');
            toast({ title: 'Success', description: 'Your Google Drive is now connected.' });
          } else {
            throw new Error(result.message);
          }
        })
        .catch(e => {
          setStatus(`Error: ${e.message}`);
          toast({ variant: 'destructive', title: 'Failed to connect Drive', description: e.message });
        })
        .finally(() => {
          // Clean up URL
          window.history.replaceState({}, document.title, window.location.pathname);
        });
    }
  }, [toast]);


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
    setStatus('Classifying...');
    try {
      const result = await classifyFiles({ files: [], redact: true });
      setStatus(`Labeled ${result.labels.length} files.`);
      toast({
        title: 'Classification Complete',
        description: `Successfully labeled ${result.labels.length} files. Check the console for details.`,
      });
      console.log('Classification results:', result.labels);
    } catch (error: any) {
      setStatus(`Error: ${error.message}`);
      toast({ variant: 'destructive', title: 'Classification Failed', description: error.message });
    }
  }

  async function handleProposeRules() {
    resetFlow();
    setStatus('Proposing rule...');
    try {
      const prompt = "Move all PDFs older than 6 months with 'invoice' in the name to Finance/Invoices/Archive.";
      const result: ProposeRulesOutput = await proposeRules({ prompt, auth: mockAuth });
      setRuleId(result.ruleId);
      setCompiledRule(result.compiledRule);
      setStatus('Rule drafted successfully.');
      toast({ title: 'Rule Proposed', description: `Rule ID: ${result.ruleId}` });
    } catch (error: any) {
      setStatus(`Error: ${error.message}`);
      toast({ variant: 'destructive', title: 'Rule Proposal Failed', description: error.message });
    }
  }

  async function handleSimulate() {
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
      toast({ title: 'Simulation Complete', description: `${result.proposals.length} actions proposed.` });
    } catch (error: any) {
      setStatus(`Error: ${error.message}`);
      toast({ variant: 'destructive', title: 'Simulation Failed', description: error.message });
    } finally {
      setIsSimulating(false);
    }
  }

  async function handlePreflight() {
    if (!batchId) return;
    setStatus('Running preflight checks...');
    try {
      const result = await preflightActions({ batchId, auth: mockAuth });
      setChallenge(result.challenge);
      setStatus('Preflight complete. Please confirm.');
      toast({ title: 'Preflight Complete', description: 'Ready for confirmation.' });
    } catch (error: any) {
      setStatus(`Error: ${error.message}`);
      toast({ variant: 'destructive', title: 'Preflight Failed', description: error.message });
    }
  }

  async function handleConfirm() {
    if (!batchId || !challenge) return;
    setStatus('Confirming...');
    try {
      await confirmActions({ batchId, challengeResponse, auth: mockAuth });
      setIsConfirmed(true);
      setStatus('Confirmation successful.');
      toast({ title: 'Confirmation Success', description: 'Batch confirmed.' });
    } catch (error: any) {
      setStatus(`Error: ${error.message}`);
      toast({ variant: 'destructive', title: 'Confirmation Failed', description: error.message });
    }
  }

  async function handleExecute() {
    if (!batchId || !isConfirmed) return;
    setStatus('Executing actions...');
    try {
      const result = await executeActions({ batchId, auth: mockAuth });
      setExecutionResults(result.results);
      setStatus(`Execution complete: ${result.status}`);
      toast({ title: 'Execution Complete', description: `Status: ${result.status}` });
    } catch (error: any) {
      setStatus(`Error: ${error.message}`);
      toast({ variant: 'destructive', title: 'Execution Failed', description: error.message });
    }
  }

  async function handleRestore() {
    if (!batchId) return;
    setStatus('Restoring files...');
    try {
      const result: RestoreActionsOutput = await restoreActions({ batchId, auth: mockAuth });
      setStatus(`Restored ${result.restored.length} files.`);
      toast({ title: 'Restore Complete', description: `Restored ${result.restored.length} files.` });
      setExecutionResults(null); // Clear old results
    } catch (error: any) {
      setStatus(`Error: ${error.message}`);
      toast({ variant: 'destructive', title: 'Restore Failed', description: error.message });
    }
  }

  async function handleConnectDrive() {
    setStatus('Redirecting to Google...');
    try {
      console.log('Starting OAuth flow...');
      console.log('Mock auth object:', mockAuth);
      
      // Use API route instead of Genkit flow to avoid server component issues
      const response = await fetch('/api/oauth/begin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: mockAuth.uid })
      });
      
      console.log('API response status:', response.status);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to start OAuth');
      }
      
      const { url } = await response.json();
      console.log('Generated OAuth URL:', url);
      
      // Redirect the current window to the consent screen
      window.location.href = url;
    } catch (error: any) {
      console.error('OAuth error details:', {
        message: error.message,
        stack: error.stack,
        cause: error.cause,
        digest: error.digest
      });
      setStatus(`Error: ${error.message}`);
      toast({ variant: 'destructive', title: 'Failed to connect Drive', description: error.message });
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
          </div>
           <Button onClick={resetFlow} variant="outline">Reset Flow</Button>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle>Google Drive Integration</CardTitle>
            <CardDescription>Connect your Google Drive account to get started. You will be redirected to a Google consent screen.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <Button onClick={handleConnectDrive}>Connect Google Drive</Button>
              <Button onClick={() => listSampleFiles({ auth: mockAuth }).then(res => console.log(res.files)).catch(err => console.error(err))}>Log Sample Files to Console</Button>
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
              <Button onClick={classifySample}>Test Classification</Button>
              <Button onClick={handleProposeRules}>1. Propose Rule</Button>
              <Button onClick={handleSimulate} disabled={!compiledRule || isSimulating}>2. Simulate Rule</Button>
              <Button onClick={handlePreflight} disabled={proposals.length === 0}>3. Preflight Actions</Button>
              <Button onClick={handleExecute} disabled={!isConfirmed}>5. Execute</Button>
            </div>
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
