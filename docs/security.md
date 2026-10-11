# Security

- Security is build-time: mutating routes carry auth/permission checks when first written; secrets stay server-side.
- Guard/effect fixes re-check adjacent paths they unblocked.
- Ask before: installing packages, destructive commands, anything outside the repo (dotfiles, global config), network side effects, `sudo`, `curl | sh`, migrations, deploys.
- Never overwrite uncommitted user changes; never `git add -A`, `git commit --amend`, or `--no-verify` unprompted.
- Never print or log `.env` contents or any secret.
