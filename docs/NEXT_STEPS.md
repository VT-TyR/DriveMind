# Next Steps & TODOs

## Phase 4 – Productization & Scale
- File operations GA (move/rename/delete/restore) with safeguards and audit logs
- Sharing/permissions insights; largest/oldest files views
- Virtualized inventory browser with filters and exports
- Advanced duplicate resolution flows (bulk actions, previews)
- ML classification & suggestions (graceful fallback)

## Quality & Observability
- E2E tests (Playwright/Cypress) for core flows
- Expand metrics (SLOs): scan duration, error rates, Drive API backoff events
- Optional: External log sink (Cloud Logging/Sentry) with PII scrubbing

## Data & Analytics
- Stand up DataConnect service (resolvers + DB)
- Migrate dashboard insights to GraphQL queries when available
- Add subscriptions for live progress if needed

## Documentation
- Keep docs/README.md index updated
- Add playbooks for any repeating incident patterns

