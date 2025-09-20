# Operations Runbook

## Health
- `GET /api/health` should return 200 and status `healthy` or `degraded`
- `GET /api/metrics` provides JSON or Prometheus metrics

## Background Scan Incidents
1. Symptom: 500 on scan start
   - Check logs for `Background scan API error`
   - Verify Firebase Admin is initialized (`getAdminAuth()`)
   - Confirm tokens exist in Firestore (`src/lib/token-store.ts`)
2. Symptom: Scan stalls or takes too long
   - Review Drive rate limits; look for `Drive API error on page`
   - Check for cancellation or timeouts in the loop
   - Use `PATCH /api/workflows/background-scan` with `{ action: 'cancel' }` to recover
3. DataConnect errors (optional layer)
   - Look for warnings: `DataConnect ... publish failed`
   - Confirm `FEATURE_DATACONNECT_ENABLED`, `DATACONNECT_URL`, `DATACONNECT_API_KEY`

## OAuth Issues
- Use `/api/health` Google auth check and `/api/auth/drive/status`
- Re-connect via UI, ensure `prompt: 'consent'` and offline access configured

## CI & Post-Deploy
- Actions → Post-Deploy Health Check (auto on push to main)
- Actions → Post-Deploy Scan Smoke (manual; needs `SCAN_TEST_ID_TOKEN`)

## Rollback
- `git revert <commit>` → push `main` to auto-deploy
- See `artifacts/safety/rollback_procedures.md`

