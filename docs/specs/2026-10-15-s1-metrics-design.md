# S1 — Session Metrics Extraction: Design Spec

> Path note (2026-10-16): `native/` was later renamed to `custom-tools/`. Read `native/X` below as `custom-tools/X`.

Status: **spec'd** (awaiting implementation plan)
Created: 2026-10-15
Parent: `docs/specs/MASTER.md` §3 (S1). Feedback basis: MASTER §1.2 P0, §1.4C metric table.
Decisions locked with user: task = session (v1); per-session emitter only (aggregation is S2); standalone script inside `skills/session-audit/scripts/` with no audit-flow changes; approach = Node module over pidx extracts (no Rust changes).

## 1. Problem

The feedback's P0 is to measure real per-task cost before optimizing. Existing infrastructure stops short:

- `native/pidx` extracts timestamps, calls, results, and usage into session extracts — but nothing computes latency, repeat rates, or per-task aggregates from them.
- `skills/session-audit` is waste-scoped: it finds problems (DUP_TOOL_CALL, RETRY_STORM, …), not neutral per-task efficiency metrics.
- `benchmark/BENCHMARK_REPORT.md` was a one-time external run; S2 will be the repeatable, repo-owned suite and needs a machine-readable per-run metrics emitter as its measurement primitive.

S1 delivers that primitive. Primary consumer: S2 benchmark comparisons (baseline vs candidate arms). Secondary future consumers: S5 (edit-failure impact), S6/S7 (before/after evaluation).

## 2. Scope

**In scope:** one pure-compute Node module + thin CLI that emits a versioned metrics JSON for one session (by id or file path), computed from the same data pidx/parser already extract.

**Out of scope (non-goals):**
- Cross-run aggregation, medians, arm comparison — S2 owns these.
- Task success rate — requires task ground truth, which only S2 has.
- In-session task segmentation — v1 treats a session as one task; the normalization seam (§5.1) is where a task-window filter slots in later.
- Audit skill integration (views/report/SKILL.md phases) — possible follow-up, not S1.
- Any change to pidx, its store, its extract schema, or `rules.mjs` semantics.

## 3. Approach (of three considered)

**Chosen — Node metrics module over pidx extracts.** The extract already carries every field needed (verified empirically: 100% of assistant and toolResult messages carry timestamps across a 25-session random sample). Latency is an id-join plus subtraction; all other metrics are existing parser/rules primitives recombined. Metric definitions will iterate once S2 starts comparing; JS iteration avoids churning the Rust extract/store contract, and keeps the Rust↔Node parity symmetry intact (both paths consume identical extract-shaped input, so both yield identical metrics).

Rejected: `pidx metrics` Rust subcommand (parity burden — metrics mirrored in Node fallback or the fast/fallback paths diverge; store/schema churn per definition tweak; violates the extraction-vs-observability separation of MASTER §1.4B; contradicts §1.3 "Rust only where profiling shows overhead" — per-session compute is milliseconds). Rejected: folding metrics into audit.mjs `run` (couples S2 to the AUDIT_WORKDIR full-directory digest; contradicts the locked decision of a standalone emitter).

## 4. Metric definitions

All timestamps normalized to epoch ms via `parser.mjs tsMs`. All dedup semantics inherit parser.mjs/pidx parity: turns deduped by responseId (last wins, ts-sorted), calls/results deduped by id.

| Metric | Definition |
| --- | --- |
| `durationMs` | last event ts − first event ts over the union of turn, call, result, and user-entry timestamps; null if fewer than two events have ts |
| `apiTurns` | count of rid-deduped assistant turns carrying usage |
| `tokens.input/output/cacheRead/cacheWrite` | sums over rid-deduped turns |
| `tokens.peakContext` | max over turns of `input + cacheRead + cacheWrite` |
| `cacheHitRatio` | `cacheRead / (cacheRead + cacheWrite)`; **0** when denominator is 0 (audit.mjs parity) |
| `costUsd` | Σ `usage.cost.total` over rid-deduped turns; **null** when no turn carries cost |
| `batch` | per-turn call-count distribution — same semantics as audit.mjs `batchingFromCalls`, reimplemented locally (audit.mjs is not modified): `turnsWithCalls, calls, one, two, multi` |
| `tools.<name>.calls/errors/errorRate/resultBytes` | per-tool counts; errors and bytes joined by call id → result |
| `tools.<name>.latencyMs` | see §4.1 |
| `reads.calls/repeats/repeatRate` | see §4.2 |
| `edits.attempts/failures/failureRate/failedThenSucceeded/failedTerminal` | see §4.3 |
| `compactions` | compaction event count |
| `skills` | map name → load count |
| `partial` | true iff last event ts is within 5 minutes of generation time — guards S2 against measuring a still-running session |
| `valid` | false iff zero turns and zero calls → all aggregates null, degenerate not error |
| `unmatchedCalls` | calls with no matching result (e.g. session cut mid-call) |

### 4.1 Tool latency

Per matched (call, result) pair joined by id: `delta = result.ts − call.ts` (ms). Sample kept iff both timestamps present, finite, and `delta ≥ 0`; dropped samples increment `latencyMs.invalid` (never silently discarded). Percentiles are **nearest-rank** on the sorted kept samples: index `ceil(p/100 · n) − 1`, clamped to `[0, n−1]` — deterministic, no interpolation; for n = 1, p50 = p95 = max. Reported: `{n, p50, p95, max, invalid}` per tool.

Known approximation, accepted: batched calls in one assistant message share the assistant timestamp; each pair still measures wall time until *that* call's own result. Documented, not corrected.

### 4.2 Repeated-read rate

Reuses `rules.mjs dupToolCall` verbatim: `repeats = Σ (count − 1)` over its read findings; `repeatRate = repeats / reads.calls`. This inherits the audited generation-aware semantics — a write/edit to the path, or a bash command mentioning it, resets the group; reads of *different* windows (offset/limit) are not repeats (the 2026-10-10 false-positive fix). Metrics imports and calls the rule; it does not reimplement it.

### 4.3 Edit failure and retry structure

- `attempts` = edit calls; `failures` = matched results with `isError: true`; `failureRate = failures / attempts` — **null** when attempts = 0.
- `failedThenSucceeded` = count of edit paramHash groups containing an errored result followed by a later non-error result (recoverable failures — the number S5 wants to drive down without losing the eventual success).
- `failedTerminal` = count of edit paramHash groups where every result errored.

Write/read/bash failures remain visible through the per-tool `errorRate`; the dedicated block is edit-only, per the gap analysis.

Known nuance, inherited and left as-is: `dupToolCall` bumps a path's read-generation on every write/edit *including failed ones* (file unchanged), so a read after a failed edit escapes dup flagging. Conservative (under-reports repeats), harmless for S1's purpose; changing `rules.mjs` semantics is out of scope.

## 5. Interface

### 5.1 Module — `skills/session-audit/scripts/metrics.mjs`

```
computeMetrics(session, nowMs?) → metrics object  // pure; no I/O; nowMs defaults to Date.now()
                                             // (injected so tests can pin `partial`)
sessionFromExtract(extractJson) → session      // pidx extract v1 line → normalized shape
sessionFromPath(path) → session                // raw jsonl via parser.mjs (computes ph per call)
```

The normalized shape is exactly the one audit.mjs builds from pidx output (parser-style field names, precomputed hashes) — so `rules.mjs` functions import and run against it unmodified:

- `turns`: `{requestId, timestamp, model, usage}` (rid-deduped, ts-sorted)
- `calls`: `{id, name, timestamp, rid, ph, path, cmd}`
- `results`: `{toolUseId, isError, bytes, timestamp}`
- plus `{sessionId, project, compactions, uts (ms numbers), skills (name → uses)}`

`sessionFromPath` produces the same shape from a raw file via parser.mjs (`apiTurns`/`toolCalls`/`toolResults`/`compactionCount`/`loadedSkillName`), computing `ph` per call through the identical `paramHash` normalizers. This builder layer is the reserved seam for a future task-window filter (filter events by ts at this boundary) — not shipped in v1.

### 5.2 CLI

```
node skills/session-audit/scripts/metrics.mjs <session-id | path> [--sessions-dir DIR] [--pretty]
```

- Input: a session id (resolved via `discover.mjs findSession`) or a direct `.jsonl` path — the CLI always reads raw files through `sessionFromPath`. Extract ingestion is module-level only (parity tests, future S2 piping of pidx output).
- `--sessions-dir`: default `PI_SESSIONS_DIR`, else `~/.pi/agent/sessions` (same resolution as pidx/discover.mjs).
- Output: compact single-line JSON on stdout (S2 pipes to jq); `--pretty` for humans.
- Exit codes: 0 on success (including `valid: false` degenerate); 1 on not-found, unreadable file, or extract `v !== 1` — with one JSON error object `{error, sessionId?}` on stderr.

## 6. Error handling summary

| Condition | Behavior |
| --- | --- |
| Session id/path not found | exit 1, `{error}` JSON on stderr |
| Unreadable file | exit 1, `{error}` JSON on stderr |
| Malformed JSONL lines | tolerated (parser.mjs skips) — inherited |
| Zero turns + zero calls | exit 0, `valid: false`, aggregates null |
| Extract with `v !== 1` | `sessionFromExtract` throws (CLI never ingests extracts directly) |
| Missing/negative latency ts | sample → `invalid` counter |

## 7. Output schema (contract for S2)

```json
{
  "schema": "s1-metrics/1",
  "sessionId": "…", "project": "…", "generatedAt": "…ISO…",
  "valid": true, "partial": false,
  "durationMs": 123456,
  "apiTurns": 42,
  "tokens": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0, "peakContext": 0 },
  "cacheHitRatio": 0.97,
  "costUsd": 0.42,
  "batch": { "turnsWithCalls": 10, "calls": 17, "one": 5, "two": 3, "multi": 2 },
  "compactions": 0,
  "skills": { "session-audit": 1 },
  "tools": {
    "read": { "calls": 12, "errors": 0, "errorRate": 0, "resultBytes": 90000,
              "latencyMs": { "n": 12, "p50": 3, "p95": 40, "max": 90, "invalid": 0 } }
  },
  "reads": { "calls": 12, "repeats": 2, "repeatRate": 0.16666666666666666 },
  "edits": { "attempts": 5, "failures": 1, "failureRate": 0.2, "failedThenSucceeded": 1, "failedTerminal": 0 },
  "unmatchedCalls": 0
}
```

Every field is present in every emission (null when not computable) — S2 never branches on key presence. Rates are unrounded doubles; the zero-denominator convention is per §4 (`cacheHitRatio` → 0 for audit parity, other rates → null). `schema` versions the contract; S2 pins the version it reads.

## 8. Testing

`tests/session-metrics.test.mjs` (node:test), fixtures under `tests/fixtures/session-metrics/`:

- **Latency**: batched calls sharing assistant ts; negative delta → invalid; missing ts → invalid; unmatched call; n=1 percentile; nearest-rank exactness on a fixed sample.
- **Repeat reads**: true re-read flagged; continuation windows (offset 1–200 then 201–266) not flagged; write between reads resets; bash mentioning path resets.
- **Edits**: failure-rate math; failedThenSucceeded vs failedTerminal classification.
- **Usage**: rid-dedupe last-wins; cacheHitRatio (incl. zero denominator); costUsd null without cost fields.
- **Parity gate**: golden fixture jsonl → metrics via parser path and via a hand-written equivalent extract must deep-equal. Pins both producers to identical output — same discipline as pidx's parity gate.
- **Degenerate**: empty session → `valid: false`, nulls. `partial` flag near-now timestamps.

Verification at implementation end: targeted test file + tsc/lint on changed files only; one manual smoke run against a real recent session (eyeball, not asserted).

## 9. Risks / notes

- Timestamps are message-level and ISO-string-based; clock skew across message types could produce negative deltas — handled as invalid samples, counted.
- `costUsd` depends on `usage.cost` presence (model/provider dependent); null when absent — S2 must treat null as unpriced, not zero.
- Repeat/read semantics are only as good as `dupToolCall`'s; S1 deliberately rides the audited implementation rather than forking it.

## 10. Acceptance criteria

1. CLI emits `s1-metrics/1` JSON for any session id or path in the sessions dir; error paths exit 1 with JSON on stderr.
2. All §4 metrics present with the exact definitions above; no silent drops (invalid/unmatched counters).
3. Parity test (parser path ≡ extract path) passes on the golden fixture.
4. All tests in §8 green; no changes to pidx, parser.mjs, rules.mjs, audit.mjs, SKILL.md.
