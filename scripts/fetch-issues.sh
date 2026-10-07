#!/bin/sh
# Batch-pull open GitHub issues to $TMPDIR/issues/ and sync ISSUE_TRACKER.md at the
# repo root, so the whole backlog + pipeline state is visible in one file.
# Usage: fetch-issues.sh [limit] [repo]   (repo defaults to the cwd's repo)
set -eu

LIMIT="${1:-100}"
REPO="${2:-}"
DUMP_DIR="${TMPDIR:-/tmp}/issues"
mkdir -p "$DUMP_DIR"

if [ -z "$REPO" ]; then
  REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner)"
fi

# One list call reused for both dump fetching and tracker sync.
# Format per line: <number>\t<updatedAt ISO>
LIST="$(gh issue list -R "$REPO" --json number,updatedAt --jq '.[] | "\(.number)\t\(.updatedAt)"' -L "$LIMIT")"

echo "$LIST" | while IFS="$(printf '\t')" read -r n updated; do
  gh issue view "$n" -R "$REPO" --json number,title,body,labels,state,updatedAt,comments > "$DUMP_DIR/$n.json"
  echo "fetched #$n"
done

# Sync ISSUE_TRACKER.md (gh holds backlog state, .pi/issues/ holds pipeline state)
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
mkdir -p .pi/issues
TMP_TRACKER="$(mktemp)"

{
  echo "| Issue | Status | Branch | PR | Updated |"
  echo "|---|---|---|---|---|"
  echo "$LIST" | while IFS="$(printf '\t')" read -r n updated; do
    updated="${updated%%T*}"
    rec=".pi/issues/$n.md"
    status="open"
    branch="-"
    pr="-"
    if [ -f "$rec" ]; then
      status="$(grep -m1 '^Status:' "$rec" | cut -d' ' -f2)"
      branch="$(grep -m1 '^Branch:' "$rec" | cut -d' ' -f2)"
      pr="$(grep -m1 '^PR:' "$rec" | cut -d' ' -f2)"
    fi
    echo "| #$n | ${status:-open} | ${branch:--} | ${pr:--} | $updated |"
  done
} > "$TMP_TRACKER"

# Keep any sections below the table (e.g. "## Possible duplicates")
if [ -f ISSUE_TRACKER.md ]; then
  sed -n '/^## /,$p' ISSUE_TRACKER.md >> "$TMP_TRACKER" || true
fi
mv "$TMP_TRACKER" ISSUE_TRACKER.md
echo "ISSUE_TRACKER.md synced"
