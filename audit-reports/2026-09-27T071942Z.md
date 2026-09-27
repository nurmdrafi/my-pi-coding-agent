# Session Audit — ubl-survey-dashboard (all sessions)

sessionsDir: `~/.pi/agent/sessions` · scope: every session of `/Users/nur/Barikoi/ubl-survey-dashboard` (target confirmed on disk; request spelled "survary") · 7 of 143 directory sessions (2 active excluded directory-wide) · window 2026-09-17 → 2026-09-27 · report 2026-09-27T071942Z

## Totals

- turns 438 · cacheRead 18.8M · hitRatio 1.00 · compactions 0 · peak contexts ≤142K (no ceiling pressure)
- findings 28 · headline waste **127.6K tokens ≈ $0.16** (heuristic floor; 0.68% of read volume — directory avg 0.48%)
- Project share of directory headline (143 sessions, 2877K / $2.96): **4.4% of tokens, 5.4% of dollars**
- Models: glm-5.3 at $1.4/MTok waste rate in 6 sessions; session 01a0c8bd blended $0.36/MTok (deepseek mix). **All waste carries a price here** (pricedShare 1.0; directory-unpriced models — opencode/big-pickle, deepseek-v4-flash-free, mimo-v2.5-free — appear in none of these sessions). Reasoning tokens and compaction re-sends remain unpriced by the waste model; totals are floors, not ceilings.

## Findings by rule

| rule | findings | sessions affected | tokens | usd |
|---|---|---|---|---|
| BIG_TOOL_OUTPUT | 7 | **5 of 7** | 79.5K | $0.10 |
| DUP_TOOL_CALL | 21 | **6 of 7** | 48.2K | $0.06 |
| CONTEXT_GROWTH | 0 | 0 | 0 | $0 |

All 7 BIG findings are `bash`; 17 of 21 DUP findings are `read`. 200-style concentration does not apply: findings spread across nearly every session → these are **project-level patterns, not one bad session**.

```text
BIG_TOOL_OUTPUT   ████████████████████████████████████████████████  5 sess /  79K / $0.10
DUP_TOOL_CALL     ██████████████████████████████████               6 sess /  48K / $0.06
```

## Sessions by waste (the project "breakdown")

| session | date | turns | peak | waste | usd | findings |
|---|---|---|---|---|---|---|
| 01a0e16f-53a7-7048-bb59-abe31ae5f530 | 09-27 | 51 | 97K | 51.9K | $0.073 | BIG×2, DUP×8 |
| 01a0aeb6-d102-713c-9eeb-85dc3c3e7723 | 09-17 | 173 | 90K | 26.3K | $0.037 | BIG×2, DUP×6 |
| 01a0d337-faf6-72ac-8b9e-bfaeacf9ae9b | 09-24 | 52 | 85K | 22.4K | $0.031 | BIG×1, DUP×4 |
| 01a0c8bd-a198-76bb-9d8f-bb98efa36423 | 09-22 | 54 | 38K | 15.9K | $0.006 | BIG×1, DUP×1 |
| 01a0e1a0-a905-7048-bb59-abe5e501084a | 09-27 | 21 | 22K | 7.2K | $0.010 | BIG×1, DUP×1 |
| 01a0e15e-7b22-752a-8017-b0c301f6c579 | 09-27 | 83 | 142K | 3.8K | $0.005 | DUP×1 |
| 01a0c87f-0ae8-7271-bece-e53d73157fd4 | 09-22 | 4 | 0 | 0 | $0 | — |

Token and dollar ranks disagree at #4/#5: 01a0c8bd has 2.2× the tokens of 01a0e1a0 but 40% of its dollars — it ran the cheap deepseek mix ($0.36/MTok vs glm-5.3's $1.40). The dollar order is the one to act on.

Inspect any one:
`node ~/.pi/agent/skills/session-audit/scripts/audit.mjs fetch 01a0e16f-53a7-7048-bb59-abe31ae5f530 --kind user_text --limit 3 --max-bytes 500`

```text
01a0e16f  ████████████████████████████████████████████████████  51.9K / $0.073
01a0aeb6  ███████████████████████████████████                 26.3K / $0.037
01a0d337  ███████████████████████████                        22.4K / $0.031
01a0c8bd  █████████████████                                   15.9K / $0.006
01a0e1a0  ███████                                             7.2K / $0.010
01a0e15e  ████                                                3.8K / $0.005
01a0c87f                                                     0K / $0.000
```

## Trend

Baseline: report 2026-09-23T115618Z.md had ubl-survey-dashboard at 3 sess / 231 turns / 42K / $0.04 (0.58% of 7.3M read). Now 7 / 438 / 127.6K / $0.16 (0.68%). **Worsening** in absolute and rate. Driver is 09-27 alone: 3 sessions / 62.9K — the "remove all sonarqube related files and codeblocks" session (01a0e16f) paid both 45K hook dumps plus 8 re-read dups in 51 turns.

```text
09-17  ██████████████████████                26.3K
09-22  ██████████████                        15.9K
09-24  ██████████████████                    22.4K
09-27  ██████████████████████████████████████████████████  62.9K
```

## Cache hit-ratio

No cache problem: all volume-carrying sessions at ratio 1.00 (project row, views); directory-wide distribution for context: ≥0.95 → 139 sessions, no-cache zero-volume → 4.

```text
>=0.95    ██████████████████████████████████████████████████  139 sess
no cache  █                                                     4 sess
<0.95     0 sessions
```

## Ranked fixes

### 1. Do this first — pipe git commit/push hook output (config, one edit, permanent)

- **Evidence**: every BIG finding is a bash result of 44–48K. `error_head` on 01a0aeb6 at 2026-09-17T12:15:45.360Z (same timestamp as BIG finding `call_b22e5feed7384d579ccc5fa5`) shows the husky pre-commit banner *"Preparing to commit: Running linting, type checking, test coverage, and build"* followed by `npm verbose`/`npm info`/`npm warn` lines. The repo README states it runs "ESLint, Husky, and commitlint". Each commit/push re-floods context with the whole pipeline log; the tool_input window also shows a commit attempt re-issued 21s later — the agent re-pays the dump on retries.
- **Sessions**: 01a0e16f-53a7-7048-bb59-abe31ae5f530, 01a0aeb6-d102-713c-9eeb-85dc3c3e7723, 01a0d337-faf6-72ac-8b9e-bfaeacf9ae9b, 01a0c8bd-a198-76bb-9d8f-bb98efa36423, 01a0e1a0-a905-7048-bb59-abe5e501084a
- **Cost**: 79.5K tokens / $0.10 — 62% of project headline
- **Attribution**: config (repo hook verbosity × no output guard in the agent's git habit)
- **Fix**: add to `~/.pi/agent/AGENTS.md` → Token Economy → Command output: `git commit/push: always append 2>&1 | tail -20 — hooks re-run eslint/tsc/tests/build and print tens of KB`. Separately check the repo hook scripts / `.npmrc` for `loglevel=verbose` (plain `npm run` does not print `npm verbose cli` lines).
- **Target metric**: BIG_TOOL_OUTPUT for this project 7 findings / 79.5K / $0.10 → **≤2 findings / under 20K** by next audit.

Ranked #1 by waste *and* chosen first: it is a one-line skill/config edit with permanent enforcement, while #2 is unenforced discipline (see "do this first" rule).

### 2. Stop whole-file re-reads of files already in context (habit)

- **Evidence**: 17 DUP_TOOL_CALL on `read`. Largest: 01a0d337 read one 9,412-byte file twice (`call_94dbb278…`, `call_70711b08…`); 01a0c8bd read a 5,422-byte file **three times**. AGENTS.md Token Economy (Reading) already mandates: after an edit, a ≤60-line window at the anchor suffices.
- **Sessions**: all six waste-carrying sessions above
- **Cost**: 48.0K tokens / $0.06 — 38% of headline
- **Attribution**: habit (iterative re-verification by full re-read)
- **Fix**: behavioral — when re-checking an edited file, re-read only the edited window (`read` with offset/limit), never the full file.
- **Target metric**: read-dups for this project 17 findings / 48.0K → **under 5 findings / under 15K** by next audit.

### 3. Batch independent tool calls (habit, amplifier — not in waste model)

- **Evidence**: views batching block: 01a0c8bd-a198-76bb-9d8f-bb98efa36423 ran **41/41 turns single-call (100%)**; directory-wide 89% of call-turns are single-call.
- **Cost**: $0 direct (no rule prices it); each round-trip re-pays prefix + latency.
- **Attribution**: habit
- **Fix**: batch independent read+bash calls in one turn, per existing AGENTS.md Turns rule.
- **Target metric**: this project's 1-call turn share 100% (worst session) → **below 80%** in the next views batching block.

## Audit self-cost

10 escalation fetches, 10,440 returned bytes (fetch_log.jsonl) — **lower bound**: excludes the Phase-1 `run`/`views` transcript and this auditor's own reasoning turns. Additionally, 4 unlogged jq queries into `overview.json`/`l1_findings.json` supplied the per-project session/finding slices (views prints project rollups only) — their transcript cost is real and uncounted.

## Stats this report wanted and could not get

- Per-project session list, per-finding dollars, and per-date trend are not in `views` output — obtained via the disclosed narrow jq queries above instead.
- Call-level attribution of BIG findings: `tool_input` windows are timestamp-sorted (not uuid-anchored) and `turn_window` keys on responseIds while findings carry call ids — exact culprit commands resolved only via `error_head` timestamp alignment. A uuid-anchored `tool_input` would remove the guesswork.
- Per-project tool byte breakdown (views prints it directory-wide only).
