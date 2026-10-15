# Harness-Improvement Scope Index

Date: 2026-10-15
Source: design-level review at `native/pidx/Feedback.md`
Status: decomposition approved; each sub-project gets its own spec → plan → implementation cycle in a dedicated session.

## Purpose

The feedback review spans multiple independent workstreams. Rather than one large spec, each workstream is a separate sub-project (S1–S7) with its own spec. This index is the single source of truth for scope, dependencies, build order, and status. New sessions should read this file first, then the linked spec if one exists.

## Current state (verified 2026-10-15)

Do not re-explore from scratch — this is what already exists:

- `native/pidx/` — Rust session-log indexer (turns, tool calls + param hashes, results, compactions, skill loads; incremental via size+mtime cache). Feeds session-audit's L0 fast path. Built and released (`bin/pidx`).
- `skills/session-audit/` — layered audit engine. L0/L1 deterministic rules already cover: `CACHE_TTL_EXPIRY`, `DUP_TOOL_CALL`, `BIG_TOOL_OUTPUT`, `RETRY_STORM`, `CACHE_MISS_RATE`, `CONTEXT_GROWTH`; plus token/cost math anchored on cacheRead/cacheWrite, dedup by responseId, per-tool/per-project rollups, pricing from logged usage.
- `benchmark/BENCHMARK_REPORT.md` — one-time 4-arm comparison (arms: none, permission-gate, sol-pi, piagent-platform) run via an **external** harness. Not a repo-owned repeatable suite.
- README doc inconsistencies flagged in feedback are partially fixed (commit `844a65e`); S3 makes the check automated.

## Sub-projects

| ID  | Name                          | Scope (one sentence)                                                                       | Deps     | Status | Spec |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------ | -------- | ------ | ---- |
| S1  | Session metrics extraction    | Extend pidx/session-audit with per-task metrics: tool p50/p95 latency, edit-failure rate, repeated-read rate, model calls per task | —        | planned | —    |
| S2  | Benchmark task suite          | Versioned, repo-owned task sets + repeatable runs; consumes S1 metrics for comparisons       | S1       | planned | —    |
| S3  | Doc-consistency validator     | Automated check: skill counts, extension inventory, env-var claims vs. reality              | —        | planned | —    |
| S4  | Fail-closed security tests    | Adversarial suite for permission-gate: shell chaining, redirects, env expansion, symlinks, TOCTOU, missing handlers | —        | planned | —    |
| S5  | Edit-validation hardening     | Execution-time content checks, stale-read rejection, ambiguous multi-match rejection         | — (S1 metrics prove impact) | planned | —    |
| S6  | Rust native tool prototype    | One tool (likely `read`) behind the existing interface, benchmarked vs. current              | S1, S2   | planned | —    |
| S7  | Orchestration tuning          | Evaluate skill routing, tool batching, subagent delegation against baseline                  | S1, S2   | planned | —    |

## Build order

1. **S1** first — it is the P0 from the feedback and unblocks S2, S6, S7 (all evaluated through its metrics).
2. **S3, S4** any time — fully independent quick wins; S4 especially is safety-critical.
3. **S5** after S1 ideally, so impact is measurable, but can proceed independently.
4. **S2** once S1 lands — establishes the baseline every later phase compares against.
5. **S6** after S2 exists to judge it.
6. **S7** last — needs the S2 baseline to avoid optimizing blind.

Priority within the feedback: measure before optimizing. A faster local tool is not necessarily a faster coding agent; the goal is same task, less wall-clock and token cost, no loss of correctness or security.

## Session openers

Paste per topic (each starts from the base, no re-exploration needed):

- **S1**: `Read docs/specs/2026-10-15-harness-improvement-index.md and native/pidx/Feedback.md. Brainstorm S1 (session metrics extraction).` Seed question: extend pidx/session-audit vs. new `pidx metrics` subcommand — primary consumer is S2 benchmark comparisons.
- **S2**: same prefix, `Brainstorm S2 (benchmark task suite).` Seed question: which task classes first (bug fix, refactor, feature, test-repair) and where tasks live in-repo.
- **S3**: same prefix, `Brainstorm S3 (doc-consistency validator).` Seed question: what CI/check entrypoint runs it and what it verifies (skill counts, extension inventory, env-var claims).
- **S4**: same prefix, `Brainstorm S4 (fail-closed security tests).` Seed question: pure unit fixtures vs. live-shell adversarial cases for permission-gate.
- **S5**: same prefix, `Brainstorm S5 (edit-validation hardening).` Seed question: content-hash vs. version-counter for stale-read detection.
- **S6**: same prefix, `Brainstorm S6 (Rust native tool prototype).` Seed question: candidate tool choice (feedback suggests `read`) and the compat interface contract.
- **S7**: same prefix, `Brainstorm S7 (orchestration tuning).` Seed question: which single behavior to evaluate first (skill routing, batching, subagents) against the S2 baseline.

## Session protocol

- One sub-project per session. Open the session with: this index + `native/pidx/Feedback.md` + the sub-project's spec (if written).
- Workflow per sub-project: brainstorm → spec at `docs/specs/YYYY-MM-DD-<topic>-design.md` → self-review → user review → implementation plan → implement.
- When a spec is committed, update this table (Status: `spec'd`, Spec: link). When implementation completes, Status: `done` + short outcome note below.

## Outcome log

_(append one line per completed sub-project: ID, date, one-sentence result)_
