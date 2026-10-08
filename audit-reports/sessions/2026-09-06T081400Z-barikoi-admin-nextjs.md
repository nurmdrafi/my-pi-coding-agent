# Session Audit — barikoi-admin-nextjs, last session (single-session scope)

sessionsDir: ~/.pi/agent/sessions/--Users-nur-Barikoi-barikoi-admin-nextjs-- · 1 session in scope · window: 2026-09-06 04:53 → 05:50 UTC
Session: `01a07510-9769-76fd-abb9-4b664356aa39` (164 turns, glm-5.2 ×153 / glm-5.3 ×11)

## Totals

- cacheRead 12.0M · cacheWrite 0 · raw input sum 213K (untrusted, streaming placeholders) · peak context 116K · 0 compactions
- findings 13 · waste **~52.4K tokens ≈ $0.07** (at derived $1.40/MTok input) — heuristic floor
- session `usage.cost` not logged → dollars are rate-derived estimates; reasoning tokens and compaction re-sends unpriced
- verify: `node /Users/nur/.pi/agent/skills/session-audit/bin/audit.mjs fetch 01a07510-9769-76fd-abb9-4b664356aa39 --kind user_text --limit 3 --max-bytes 500`
  (note: `bin/audit.mjs` is missing from the installed bundle — see "bundle gap" below; this audit drove `src/` modules directly)

## Findings by rule

| rule | n | tokens | usd | note |
|---|---|---|---|---|
| DUP_TOOL_CALL | 13 | 52.4K | $0.07 | read ×1 (9.8K bytes), edit retries, repeated bash |
| RETRY_STORM | 1 | 1.1K | <$0.01 | 3 errored edits |

No CACHE_TTL_EXPIRY, CACHE_MISS_RATE, CONTEXT_GROWTH, BIG_TOOL_OUTPUT findings. Hit ratio high; growth near-linear. A healthy session.

```text
DUP_TOOL_CALL   ████████████████████████████████████████████  52.4K tok / $0.07
RETRY_STORM     ██                                              1.1K tok / <$0.01
```

```text
DUP       ████████████████████  $0.07
RETRY     █                     $0.01
```

## Focus question: why is `sg` never called?

**Facts**
- 0 of 164 tool calls reference `sg`/ast-grep — not even a failed attempt or a `which sg` probe.
- `sg` **is installed** (`/Users/nur/.nvm/.…/bin/sg`, responds to `--version`).
- The project has **no AGENTS.md**; the sg rule exists only in `~/.pi/agent/AGENTS.md`, phrased conditionally: "if `sg` (ast-grep) is installed, try `sg run` … before keyword guessing".
- The session was a debugging task (marker drag/update bugs in MapView/redux) navigated with 41 `rg` searches, several exactly the wide-keyword shape the rule targets (`rg -n "markerData|update|add|delete" redux/reducers/mapReducer.ts`).
- Models: glm-5.2/5.3 — smaller models follow advisory-style AGENTS.md rules far less reliably.

**Attribution: config (guidance placement + phrasing), not tool availability.** A conditional "if installed, try" instruction in the global file is too weak; nothing verifies availability, and the project-level file (which would carry more weight) doesn't exist.

**Fix (do this first — one edit, permanent):**
1. Add `~/Barikoi/barikoi-admin-nextjs/AGENTS.md` with a firm rule, e.g.:
   `Code search in TSX/TS: use \`sg run -p '<pattern>'\` first (it is installed). Use rg -n only when sg yields nothing or for non-code files.`
2. Optionally reword the global line from "if installed, try" → "sg is installed; structural search goes through sg run before keyword rg".

**Target metric:** next audit of this project — tool inputs matching `sg run` should be > 0 per search-heavy session (e.g. ≥ 5 of ~40 searches); wide-keyword rg over .tsx/.ts files should drop.

## Trend vs 2026-09-05T060421Z.md

Prior day, all-projects: waste 823K / $0.68, dominated by DUP_TOOL_CALL (25 sessions). This session: 52.4K waste, same dominant pattern at much smaller scale — **steady**; duplicate-read/edits remain the recurring leak, cost trivial.

## Stats this report wanted and could not get

- `bin/audit.mjs` (run/views/fetch CLI) missing from the installed session-audit bundle — ran `src/{parser,rules,pricing,discover}.mjs` directly instead; per-finding dollar figures computed from derived rates, not the manifest pipeline.
- Idle-gap (gapKind) breakdown per TTL finding — moot, no TTL findings.

## Audit self-cost (lower bound)

2 content fetches over the session (~1.4KB user_text) + module-driven metadata passes; transcript reasoning turns unlogged. Lower bound: ~2 fetches / <2KB.
