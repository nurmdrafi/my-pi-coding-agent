# Session Audit — 2026-09-19T15:10:00Z (focus: discoverthreejs)

**sessionsDir** `~/.pi/agent/sessions` · 84 sessions digested (2026-08-09 → 2026-09-08), 2 active excluded · deliverable focus: `/home/nurmdrafi/Desktop/MyProject/discoverthreejs`

## Scope note (read first)

The one discoverthreejs session (`01a0b5ae-7f8c-7419-ab5c-2c6df881971c`, started 2026-09-18T18:01Z, file 348KB, last write minutes before this audit) is **excluded from the digest as active** — it is still open. All numbers below for it come from the sanctioned `fetch` interface (5 fetches, ~11.7KB returned), not the rule engine. Re-run this audit after closing that session for rule-priced figures.

## Directory totals (digest window)

- cacheRead 310.8M · cacheWrite 0.0M · hitRatio 1.000 · compactions 5
- findings 67 · headline waste **1347K tokens ≈ $0.94** (heuristic floor; waste = 0.43% of read volume)
- Unpriced models (auto, claude-opus-4-8, kiro/claude-sonnet-4.5, oc/deepseek-v4-flash-free): 100% of waste carries a price here; reasoning tokens and compaction re-sends remain unpriced by the waste model.

### Findings by rule

| rule | n | sessions | tokens | usd |
|---|---|---|---|---|
| BIG_TOOL_OUTPUT | 17 | 12 | 936K | $0.55 |
| DUP_TOOL_CALL | 48 | 21 | 411K | $0.39 |
| CONTEXT_GROWTH | 2 | 2 | 0 (amplifier) | $0 |

```text
BIG_TOOL_OUTPUT   ████████████████████████████████████████████████  12 sess /  $0.55
DUP_TOOL_CALL     ████████████████████                             21 sess /  $0.39
CONTEXT_GROWTH    ▏ (amplifier, unpriced)                           2 sess /   $0
```

### Projects by waste

| project | sess | turns | read | waste | usd |
|---|---|---|---|---|---|
| react-bkoi-gl | 8 | 2011 | 215.4M | 939K | $0.60 |
| barikoi-admin-nextjs | 8 | 318 | 14.4M | 198K | $0.19 |
| agent (~) | 27 | 1250 | 43.7M | 153K | $0.11 |
| dropx-merchant | 1 | 58 | 1.9M | 34K | $0.03 |
| dropx-admin | 5 | 293 | 11.8M | 10K | <$0.01 |

```text
react-bkoi-gl          ████████████████████████████████████████████  939K / $0.60
barikoi-admin-nextjs   ██                                             198K / $0.19
agent (~)              █                                              153K / $0.11
dropx-merchant         ▏                                               34K / $0.03
dropx-admin                                                            10K / <$0.01
```

Token and dollar rankings agree here; react-bkoi-gl dominates both (70% of all cache-read volume).

### Trend by date

```text
08-09→08-25   ████████████████████  44 sess · 466K waste · 0.56% of read
08-26→09-08   ████████████████████████████████████████████  40 sess · 881K waste · 0.39% of read
```

Waste **rate** improving (0.56% → 0.39%) but absolute waste and volume both ~doubled (83.5M → 227.3M read).

### Cache hit-ratio distribution

```text
>=0.95   ████████████████████████████████████████████████  75 sessions
no cache (zero volume)                                    9 sessions
```

Cache behavior is healthy (1.000 hit ratio, zero cacheWrite — TTL expiry contributes nothing). The cost story is prefix size, not caching.

## The discoverthreejs session (fetch-based, not rule-priced)

Session `01a0b5ae-7f8c-7419-ab5c-2c6df881971c`, ~6.5h span (13:19 → 15:03 user messages on 2026-09-19), single still-open session. Observed structure:

1. **Long book excerpts pasted as user messages.** Three user turns at 13:27–13:31 each carry multi-hundred-word Discover Three.js chapter text (camera projections, BufferGeometry, geometry-vs-material). Every subsequent cheap ask re-pays that pasted text through the prefix for the rest of the session.
2. **A monotonically growing README is the working surface.** The session is ~20 sequential "include deep dive X at readme" requests (world space, cameras, geometry/material, modular refactor, js-docs, resizer). README.md grew past offset 443 by 15:03 and gets re-windowed (`read offset 443 limit 30`, `rg -n "^## "`) before nearly every edit.
3. **Hook-blocked bash retries.** Four `error_head` hits are the Token Economy hook rejecting `sed`/`cat` standalone reads — each is a wasted round-trip followed by the correct `read` call.
4. Good behavior present: edits are heavily batched (8 `edit` calls in one turn at 14:06:10).

**Verdict on "simple task consuming more tokens":** the tasks are genuinely small (one README section each), but they run inside one long-lived session whose prefix contains pasted book chapters + the entire session history + a large README that is re-read before each edit. Session age, not any single call, is the multiplier. Same shape as the react-bkoi-gl marathons below.

## Ranked fixes

1. **One chapter = one session** (habit) — evidence: discoverthreejs fetches above; react-bkoi-gl `01a05313-e237-74a9-b25c-66de12154716` (322 turns, peak 352K = 1.76× ceiling, user asks "commit and push" / "update changelog v3"); `01a03d76-bbee-7699-8509-b794f63530dc` (436 turns, peak 254K). Cost: ~70% of digest waste (939K of 1347K) sits in marathon sessions; unpriced prefix re-send cost is larger than all rule waste. Target: no session above 150K peak context in discoverthreejs; `CONTEXT_GROWTH` stays at 0.
   Check: `node ~/.pi/agent/skills/session-audit/bin/audit.mjs fetch 01a05313-e237-74a9-b25c-66de12154716 --kind user_text --limit 3 --max-bytes 500`
2. **Stop re-reading files already in context** (habit) — evidence: `read` dup 31× / 401K dupWaste directory-wide; `01a03992-7940-7f74-8499-d2b48162050e` re-read one 4,585-byte file 5 times (44.9K waste); discoverthreejs re-windows README.md before each edit. Cost: ~30% of headline waste. Target: `DUP_TOOL_CALL` 411K / $0.39 → under 150K; per-session read-dup count ≤ 2.
3. **Respect the Token Economy hook on first try** (habit) — evidence: 4 sed/cat rejections in the discoverthreejs session; 155 bash errors directory-wide. Cost: small in tokens, real in round-trips. Target: zero "Token Economy (Reading)" entries in `error_head`.
4. **Cap verbose build/test output** (habit, directory-wide) — evidence: `BIG_TOOL_OUTPUT` 936K / $0.55 across 12 sessions; repeated `nohup npm run coverage` + `sleep 85` polling cycles in react-bkoi-gl (`bkoi-coverage3.log` then `4.log` minutes apart); 51KB bash outputs twice. Target: `BIG_TOOL_OUTPUT` 936K → under 300K.

**Do this first:** fix #1 — it is pure discipline with zero edits, applies to the exact complaint (simple tasks costing too much), and multiplies every other saving; there is no skill/config edit in this project that pays comparably. Runner-up if you want a one-time edit: the newly created `discoverthreejs/AGENTS.md` (written this session at 14:12) — add one line to it: *"One book chapter per session; close and restart between chapters; do not re-read README.md sections already shown this session."* That converts fix #1 from discipline into enforcement for this repo.

## Trend vs archive

Previous report (2026-09-15T090800Z.md): directory-wide 1,739K / $1.55, 0.46% of read, marathon sessions flagged as worsening. Today's digest (different window: 08-09→09-08): 1,347K / $0.94, 0.43%. Rate steady-to-improving; the marathon-session pattern flagged on 09-14 and 09-15 is unchanged and is exactly what the discoverthreejs session repeats.

## Stats this report wanted and could not get

- Rule-priced findings for the discoverthreejs session (excluded as active by the runner — by design).
- Per-user-message token mass (to price the pasted book excerpts) — not emitted by `views` or `fetch` kinds.

## Audit self-cost (lower bound)

5 escalation fetches, ~11.7KB returned (`fetch_log.jsonl`). Excludes Phase-1 `views` output and this session's own reasoning turns.
