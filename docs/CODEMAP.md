# Code Map

This map points to core files and explains how features connect.

## Core Flows
- Background Scan
  - API: `src/app/api/workflows/background-scan/route.ts`
  - Drive client: `src/lib/google-drive.ts`
  - DB & scan jobs: `src/lib/firebase-db.ts`
  - SSE updates (optional): `src/app/api/scan/stream/route.ts`
- OAuth / Auth
  - OAuth endpoints: `src/app/api/auth/drive/*`
  - Token store (Firestore Admin): `src/lib/token-store.ts`
  - Admin init: `src/lib/admin.ts`
- Exports
  - Export service: `src/lib/export-service.ts`
  - Duplicates export API: `src/app/api/exports/duplicates/route.ts`
- Security & Middleware
  - Edge middleware + headers: `src/middleware.ts`
  - Rate limiter: `src/lib/security/rate-limiter.ts`

## Frontend
- Dashboard: `src/app/dashboard/page.tsx`, components in `src/components/dashboard/*`
- Duplicates page: `src/app/duplicates/page.tsx`
- Contexts: `src/contexts/*`

## Observability & Ops
- Health: `src/app/api/health/route.ts`
- Metrics: `src/app/api/metrics/route.ts`
- Logs: `src/lib/logger.ts`
- CI: `.github/workflows/*.yml`

## Optional Data Layer (GraphQL)
- Schema: `dataconnect/schema/schema.gql`
- Client: `src/lib/dataconnect.ts`
- Config flags: `FEATURE_DATACONNECT_ENABLED`, `DATACONNECT_URL`, `DATACONNECT_API_KEY`

