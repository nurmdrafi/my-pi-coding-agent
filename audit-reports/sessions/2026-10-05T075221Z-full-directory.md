# Session Audit — full directory, 2026-10-05

sessionsDir: `~/.pi/agent/sessions` · scope: **all projects** · 177 sessions, 2026-08-30 → 2026-10-05 (active session self-excluded) · report 2026-10-05T075221Z

## Totals

- apiTurns 12,232 · compactions 3 · cache hitRatio **1.000** (cacheWrite 0 — no TTL-expiry waste class present)
- findings 382 · headline waste **4,366K tokens ≈ $4.89** — a heuristic **floor**: reasoning (output-side) tokens and compaction re-sends are unpriced by the waste model
- waste as share of read volume: 0.55% · unpriced models excluded from $ (opencode/big-pickle, deepseek-v4-flash-free, mimo-v2.5-free) — 99.8% of waste carries a price

## Findings by rule

| rule | findings | sessions affected | tokens | usd |
|---|---|---|---|---|
| DUP_TOOL_CALL | 334 | **95 of 177** | 3,207K | $3.44 |
| BIG_TOOL_OUTPUT | 35 | 30 | 1,159K | $1.45 |
| CONTEXT_GROWTH | 13 | 13 | 0 (amplifier) | $0 |

```text
DUP_TOOL_CALL      ██████████████████████████████████████████████  95 sess / $3.44
BIG_TOOL_OUTPUT    █████████████                                    30 sess / $1.45
CONTEXT_GROWTH     █                                                13 sess /  $0.00
```

334 findings across 95 sessions is a **population habit**, not one bad week. Tool detail: the DUP waste is `read` dup 258× → 3,089K (71% of headline); `bash` dup 73× → 117K; `edit`/`write` negligible.

## Cache hit-ratio distribution

```text
>=0.95             ██████████████████████████████████████████████  173 sessions
no cache (0 vol)   █                                                  4 sessions
```

Nothing to fix here — the cache is healthy; no CACHE_TTL_EXPIRY, RETRY_STORM, or CACHE_MISS_RATE findings exist in this directory.

## Projects by waste

| project | sessions | read | waste | usd |
|---|---|---|---|---|
| dropx-admin | 29 | 149.3M | 1,198K | $1.51 |
| barikoi-admin-nextjs | 24 | 139.3M | 829K | $0.45 |
| bkoi-gl-js | 16 | 197.5M | 618K | **$0.84** |
| dropx-merchant | 21 | 37.5M | 590K | $0.65 |
| react-bkoi-gl | 12 | 120.0M | 494K | $0.60 |
| ubl-survey-dashboard | 14 | 51.7M | 357K | $0.48 |
| agent | 38 | 42.7M | 147K | $0.19 |
| pickaboo-frontend | 5 | 40.8M | 89K | $0.12 |

```text
dropx-admin           ██████████████████████████████████████████████  $1.51
bkoi-gl-js            ████████████████████                            $0.84
dropx-merchant        ████████████████                                 $0.65
react-bkoi-gl         ███████████████                                  $0.60
ubl-survey-dashboard  ████████████                                     $0.48
barikoi-admin-nextjs  ███████████                                      $0.45
agent                 ████                                             $0.19
pickaboo-frontend     ███                                              $0.12
```

Dollar and token rankings disagree on rows 2–3: barikoi-admin-nextjs has more waste *tokens* (829K) but fewer *dollars* ($0.45) than bkoi-gl-js (618K / $0.84) — bkoi-gl-js ran a pricier model. **Act on the dollar order.**

## Ranked fixes

### 1. Re-reads of already-in-context files — habit + config gap · ~73% (3,207K / $3.44) · worsening

Evidence: `read` dup 258× across 95 sessions; marathon fix sessions are the epicenter — 405 and 498 turns respectively. Fetched snippets show disciplined capped *commands*, so the waste is re-entry, not verbosity. AGENTS.md says the permission-gate extension blocks "re-reads of in-context files" — 258 slipped past it (likely different offset/limit evades the match).
Sessions: `01a105c2-0558-73d3-bb83-988fe6fc5f83` (dropx-admin, DUP×22, 710K), `01a09edc-37aa-752b-ae91-a83df88be819` (barikoi-admin-nextjs, DUP×23, 467K), `01a0573a-303e-7e21-9558-263617b2d7fc` (dropx-merchant, DUP×12).
Check one: `node ~/.pi/agent/skills/session-audit/scripts/audit.mjs fetch 01a105c2-0558-73d3-bb83-988fe6fc5f83 --kind user_text --limit 3 --max-bytes 500`
Fix: extend the permission-gate's in-context re-read block to flag **any** re-read of a file already read this session regardless of window. Target metric: **DUP_TOOL_CALL 3,207K / $3.44 → under 1,200K next audit.**

### 2. Occasional uncapped tool outputs — habit · ~27% (1,159K / $1.45) · steady

Evidence: 35 tail events on 30 of 177 sessions; one BIG×1 costs 394K of a 129-turn session's 394K+ waste (`01a0d205-6fde-7521-8a5a-9a832d111de1`); `01a0a345-1032-7278-a923-bf3126db2be2` (BIG×2, 296K).
Fix: explicit `limit` on every read; `| head`/`rg` on verbose commands (the majority of sessions already do this — it's the tail that bites). Target: **BIG_TOOL_OUTPUT 1,159K → under 500K.**

### 3. Unbatched turns — habit · unpriced amplifier (12,232 apiTurns, 87% single-call) · steady

Evidence: 5 sessions at 100% one-call turns (`01a0573a-…`, `01a0bdae-570c-755f-9fda-0b78b39ed9a2`, `01a0a9ed-be83-7552-a801-6fd4dd3f806b`, …). Every extra turn re-sends the prefix, multiplying fixes #1 and #2.
Fix: batch independent tool calls into one assistant turn (AGENTS.md already mandates this). Target: **1-call share 87% → under 70%** (views → Batching).

### 4. Full-spec e2e re-runs — habit · ~3% (bash dup 117K / $0.12) · steady

Evidence: `01a09edc-…` runs the identical `npx playwright test e2e/polygon-add-place-flow.spec.ts …` twice within 2 minutes and re-runs marker-sync.spec.ts 3× in a for-loop.
Fix: re-run the failing case with `-g <name>` first; full spec once at the end. Target: bash dupWaste 117K → under 40K.

## Do this first

**Not** fix #1's discipline — its *config* half: one edit to the permission-gate extension that blocks re-reads of any file already read this session. A gate edit is permanent enforcement; the habit alternative is indefinite discipline, and 95 affected sessions show discipline alone already lost. Fix #2 has no one-edit equivalent, so it waits. If the gate already claims to do this (AGENTS.md wording suggests it intends to), the edit is a bug fix to its matcher — same payoff.

## Trend

Prior reports exist (13, since 2026-09-05); the most recent (2026-09-27) was project-scoped (`agent`, 56K/$0.08) but recorded the directory lifetime headline then as **2,905K / $3.00** — now **4,366K / $4.89**. This audit's own per-date split confirms worsening: rate of waste per read **0.43% (08-30→09-15) → 0.67% (09-16→10-05)**.

```text
rate 0.43% (08-30..09-15)  █████████████████████████████████               78 sess / 1,739K
rate 0.67% (09-16..10-05)  ██████████████████████████████████████████████  99 sess / 2,627K
```

## Audit self-cost (lower bound)

3 escalation fetches (`tool_input`), 6,558 bytes returned — counts neither the Phase 1 `views` output nor this session's own reasoning turns.

## Stats this report wanted and could not get

- Which *files* the 258 dup reads targeted (rule detail reports counts/bytes only; file identity needs per-session fetches beyond budget) — would sharpen fix #1's gate matcher.
- BIG_TOOL_OUTPUT broken down by tool (read vs bash) — not in `views`.
