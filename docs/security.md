# Security

## Build-time

- Mutating routes: auth/permission check at first write.
- Secrets server-side.
- Guard/effect fix → re-check adjacent unblocked paths.

## Ask before

The ask-list lives in AGENTS.md §Scope (single source) — installing packages, destructive commands, out-of-repo/out-of-scope changes, `sudo`, `curl | sh`.

## Never

- Overwrite uncommitted user changes
- `git add -A`, `git commit --amend`, `--no-verify` unprompted
- Print/log `.env` or any secret
- Run a command whose output may contain a secret without a redaction pipe — near a known secret: `sed`/`jq` redaction, or length/hash only; verify the redaction pattern matches the quoting style first; the raw value never reaches tool output or the transcript
