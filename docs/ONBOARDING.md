# Onboarding Guide

This guide onboards a new developer or AI agent to DriveMind.

## TL;DR
- Read: README.md → DEVELOPMENT_SETUP.md → TECHNICAL_DEEP_DIVE.md → ARCHITECTURE_NOTES.md
- Run locally: `npm install && npm run dev`
- Set env: copy `.env.example` → `.env.local` and fill Firebase + OAuth (see DEVELOPMENT_SETUP.md)
- Verify health: `GET /api/health`
- Run a scan: POST `/api/workflows/background-scan` with a Firebase ID token
- Explore docs index: docs/README.md

## Repo Structure (high-level)
- `src/app` — Next.js App Router (pages + API routes)
- `src/lib` — Core libraries (auth, drive, db, logging, security)
- `src/components` — UI components
- `src/ai/flows` — AI and analysis flows
- `artifacts/` — Reports, ADRs, audit notes, release notes
- `docs/` — Developer handbook (this folder)

For a detailed mapping, see docs/CODEMAP.md.

## Setup Steps
1) Install prerequisites
- Node.js 18+, npm 9+
- Firebase CLI (`npm i -g firebase-tools`)

2) Install and run
```bash
npm install
npm run dev
# open http://localhost:3000
```

3) Configure environment
- `.env.local`: Firebase client config + `GOOGLE_OAUTH_CLIENT_ID/SECRET`
- For server routes using Firebase Admin, set `GOOGLE_APPLICATION_CREDENTIALS` to a service account file (see DEVELOPMENT_SETUP.md)

4) Sign in & connect Google Drive
- Use the UI (Dashboard) to sign in
- Connect to Google Drive (OAuth)

5) Start a background scan
- Via UI: Dashboard → Start Background Scan
- Via API: `POST /api/workflows/background-scan` with header `Authorization: Bearer <FirebaseIDToken>`

6) Export duplicate report
- Duplicates page → Export CSV/JSON
- Or API: `POST /api/exports/duplicates`

## Production & Staging
- Deploy: push to `main` (auto) or `npm run deploy`
- Health checks: Actions → Post-Deploy Health Check
- Smoke test scan: Actions → Post-Deploy Scan Smoke
- Staging (file ops enabled): `bash scripts/deploy-staging.sh` → validate → `bash scripts/deploy-prod.sh`

## Key References
- Dev Setup: DEVELOPMENT_SETUP.md
- Deployment: DEPLOYMENT_GUIDE.md
- Background Scan: BACKGROUND_SCAN_GUIDE.md
- OAuth: OAUTH_SYSTEM_GUIDE.md
- Technical: TECHNICAL_DEEP_DIVE.md
- DataConnect (optional): artifacts/docs/DataConnect.md

## Credentials & Secrets
- Firebase App Hosting Secrets: OAuth creds; optional DataConnect (see docs/ENV_AND_FLAGS.md)
- GitHub Secrets: `SCAN_TEST_ID_TOKEN` for scan smoke workflow

## Common Tasks
- Add an API route: under `src/app/api/.../route.ts`
- Write a playbook: under `docs/PLAYBOOKS/`
- Update docs index: `docs/README.md`
- Update phase status: `PROJECT_COMPLETION_STATUS.md`

