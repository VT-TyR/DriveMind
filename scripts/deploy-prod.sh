#!/usr/bin/env bash
set -euo pipefail

if ! command -v npx >/dev/null 2>&1; then
  echo "npx not found. Please install Node.js/npm." >&2
  exit 1
fi

if ! command -v firebase >/dev/null 2>&1; then
  echo "firebase CLI not found. Install with: npm i -g firebase-tools" >&2
  exit 1
fi

echo "Reverting to production config (file ops disabled)."
git checkout -- apphosting.yaml

echo "Ensuring Firebase project selection..."
npx firebase use drivemind-q69b7

echo "Updating App Hosting backend (studio)..."
npx firebase apphosting:backends:update studio

echo "Done. Production config applied."

