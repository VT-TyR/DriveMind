/**
 * Lightweight DataConnect client (GraphQL) with feature flag gating.
 * If FEATURE_DATACONNECT_ENABLED is false or DATACONNECT_URL is missing, calls no-op.
 */

type GqlResponse<T> = { data?: T; errors?: Array<{ message: string }> };

const isEnabled = () => (process.env.FEATURE_DATACONNECT_ENABLED || 'false') === 'true';
const endpoint = () => process.env.DATACONNECT_URL || '';
const apiKey = () => process.env.DATACONNECT_API_KEY || '';

async function gql<T>(query: string, variables?: Record<string, any>): Promise<T | null> {
  if (!isEnabled() || !endpoint()) return null;
  const headers: Record<string,string> = { 'Content-Type': 'application/json' };
  if (apiKey()) headers['Authorization'] = `Bearer ${apiKey()}`;

  const res = await fetch(endpoint(), {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as GqlResponse<T>;
  if (!res.ok || json.errors?.length) {
    throw new Error(`DataConnect error: ${json.errors?.map(e => e.message).join('; ') || res.statusText}`);
  }
  return json.data ?? null;
}

export async function publishFileIndex(entries: Array<Record<string, any>>): Promise<number> {
  if (!isEnabled()) return 0;
  const mutation = `mutation Upsert($entries: [FileIndexInput!]!) { upsertFileIndex(entries: $entries) }`;
  const data = await gql<{ upsertFileIndex: number }>(mutation, { entries });
  return data?.upsertFileIndex ?? 0;
}

export async function publishDuplicateGroups(groups: Array<Record<string, any>>): Promise<number> {
  if (!isEnabled()) return 0;
  const mutation = `mutation Upsert($groups: [DuplicateGroupInput!]!) { upsertDuplicateGroups(groups: $groups) }`;
  const data = await gql<{ upsertDuplicateGroups: number }>(mutation, { groups });
  return data?.upsertDuplicateGroups ?? 0;
}

export async function recordScanResults(input: Record<string, any>): Promise<boolean> {
  if (!isEnabled()) return false;
  const mutation = `mutation Record($input: ScanResultsInput!) { recordScanResults(input: $input) }`;
  const data = await gql<{ recordScanResults: boolean }>(mutation, { input });
  return !!data?.recordScanResults;
}

