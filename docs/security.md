# Security

## Build-time
- Mutating routes: auth/permission checks at first write.
- Secrets server-side.
- Guard/effect fixes re-check adjacent unblocked paths.

## Ask before
- Installing packages
- Destructive commands
- Outside repo / out-of-scope changes (dotfiles, global config)
- `sudo`, `curl | sh`

## Never
- Overwrite uncommitted user changes
- `git add -A`, `git commit --amend`, `--no-verify` unprompted
- Print/log `.env` or any secret
- Run command whose output may contain secret without redaction pipe — near known secret: pipe through `sed`/`jq` redaction or print length/hash only; verify redaction pattern matches quoting style first; raw value never reaches tool output or transcript
