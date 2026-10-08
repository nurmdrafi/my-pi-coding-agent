<!-- handoff | goal: summary implmentation and post feedbacks decision | source: /Users/nur/.pi/agent/sessions/--Users-nur-.pi-agent--/2026-10-07T10-50-40-530Z_01a115fc-a20f-7232-8cfa-7563fca12dcb.jsonl | 2026-10-07T11:58:33.585Z -->

## Context

We maintain `~/.pi/agent/`, a pi coding-agent harness with a tool-call permission gate (`extensions/permission-gate.ts`). Work completed in the previous thread:

**Phase 1 — Post-Block Impact Audit** (report: `audit-reports/harness/2026-10-07T110500Z-block-impact-permission-gate.md`, Feedbacks.md taxonomy): 139 blocks classified from watermark-scoped sessions. Findings: R10 (Re-run) withdraw-or-narrow (compliance 0.06, mean net −1.83 — prefix-collision false positives, token-level evasion escapes); R2 (Reading) evasion lane (`head`/`awk` free), s///p false positives, loop-body splits; runner caps mis-flag `> file` redirects; R5 misses `git log -<N>`; R2→R1 cascade thrash. Healthy: R6/R7/R9; kept: AG/R1/R8.

**Phase 2 — Research**: Claude Code PreToolUse deny+reason pattern; Hermes-agent #18076 (identical name+args dedup keying); arXiv 2603.05344 (mtime staleness — our R1 already matches).

**Phase 3 — Implementation** (all verified: 63/63 tests, tsc clean, 98% recovery gate, portability clean):
1. R10 rekeyed to **full-command identity** (`2>&1`-class stripped, whitespace collapsed); `firstUnquotedPipeOrRedirect` deleted
2. R2: `sed s///p` exempt; `do…done` bodies unsplittable; standalone `head`/`tail` viewers blocked (`tail -f` exempt); reason now warns about R1 cascade
3. `isCapped` counts stdout redirects to files (`2> err` alone doesn't)
4. R5 accepts `git log -<N>` short form
5. Fixture bug caught: `\2` backreference with one capture group (octal escape) → fixed to `\1`

Docs updated (`extensions/README.md` rows R2/R5/R6/R10; `CHANGELOG.md` [1.23.0] Changed with `Measured:` line). Watermark is now `2026-10-07T10:50:40Z`.

## Task

Run a **post-implementation feedbacks pass** — a fresh Post-Block Impact Analysis on sessions created *after* the gate changes landed (filename-ts ≥ 2026-10-07T11:00Z, the fresh sessions running the new gate), and decide from the evidence whether each change held up:

1. Reuse/adapt the classifier in `tmp/block-impact/{extract,classify}.py` (extractor joins blocks to originating toolCall + next call via toolCallId; block prefixes: `Anchor Guard` / `Token Economy (…)` / `Commitlint`; scope strictly by filename timestamp, not mtime)
2. For each changed rule, compare against the baseline in the 2026-10-07 report: R10 compliance/loop/evasion rates, R2 evasion rate, redirect-cap false positives, `git log -1` blocks, cascade thrash. Small n is expected — say so per the Feedbacks.md low-confidence rule
3. Check for **new regressions** the changes may have introduced (e.g., loop-depth splitting quirks, over-broad head/tail blocking, full-command keying misses on identical re-polls)
4. Write the follow-up report to `audit-reports/harness/` (provenance header, per-block table, deltas vs baseline), advance `audit-reports/.watermark.json` to the newest session covered, prune sessions >30 days, add a CHANGELOG entry with a `Measured:` line
5. Deliver a **verdict per change**: held up / needs adjustment / revert, with block-level evidence. Audit-mode discipline: modify only the report, watermark, prune, and CHANGELOG unless a fix is clearly requested

## Files
- `extensions/permission-gate.ts` — the gate (changed)
- `tests/permission-gate.test.mjs` — 63 fixtures (9 new)
- `audit-reports/harness/2026-10-07T110500Z-block-impact-permission-gate.md` — baseline report
- `tmp/block-impact/{extract,classify,report}.py` — classifier tooling; `/tmp/block-impact/*.ndjson` — baseline labeled data
- `Feedbacks.md` — the audit prompt/taxonomy
- `extensions/README.md`, `CHANGELOG.md` — docs already synced
