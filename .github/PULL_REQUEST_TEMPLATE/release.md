## Release Title

DriveMind vX.Y.Z — Summary of Changes

## Highlights
- Background scan stability and Admin migration
- Security hardening and rate limiting
- Duplicates export (CSV/JSON) and inventory export
- Optional DataConnect publishing (scan summary + file index)

## Checklist
- [ ] Bump version in `package.json`
- [ ] Update `artifacts/release/ReleaseNotes.md` with final changes
- [ ] Verify health after deploy (`/api/health`)
- [ ] Run Post-Deploy Scan Smoke workflow
- [ ] Flags: file ops disabled in prod; DataConnect as intended

## Notes
Link to Phase verification: `docs/PHASE1-VERIFICATION.md`

