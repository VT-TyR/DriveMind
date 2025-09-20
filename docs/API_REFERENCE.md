# API Reference (Selected)

Auth & OAuth
- `POST /api/auth/drive/begin` → Start OAuth
- `POST /api/auth/drive/callback` → Complete OAuth
- `GET /api/auth/drive/status` → Check Drive connection
- `POST /api/auth/drive/sync` → Sync tokens

Background Scan
- `POST /api/workflows/background-scan` → Start scan (requires Firebase ID token)
- `GET /api/workflows/background-scan` → Poll status
- `PATCH /api/workflows/background-scan` → Cancel active scan (with `{ action: 'cancel' }`)
- `GET /api/scan/stream?jobId=...` → SSE updates

Duplicates & Exports
- `POST /api/workflows/duplicates` → Run duplicate detection
- `POST /api/exports/duplicates` → Export duplicates (json|csv)

File Operations (feature gated)
- `POST /api/files/move`
- `POST /api/files/rename`
- `POST /api/files/delete`
- `POST /api/files/restore`
- `POST /api/folders/create`

Ops & Debug
- `GET /api/health`
- `GET /api/metrics` (`?format=prometheus` supported)
- Various: `src/app/api/debug/*`

