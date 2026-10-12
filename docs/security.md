# Security

## Build-time

- Mutating routes carry auth/permission checks when first written.
- Secrets stay server-side.
- Guard/effect fixes re-check adjacent paths they unblocked.

## Ask before

- Installing packages
- Destructive commands
- Anything outside the repo (dotfiles, global config)
- Network side effects
- `sudo` or `curl | sh`
- Migrations or deploys

## Never

- Overwrite uncommitted user changes
- `git add -A`, `git commit --amend`, or `--no-verify` unprompted
- Print or log `.env` contents or any secret
