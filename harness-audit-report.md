# Pi Harness Audit Report

Generated: 2026-08-31 (local)
CWD: ~/.pi/agent
Token estimate method: chars/4 (description values incl. YAML quoting, ±2%; real prefix measured separately from session logs)

## 1. Executive Summary

- **Permanent floor: ~1,356 tok** (context 365 + skill catalog ~991) — down ~140 tok vs 2026-12-17 report (~1,496), matching the AGENTS.md slim + desc trims exactly (theory predicted −151).
- **Measured real first-turn prompt: ~4,881 tok** (session 2026-08-31T14-52) — pi system prompt dominates; harness-controlled share is only ~1,356.
- Context files: **1** (AGENTS.md, byte-stable at 1,460 B). Skills: **14**. Prompts: 1. Scripts: 1 (usage-metrics.py, added today).
- **Harness Health Score: 90/100 (Good)** — −5 ponytail ladder overlap (standing ruling), −5 skills-dir node_modules (installed this session, gitignored).
- New capability since last audit: `scripts/usage-metrics.py` gives measured token evidence (per-model profile, cost tail, prefix trend) — replaces chars/4 guesswork for usage questions.

## 2. Context Files Inventory

| Path | Bytes | ~tokens | Summary |
|------|-------|---------|---------|
| ~/.pi/agent/AGENTS.md | 1,460 | 365 | Behavioral Core + comms/token-economy/safety/cadence. Ponytail ladder merged into one bullet. |

Total context: 365 tok (≤800 → no deduction).

## 3. Skill Catalog Inventory

14 skills, all frontmatter-valid (spec check passed this session). Total desc ~3,964 chars (~991 tok), avg 283 chars (~71 tok).

| Skill | Desc chars | ~tok | Body bytes | ~body tok |
|-------|-----------|------|-----------|-----------|
| sdk-development | 333 | 83 | 14,338 | 3,585 |
| playwright-tester | 331 | 83 | 15,119 | 3,780 |
| browser-tools | 329 | 82 | 14,203 | 3,551 |
| ponytail | 327 | 82 | 6,434 | 1,609 |
| audit | 321 | 80 | 2,954 | 739 |
| ponytail-review | 321 | 80 | 2,232 | 558 |
| map-integration | 320 | 80 | 6,155 | 1,539 |
| frontend-design | 276 | 69 | 7,206 | 1,802 |
| systematic-debugging | 275 | 69 | 9,649 | 2,412 |
| brainstorming | 267 | 67 | 10,114 | 2,529 |
| harness-engineer | 235* | 59 | 5,246 | 1,312 |
| refactoring-ui | 225 | 56 | 5,742 | 1,436 |
| skill-creator | 213 | 53 | 4,876 | 1,219 |
| youtube-transcript | 191 | 48 | 837 | 209 |

*folded block-scalar desc (valid YAML, spec-compliant).
Body total: ~105 KB — all on-demand only.

Bodies >2,000 tok: playwright-tester, sdk-development, browser-tools, brainstorming, systematic-debugging — all with desc ≤83 tok → progressive disclosure holds (no deduction).

## 4. Overlaps / Issues

1. **Ponytail ladder** in AGENTS.md, deferred-to (not restated) by ponytail skill → −5 (consistent with both prior audits; deliberate design).
2. `skills/browser-tools/node_modules` (210 pkgs, installed this session for web research) — gitignored (`**/node_modules/`), documented as on-demand deps in the skill itself → −5 per pollution rule; regenerable via `npm install`.
3. `ponytail` declares non-standard `argument-hint` frontmatter — pi ignores unknown fields; cosmetic only.
4. No stale `~/.pi/agent/npm` cache (removed in earlier cleanup, confirmed absent).

## 5. Portability

`rg '/Users/|/home/|pbcopy|pbpaste|osascript|/opt/homebrew|launchctl'` over AGENTS.md, settings.json, models.json, prompts/, skills/, scripts/ (excl. harness-engineer, node_modules): **0 hits** ✅. New script uses `Path.home()`. Fully portable (macOS + Linux).

## 6. Score Breakdown

| Rule | Result | Deduction |
|------|--------|-----------|
| Context > 800 tok | 365 | 0 |
| Skill count > 15 | 14 | 0 |
| Any desc > 250 tok | max 83 | 0 |
| Avg desc > 100 tok | ~71 | 0 |
| Body >2,000 tok AND desc >100 tok | none | 0 |
| AGENTS.md ↔ skill duplication | ponytail ladder | −5 |
| Vague/missing descriptions | none | 0 |
| Skills-dir pollution | browser-tools/node_modules | −5 |
| Portability hits | 0 | 0 |

**Total deductions: −10 → Score: 90/100 → Grade: Good**

## 7. Comparison to Previous Report (2026-12-17)

| Metric | Previous | Current | Delta |
|--------|----------|---------|-------|
| Health Score | 95 | 90 | −5 (node_modules class) |
| Permanent tokens | ~1,496 | ~1,356 | **−140** |
| Context tokens | 502 | 365 | −137 (AGENTS.md slim) |
| Skill count | 14 | 14 | 0 |
| Desc chars | 3,977 | 3,964 | −13 (desc trims; method variance) |
| Portability | 0 hits | 0 hits | 0 |
| Measured prefix evidence | none | usage-metrics.py | new |

## 8. Recommendations (ranked)

1. *(Optional, restores 95)* `rm -rf skills/browser-tools/node_modules` — gitignored runtime state; reinstall on next browser task. Disk hygiene + score.
2. *(Optional, cosmetic)* Drop `argument-hint` from ponytail frontmatter → move to body. Strict-spec conformance, zero behavior change.
3. **No trimming.** Prefix at floor; measured evidence (usage-metrics.py) shows cost lives in reasoning output and session tails, not harness bytes. Do not chase minimum.

No changes made this audit (audit-only mode).
