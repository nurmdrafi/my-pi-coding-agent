# Session Audit — last `agent` session (why 115K in / 83K out), 2026-10-06

sessionsDir: `~/.pi/agent/sessions` · scope: **project `agent` (`/Users/nur/.pi/agent`), newest session** · session `01a10f9a-c113-75c4-b8d7-b79762ea5bc9`, 2026-10-06, 74 apiTurns, glm-5.3 · report 2026-10-06T055104Z

## The answer

- **83K output** = 74 turns × ~1.1K tokens/turn of assistant prose **plus reasoning tokens** (glm-5.3 thinking is visible-but-unpriced in the waste model). Fetched assistant heads confirm verbose multi-paragraph narration per turn; the session was a chain of repo-maintenance chores (rename audit files, gitignore/watermark.json decisions, `skills-audit.md` placement, commits, push).
- **115K input** = an 80K-peak context that grew turn by turn plus tool outputs from 92 tool calls (8.33MB bash + 7.66MB read were directory-wide; this session's calls were mostly small edits/git). Cache absorbed the re-sent prefix: **cacheRead 3.34M, hitRatio 1.0, cacheWrite 0** — nothing here is TTL-expiry or cache-miss waste.
- **Modeled waste in this session: 11K tokens ≈ $0.016** — 3 DUP_TOOL_CALL findings, the worst being `README.md` read 3× (repeatBytes 3,952).
- Driver: **37 of 64 tool-turns were single-call**, matching five rapid-fire micro-prompts in ~8 minutes (fetched user_text). Each round-trip re-rides the ~45K average prefix and elicits another ~1K-token narrated reply.

**This session was not anomalous.** 74 round-trips × (cache-read prefix + fresh tokens + ~1.1K output incl. reasoning) is exactly the arithmetic of 115K in / 83K out. The cache is working perfectly; the volume is conversation length, not waste.

Verify:
`node ~/.pi/agent/skills/session-audit/scripts/audit.mjs fetch 01a10f9a-c113-75c4-b8d7-b79762ea5bc9 --kind user_text --limit 5 --max-bytes 800`

## Project `agent` context (all 43 sessions, 2026-08-30 → 2026-10-06)

read 56.0M · waste 235K = **$0.32** · share of read volume 0.42% (vs 0.54% directory-wide) — the healthiest-ish major project in the directory.

```text
DUP_TOOL_CALL     ████████████████████████████████████████████████  16 sess / $0.32
BIG_TOOL_OUTPUT   ██                                                 1 sess /  $0.00
RETRY_STORM       ▏                                                  1 sess / <$0.01
```

Worst agent sessions: `01a10b16-236d-7718-a211-2fa90bc4a248` (54K/$0.08, DUP×8 — incl. re-reading `extensions/permission-gate.ts` twice at 10.3K) and `01a0e2ae-6030-7034-8279-4e6c0235601b` (36K/$0.05). The recurring dup-read target across this repo's sessions is **`extensions/permission-gate.ts`** (4 sessions) — the file is large and gets re-read instead of trusted from context.

## Ranked fixes

1. **Trust already-read lines in context** (habit). Evidence: README.md ×3 in one session; `permission-gate.ts` re-read in 4 sessions. Cost: 226K / $0.32 across project — small. Target: project DUP_TOOL_CALL 226K → under 100K by next audit.
2. **Batch chore micro-prompts** (habit). Five separate prompts in 8 minutes for one cleanup task. Cost: not priced as waste (cache absorbed it) but drives both the 83K output and round-trip count. Target: agent-project one-call-turn share 87% → under 60%.
3. **No config or skill fix warranted** — hitRatio 1.0, no TTL findings, no cacheWrite anywhere in the digest. Nothing to change.

**Do this first:** nothing urgent — this project's total modeled waste is $0.32 in five weeks. If anything, fix #1 is free discipline already mandated by your own AGENTS.md token-economy rules.

## Trend

Prior full-directory report (2026-10-05): 382 findings / 4,366K / $4.89 across 177 sessions. Today: 412 findings / 4,519K / $5.10 across 191 — **steady, no regression** (waste rate 0.55% → 0.54%).

## Stats this report wanted and could not get

- Per-session **output token total** and **reasoning-token split** — `views` exposes cacheRead/waste only, so the 83K output figure was reconciled arithmetically (74 turns × ~1.1K), not read directly.
- Exact non-cached **input** breakdown for the session (115K is the user-quoted figure; digest shows cacheRead 3.34M / peak 80K).
- One narrow jq query into `overview.json` for the session row was run (transcript cost unlogged, per skill note).

## Audit self-cost

2 fetches (user_text ×1, assistant_head ×1), 327 bytes logged — **lower bound**: excludes the Phase-0/1 `run`/`views` passes and this agent's own reasoning turns.
