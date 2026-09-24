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

| Extension | Role | Hooks |
|---|---|---|
| `permission-gate.ts` | Blocks rule-violating tool calls before execution, with corrective rule text | `tool_call`, `tool_result` |
| `error-telemetry.ts` | Captures runtime errors to daily machine-local JSONL; `/errors [n]` reviews the tail | `tool_result`, `tool_execution_end`, `after_provider_response`, `session_compact_failed` |

## `permission-gate.ts` — rule catalog

Single `tool_call` interceptor; one handler, deterministic order (edit → read → write → bash). Every block carries a rule-family prefix (`Anchor Guard:`, `Token Economy (…)`) so transcripts and logs stay greppable and the model gets precise corrective text.

| Rule | Scope | Blocks |
|---|---|---|
| `Anchor Guard:` | edit | `oldText` not found (exact + fuzzy normalization), non-unique anchor (reports line numbers), intra-call overlap of exact-matched anchors |
| R1 | read | full re-read of a file whose edit result is ≤ 6 tool calls old; windowed reads (`offset`/`limit`) pass |
| R2 | bash | `cat` / `sed -n` for viewing with no pipe consumer — `sed -n` batching 2+ regions (`;` or two `-e`) is allowed |
| R5 | bash | `git log` without `--oneline` / `-n <N>` / pipe cap |
| R6 | bash | `rg -o` without pipe cap (quoted patterns stripped first so a pattern containing `-o` can't false-fire) |
| R7 | bash | recursive walks: `ls -R`-family flags, `find -exec`/`-execdir` (redirected `ls -R > f` exempt; `find -executable` doesn't false-fire) |
| Runner cap | bash | uncapped `npm`/`vitest`/`jest`/`playwright`/`tsc` runners (suggests the filter pipe) |

State (per session): `pendingEdits` (toolCallId → path, awaiting result) and `lastInContext` (path → call seq) drive R1 freshness; a failed edit drops freshness — content may have drifted, so a re-read is legitimate. Fuzzy matching mirrors edit-diff.js `normalizeForFuzzyMatch` (NFKC, trailing whitespace, smart quotes/dashes/spaces) so the guard and the tool agree on what "matches". Anchor validation runs before freshness registration, so a blocked edit never enters the map.

## `error-telemetry.ts` — what gets captured

| Kind | Source event | Examples |
|---|---|---|
| `tool` | `tool_result` `isError` | bash exit ≠ 0, edit anchor misses, fs errors |
| `blocked` | `tool_execution_end` `isError` | guard blocks and unknown tools (never reach `tool_result`) |
| `provider` | `after_provider_response` ≥ 400 | rate limits, auth, 5xx (retry-after recorded) |
| `compaction` | `session_compact_failed` (non-abort) | compaction failures |

- **Storage**: `logs/errors-<YYYY-MM-DD>.jsonl` — machine-local, gitignored; fields capped at 2 KB (full output lives in the session transcript); writes never break the agent loop.
- **Dedupe**: `tool_result` vs `tool_execution_end` double-reporting filtered by toolCallId (256-id ring buffer).
- **Review**: `/errors [n]` (default 10, max 100) — newest-first tail across days.
- **Batch mining**: `skills/harness-engineer/scripts/error_audit.py` (default scans session transcripts; `--live` reads these daily files).
- **Why it exists**: the sensor of the measure → guard → verify loop. Every rule above was ranked into existence by an error audit (2026-09-16, 09-23, 09-24); post-guard error counts verify the guards actually work. Deleting it is safe for enforcement (rules live in `permission-gate`) but blinds the audit loop.

## Conventions (pi)

- **One file per extension**, `export default function (pi: ExtensionAPI)` — per [pi conventions](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md); use a directory + nearby `package.json` only for multi-file implementations with deps.
- **Naming**: kebab-case, function-descriptive. Note this harness's `permission-gate.ts` *blocks unconditionally* — upstream's same-named example *confirms* instead, so the planned commit/push confirmation gate is named `commit-gate.ts`. `error-telemetry.ts` names the observer role.
- **No npm dependencies** — Node stdlib + `@earendil-works/pi-coding-agent` only. If a dep is ever needed, the pi-native way is `pi install npm:<pkg>` (declares it in `settings.json` → `packages`, installs under `~/.pi/agent/npm`) — *not* the root `package.json`, which holds repo tooling (husky/commitlint) only.
- **Portability (macOS + Linux)**: paths via `os.homedir()` / `~`; no absolute user paths; no OS-only commands.
- Machine-local, gitignored, auto-regenerated: `bin/` (pi downloads arch-correct binaries), `npm/` (pi-managed installs), `logs/`.

## Verifying changes

- Strict typecheck against the installed package's types (`npx tsc --noEmit --strict` with a `paths` mapping to the global `@earendil-works/pi-coding-agent/dist/index.d.ts` — the global path is machine-specific).
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
