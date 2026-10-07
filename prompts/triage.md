---
description: Batch-scan fetched issue dumps for likely duplicate reports and flag clusters in ISSUE_TRACKER.md
argument-hint: "[max-issues]"
---
Batch duplicate triage over the fetched backlog. No code edits, no record Status changes, nothing posted to GitHub.

1. If /tmp/issues/ is empty or stale, run `~/.pi/agent/scripts/fetch-issues.sh` first. Then list the dumps, capped at the ${1:-40} highest issue numbers (newest).
2. For each dump: rg out number, title, and the first ~10 lines of the body. Do not page through full dumps or comments.
3. Cluster issues describing the same symptom and the same trigger. Be conservative — differing environment, version, or trigger means separate issues unless the failure is clearly identical.
4. Rewrite the `## Possible duplicates` section at the bottom of ISSUE_TRACKER.md (keep the table above it untouched). One cluster per line:
   `- #12 ≈ #45 — same <one-line symptom>; keep #12 (older), #45 likely dup`
   Write `None found.` if there are no clusters.
5. Report the clusters, then stop. Resolving them (marking dup on GitHub, closing, re-running fetch to refresh the tracker) is a human decision.
