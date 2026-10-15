# S2 — Implementation Plan

Spec: `docs/specs/2026-10-15-s2-benchmark-design.md` (approved 2026-10-15). This plan follows it exactly; deviations must be stated in the final report.

Conventions: TDD (red → green per step), surgical scope, narrowest check after each step. No changes to `skills/session-audit/**` (S1 is spawned, never edited), pidx, or audit skill. All scripts zero-dependency Node `.mjs`; JSON contracts per spec §10.

Deliverables:
- `benchmark/bench.mjs` — CLI: `start | finish | report | list | check-tasks` (spec §7)
- `benchmark/lib/*.mjs` — copy/git-init, spawn+parse, aggregation helpers
- `benchmark/arms.json`, `benchmark/tasks/**` — 6 tasks (spec §5.3), arm manifest (§6)
- `tests/bench-suite.test.mjs` + `tests/fixtures/bench/` — suite tests (repo pattern: `node --test <file>` and directly)
- `.gitignore` — `benchmark/runs/`

## Step 0 — Docs commit

Spec is committed (`4e3dda7`). Commit this plan + MASTER §3 link update: `docs(specs): s2 benchmark-suite implementation plan`.

## Step 1 — Manifests + scaffolding (red → green)

Tests: `arms.json` loads, exposes `baseline:true` entry; unknown arm name rejected; task discovery walks `benchmark/tasks/<class>/<id>/task.json`, rejects missing `prompt`/`id` mismatch; `.gitignore` covers `benchmark/runs/`. Implement `lib/manifests.mjs` (task/arm loading+validation), create `arms.json` with `baseline` + `candidate`, gitignore entry.

## Step 2 — Test fixtures (test data first)

`tests/fixtures/bench/task-syn/`: synthetic task — `task.json`, one-file `fixture/` (a `failing.js` + `failing.test.js` where a trivially wrong function makes one test red), `validate.mjs` (tests-green + tests-unmodified via git, spec §5.2 contract), `solution.patch` (one-line fix). `tests/fixtures/bench/session-syn.jsonl`: tiny S1-parseable session (a few turns/calls/results with timestamps+usage; reuse S1 fixture style). Verify: run validator by hand on pristine copy (exit 1) and on patched copy (exit 0); `metrics.mjs session-syn.jsonl --pretty` emits `s1-metrics/1`.

## Step 3 — Workdir prep (red → green)

Tests: copy fixture → temp dir, `git init` + commit, `.git` exists, fixture files match source, source untouched. Implement `lib/workdir.mjs` (`prepareWorkdir(taskDir, runsRoot) → {runId, workDir}`; runId = UTC timestamp + task slug).

## Step 4 — `start` (red → green)

Tests (spawn real CLI): creates `runs/<runId>/work` + `run.json` stub (`status:"started"`, task, arm, startedAt); stdout prints prompt, arm `config`, workdir path, next-step hint; unknown task/arm → exit 1 + `{error}` JSON stderr. Implement command dispatch in `bench.mjs` (audit.mjs arg-parse style).

## Step 5 — Validator runner (red → green)

Tests: spawn task-syn validator on pristine workdir → parsed `{pass:false, checks[]}`; on patched → `pass:true`; fake crashing validator (no JSON) → synthetic `validator-crash` check (spec §10). Implement `lib/validate.mjs`.

## Step 6 — `finish` (red → green)

Tests (spawn, session via `--sessions-dir` pointing at `tests/fixtures/bench/`): run record `results/runs/<runId>.json` conforms to `s2-run/1` (spec §8) — grade, checks, embedded metrics with `schema:"s1-metrics/1"`; stub flipped to `done`; double-finish → exit 1; unknown session id → `metrics:null` + `metricsError`, grade still recorded; schema-pin: fixture metrics with wrong `schema` value → loud error. Implement: spawn S1 `metrics.mjs`, record writer.

## Step 7 — Aggregation (red → green)

Tests (pure unit on synthetic records): medians incl. n=1; null skipping (`costUsd`, `edits.failureRate` null when no attempts); success rate; `partial:true` excluded unless flag; incomplete-metrics cell marking; empty input → exit-0 no-file path. Implement `lib/aggregate.mjs`.

## Step 8 — `report` (red → green)

Tests: markdown contains per-(task,arm) cells with n, success rate, median columns (spec §9 list); JSON sibling deep-equals expected structure; same-day rerun gets `-2` suffix; `--task`/`--arm` filters. Implement.

## Step 9 — `list` (red → green)

Tests: lists tasks (class, title), arms, run counts per task×arm from `results/runs/`. Implement.

## Step 10 — `check-tasks` (red → green)

Tests: on task-syn — pristine validator FAIL + patched PASS → command exits 0; inverted fixture (already-solved) → per-task FAIL lines + exit 1. Implement (temp-copy apply → validate, never touching the task source).

## Step 11 — Real tasks: bugfix ×2 (author + `check-tasks` each)

`tasks/bugfix/t1`, `t2`: small multi-function modules with 2–3 red tests each (off-by-one, wrong comparison). Each ships `task.json` (prompt per spec §5.1), `fixture/`, `validate.mjs`, `solution.patch`. Verify: `check-tasks` green for both.

## Step 12 — Real tasks: feature ×2

`tasks/feature/t1`, `t2`: existing green tests + red tests for the missing behavior (new CLI flag handling; new pure function + module). Same verification.

## Step 13 — Real task: refactor

`tasks/refactor/t1`: green tests + duplicated logic to extract; validator = tests green + structural assertions (new module exists, duplicate gone, tests unmodified). Same verification.

## Step 14 — Real task: test-repair

`tasks/test-repair/t1`: working source, broken tests (wrong expectation, wrong assertion target); validator = tests green + production source unmodified. Same verification.

## Step 15 — Final verification + smoke + report

- `node --test tests/bench-suite.test.mjs` full green (summary shown).
- `node benchmark/bench.mjs check-tasks` green over all 6 real tasks (the synthetic task lives under `tests/` and is covered by the test file, not by `check-tasks` discovery).
- Smoke (manual, eyeball): `start --task bugfix/t1 --arm baseline` → real agent run in workdir → `finish --run … --session <real id>` → `report` renders. Then delete the smoke workdir; commit only the run record + report if the user wants them kept, else drop.
- Update MASTER §3 (Status: `done`) + §7 outcome line; final commit `feat(benchmark): s2 task suite, lifecycle cli, and six tasks`.
