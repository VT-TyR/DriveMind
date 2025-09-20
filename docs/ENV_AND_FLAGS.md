# Environment & Feature Flags

## Environment Variables (selected)
- OAuth
  - `GOOGLE_OAUTH_CLIENT_ID`
  - `GOOGLE_OAUTH_CLIENT_SECRET`
- Firebase Admin (local dev)
  - `GOOGLE_APPLICATION_CREDENTIALS` → path to service account JSON
- Next.js public config
  - `NEXT_PUBLIC_FIREBASE_CONFIG` or individual `NEXT_PUBLIC_FIREBASE_*`
  - `NEXT_PUBLIC_BASE_URL`
- DataConnect (optional)
  - `DATACONNECT_URL` (GraphQL endpoint)
  - `DATACONNECT_API_KEY` (Bearer)

See `apphosting.yaml` and `apphosting.staging.yaml` for production values.

## Feature Flags
- File operations
  - Server: `FEATURE_FILE_OPS_ENABLED` (default false)
  - Client: `NEXT_PUBLIC_FEATURE_FILE_OPS` (default false)
- DataConnect
  - Server: `FEATURE_DATACONNECT_ENABLED` (default false)

Guidance:
- Keep file ops off in production until write scope and permissions have been validated and UX safeguards are complete.
- Enable DataConnect only when endpoint and resolvers are configured.

