# Session Audit — 2026-09-14T041139Z

- sessionsDir: `~/.pi/agent/sessions` · 61 sessions audited (1 active excluded)
- window: 2026-08-30 → 2026-09-13 · 3,937 API turns · 3 compactions
- runner note: the installed skill bundle is missing `bin/audit.mjs`; this audit used a thin workdir driver importing the skill's own `src/` modules (run/views/fetch reproduced per SKILL.md). Recorded here because the transcript cost of that shim is unlogged.

## Totals (heuristic floor)

| metric | value |
|---|---|
| cacheRead | 208.2M · hitRatio 1.000 (degenerate — see disclosures) |
| cacheWrite | 0.0M — **provider logs no cache-write leg on any of the 3,937 turns** |
| headline waste | **1,375K tokens ≈ $1.59** (floor; ~99% of waste carries a derived price; post artifact-fix figures — see findings table) |
| waste / read volume | 0.66% |

Unpriced models (excluded from $): `opencode/big-pickle`, `opencode/mimo-v2.5-free`, `opencode/deepseek-v4-flash-free` — 99.2% of waste carries a price. Reasoning (output-side) tokens and compaction re-sends are unpriced by the waste model; totals are floors.

**Measurement gap (carried over from the 2026-09-06 report, still true):** zero `cacheWrite` in logs means `CACHE_TTL_EXPIRY` and `CACHE_MISS_RATE` are structurally blind — hitRatio 1.000 is not evidence of cache health. Raw usage confirms `cost.cacheWrite: 0` per turn, so this is the provider, not the parser. All headline waste comes from DUP/BIG rules, which anchor on content bytes and remain valid. **This report's figures are post-fix**: the original run showed 231 findings / 1,515K before the `edit`/`write` paramHash artifacts were fixed in `src/parser.mjs` (see below).

## Findings by rule

| rule | n | sessions | tokens | usd | note |
|---|---|---|---|---|---|
| DUP_TOOL_CALL | 71 | 26 | 862K | $0.89 | read 38×/817K + bash 32×/45K + 1 true edit repeat (artifact fixed) |
| BIG_TOOL_OUTPUT | 10 | 9 | 513K | $0.70 | bash dominates (npm install/typecheck tails 45–51K) |
| CONTEXT_GROWTH | 3 | 3 | 0 | $0 | amplifier only |

RETRY_STORM's original 5 findings were the same artifact (distinct failed edits to one file grouping by path); true identical-input retry storms still detect. The `edit`/`write` normalizers in `session-audit/src/parser.mjs` now include the edits/content payload: findings 231 → 84, headline 1,515K → 1,375K.

```text
DUP_TOOL_CALL      ████████████████████████████████████████████████████  26 sess /  $0.89
BIG_TOOL_OUTPUT    ████████████████████████████████████                 9 sess /  $0.70
CONTEXT_GROWTH     (0 waste — amplifier)                                 3 sess /   $0
```

## Projects by waste

```text
bkoi-gl-js              ██████████████████████████████████████████████████  643K / $0.90
dropx-merchant          █████████████████████                               274K / $0.06
react-bkoi-gl           ████████████████████                                249K / $0.33
barikoi-admin-nextjs    █████████████                                        158K / $0.22
pickaboo-frontend       ███████████                                          96K / $0.13
dropx-admin             ██████                                               57K / $0.07
```

Dollar/token rankings disagree sharply for **dropx-merchant**: #2 by tokens (274K) but #5 by dollars ($0.06) — those sessions ran cheaper models, so its priority is lower than the token rank suggests. The dollar order is the one to act on.

## Cache hit-ratio distribution

```text
>=0.95    ██████████████████████████████████████████████████  58 sessions
no cache  ██                                                  3 sessions
```

Degenerate (cacheWrite logged as 0) — no cache-health signal available. Recorded under "stats this report wanted and could not get": any cache-side waste measurement.

## Trend by date

```text
earlier 08-30→09-02  ████████████████████████████████  596K / 0.71%
later   09-03→09-13  ██████████████████████████████████████████████  918K / 0.74%
```

vs. previous report (2026-09-06, 19 sessions): waste rate improved 1.13% → 0.73%; absolute waste grew only because the window grew (57M → 208M read). Rate is roughly flat within this window (0.71% → 0.74%).

## Batching (tool calls per assistant turn)

3,403 calling turns · 4,251 calls · **avg 1.1/turn · 94% single-call** · 5% two-call · 0% 3+. Worst: `01a0573a…` (dropx-merchant) 155/155 one-call, `01a09a4f…` (barikoi-admin) 65/65, `01a056e0…` (react-bkoi-gl) 70/70. Each single-call turn re-sends the whole prefix. Caveat: single tool call ≠ unbatched work — `&&`-chaining inside one bash call still batches commands; this measures harness-level round-trips.

```text
1-call turns   ██████████████████████████████████████████████  94%
2-call turns   ███                                             5%
3+ call turns  █                                                0%
```

## ast-grep discipline

**16 ast-grep/sg calls across 2 of 61 sessions; `rg` in bash in 47 sessions — 45 sessions rg-but-never-ast-grep.** The AGENTS.md "ast-grep first for construct-shape search" rule is largely unpracticed (rule since strengthened with this measurement).

## Tool detail (calls · errors · dup linkage)

```text
bash    calls 2395  err  89  dup  32×  waste  45K
read    calls  446   err   5  dup  38×  waste 817K
edit    calls  691   err  60  dup   1×  waste   95
write   calls  119   err   0  dup   0×  waste    0
```

## Ranked fixes

1. **Whole-file re-reads while iterating on one large file** — habit.
   Evidence: session `01a0573a-303e-7e21-9558-263617b2d7fc` (dropx-merchant, pickup-location validation fix) reads `components/features/managePickupLocations/ManagePickupLocations.tsx` full-file ~6× plus 7 windowed reads; user's own framing: "need to check each possible pattern at this manage pickup location module, and fix". Session `01a09958-0d26-7114-b35a-d04c7e00c2e2` (pickaboo-frontend) shows the same shape (13 DUP).
   Cost: 817K tokens / ~$0.89 of read-dup waste — **~59% of headline**.
   Fix: never re-read a file already read this session; use `read` with offset/limit at the known anchor (AGENTS.md already prescribes this — it is followed for new files but violated during iterative fixes).
   Target metric: DUP_TOOL_CALL read-tool waste **816K → under 200K** by next audit.
   Inspect: `node ~/.pi/agent/skills/session-audit/bin/audit.mjs fetch 01a0573a-303e-7e21-9558-263617b2d7fc --kind user_text --limit 3 --max-bytes 500` (or the workdir runner equivalent).

2. **Uncapped build/npm output** — habit.
   Evidence: two 45–51K bash results in `01a07611-f8b8-7639-9172-0af2ab05d0aa` and `01a075a6-7f57-71d5-a800-898adfa36b9f` (npm install / typecheck tails); `npm run typecheck` executed twice in one turn in 01a075a6.
   Cost: 513K tokens / $0.70 — **34% of headline**.
   Fix: every verbose command gets `| rg … | head`; one typecheck per turn.
   Target metric: BIG_TOOL_OUTPUT **513K → under 150K**.

3. ~~**Edit-dup rule artifact in the session-audit skill**~~ — **APPLIED 2026-09-14** (`src/parser.mjs` normalizers for edit/write now hash the payload; also removed 5 false RETRY_STORM findings). Findings 231 → 84.

4. **Marathon sessions near the ceiling** — habit, low urgency.
   Sessions `01a07611…` (299 turns, peak 238K) and `01a05b46…` (303 turns, peak 212K, 1 compaction) amplify every later read/output. Split >250-turn sessions at milestones. Target: sessions with peak >150K stay at **≤3**.

5. **ast-grep rule unpracticed** — habit (rule strengthened 2026-09-14 with the 45/61 measurement and "mandatory, not optional" wording).
   Target metric: rg-but-never-ast-grep sessions **45 → under 20** by next audit.

6. **Single-call turns** — habit (rule extended 2026-09-14: batch independent tool calls into one turn, not just `&&` chains).
   Target metric: 1-call turn share **94% → under 80%**.

## Do this first

Fix #3 (the skill edit) was done first and is applied — permanent payoff, no discipline. Of what remains, #2 over #1: narrower (10 findings vs 38) and mechanical (always pipe, single typecheck). The two rule strengthenings (ast-grep mandatory-first, tool-call batching) are already in AGENTS.md; their effect shows in the next audit's window.

## Stats this report wanted and could not get

- Cache-write/caching waste (provider logs 0) — TTL and miss-rate blind.
- ~~Batching, ast-grep discipline, tool dup-linkage~~ — added to `views` mid-audit (2026-09-14); figures above are from the re-run.
- Command-level `&&`-batching rate inside bash calls (measured by `harness-engineer/scripts/audit_toolcall_rules.py`, not by this skill).
- Idle-gap resume cost: curve computable in turns but carries zero cache-creation volume.

## Audit self-cost (lower bound)

9 escalation fetches, 14,532 bytes logged (`fetch_log.jsonl`: 4/12,001 B original + 5/2,531 B verification re-run) — excludes Phase 1 landscape renders, driver-shim construction, and this reasoning layer's own turns.

## Validation addendum (2026-09-14, post-report)

- Fix #3 verified in `src/parser.mjs:183-187` — edit/write normalizers hash the `edits`/`content` payload.
- Runner note verified: `bin/audit.mjs` does not exist in the installed skill (only `SKILL.md` + `src/`) while SKILL.md documents `run`/`views`/`fetch` subcommands. The skill's own contract is broken — restore `bin/audit.mjs` before the next audit.
- BIG_TOOL_OUTPUT evidence verified exactly: top toolResults in `01a07611…` = 51,338 and 45,268 chars; `01a075a6…` = 51,339.
- Fix #1 evidence line corrected: session `01a0573a…` contains 2 identical full reads (one dup pair) plus 30 distinct windowed reads of `ManagePickupLocations.tsx` — not "~6 full + 7 windowed". Direction holds (whole-file re-read dups are the top bucket) but that session practiced windowing far more than stated; the 817K aggregate rests on persistence weighting across 26 sessions, which is plausible but was not re-derived here.
- ast-grep rule syntax verified against installed ast-grep 0.45.3 (`run -p` is valid usage).
- `bin/audit.mjs` **restored 2026-09-14** (same session, user-directed port per I7): `run`/`views`/`fetch` implemented against `src/` modules exactly as this file documents. Verified end-to-end: `run --max 25` → 46 findings with the active session excluded; `views` renders all 13 sections (incl. batching / ast-grep discipline / tool detail, added mid-audit); all fetch kinds byte-capped and logged to `fetch_log.jsonl`; clean error paths. One contract note: findings' `turnPointers` mix responseIds and toolCall ids, so `turn_window --uuid` now resolves either. Next audit runs the documented commands unmodified — no workdir shim needed.
- AGENTS.md updated 2026-09-14 from this validation: read-dup rule quantified (817K / 59%), `npm install --no-fund --no-audit | tail -5` capping, marathon-session milestone suggestion. Fixes #5 and #6 rules were already in place pre-validation.
