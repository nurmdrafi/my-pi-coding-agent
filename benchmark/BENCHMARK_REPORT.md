# Pi Extension Benchmark — Final Report

## 1. Environment

| Item | Value |
|---|---|
| Pi version | 1.1.0 |
| Node version | v24.21.0 |
| Model | glm-5.3 (thinkingLevel: high) |
| Provider | zai (api: openai-completions) |
| Date | 2026-10-12 |
| Fixture commit | `fd26bbc3e83e7d48115f3d5c4623dd920f644f17` |
| Tasks | t1-change-constant, t2-fix-phone-test, t3-add-slug-util (3 runs each per arm) |
| Extensions under test | `./extensions/permission-gate`, SoL-Pi (`git/github.com/NVlabs/SoL-Pi`), `@piagent/platform` v1.22.1 (vendored at `benchmark/vendor/`) |

## 2. Methodology and deviations

- **Concurrent arms (user-approved deviation):** the four arms ran in parallel (one worker each) instead of sequentially as the instructions recommend. Each arm used its own fixture copy (`benchmark/fixtures/<arm>/pi-bench-fixture`, all reset to the same commit before every run), eliminating git-reset conflicts. Consequence: `duration_ms` carries cross-arm CPU/API contention noise and should be read as indicative only.
- **Budget escalation (per spec rule):** every arm crossed the >20% BUDGET_EXCEEDED threshold at 10,000 tokens, so each arm was stopped and fully rerun at 15,000 tokens (files `<task>-r<N>-b15000.jsonl`). The 10k JSONLs are preserved.
- **Budget enforcement:** each run was polled (2s cadence) and killed at the threshold; in-flight API responses cause a recorded overshoot of ~0.5–3.6k tokens on killed runs.
- Raw outputs: 51 JSONL files under `benchmark/runs/<arm>/`, never overwritten. One CSV row per attempted run in `benchmark/results/summary.csv` (51 rows + header).

## 3. Total attempted runs and failures by arm

| Arm | Attempted | 10k set | 15k set | SUCCESS | BUDGET_EXCEEDED | Other failures |
|---|---:|---:|---:|---:|---:|---:|
| none | 14 | 5 | 9 | 9 | 5 | 0 |
| permission-gate | 14 | 5 | 9 | 9 | 5 | 0 |
| sol-pi | 12 | 3 | 9 | 7 | 5 | 0 |
| piagent-platform | 11 | 2 | 9 | 3 | 8 | 0 |
| **Total** | **51** | **15** | **36** | **28** | **23** | **0** |

- Zero LOAD_FAILED, HARNESS_ERROR, TIMEOUT, or VALIDATION_FAILED results across all 51 runs.
- 22 of the 23 BUDGET_EXCEEDED runs had already produced validating patches — budget exhaustion cut the final answer, not the code. Only `piagent-platform` t2-r3-b15000 also failed validation.
- Validation passed 50/51 runs overall (98%); the only miss was `piagent-platform` t2-r3-b15000.
- All extensions loaded successfully in every run (model/provider confirmed zai glm-5.3 in all 51 JSONLs).

## 4. Budget used by each arm

All four arms exhausted the >20% rule at 10,000 tokens and were rerun at 15,000:

| Arm | 10k attempts | 10k outcome | 15k set | 15k BUDGET_EXCEEDED |
|---|---:|---|---:|---:|
| none | 5 | 3 SUCCESS / 2 BE (t2) | 9 | 3 (t2×1, t3×2) |
| permission-gate | 5 | 3 SUCCESS / 2 BE (t2) | 9 | 3 (t2×2, t3×1) |
| sol-pi | 3 | 1 SUCCESS / 2 BE (t1) | 9 | 3 (t2×1, t3×2) |
| piagent-platform | 2 | 0 SUCCESS / 2 BE (t1) | 9 | 6 (t2×3, t3×3) |

Even at 15,000 tokens, t3 exceeded budget in every arm (1–3 of 3 runs), and piagent-platform's t2/t3 exceeded it in all 6 runs (16.5k–18.6k natural usage).

## 5. Average metrics by arm (15k rerun sets, n=9 each — comparable sets)

| Arm | Avg total tokens | Avg turns | Avg tool calls | Avg bash calls | Avg duration ms | Completion | Validation | Success |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| none | 12128.6 | 4.22 | 3.67 | 1.44 | 25331.2 | 9/9 | 9/9 | 6/9 |
| permission-gate | 12041.1 | 4.11 | 3.78 | 1.56 | 15346.4 | 8/9 | 9/9 | 6/9 |
| sol-pi | 12285.8 | 3.78 | 4.11 | 1.44 | 25645.0 | 8/9 | 9/9 | 6/9 |
| piagent-platform | 15547.0 | 3.56 | 4.22 | 1.78 | 25683.0 | 3/9 | 8/9 | 3/9 |

10k partial sets (incomparable, different sizes): none 8437.8 avg (n=5), permission-gate 9049.0 (n=5), sol-pi 9682.7 (n=3), piagent-platform 11739.0 (n=2).

Per-task average tokens (15k sets; includes over-budget runs, so t2/t3 reflect usage, not cost-of-success):

| Task | none | permission-gate | sol-pi | piagent-platform |
|---|---:|---:|---:|---:|
| t1-change-constant | 6630 | 7119 | 7902 | 11739 |
| t2-fix-phone-test | 13933 | 14142 | 14812 | 18073 |
| t3-add-slug-util | 15823 | 14863 | 14143 | 16828 |

## 6. Token change relative to none

Arm-level (15k set averages): `token_change_percent = ((ext_avg - none_avg) / none_avg) × 100`

| Arm | Avg tokens | Change vs none |
|---|---:|---:|
| none | 12128.6 | baseline |
| permission-gate | 12041.1 | **−0.7%** |
| sol-pi | 12285.8 | **+1.3%** |
| piagent-platform | 15547.0 | **+28.2%** |

Isolating pure extension context overhead with t1-only runs (identical 3-turn shape, no budget kills, 15k set):

| Arm | t1 avg tokens | Change vs none |
|---|---:|---:|
| none | 6630.3 | baseline |
| permission-gate | 7118.7 | **+7.4%** (~488 tokens) |
| sol-pi | 7901.7 | **+19.2%** (~1271 tokens) |
| piagent-platform | 11739.3 | **+77.0%** (~5109 tokens) |

The arm-level near-parity of permission-gate/sol-pi vs none is task-mix noise (their t2/t3 runs happened to need fewer turns); the t1-only comparison is the cleaner overhead signal.

## 7. Cost per successful task

`cost_per_successful_task = total_tokens_across_all_attempted_runs / successful_runs` (per arm, all attempted runs):

| Arm | Total tokens (all attempts) | Successes | Cost per successful task |
|---|---:|---:|---:|
| none | 151,346 | 9 | 16,816 |
| permission-gate | 153,615 | 9 | 17,068 |
| sol-pi | 139,620 | 7 | 19,946 |
| piagent-platform | 163,401 | 3 | 54,467 |
| **Overall** | **607,982** | **28** | **21,714** |

## 8. Interpretation

- **Fewest tokens:** permission-gate (12,041 avg, −0.7% vs none — parity within noise at arm level). On the clean t1-only measure, `none` is fewest; permission-gate adds ~7%.
- **Fastest:** permission-gate (15.3s avg vs 25.3–25.7s for the others), though concurrent-arm execution and provider latency outliers (35–48s runs in other arms) make duration the weakest metric here.
- **Best success-within-budget:** three-way tie — none, permission-gate, sol-pi at 6/9 (66.7%); piagent-platform at 3/9 (33.3%), succeeding only on t1.
- **Did SoL-Pi reduce turns, input tokens, or both?** No. t1 turns were identical to none (3 vs 3), input tokens were at parity (t1: 197–242 vs 232–264), and its slightly lower arm-level turn average (3.78 vs 4.22) is task-mix, not turn reduction. SoL-Pi added ~1.2k tokens of cached context per run (+19% on t1).
- **Did piagent/platform reduce file-reading/context overhead?** No — the opposite. It inflated first-turn context from ~2.0k to ~3.8–4.0k tokens (+77% on t1), pushing every t2/t3 run past even the 15k budget (16.5k–18.6k usage). No file-reading savings were observed.
- **Did permission-gate add measurable overhead?** Arm-level: no (−0.7%). Task-level: a small, real cost — ~490 tokens (+7.4%) of cached guard prompt on t1. Its behavioral guards (destructive-command checks, re-read/re-run enforcement, commitlint) never fired on these clean, simple tasks, so no interaction overhead materialized.
- **Were any results affected by budget exhaustion?** Yes, extensively: 23 of 51 attempts (45%) ended BUDGET_EXCEEDED. 22 of those 23 had valid patches already applied — the budget cut the final summary answer, not the code. The 10k budget was structurally too tight for t2/t3 on this model (t2 needs ~12–15k, t3 ~12–18k baseline), and even 15k was exceeded by t3 in all four arms. piagent-platform was budget-limited on 8 of 11 attempts.

## 9. Final table

Aggregates from the 15k rerun sets (9 runs per arm; all arms escalated from 10k per the >20% rule):

| Arm | Budget | Completion rate | Validation rate | Success within budget | Avg total tokens | Avg turns | Avg duration ms | Token change vs none |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| none | 15000 | 100% | 100% | 66.7% | 12129 | 4.22 | 25331 | baseline |
| permission-gate | 15000 | 88.9% | 100% | 66.7% | 12041 | 4.11 | 15346 | −0.7% |
| sol-pi | 15000 | 88.9% | 100% | 66.7% | 12286 | 3.78 | 25645 | +1.3% |
| piagent-platform | 15000 | 33.3% | 88.9% | 33.3% | 15547 | 3.56 | 25683 | +28.2% |

## 10. Anomalies and data quality

- **Kill overshoot:** 2s polling let in-flight responses finish; killed runs recorded 0.5–3.6k tokens above threshold. Several "BUDGET_EXCEEDED" runs actually completed naturally (exit 0, full event stream) and are marked by token count only.
- **Token composition:** cacheRead dominates all totals (~93–97%); cacheWrite = 0 and compactions = 0 on all 51 runs (zai prompt caching).
- **Latency outliers:** 35s, 44s, 48s runs vs ~6s siblings with identical turn/token profiles — provider variance, not extension cost.
- **tool mix:** t1 runs used only edit/read; t2/t3 added 1–2 bash calls (npm test). No test file was modified in any of the 51 runs; fixtures were reset to `fd26bbc` before every run and left clean.

## 11. Artifacts and definition of done

- `benchmark/results/summary.csv` — 51 rows (one per attempted run), columns exactly per spec.
- `benchmark/runs/{none,permission-gate,sol-pi,piagent-platform}/` — 14 + 14 + 12 + 11 = 51 raw JSONL files, none overwritten.
- Per-arm CSVs: `benchmark/results/{none,permission-gate,sol-pi,piagent-platform}.csv`.
- Tasks: `benchmark/tasks/t1-change-constant.md`, `t2-fix-phone-test.md`, `t3-add-slug-util.md`.
- All 51 attempted runs have a JSONL record; every run either stayed within budget or is explicitly marked BUDGET_EXCEEDED; no fixture test file was modified. Benchmark complete.
