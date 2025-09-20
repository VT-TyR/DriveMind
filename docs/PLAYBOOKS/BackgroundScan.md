# Playbook: Background Scan

## Start a scan
- UI: Dashboard → Start Background Scan
- API: `POST /api/workflows/background-scan` with Firebase ID token

## Monitor
- Poll: `GET /api/workflows/background-scan`
- SSE: `GET /api/scan/stream?jobId=...`

## Cancel
- `PATCH /api/workflows/background-scan` body `{ "action": "cancel" }`

## Troubleshooting
- Missing tokens → re-connect OAuth, check Firestore secrets path
- 5xx during scan → inspect logs for Drive API pagination errors, backoff timing
- Large drives → ensure job-chaining and checkpointing logic remains within limits

References: BACKGROUND_SCAN_GUIDE.md, TECHNICAL_DEEP_DIVE.md

