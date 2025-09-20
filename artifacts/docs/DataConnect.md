# DataConnect Integration (GraphQL)

This app can optionally publish scan summaries and file index entries to a GraphQL endpoint ("DataConnect").

## Enable

Environment variables (App Hosting):
- `FEATURE_DATACONNECT_ENABLED` = `true`
- `DATACONNECT_URL` = GraphQL endpoint URL
- `DATACONNECT_API_KEY` = Bearer token (optional if endpoint is public or uses different auth)

See `apphosting.yaml` and `apphosting.staging.yaml` for placeholders.

## Schema

GraphQL schema lives at `dataconnect/schema/schema.gql` and defines:
- FileIndexEntry (indexed files)
- ScanJob + ScanResults (scan summary)
- DuplicateGroup (detected duplicates)

## Publish Points

- File index: `updateFileIndex()` calls `publishFileIndex(...)` in a fire-and-forget fashion.
- Scan summary: background scan route calls `recordScanResults(...)` after completing the job.

Errors from publishing are logged but do not affect user flow.

## Notes
- This layer is optional; Firestore remains the system of record.
- Add resolvers/backing store on the GraphQL service side for upsert mutations.
