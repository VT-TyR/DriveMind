# Playbook: DataConnect (GraphQL)

This layer is optional. Publishing is non-blocking and logs warnings on failure.

## Enable
- Flags: `FEATURE_DATACONNECT_ENABLED=true`
- Secrets: `DATACONNECT_URL`, `DATACONNECT_API_KEY`

## Publish Points
- File index updates: `updateFileIndex()` → `publishFileIndex(...)`
- Scan summary: background scan completion → `recordScanResults(...)`

Full details: artifacts/docs/DataConnect.md, schema: dataconnect/schema/schema.gql

