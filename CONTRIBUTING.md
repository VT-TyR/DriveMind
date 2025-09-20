# Contributing to DriveMind

Thanks for your interest in contributing! This document outlines our conventions, standards, and workflow so you can be productive quickly.

## Code of Conduct
Be respectful, collaborative, and security-minded. Avoid exposing secrets and PII. Prefer constructive, actionable feedback.

## Development Environment
- Node.js 18+, npm 9+
- Firebase CLI: `npm i -g firebase-tools`
- Local setup: see `DEVELOPMENT_SETUP.md`
- Run: `npm run dev`

## Coding Standards
- TypeScript strict mode everywhere. Fix types at the edges; avoid `any`.
- Modules under `src/lib` should be framework-agnostic and testable.
- API routes in `src/app/api/**/route.ts` must:
  - Validate input (Zod or explicit guards)
  - Authenticate as needed (Firebase Admin ID token)
  - Handle errors with clear messages (no stack traces in responses)
  - Log using `src/lib/logger.ts`
- Security:
  - Avoid client SDK in server routes — use Firebase Admin (`src/lib/admin.ts`)
  - Use rate-limiter for expensive endpoints (`rateLimiters.expensive`/`api`)
  - Consider CSP and headers from `src/middleware.ts`
- Feature flags:
  - Server: `FEATURE_*` flags; Client: `NEXT_PUBLIC_*`
  - Keep write operations disabled by default in production

## Commits & Branching
- Use Conventional Commits:
  - feat: add new feature
  - fix: bug fix
  - docs: documentation only changes
  - refactor: code change that neither fixes a bug nor adds a feature
  - perf: performance improvement
  - test: add or fix tests
  - chore: tooling/build/infra
- Branching: short-lived feature branches targeting `main` via PR.

## Pull Requests
- Checklist:
  - [ ] Typecheck and lint pass: `npm run typecheck && npm run lint`
  - [ ] Tests updated/added where appropriate
  - [ ] No secrets committed; `.env*` excluded
  - [ ] Feature flags documented if applicable
  - [ ] Docs updated (docs/README.md index if new docs added)
- Request review from at least one collaborator.

## Testing
- Unit/integration tests: `npm run test` (see `TESTING_GUIDE.md`)
- Prefer testing at the module boundary and focused integration tests
- Add minimal E2E for critical paths when possible

## Releases
- See `docs/RELEASE_PROCESS.md`
- Post-deploy health and optional scan smoke workflows exist

## Security & Privacy
- Never log raw tokens or PII; `logger` sanitizes high-risk fields
- Validate inputs and sanitize outputs; prefer Zod schemas for API bodies
- Report vulnerabilities privately

## Adding Docs
- Place new docs under `docs/` and link them from `docs/README.md`
- Add playbooks for repeatable operational tasks under `docs/PLAYBOOKS/`

## Questions
Open a discussion or issue with `[question]` prefix, or tag a maintainer.

