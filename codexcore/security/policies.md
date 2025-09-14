# Security Policies (baseline)
- CSP: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:;
- CORS: strict allowlist per environment; no wildcard.
- Secrets: never committed; provide `.env.example`; mandate secret rotation.
- Audit: immutable append-only logs for authz decisions and data writes.