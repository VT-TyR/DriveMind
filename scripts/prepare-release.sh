#!/usr/bin/env bash
set -euo pipefail

VERSION=${1:-}
if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version>  (e.g., $0 1.3.0)" >&2
  exit 1
fi

DATE=$(date +%Y-%m-%d)
SRC="artifacts/release/ReleaseNotes.md"
DST="artifacts/release/ReleaseNotes_Draft_v${VERSION}_${DATE}.md"

if [ ! -f "$SRC" ]; then
  echo "Source release notes not found: $SRC" >&2
  exit 1
fi

cp "$SRC" "$DST"
echo "Drafted: $DST"
echo "Next: bump package.json version, open PR with template .github/PULL_REQUEST_TEMPLATE/release.md"

