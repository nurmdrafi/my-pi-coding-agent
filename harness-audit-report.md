# Pi Harness Audit Report

Generated: 2026-12-17 (local)
CWD: ~/.pi/agent
Token estimate method: chars/4 (portable heuristic; real counts typically ±15–25%)

## 1. Executive Summary

- **Permanent tokens: ~1,496** (context 502 + skill catalog ~994) — unchanged vs 2026-08-28 report (~1,463; delta within counting-method noise)
- Context files count: **1** (AGENTS.md only); skill count: **14** (limit 15 → no deduction)
- **Harness Health Score: 95/100 (Good — minor polish only)** — same as previous (95)
- Config change since last audit: both extension packages (`npm:pi-session-analyzer`, `npm:pi-token-burden`) removed from `settings.json` per user request. No `~/.pi/agent/extensions` dir exists. Stale package cache remains at `~/.pi/agent/npm`.

## 2. Context Files Inventory

| Path | Chars | ~tokens | Summary |
|------|-------|---------|---------|
| ~/.pi/agent/AGENTS.md | 2,008 | 502 | Behavioral rules + Ponytail ladder + comms/token-economy/safety/cadence + skill routing. Byte-stable since last audit. |

Total context: 502 tok (≤800 → no deduction).

## 3. Skill Catalog Inventory

14 skills, all with frontmatter descriptions; total description chars 3,977 (~994 tok), avg ~284 chars (~71 tok).

| Skill | Desc chars | ~desc tok | Body bytes | ~body tok |
|-------|-----------|-----------|-----------|-----------|
| systematic-debugging | 370 | 93 | 9,746 | 2,437 |
| harness-engineer | 350 | 88 | 5,183 | 1,296 |
| ponytail | 329 | 82 | 6,438 | 1,610 |
| sdk-development | 327 | 82 | 14,338 | 3,585 |
| playwright-tester | 327 | 82 | 15,119 | 3,780 |
| browser-tools | 325 | 81 | 14,203 | 3,551 |
| map-integration | 320 | 80 | 6,155 | 1,539 |
| audit | 317 | 79 | 2,954 | 739 |
| ponytail-review | 317 | 79 | 2,232 | 558 |
| frontend-design | 274 | 69 | 7,206 | 1,802 |
| brainstorming | 261 | 65 | 10,114 | 2,529 |
| refactoring-ui | 219 | 55 | 5,742 | 1,436 |
| skill-creator | 213 | 53 | 4,876 | 1,219 |
| youtube-transcript | 191 | 48 | 837 | 209 |

Top consumers of permanent budget: AGENTS.md (502), systematic-debugging (93), harness-engineer (88), ponytail/playwright-tester/sdk-development (82 each).

Bodies >2,000 tok: playwright-tester, sdk-development, browser-tools, brainstorming, systematic-debugging, frontend-design — all with descs ≤100 tok, so progressive disclosure holds (bodies load on demand only; no deduction).

## 4. Overlaps / Issues

1. **Ponytail ladder duplicated** in AGENTS.md and referenced (not restated) in ponytail skill — deliberate, skill explicitly says "do not restate" → −5 (same ruling as last audit).
2. `~/.pi/agent/npm` package cache is stale (packages removed). Not a prefix cost; disk only.
3. Descriptions show mild growth vs last audit (3,842 → 3,977 chars); within noise/no action.

## 5. Portability

`rg '/Users/|/home/|pbcopy|pbpaste|osascript|/opt/homebrew|launchctl'` over AGENTS.md, settings.json, models.json, prompts/, skills/ (excl. harness-engineer): **0 hits**. ✅ Fully portable.

## 6. Score Breakdown

| Rule | Result | Deduction |
|------|--------|-----------|
| Context > 800 tok | 502 | 0 |
| Skill count > 15 | 14 | 0 |
| Any desc > 250 tok | max 93 | 0 |
| Avg desc > 100 tok | ~71 | 0 |
| Body >2,000 tok AND desc >100 tok | none | 0 |
| AGENTS.md ↔ skill duplication | ponytail ladder | −5 |
| Vague/missing descriptions | none | 0 |
| Skills-dir pollution | none | 0 |
| Portability hits | 0 | 0 |

**Total deductions: −5 → Score: 95/100 → Grade: Good — minor polish only**

## 7. Comparison to Previous Report (2026-08-28)

| Metric | Previous | Current | Delta |
|--------|----------|---------|-------|
| Health Score | 95/100 | 95/100 | 0 |
| Permanent tokens | ~1,463 | ~1,496 | +33 (counting noise) |
| Context tokens | 502 | 502 | 0 |
| Skill count | 14 | 14 | 0 |
| Portability | 0 hits | 0 hits | 0 |
| Extension packages | 2 | 0 | −2 |

## 8. Recommendations (ranked)

1. *(Optional)* Delete `~/.pi/agent/npm` cache — disk hygiene only, no token effect.
2. *(Optional)* Shave top-3 descriptions (systematic-debugging, harness-engineer, ponytail) by ~30% → saves ~80 permanent tokens. Marginal; not recommended unless chasing minimum.

No changes made this audit (audit-only mode). Harness is lean and stable.
