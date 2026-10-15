# Check catalog

| Check | FAIL when | WARN when | Why it matters |
|---|---|---|---|
| node-pin | — | running node ≠ `.nvmrc` | engine mismatches cause module-not-found and unsupported-engine runs; prefix pinned binaries with `nvm use <pin> &&` |
| cargo | — | not on PATH | pidx cannot rebuild; session-audit still works via Node fallback, just slower |
| pidx | binary missing/not executable/`--help` fails | stale vs crate sources | L0 fast path for session-audit; stale binary = old extract schema risk |
| rg / gh / fd / jq | — | not on PATH | search, issue workflow, find alternative, payload piping |
| gate | permission-gate/index.ts missing | — | mechanical enforcement layer absent |
| settings | settings.json unparsable or lists missing extension dirs | — | broken settings degrade every session |
| hooks | — | .husky empty | commitlint/ship guards plus post-pull setup sync (`post-merge`/`post-rewrite`) |
| dir:sessions / dir:.cache | exists but not writable | missing (created on first use) | transcripts and pidx state need write access |
| audit | session-audit runner exits non-zero on `--help` | — | the digest/fetch interface itself broken |

pidx rebuild path: `cargo build --release` in `tools/pidx`, copy
`target/release/pidx` to `bin/pidx`. Binary is machine-local (`/bin/` is
gitignored) — every fresh clone needs the rebuild once; that is the normal
Linux/macOS bootstrap, not an error state. After the first bootstrap, `git
pull` re-runs `pidoc --fix` automatically via `scripts/after-pull.sh`,
rebuilding pidx only when it is missing or older than the crate sources.
