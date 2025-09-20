# Playbook: OAuth & Tokens

## Connect
- `POST /api/auth/drive/begin` → user redirect URL
- `POST /api/auth/drive/callback` → stores refresh token (cookie + Firestore)

## Verify
- `GET /api/auth/drive/status` → attempts Drive API call
- `POST /api/auth/drive/sync` → reconcile cookie/Firestore tokens

## Common Issues
- No refresh token: ensure `access_type: 'offline'` and `prompt: 'consent'`
- Redirect mismatch: check `NEXT_PUBLIC_BASE_URL` and Google Console URIs
- Server-only ops failing: ensure Firebase Admin initialized (`src/lib/admin.ts`)

