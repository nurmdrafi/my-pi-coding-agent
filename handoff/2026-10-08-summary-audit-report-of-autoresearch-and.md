<!-- handoff | goal: summary audit report of autoresearch, and plan for update live repo | source: /home/nurmdrafi/.pi/agent/sessions/--home-nurmdrafi-.pi-agent--/2026-10-08T15-34-48-855Z_01a11c27-2115-7171-a316-3606b99ae7c3.jsonl | 2026-10-08T17:35:08.495Z -->

## Context

An autoresearch session (30 iterations, plus post-close A/B validation) optimized `~/.pi/agent`'s token economy, working in a scratch repo at `/tmp/pgate-research` (branch `autoresearch/pgate-token-economy-20261008`). Everything was measured with a purpose-built harness, and the winning changes were already applied to the live repo in commit `23bcc05` on `main`. What remains is a **summary audit report** and a **plan for further live-repo updates**.

### Key results (baseline → final)
- Replay waste: 4,223 → **0** tokens/task; false-positive blocks 18.2% → **0%**; unintended replay blocks 709 → 0
- Context inflow: −26.9% via non-blocking output cap (100 lines / 4 KB, tail spilled to `$TMPDIR/pgate-spill` with pointer)
- Suite (corrected grader): success 0.854 → **0.981**, mistakes 0.208 → **0.019**, necessary actions 0.854 → 0.923, tokens +8% (cost of ask-turns)
- Tests 103/103, fixtures 54/54, one-shot recovery 95%

### What shipped to live (`23bcc05`)
- `extensions/permission-gate.ts`: output cap replaced block rules R2/R5/R6/R7/R8/verbose; H2 destructive confirm (`ctx.ui.confirm`, headless fail-closed ask-in-chat, 2-min approval window); commitlint fixes (B12/B13/B21, git-flag normalization); R10 bash-side mutation detection (B20); Re-block fixes (B1/B2); coverage span math (B3/B4); hydration safety (B6/B7); violation memory distinct-session counting (H7)
- `tests/` (103 tests, fixtures, gate.eval, replay), `scripts/gate-eval.mjs` + `agents-lint.mjs`, `package.json` gate:eval script
- **AGENTS.md deliberately NOT changed** — v2 rewrite was measured and rejected (success −5–8pts, 6 max-turns stalls, weakened block recovery; v1 wording is load-bearing)
- Pre-existing dirty files (`agents/reviewer.md`, `settings.json`, `AGENTS.md`) left unstaged

### Key files
- `/tmp/pgate-research/research-log.md` — full 30-iteration log + final metrics table
- `/tmp/pgate-research/docs/rejected-hypotheses.md` — 9 rejected hypotheses with measured reasons + **5 open questions for the user** (H2 allowlist JSON, non-force-push confirm, permission-gate/tool-economy split, cap ceiling tunability, anything else pending review)
- `/tmp/pgate-research/docs/final-diff.patch` (718 lines, gate-only), `docs/verify.md` (V1–V8), `docs/waste-pareto.{md,json}` (H0), `docs/rescore-{h1,h2,av2}.json`, `docs/suite-*.json`
- Same set mirrored to `~/.pi/agent/audit-reports/autoresearch-2026-10-08/`
- `.auto/log.jsonl` in scratch — raw experiment log with per-iteration ASI annotations

## Task

1. **Write a summary audit report** (concise, decision-oriented): session objective, method (harness, metrics, A/B protocol), the waste Pareto that drove attack order, what changed and why, measured before/after table, rejected hypotheses with reasons, grader-validity fixes discovered along the way (seeded-bug test_pass, blocked≠mutated), and residual gaps (model ask-quality on t08/t10-class tasks, non-bash mutation lanes, W10 prose in older work sessions). Source it from the files above; save as `~/.pi/agent/audit-reports/autoresearch-2026-10-08/SUMMARY.md` and commit it (conventional commit, lowercase subject; stage only that file — the repo has unrelated uncommitted changes that must not be swept in).
2. **Produce a plan for updating the live repo going forward**: what is already live (commit `23bcc05`), what remains intentionally not applied (AGENTS.md v2 — rejected; nothing else pending), and a decision list for the 5 open questions in `rejected-hypotheses.md` with a recommendation for each (e.g. H2 allowlist JSON: recommend yes with per-path rules; non-force push: recommend keep confirming; split: recommend defer; cap ceiling: recommend keep 100L/4KB constant; plus a monitoring step — re-run `npm run gate:eval` after a week of real sessions to confirm replay metrics hold on fresh data). Present the plan for user approval before any further live mutation; do not apply anything beyond the SUMMARY.md commit without explicit OK.

Work read-only against `/tmp/pgate-research` (it may vanish on reboot — copy anything you need into the audit-reports dir first). The live `~/.pi/agent` install runs the new gate from the next pi session; current session may still be on the old one.
