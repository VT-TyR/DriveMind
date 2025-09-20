# CI Workflows

## Health Check (post-deploy)
- File: `.github/workflows/post-deploy-health.yml`
- Triggers on push to `main` and manual
- Validates `/api/health` status is healthy/degraded

## Scan Smoke (post-deploy)
- File: `.github/workflows/post-deploy-scan-smoke.yml`
- Manual only
- Starts a background scan and polls until completion
- Requires secret: `SCAN_TEST_ID_TOKEN` (see `docs/CI-SECRETS.md`)

