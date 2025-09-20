# Release Process

## Branch & Versioning
- Main deploys automatically (App Hosting)
- Create annotated tag and GitHub Release when promoting a stable build

## Checklist
- [ ] Typecheck and lint pass (`npm run typecheck && npm run lint`)
- [ ] Health & metrics pass after deploy
- [ ] Background scan verified via Phase 1 script
- [ ] Duplicates export (CSV/JSON) verified
- [ ] Secrets/flags correct: file ops disabled in prod, DataConnect as intended

## CI Supports
- Post-Deploy Health Check (auto)
- Post-Deploy Scan Smoke (manual)

## Rollback
- Revert commit and push → redeploy

