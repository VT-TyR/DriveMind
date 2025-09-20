# CI Secrets and Variables

This repository includes two post-deploy workflows:

- `post-deploy-health.yml` – checks `/api/health` and fails if not healthy/degraded
- `post-deploy-scan-smoke.yml` – starts a background scan and polls for completion

## Required secret for scan smoke

Set a Firebase ID token for a test user in GitHub secrets so the scan smoke workflow can authenticate.

Secret name: `SCAN_TEST_ID_TOKEN`

### Generate a token
1. In a browser logged into your deployed app as a test user, open the console and run:
   ```js
   await firebase.auth().currentUser.getIdToken(/* forceRefresh */ true)
   ```
2. Copy the token string.

### Set the secret using GitHub CLI
```bash
gh secret set SCAN_TEST_ID_TOKEN --body "<PASTE_TOKEN_HERE>"
```

Alternatively, set it in the GitHub UI under Settings → Secrets and variables → Actions.

## Optional: BASE_URL variable

If you deploy to a different base URL, set a repository variable:

Name: `BASE_URL`

Value example:
```
https://studio--drivemind-q69b7.us-central1.hosted.app
```

## Running the workflows

- Health check: runs automatically on push to `main` or manually from Actions.
- Scan smoke: manual only → Actions → “Post-Deploy Scan Smoke”.
  - Uses `SCAN_TEST_ID_TOKEN` secret by default.
  - You can override with a one-off token via the workflow input.

