/**
 * Centralized feature flag helpers.
 *
 * Server-side flags should use non-public env vars (e.g., FEATURE_*),
 * Client-side flags must use NEXT_PUBLIC_* to be exposed at build time.
 */

// Server: controls API routes for write-enabled file operations
export function isFileOpsEnabledServer(): boolean {
  return (process.env.FEATURE_FILE_OPS_ENABLED || 'false') === 'true';
}

// Client: controls visibility of file operation UI elements
export function isFileOpsEnabledClient(): boolean {
  return (process.env.NEXT_PUBLIC_FEATURE_FILE_OPS || 'false') === 'true';
}

export const featureMessages = {
  fileOpsDisabled: 'File operations are currently disabled in this environment.',
};

