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

> **Extensions vs packages:** pi packages (`pi install git:…`) are declared in `settings.json` → `packages` and cloned machine-local under `~/.pi/agent/git/`. Unlike extensions, their tool definitions DO add to the model-visible prefix. Currently none — the former `pi-interactive-subagents` package is owned in-tree as `subagents/` below (vendored at `c3e8b53` with local patches folded in; spawning tools default-inactive — see the main `README.md` "Subagents" section).

| Extension | Role | Hooks |
|---|---|---|
| `permission-gate.ts` | Blocks rule-violating tool calls before execution, with corrective rule text | `tool_call`, `tool_result`, `session_compact` |
| `subagents/` | Interactive tmux subagents (vendored upstream at `c3e8b53`, patches folded in; spawning tools gated by default) | tools, commands, renderers |

## `permission-gate.ts` — rule catalog

Single `tool_call` interceptor; one handler, deterministic order (edit → read → write → bash). Every block carries a rule-family prefix (`Anchor Guard:`, `Token Economy (…)`) so transcripts and logs stay greppable and the model gets precise corrective text. Block reasons are capped ≈200 chars — pointer + fix, no prose (2026-10-06 diet: session audit showed 90% one-shot recovery needs the pointer, not the words, and every block text rides the prefix ~2.6× for the rest of the session). Anchor Guard keeps a trimmed ≤8-line file snippet on anchor-miss — Aider-style "did you mean" context.

| Rule | Scope | Blocks |
|---|---|---|
| `Anchor Guard:` | edit | `oldText` not found (exact + fuzzy normalization), non-unique anchor (reports line numbers), intra-call overlap of exact-matched anchors |
| R1 | read | any re-read whose requested window is fully covered by the session's in-context span union — read results (actual returned lines from result truncation stats; an untruncated whole-file read certifies 1–EOF), edit-result spans (exact-match anchors), whole file after `write` and for images; partial overlap passes; freshness = mtime+size snapshot per certified path — an external on-disk change invalidates coverage (stat, not command-text guessing); also resets on `session_compact`, a failed edit |
| R2 | bash | `cat` / `head` / `tail` / `sed -n` for viewing with no pipe consumer (`tail -f` is a watcher, exempt) — `sed -n` batching 2+ regions (`;` or two `-e`) or substituting (`s/…/…/p` prints matches only) is allowed; segments split only at **unquoted** `\n && ; ||` outside `do … done` bodies (quote-aware since 2026-10-06; loop bodies unsplittable since 2026-10-07 — the read tool cannot loop); the block reason warns that a re-read of in-context lines will hit R1 (cascade fix) |
| R5 | bash | `git log` without `--oneline` / `-n <N>` / `-<N>` short form / cap |
| R6 | bash | `rg -o` without pipe cap (quoted patterns stripped first so a pattern containing `-o` can't false-fire); a stdout redirect to a file counts as capped everywhere (`> /tmp/x` — the bytes never land in context; `2> err` alone does not) |
| R7 | bash | recursive walks: `ls -R`-family flags, `find -exec`/`-execdir` (redirected `ls -R > f` exempt; `find -executable` doesn't false-fire) |
| R8 | bash | `git commit`/`git push` without `--no-verify`, a pipe cap, or `2>&1 \| tail -20` — hooks (lint/test/build) flood context; a cap anywhere in the full command satisfies the check (heredoc messages) |
| R9 | bash | `git commit -m <msg>` header not matching commitlint conventional pattern `type(scope?): subject` (types: feat/fix/docs/style/refactor/perf/test/build/ci/chore/revert; also header ≤ 100 chars, subject not capitalized, no trailing `.`); header rules only — body `-m` flags, `-F`, heredoc skipped; checked before R8 so a bad message never reaches hooks |
| R10 | bash | identical re-run: the **same full command** (fd-merges like `2>&1` stripped, whitespace collapsed — rekeyed 2026-10-07: the old pipe-truncated base collided every command sharing a preamble, `nvm use`/`KEY=$(…)`/heredoc `cat > f`, and taught token-level escapes) re-run ≤10 min after its last successful run with no intervening edit/write — its output is already in context; watchers (`watch`, `tail -f`, `sleep`, `--watch`) anywhere in the command and retries of failed runs exempt; recorded on `tool_result`, cleared on `session_compact` |
| Runner cap | bash | uncapped `npm`/`vitest`/`jest`/`playwright`/`tsc` runners (suggests the filter pipe) |

State (per extension instance): `coverage` (path → merged span union + last kind), `pendingEdits`, `pendingReads` drive R1; `pendingBash` / `lastBashRun` (normalized full command → last-run record) plus a `mutationSeq` counter bumped by every successful edit/write drive R10 — a mutation makes verify re-runs legitimate. A failed edit drops coverage — content may have drifted, so a re-read is legitimate; `session_compact` clears everything. No hydration on session resume — the map starts empty, erring toward allowing. Fuzzy matching mirrors edit-diff.js `normalizeForFuzzyMatch` (NFKC, trailing whitespace, smart quotes/dashes/spaces) so the guard and the tool agree on what "matches". Anchor validation runs before coverage registration, so a blocked edit never enters the map.

**Violation memory** (cross-session): every block appends `{"family","n","ts"}` to `~/.pi/agent/logs/violation-memory.ndjson` (`PGATE_MEMORY` overrides the path; delete the file to reset) — append-only so parallel sessions (gated subagent panes) can't race; counts aggregate at load, with the legacy `violation-memory.json` blob as a frozen read-only base. On the first `before_agent_start` of a session, families with ≥5 all-time blocks (top 3) get a one-line lesson appended to the system prompt inside `<violation-memory>` tags — ~45 tok conditional cost, paid only when a family qualifies. The file holds counts only; lesson text lives in `FAMILY_LESSONS` in the extension source. Measured experiment, not a guaranteed fix: prompt rules alone never prevented first attempts — the `tests/block-recovery-audit.mjs` blocks/1k-calls trend is the judge.

## Conventions (pi)

- **One file per extension**, `export default function (pi: ExtensionAPI)` — per [pi conventions](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md); use a directory + nearby `package.json` only for multi-file implementations with deps.
- **Naming**: kebab-case, function-descriptive. Note this harness's `permission-gate.ts` *blocks unconditionally* — upstream's same-named example *confirms* instead, so the planned commit/push confirmation gate is named `commit-gate.ts`.
- **No npm dependencies in extensions** — Node stdlib + `@earendil-works/pi-coding-agent` only. If a runtime dep is ever needed, the pi-native way is `pi install npm:<pkg>` (declares it in `settings.json` → `packages`, installs under `~/.pi/agent/npm`) — *not* the root `package.json`. The root `package.json` holds repo tooling (husky/commitlint) plus typecheck/test-resolution devDeps (`typescript`, `@types/node`, `@sinclair/typebox`) — nothing pi loads at runtime. The `@earendil-works/pi-coding-agent` + `pi-tui` types resolve via `scripts/link-pi.mjs` symlinks to the global install (`npm run typecheck`).
- **Portability (macOS + Linux)**: paths via `os.homedir()` / `~`; no absolute user paths; no OS-only commands.
- Machine-local, gitignored, auto-regenerated: `bin/` (pi downloads arch-correct binaries), `npm/` (pi-managed installs).

## Verifying changes

- Strict typecheck against the installed package's types (`npx tsc --noEmit --strict` with a `paths` mapping to the global `@earendil-works/pi-coding-agent/dist/index.d.ts` — the global path is machine-specific).
- `permission-gate` fixture test: `node tests/permission-gate.test.mjs` — 43 black-box cases through a stubbed ExtensionAPI (exit 0 = pass; preflight symlinks the global package into the gitignored root `node_modules`).
- `node tests/block-recovery-audit.mjs` — re-measures what the model does after blocks (families, message sizes, one-shot recovery) over logged sessions; exits 1 below 85% recovery on a ≥10-block sample. Run after every permission-gate change.
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
| `session-name.ts` | upstream | Named sessions improve `sessions/**/*.jsonl` audits |
| `notify.ts` | upstream | OSC 777 turn-complete desktop notifications |
| `reload-runtime.ts` | upstream | Hot-reload extensions after editing guards, without restarting |

## Upstream references

- Examples: <https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions>
- Extension docs: <https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md>
- Pi packages (`pi install`): <https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md>
