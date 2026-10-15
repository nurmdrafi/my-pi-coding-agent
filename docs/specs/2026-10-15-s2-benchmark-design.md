# S2 — Benchmark Task Suite: Design Spec

Status: **spec'd** (awaiting implementation plan → see `2026-10-15-s2-benchmark-plan.md`)
Created: 2026-10-15
Parent: `docs/specs/MASTER.md` §3 (S2). Feedback basis: MASTER §1.2 P0, §1.4C, §1.5 Phase 1, §1.7.
Decisions locked with user: manual runs, suite owns tasks + grading + aggregation (Q1=B); all four task classes — bug fix, refactor, feature, test repair (Q2=C); grading via per-task validator scripts (Q3=A); self-contained mini-repo fixtures checked into the repo (Q4=A); arm = manifest entry with config instructions, nothing auto-applied (Q5=A); full start/finish/report lifecycle around the manual session (Q6=A).

## 1. Problem

MASTER §1.4C requires repeatable measurement: identical tasks, repository states, and settings for baseline and candidate, medians over repeated runs. What exists falls short:

- `benchmark/BENCHMARK_REPORT.md` was a one-time 4-arm comparison driven by an external harness — not repo-owned, not repeatable.
- S1 delivers the per-session metrics primitive (`skills/session-audit/scripts/metrics.mjs`, schema `s1-metrics/1`) but explicitly defers aggregation, arm comparison, and task success rate to S2.
- Nothing defines versioned tasks or grades task outcomes objectively.

S2 is the repo-owned benchmark suite: versioned task sets, a lifecycle around manual agent runs, machine grading, and median comparison reports. Primary consumers: S6 and S7 (before/after evaluation against the S2 baseline); secondary: S5 (edit-failure impact).

## 2. Scope

**In scope:** one zero-dependency Node CLI (`benchmark/bench.mjs`) with commands `start`, `finish`, `report`, `list`, `check-tasks`; a versioned task library (6 tasks across four classes) of self-contained mini-repo fixtures with validators and reference solutions; an arm manifest; committed run records; generated median-comparison reports.

**Out of scope (non-goals):**
- Automated/headless run execution — runs are manual (Q1); a runner could wrap the same records later.
- Auto-applying arm configuration — arms are labels + printed instructions (Q5).
- Any change to S1 scripts, pidx, or the audit skill beyond importing/spawning them.
- Referee-grade refactor semantics analysis — refactor grading is tests-still-green + structural assertions.
- Cross-machine result merging or a results server — records are files in this repo.

## 3. Approach (of three considered)

**Chosen — Node CLI + committed fixture directories.** Pure-Node `.mjs` in the established repo style (no deps, JSON contracts on stdout/stderr), tasks as committed directories under `benchmark/tasks/`, run records as committed JSON, live workdirs gitignored. Grading spawns each task's own `validate.mjs`; metrics ingestion spawns the S1 CLI and pins schema `s1-metrics/1`. Everything needed to reproduce or extend a comparison lives in git history.

Rejected: shell/Makefile-only suite (structural assertions and JSON aggregation in shell are painful; refactor validators unworkable). Rejected: folding the suite into `skills/session-audit` (conflates the audit skill's waste-finding purpose with benchmark grading; MASTER keeps S2 its own sub-project; audit skill stays untouched).

## 4. Repository layout

```
benchmark/
  bench.mjs                 # CLI: start | finish | report | list | check-tasks
  arms.json                 # arm manifest (§6)
  lib/                      # shared helpers: fixture copy, spawn/parse, aggregation
  tasks/<class>/<id>/
    task.json               # { id, class, title, prompt }
    fixture/                # self-contained mini Node repo (node:test, zero deps)
    validate.mjs            # contract: §5.2
    solution.patch          # reference solution — task QA only, never grading
  results/
    runs/<runId>.json       # committed run records (§7)
    report-YYYY-MM-DD.md    # generated comparison reports
  runs/                     # live workdirs — gitignored
```

`<class>` ∈ `bugfix | feature | refactor | test-repair`. `<runId>` = `<UTC-timestamp>-<task-id>`. `tests/bench-suite.test.mjs` + `tests/fixtures/bench/` hold the suite's own tests.

## 5. Task format

### 5.1 `task.json`

`{ "id": "bugfix/t1", "class": "bugfix", "title": "…", "prompt": "…" }`. `prompt` is the exact text `start` prints and the user pastes into the agent session. Every prompt must instruct: solve the task, make the named tests pass, do not modify test files. `title` is for `list`/reports.

### 5.2 `validate.mjs`

Executable as `node validate.mjs <workdir>`. Prints one JSON object `{ "pass": bool, "checks": [ { "name": str, "pass": bool, "detail": str } ] }` on stdout; exit 0 iff `pass`. Validators run the fixture's tests (`node --test`) plus structural assertions (e.g. duplicate function gone, new module exists, tests unchanged via git). Per-class grading:

| Class | Pristine fixture | Grading |
| --- | --- | --- |
| bugfix | tests red | tests green + tests unmodified |
| feature | new-behavior tests red | new tests green + existing tests green + tests unmodified |
| refactor | structural check red (tests green) | tests still green + structural assertions + tests unmodified |
| test-repair | tests red | tests green + production source unmodified |

### 5.3 v1 task set (6 tasks)

2 bugfix, 2 feature, 1 refactor, 1 test-repair — small single-package Node projects (one to four source files + tests), zero runtime deps, `node --test`. Tasks stay deliberately small: manual runs cost real tokens; the suite measures harness efficiency, not agent stamina.

### 5.4 Task QA — `check-tasks`

For every task: (a) validator on a pristine copy of `fixture/` must FAIL (exit 1) with at least one failing check; (b) `git apply solution.patch` then validator must PASS. Guards against impossible or already-solved fixtures; CI-runnable. Fails with a per-task summary.

## 6. Arms

`arms.json` — array of `{ "name": str, "description": str, "config": str, "baseline": bool }`. `config` is human instructions (extensions/env/flags to set before the run) — printed by `start`, never auto-applied. v1 ships `baseline` (documented default harness config, `baseline: true`) and a `candidate` placeholder to be filled when a real comparison starts. `report` treats every arm as a peer column; `baseline` marks the reference column in output.

## 7. Run lifecycle

1. **`start`** — `node benchmark/bench.mjs start --task <id> --arm <name>`
   Copies `tasks/<id>/fixture/` → `benchmark/runs/<runId>/work`, runs `git init` + initial commit inside the workdir (enables tests-unmodified checks and diffing), writes `runs/<runId>/run.json` stub `{runId, task, arm, startedAt, status:"started"}`, then prints: the task prompt, the arm's `config` instructions, the workdir path, and the next-step hint (run the agent with cwd = workdir, then `finish`).
2. **Manual session** — user runs the agent with cwd = workdir and pastes the prompt.
3. **`finish`** — `node benchmark/bench.mjs finish --run <runId> --session <sessionId>`
   Spawns `validate.mjs` against the workdir; spawns S1 `metrics.mjs <sessionId>`; writes `results/runs/<runId>.json` (§8); flips the stub to `status:"done"`; prints a grade summary line.
4. **`report`** — `node benchmark/bench.mjs report [--task <id>…] [--arm <name>…] [--include-partial]`
   Aggregates completed records into `results/report-YYYY-MM-DD.md` (§9).
5. **`list`** — tasks with class/title, arms, and run counts per task × arm.

Recommended protocol (documented in report header): ≥3 completed runs per task × arm before comparing; report always shows n per cell.

## 8. Run record — `results/runs/<runId>.json`

```json
{
  "schema": "s2-run/1",
  "runId": "20261015T101530-bugfix-t1",
  "task": "bugfix/t1", "arm": "baseline",
  "startedAt": "…ISO…", "finishedAt": "…ISO…",
  "sessionId": "…",
  "grade": "SUCCESS",
  "checks": [ { "name": "tests-green", "pass": true, "detail": "7 passed" } ],
  "metrics": { …embedded s1-metrics/1 object… },
  "metricsError": null
}
```

`grade` ∈ `SUCCESS | FAIL` (validator `pass`). `metrics` embeds the S1 JSON verbatim; on metrics failure it is `null` with `metricsError` set — the grade is still recorded. `partial: true` inside embedded metrics marks possibly-unfinished sessions (§10). Committed to git: run records are the repo-owned baseline history. Workdirs under `benchmark/runs/` are gitignored and disposable.

## 9. Report — `results/report-YYYY-MM-DD.md`

Groups completed run records by (task, arm). Per cell: n, success rate, and **medians** of: `durationMs`, `tokens.input/output/peakContext`, `costUsd`, `cacheHitRatio`, `apiTurns`, worst-tool `latencyMs.p95`, `edits.failureRate`, `reads.repeatRate`. Cells with n = 1 are marked (median = the single value). Median of null-valued entries: nulls skipped, n of non-null shown. A header block records: date, arms compared, tasks included, and the recommended-protocol note. Also emitted as sibling JSON (`report-YYYY-MM-DD.json`) for programmatic diffing. Same-day reruns append `-2`, `-3`, … so no report is ever overwritten.

## 10. Error handling

| Condition | Behavior |
| --- | --- |
| Unknown task / arm / run id | exit 1, `{error}` JSON on stderr |
| `finish` on already-finished run | exit 1, `{error}` JSON on stderr |
| Validator crash (non-zero, no JSON) | grade FAIL; synthetic check `{name:"validator-crash", pass:false, detail:err}` recorded |
| Metrics CLI failure | run recorded with `metrics: null`, `metricsError` set; report marks the cell "metrics incomplete" |
| Embedded metrics `partial: true` | excluded from report medians unless `--include-partial`; always visible in record |
| `report` with zero completed runs | message, exit 0, no file written |
| `check-tasks` failure | per-task FAIL lines + exit 1 |
| Fixture copy / git init failure | exit 1, `{error}` JSON on stderr, partial `runs/` dir left for inspection |

## 11. Testing

`tests/bench-suite.test.mjs` (node:test, repo pattern — runnable via `node --test` and directly), fixtures under `tests/fixtures/bench/`:

- **Unit**: fixture copy + git init; validator spawn/parse (pass, fail, crash); run-record write/schema; aggregation math (medians incl. n=1 and null-skipping, success rate, partial exclusion, incomplete-metrics marking); arm/task manifest loading and error paths.
- **Integration**: one synthetic mini-task (fixture + validator + solution.patch) + one tiny session jsonl (S1-style golden fixture) → `start` → simulate session → `finish` (validator + metrics on the fixture session) → `report` renders the expected markdown cells.
- **`check-tasks`**: exercised against the synthetic task (pristine fails, patched passes) in tests; the 6 real tasks are checked manually at implementation end and in CI.
- **Smoke**: one real manual agent run end-to-end on a real task (eyeball, not asserted).

## 12. Risks / notes

- Manual runs make repeat counts discipline-dependent; mitigated by run records (visible n) + protocol note in every report. Automation can wrap records later without schema change.
- Task realism vs size: mini-repos under-measure long-horizon behavior; accepted for v1 (cheap, deterministic); larger tasks can be added as new versions of the library.
- Median over 3 runs of a noisy metric is still noisy; reports show n and the raw records remain queryable — no hidden smoothing.
- Session↔workdir linkage is by convention (agent cwd = workdir) + recorded sessionId; suite does not verify the session touched that workdir. Documented limitation; a future check could assert the session's project field.
- S1 schema dependency: `finish` pins `s1-metrics/1`; if S1 ever versions up, `finish` fails loudly (schema mismatch error) rather than emitting mixed records.

## 13. Acceptance criteria

1. `start`, `finish`, `report`, `list`, `check-tasks` behave per §7/§10; error paths exit 1 with JSON on stderr.
2. 6 tasks committed across all four classes; `check-tasks` proves each fails pristine and passes patched.
3. Run records conform to `s2-run/1` with embedded `s1-metrics/1` metrics (or explicit `metricsError`).
4. `report` renders median tables for every task × arm with n ≥ 1, plus JSON sibling.
5. Zero new dependencies; no changes outside `benchmark/`, `tests/`, `.gitignore`, and this spec's registration in `MASTER.md`.
