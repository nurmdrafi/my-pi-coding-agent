# Extensions

Always-on TypeScript extensions for this pi agent harness, auto-discovered from
`~/.pi/agent/extensions/`. Runtime only — never part of the model-visible
prefix, so edits here never invalidate the session cache.

## Usage

```bash
# auto-discovery: files here load on every pi session — no config needed
# manual / one-off load:
pi --extension ~/.pi/agent/extensions/permission-gate.ts
```

Edits take effect on the next session start (or via `/reload-runtime` if adopted — see candidates).

## Extensions

> **Extensions vs packages:** pi packages (`pi install git:…`) are declared in `settings.json` → `packages` and cloned machine-local under `~/.pi/agent/git/`. Unlike extensions, their tool definitions DO add to the model-visible prefix. Currently no packages are installed — the `pi-interactive-subagents` package was removed [1.16.10] (subagents are opt-in via `pi install` when needed; see the main `README.md` "Subagents" section).

| Extension | Role | Hooks |
|---|---|---|
| `permission-gate.ts` | Blocks rule-violating tool calls before execution, with corrective rule text | `tool_call`, `tool_result`, `session_compact` |

## `permission-gate.ts` — rule catalog

Single `tool_call` interceptor; one handler, deterministic order (edit → read → write → bash). Every block carries a rule-family prefix (`Anchor Guard:`, `Token Economy (…)`) so transcripts and logs stay greppable and the model gets precise corrective text.

| Rule | Scope | Blocks |
|---|---|---|
| `Anchor Guard:` | edit | `oldText` not found (exact + fuzzy normalization), non-unique anchor (reports line numbers), intra-call overlap of exact-matched anchors |
| R1 | read | any re-read whose requested window is fully covered by the session's in-context span union — read results (actual returned lines from result truncation stats; an untruncated whole-file read certifies 1–EOF), edit-result spans (exact-match anchors), whole file after `write` and for images; partial overlap passes; freshness = mtime+size snapshot per certified path — an external on-disk change invalidates coverage (stat, not command-text guessing); also resets on `session_compact`, a failed edit |
| R2 | bash | `cat` / `sed -n` for viewing with no pipe consumer — `sed -n` batching 2+ regions (`;` or two `-e`) is allowed |
| R5 | bash | `git log` without `--oneline` / `-n <N>` / pipe cap |
| R6 | bash | `rg -o` without pipe cap (quoted patterns stripped first so a pattern containing `-o` can't false-fire) |
| R7 | bash | recursive walks: `ls -R`-family flags, `find -exec`/`-execdir` (redirected `ls -R > f` exempt; `find -executable` doesn't false-fire) |
| R8 | bash | `git commit`/`git push` without `--no-verify`, a pipe cap, or `2>&1 \| tail -20` — hooks (lint/test/build) flood context; a cap anywhere in the full command satisfies the check (heredoc messages) |
| R9 | bash | `git commit -m <msg>` header not matching commitlint conventional pattern `type(scope?): subject` (types: feat/fix/docs/style/refactor/perf/test/build/ci/chore/revert; also header ≤ 100 chars, subject not capitalized, no trailing `.`); header rules only — body `-m` flags, `-F`, heredoc skipped; checked before R8 so a bad message never reaches hooks |
| R10 | bash | identical re-run: same base command (command up to the first pipe/redirect, `2>&1` stripped) re-run ≤10 min after its last successful run with no intervening edit/write — its output is already in context; watchers (`watch`, `tail -f`, `sleep`, `--watch`) and retries of failed runs exempt; recorded on `tool_result`, cleared on `session_compact` |
| Runner cap | bash | uncapped `npm`/`vitest`/`jest`/`playwright`/`tsc` runners (suggests the filter pipe) |

State (per extension instance): `coverage` (path → merged span union + last kind), `pendingEdits`, `pendingReads` drive R1; `pendingBash` / `lastBashRun` (base command → last-run record) plus a `mutationSeq` counter bumped by every successful edit/write drive R10 — a mutation makes verify re-runs legitimate. A failed edit drops coverage — content may have drifted, so a re-read is legitimate; `session_compact` clears everything. No hydration on session resume — the map starts empty, erring toward allowing. Fuzzy matching mirrors edit-diff.js `normalizeForFuzzyMatch` (NFKC, trailing whitespace, smart quotes/dashes/spaces) so the guard and the tool agree on what "matches". Anchor validation runs before coverage registration, so a blocked edit never enters the map.

## Conventions (pi)

- **One file per extension**, `export default function (pi: ExtensionAPI)` — per [pi conventions](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md); use a directory + nearby `package.json` only for multi-file implementations with deps.
- **Naming**: kebab-case, function-descriptive. Note this harness's `permission-gate.ts` *blocks unconditionally* — upstream's same-named example *confirms* instead, so the planned commit/push confirmation gate is named `commit-gate.ts`.
- **No npm dependencies** — Node stdlib + `@earendil-works/pi-coding-agent` only. If a dep is ever needed, the pi-native way is `pi install npm:<pkg>` (declares it in `settings.json` → `packages`, installs under `~/.pi/agent/npm`) — *not* the root `package.json`, which holds repo tooling (husky/commitlint) only.
- **Portability (macOS + Linux)**: paths via `os.homedir()` / `~`; no absolute user paths; no OS-only commands.
- Machine-local, gitignored, auto-regenerated: `bin/` (pi downloads arch-correct binaries), `npm/` (pi-managed installs).

## Verifying changes

- Strict typecheck against the installed package's types (`npx tsc --noEmit --strict` with a `paths` mapping to the global `@earendil-works/pi-coding-agent/dist/index.d.ts` — the global path is machine-specific).
- `permission-gate` fixture test: `node tests/permission-gate.test.mjs` — 19 black-box cases through a stubbed ExtensionAPI (exit 0 = pass; preflight symlinks the global package into the gitignored root `node_modules`).
- `node skills/harness-engineer/scripts/mdcmdcheck.mjs` must exit 0 (validates every command/path this README declares).
- Restart pi to load changes; watch the first few tool calls — a misfiring rule shows up immediately as a block.

## Adding a new extension

1. kebab-case function-descriptive name (see Conventions); decide blocking vs confirming semantics first.
2. `export default function (pi: ExtensionAPI)`; stateless unless the design demands state.
3. No deps; portable paths; failures must never break the agent loop.
4. If it blocks tool calls, use a stable reason prefix (`<Family>:`) — it lands in transcripts, telemetry, and audits.
5. Update this README (table + a section if non-trivial) and `CHANGELOG.md`; restart the session to load.

## Adoption candidates (from upstream, ranked)

| Candidate | Source | Why |
|---|---|---|
| `commit-gate.ts` (adapt upstream `permission-gate.ts`) | [upstream](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions) | Encode AGENTS.md Safety: ask before commit/push/install/destructive — `ctx.ui.confirm` with UI, block headless |
| new `portability-guard.ts` | no upstream twin — model on `permission-gate.ts` | Block `sed -i` (no `''`), `stat -c/-f`, `grep -P` (AGENTS.md cross-platform rule) |
| `handoff.ts` | upstream | `/handoff` summaries for the fresh-session protocol (150K / 200-turn limits) |
| `session-name.ts` | upstream | Named sessions improve `sessions/**/*.jsonl` audits |
| `notify.ts` | upstream | OSC 777 turn-complete desktop notifications |
| `reload-runtime.ts` | upstream | Hot-reload extensions after editing guards, without restarting |

## Upstream references

- Examples: <https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions>
- Extension docs: <https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md>
- Pi packages (`pi install`): <https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md>
