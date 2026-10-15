# S1 — Implementation Plan

Spec: `docs/specs/2026-10-15-s1-metrics-design.md` (approved 2026-10-15). This plan follows it exactly; deviations must be stated in the final report.

Conventions: TDD (red → green per step), surgical scope, verify after each step with the narrowest check. No changes to pidx, parser.mjs, rules.mjs, audit.mjs, views.mjs, SKILL.md.

Deliverables:
- `skills/session-audit/scripts/metrics.mjs` — module + CLI (spec §5)
- `tests/session-metrics.test.mjs` — standalone executable test (repo pattern: runnable via `node --test <file>` and directly; non-zero exit on failure)
- `tests/fixtures/session-metrics/` — golden fixture jsonl + hand-written equivalent extract + tiny edge fixtures

## Step 0 — Docs commit (deferred from planning)

Commit spec + this plan + MASTER.md §3 update: `docs(specs): s1 session-metrics design spec and plan`.

## Step 1 — Fixtures (test data first)

Create `tests/fixtures/session-metrics/golden.jsonl` covering, in one session:
- batched assistant turn (2 calls sharing one ts) with separate results at distinct ts
- one result ts < call ts (negative delta → invalid sample)
- one result missing timestamp
- one call with no result (unmatchedCalls)
- true re-read (same path+offset+limit, no mutation between)
- continuation read (same path, disjoint offset window — must NOT count as repeat)
- read after a write to that path (generation reset)
- read after a bash command mentioning the path (generation reset)
- edit group: error then success (failedThenSucceeded)
- edit group: all errors, distinct ph (failedTerminal)
- one rid appearing twice with different usage (dedupe last-wins)
- usage with `cost.total` on some turns only
- one compaction line, one `<skill name=…>` user line, one user entry ts

Plus: `golden.extract.json` — hand-written pidx-extract-v1 equivalent of the same session (parity input); `empty.jsonl` — zero turns/calls.

**Verify:** fixture loads as JSON lines; `jq` sanity of golden.extract.json field names against extract schema.

## Step 2 — Test skeleton + shape tests (red)

Test file with: import of `metrics.mjs` (fails — module absent), `sessionFromPath(golden.jsonl)` returns normalized shape per spec §5.1 (field names: `requestId/timestamp/model/usage`, `id/name/timestamp/rid/ph/path/cmd`, `toolUseId/isError/bytes/timestamp`, `uts`, `skills`), `sessionFromExtract(golden.extract.json)` same shape.

**Verify:** `node --test tests/session-metrics.test.mjs` → fails on import.

## Step 3 — Builders (green)

Implement `sessionFromPath` (compose parser.mjs: `parseSessionFile`/`apiTurns`/`toolCalls`/`toolResults`/`compactionCount`/`loadedSkillName`, compute `ph` via `paramHash`) and `sessionFromExtract` (audit.mjs fast-path mapping incl. `gapEvents`-free fields + `uts`). `computeMetrics` stub returning null metrics object.

**Verify:** Step 2 tests green.

## Step 4 — Latency (red → green)

Tests: per-call deltas on golden fixture; batching approximation (shared ts); negative delta → `invalid`; missing ts → `invalid`; unmatched call not a sample; nearest-rank p50/p95/max on fixed arrays (incl. n=1 → all equal). Implement per-tool aggregation + nearest-rank percentiles.

## Step 5 — Repeat reads (red → green)

Tests: repeats = 1 on golden (the true re-read); continuation not counted; write reset; bash-mention reset; `repeatRate` = repeats/calls; zero reads → null. Implement by importing `dupToolCall` from rules.mjs and summing `(count−1)` over read findings.

## Step 6 — Edit block (red → green)

Tests: attempts/failures/failureRate; failedThenSucceeded = 1, failedTerminal = 1 on golden; zero attempts → null rate. Implement ph-group classification.

## Step 7 — Core aggregates (red → green)

Tests: apiTurns count, rid-dedupe last-wins on token sums, peakContext, cacheHitRatio (zero denominator → 0), costUsd (null when absent, sum when present), batch distribution, durationMs (union incl. uts), compactions, skills, `valid:false` + nulls on empty.jsonl, `partial` true/false with injected `nowMs`. Implement `computeMetrics(session, nowMs?)`.

## Step 8 — Parity gate (red → green)

Test: `computeMetrics(sessionFromPath(golden.jsonl))` deep-equals `computeMetrics(sessionFromExtract(golden.extract.json))`. Fix mapping divergences until equal.

**Verify:** full test file green.

## Step 9 — CLI (red → green)

Tests (spawn real process): path arg → exit 0, valid JSON on stdout, every §7 schema key present; `--pretty`; session id resolution via `--sessions-dir` pointing at a fixture dir; not-found → exit 1 + `{error}` JSON on stderr; empty session → exit 0 + `valid:false`. Implement arg parsing (match audit.mjs `parseArgs` style), `discover.mjs findSession`, stdout/stderr contracts, exit codes.

**Verify:** full test file green; targeted lint/tsc if wired for .mjs (else state why skipped — repo has no lint script for skills/).

## Step 10 — Final verification + smoke + report

- `node --test tests/session-metrics.test.mjs` full run (show summary).
- Smoke: `node skills/session-audit/scripts/metrics.mjs <recent-real-session-id> --pretty` — eyeball against spec §7; no assertion.
- Commit implementation: `feat(metrics): s1 per-session metrics module and cli`.
- Update MASTER.md §3 S1 → `done` + §7 outcome line.
