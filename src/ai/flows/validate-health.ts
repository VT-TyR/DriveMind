
'use server';
/**
 * @fileOverview This flow validates the application's health by checking
 * key dependencies like environment variables and API connectivity.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';
import { driveFor } from '@/lib/google-drive';
import { getOAuthClient } from '@/lib/google-auth';
import { FlowAuth, getAuthenticatedUserSync } from '@/lib/flow-auth';
import { ValidateHealthInputSchema, ValidateHealthInput } from '@/lib/ai-types';


const HealthCheckResultSchema = z.object({
  ok: z.boolean(),
  message: z.string(),
});

const HealthValidationOutputSchema = z.object({
  envVars: HealthCheckResultSchema,
  driveApi: HealthCheckResultSchema,
  writeScope: HealthCheckResultSchema,
});

export type HealthValidationOutput = z.infer<typeof HealthValidationOutputSchema>;

async function checkEnvVars(): Promise<z.infer<typeof HealthCheckResultSchema>> {
    if (process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET) {
        return { ok: true, message: 'OAuth credentials are set.' };
    }
    return { ok: false, message: 'Missing GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET in your .env file.' };
}

async function checkDriveApi(uid: string): Promise<z.infer<typeof HealthCheckResultSchema>> {
    try {
        await driveFor(uid);
        return { ok: true, message: 'Successfully connected to Google Drive API.' };
    } catch (e: any) {
        if (e.message.includes('No Google Drive connection')) {
             return { ok: false, message: 'Not connected. Please complete the OAuth flow on the AI/Dev page to grant permissions.' };
        }
        return { ok: false, message: `Drive API connection failed: ${e.message}` };
    }
}

async function checkWriteScope(uid: string): Promise<z.infer<typeof HealthCheckResultSchema>> {
    try {
        const drive = await driveFor(uid);
        // Attempt a benign write-scoped operation. This will fail if scope is not granted.
        // We use a non-existent file ID to ensure no data is actually changed.
        await drive.files.get({ fileId: '1_this_is_a_test_id_and_should_not_exist', fields: 'id' });
        // If it doesn't throw, we know we at least have read scope. Now test write.
        try {
            await drive.files.update({ fileId: '1_this_is_a_test_id_and_should_not_exist', requestBody: { trashed: false } });
            // This case should ideally not be hit because the file doesn't exist.
            return { ok: false, message: 'Write scope check is inconclusive. Drive API did not return a permissions error as expected.'}
        } catch (writeError: any) {
             if (writeError.message.includes('File not found') || (writeError.errors && writeError.errors.some((err:any) => err.reason === 'notFound'))) {
                return { ok: true, message: 'Drive write scope appears to be granted.' };
            }
            if (writeError.message.includes('Insufficient Permission') || (writeError.errors && writeError.errors.some((err:any) => err.reason === 'insufficientPermissions'))) {
                return { ok: false, message: 'Drive write scope is missing. Please re-consent with write permissions on the AI/Dev page.' };
            }
             return { ok: false, message: `Write scope check failed with an unexpected error: ${writeError.message}` };
        }
    } catch (readError: any) {
        if (readError.message.includes('No Google Drive connection')) {
             return { ok: false, message: 'Not connected. Cannot check write scope without a Drive connection.' };
        }
        return { ok: false, message: `Read-level API check failed, cannot test write scope: ${readError.message}` };
    }
}


export async function validateHealth(input: ValidateHealthInput): Promise<HealthValidationOutput> {
  return validateHealthFlow(input);
}

const validateHealthFlow = ai.defineFlow(
  {
    name: 'validateHealthFlow',
    inputSchema: ValidateHealthInputSchema,
    outputSchema: HealthValidationOutputSchema,
  },
  async (input: ValidateHealthInput) => {
    const user = getAuthenticatedUserSync(input.auth);
    const [envVars, driveApi, writeScope] = await Promise.all([
        checkEnvVars(),
        checkDriveApi(user.uid),
        checkWriteScope(user.uid)
    ]);
    return { envVars, driveApi, writeScope };
  }
);

    
