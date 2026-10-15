# Harness-Improvement Master Index

Status: **master file** — stable path `docs/specs/MASTER.md`; referenced by every sub-project session.
Created: 2026-10-15
Source: design-level review at `native/pidx/Feedback.md` (repo `nurmdrafi/my-pi-coding-agent`) — all its details are folded in below, so this master is self-contained.
Decomposition approved; each sub-project gets its own spec → plan → implementation cycle in a dedicated session.

## Purpose

The feedback review spans multiple independent workstreams. Rather than one large spec, each workstream is a separate sub-project (S1–S7) with its own spec. This master file is the single source of truth for the full feedback content, scope, dependencies, build order, and status. New sessions read this file first, then the linked spec if one exists. Specs for sub-projects live beside it as `docs/specs/YYYY-MM-DD-<s-topic>-design.md`.

## 1. Feedback digest (complete)

### 1.1 Review scores (preliminary — README-based, not benchmarked)

| Dimension                | Score  |
| ------------------------ | ------ |
| Architecture and design  | 8.5/10 |
| Token efficiency         | 8/10   |
| Execution efficiency     | 7/10   |
| Security and recovery    | 7.5/10 |

Overall: architecture well thought out; biggest opportunity is reliability + efficiency of tool execution, not more agent features. The harness already addresses persistent prompt bloat, progressive skill loading, destructive-command protection, edit validation, bounded command output, optional subagents.

### 1.2 Findings and recommendations (mapped to sub-projects)

**P0 — Measure real tool-call cost** → S1, S2
The ~0.5K-token permanent prefix is only one cost component; tool definitions, repeated file reads, command results, retries, and generated patches can dominate real sessions. Measure actual model input/output tokens, tool-call count, wall-clock latency, retry rate, cache usage per completed task. Optimize the largest contributor, not the prefix.

**P1 — Improve tool execution, not just tool-call restrictions** → S1, S5, S6
Permission gate already caps output, blocks re-reads, validates edit anchors, blocks duplicate execution. Next step: inspect underlying `read`/`bash`/`edit`/`write` implementations; if the agent often shells out to inspect/parse/edit, better native tools reduce subprocess overhead and model turns. Prioritize structured, bounded outputs and fewer round trips. Rust is worthwhile only if profiling shows meaningful local execution overhead.

**P1 — Edit validation resistant to stale/ambiguous context** → S5
Reading a region once does not prove it is unchanged at edit time. Validate current file contents at execution time, reject ambiguous multi-match replacements, consider file-version or content-hash checks for stale reads. Preserve existing permission checks for destructive actions.

**P1 — Reconsider making all skills manual** → S7
All 22 skills manual minimizes auto-loading but shifts discovery/selection to the model — it can miss a skill or burn turns deciding. Keep expensive specialized skills manual; test lightweight task→skill routing for a few high-value workflows (debugging, frontend implementation, pre-push review). Compare routing token cost against missed-skill/repeated-attempt cost before enabling globally.

**P1 — Verify fail-closed behavior** → S4
Test command parsing, shell chaining, redirections, environment-variable expansion, symlinks, time-of-check/time-of-use races, and missing/failed confirmation handlers. A security gate must not silently allow an operation because it cannot classify it.

### 1.3 Should tools be rewritten in Rust? (per-tool verdicts)

Do not rewrite everything immediately. Build a benchmark first (S1+S2), then one Rust tool — most likely `read` — and compare.

| Tool              | Recommended approach           | Why                                                                                                    |
| ----------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `read`            | Optimize first                 | Bounded reads, line ranges, binary/image detection, concise output reduce I/O and tokens.               |
| `edit`            | Optimize correctness first     | Exact matching, ambiguity rejection, stale-file checks matter more than raw speed.                      |
| `write`           | Keep simple                    | Atomic writes + clear error handling matter more; creation is cheap.                                    |
| `bash`            | Keep the shell as executor     | Compatibility, environment behavior, streaming outweigh startup cost.                                  |
| Search/list tools | Use existing native utilities  | `rg`, `fd` are already optimized.                                                                       |

A Rust helper makes sense for a single compiled executable with predictable startup, low memory, structured output — but it does not automatically reduce inference latency or token usage.

### 1.4 Architecture issues worth fixing

**A. Documentation inconsistencies** → S3
README says 22 manual skills vs. "all 20 manual" in the token-budget section; "zero environment variables" vs. documented optional `PI_SUBAGENTS=1`. Add a doc-validation check verifying skill counts, extension inventories, and stated requirements against the repository.

**B. Separate policy from optimization** → cross-cutting principle (applies to S4/S5 and any permission-gate work)
Keep distinct: policy (authorization, destructive confirmation, commit rules), correctness (edit validation, path safety, atomic writes), efficiency (output limits, redundant-read detection, batching), observability (latency, token cost, errors, blocked operations). Test each independently; performance work must not weaken safety checks.

**C. Make measurements reproducible** → S1, S2
Extend before/after measurement practice into a repeatable benchmark suite. Track:

| Metric                       | What it tells you                                  |
| ---------------------------- | -------------------------------------------------- |
| Tool p50/p95 latency         | Typical and worst-case local execution time        |
| Model calls per task         | Whether the harness reduces reasoning round trips  |
| Input/output tokens per task | Actual context and generation cost                 |
| Repeated-read rate           | Whether read optimization is working               |
| Edit failure/retry rate      | Whether tools improve or disrupt execution         |
| Task success rate            | Whether speed improvements preserve correctness    |
| Cache-hit rate               | Whether changes disrupt prompt caching             |

Identical tasks, models, repository states, settings for baseline and candidate. Report medians over repeated runs, not single runs.

### 1.5 Review's implementation roadmap (mapped)

| Phase | Content                                              | Maps to |
| ----- | ---------------------------------------------------- | ------- |
| 1     | Establish baseline: instrument tools, calls, tokens, retries, outcomes; pick representative tasks (bug fix, multi-file refactor, feature, test repair) | S1, S2  |
| 2     | Improve existing tools: bounded reads, duplicate-read prevention, precise edits, output truncation, structured errors; prefer changes that remove entire model turns | S5 (+S1) |
| 3     | Prototype Rust selectively: one tool behind a compatible interface; compare time, memory, correctness, output tokens, install complexity | S6      |
| 4     | Optimize orchestration: skill discovery, tool batching, subagent delegation, verification loops; subagents stay opt-in unless benefit demonstrated | S7      |

### 1.6 Source-inspection checklist (for deeper review during each sub-project)

1. `extensions/permission-gate/` — interception behavior, command classification, bypass resistance, failure handling (S4).
2. `extensions/subagents/` — delegation overhead, concurrency, context transfer, failure recovery (S7).
3. `tools/` — Rust implementation, serialization costs, actual benefit of the native helper (S6).
4. `skills/session-audit/` — whether token/cost estimates match real session data (S1).
5. `scripts/bootstrap.sh` + `scripts/after-pull.sh` — install reliability, update behavior, supply-chain risk (any time).
6. `tests/` + `npm run gate:eval` — adversarial coverage and real coding-task outcomes (S4).

### 1.7 Final recommendation (verbatim intent)

Do not start with a full Rust rewrite. First establish which part of the harness is expensive, then optimize that part while preserving safeguards. Next major improvement: a benchmark-driven tool layer that minimizes redundant model interactions, returns compact useful results, and enforces correctness at execution time. Rust is an implementation strategy for selected operations — not the objective. A faster local tool is not necessarily a faster coding agent; the goal is the same task in less wall-clock time and lower token cost without reducing correctness or security.

## 2. Current state (verified 2026-10-15)

Do not re-explore from scratch — this is what already exists:

- `native/pidx/` — Rust session-log indexer (turns, tool calls + param hashes, results, compactions, skill loads; incremental via size+mtime cache). Feeds session-audit's L0 fast path. Built and released (`bin/pidx`).
- `skills/session-audit/` — layered audit engine. L0/L1 deterministic rules already cover: `CACHE_TTL_EXPIRY`, `DUP_TOOL_CALL`, `BIG_TOOL_OUTPUT`, `RETRY_STORM`, `CACHE_MISS_RATE`, `CONTEXT_GROWTH`; plus token/cost math anchored on cacheRead/cacheWrite, dedup by responseId, per-tool/per-project rollups, pricing from logged usage.
- `benchmark/BENCHMARK_REPORT.md` — one-time 4-arm comparison (arms: none, permission-gate, sol-pi, piagent-platform) run via an **external** harness. Not a repo-owned repeatable suite.
- README doc inconsistencies flagged in feedback are partially fixed (commit `844a65e`); S3 makes the check automated.

S1 gap analysis vs. existing L0/L1: tool latency percentiles (timestamps exist in pidx but unsurfaced), edit-specific failure rate, repeated-read as normalized rate, and per-task framing (audit is session/waste-scoped) are the missing pieces.

## 3. Sub-projects

| ID  | Name                          | Scope (one sentence)                                                                       | Deps     | Status | Spec |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------ | -------- | ------ | ---- |
| S1  | Session metrics extraction    | Extend pidx/session-audit with per-task metrics: tool p50/p95 latency, edit-failure rate, repeated-read rate, model calls per task | —        | done | [2026-10-15-s1-metrics-design.md](2026-10-15-s1-metrics-design.md) |
| S2  | Benchmark task suite          | Versioned, repo-owned task sets + repeatable runs; consumes S1 metrics for comparisons       | S1       | done | [2026-10-15-s2-benchmark-design.md](2026-10-15-s2-benchmark-design.md) |
| S3  | Doc-consistency validator     | Automated check: skill counts, extension inventory, env-var claims vs. reality              | —        | planned | —    |
| S4  | Fail-closed security tests    | Adversarial suite for permission-gate: shell chaining, redirects, env expansion, symlinks, TOCTOU, missing handlers | —        | planned | —    |
| S5  | Edit-validation hardening     | Execution-time content checks, stale-read rejection, ambiguous multi-match rejection         | — (S1 metrics prove impact) | planned | —    |
| S6  | Rust native tool prototype    | One tool (likely `read`) behind the existing interface, benchmarked vs. current              | S1, S2   | planned | —    |
| S7  | Orchestration tuning          | Evaluate skill routing, tool batching, subagent delegation against baseline                  | S1, S2   | planned | —    |

Cross-cutting principle (from feedback §1.4B): any sub-project touching permission-gate keeps policy / correctness / efficiency / observability separated and independently testable.

## 4. Build order

1. **S1** first — the P0 from the feedback; unblocks S2, S6, S7 (all evaluated through its metrics).
2. **S3, S4** any time — fully independent quick wins; S4 especially is safety-critical.
3. **S5** after S1 ideally, so impact is measurable, but can proceed independently.
4. **S2** once S1 lands — establishes the baseline every later phase compares against.
5. **S6** after S2 exists to judge it.
6. **S7** last — needs the S2 baseline to avoid optimizing blind.

Priority within the feedback: measure before optimizing (§1.7).

## 5. Session openers

Paste per topic (each starts from the master, no re-exploration needed):

- **S1**: `Read docs/specs/MASTER.md. Brainstorm S1 (session metrics extraction).` Seed question: extend pidx/session-audit vs. new `pidx metrics` subcommand — primary consumer is S2 benchmark comparisons.
- **S2**: same prefix, `Brainstorm S2 (benchmark task suite).` Seed question: which task classes first (bug fix, refactor, feature, test-repair) and where tasks live in-repo.
- **S3**: same prefix, `Brainstorm S3 (doc-consistency validator).` Seed question: what CI/check entrypoint runs it and what it verifies (skill counts, extension inventory, env-var claims).
- **S4**: same prefix, `Brainstorm S4 (fail-closed security tests).` Seed question: pure unit fixtures vs. live-shell adversarial cases for permission-gate.
- **S5**: same prefix, `Brainstorm S5 (edit-validation hardening).` Seed question: content-hash vs. version-counter for stale-read detection.
- **S6**: same prefix, `Brainstorm S6 (Rust native tool prototype).` Seed question: candidate tool choice (feedback suggests `read`) and the compat interface contract.
- **S7**: same prefix, `Brainstorm S7 (orchestration tuning).` Seed question: which single behavior to evaluate first (skill routing, batching, subagents) against the S2 baseline.

## 6. Session protocol

- One sub-project per session. Open the session with: `Read docs/specs/MASTER.md` + the sub-project's spec (if written). The master is self-contained (feedback fully digested in §1); consult `native/pidx/Feedback.md` only if the digest seems lossy.
- Workflow per sub-project: brainstorm → spec at `docs/specs/YYYY-MM-DD-<topic>-design.md` → self-review → user review → implementation plan → implement.
- When a spec is committed, update the table in §3 (Status: `spec'd`, Spec: link). When implementation completes, Status: `done` + one-line note in §7.

## 7. Outcome log

_(append one line per completed sub-project: ID, date, one-sentence result)_

- S1, 2026-10-15 — `s1-metrics/1` per-session emitter shipped (`skills/session-audit/scripts/metrics.mjs`): latency p50/p95, edit-failure structure, repeat-read rate, token/cost/batch aggregates; parser↔extract parity-gated; 25 tests green.
- S2, 2026-10-15 — benchmark suite shipped (`benchmark/`): 6 real tasks (bugfix/feature/refactor/test-repair) with validators + solutions, `bench.mjs` start/finish/report/list/check-tasks CLI, `s2-run/1` records embedding `s1-metrics/1`; 38 tests green; end-to-end smoke run verified.
