# Pi Harness Audit Report
Generated: 2026-08-28T14:58:51Z (local 2026-08-28T20:58:51+06:00)
CWD: /home/nurmdrafi/.pi/agent
Token estimate method: chars/4 (portable heuristic; no tokenizer was run — real counts typically ±15–25% of this estimate)

## 1. Executive Summary

- **permanent_tokens: ~1,463** (context 502 + skills catalog ~961) — down from **~2,467** at the previous audit (2026-08-28T14:28Z)
- context_files_count: **1** (AGENTS.md only); skill_count: **14** (was 15)
- **Harness Health Score: 95/100 (Good — minor polish only)** — previous: **50/100**
- Top 5 permanent token consumers:
  | # | Name | ~tokens |
  |---|------|---------|
  | 1 | AGENTS.md (whole file) | 502 |
  | 2 | systematic-debugging (description) | ~93 |
  | 3 | ponytail (description) | ~82 |
  | 4 | playwright-tester (description) | ~82 |
  | 5 | sdk-development (description) | ~82 |
- Risk assessment: low. The skills catalog was trimmed ~51% (desc chars 7,859→3,842); the worst offenders from last audit (sdk-development 261 tok, sdk-development-npm 258 tok, playwright-tester 187 tok, ponytail 168 tok) are all now ≤ ~93 tok. sdk-development-npm was merged into sdk-development per the merge-preference rule. No skill description exceeds 250 tokens; avg is ~69 tok.

## 2. Context Files Inventory

Checked (all missing unless listed): `~/.pi/agent/CLAUDE.md`, `SYSTEM.md`, `APPEND_SYSTEM.md` — absent. Ancestor walk from cwd: no `AGENTS.md`, `CLAUDE.md`, or `AGENTS.override.md` found. No project `.pi/` or `.agents/` dirs.

| Path | Lines | Chars | ~tokens | Summary |
|------|-------|-------|---------|---------|
| ~/.pi/agent/AGENTS.md | 42 | 2,008 | 502 | Behavioral rules + Ponytail ladder + communication/token-economy/safety/cadence rules + skill routing. Unchanged since last audit (stable prefix). |

Total context: 2,008 chars → ~502 tokens (≤800 → no deduction).

## 3. Skills Inventory

Discovery: `~/.pi/agent/skills/` only (14 valid SKILL.md). No `~/.agents/skills/`, no project skill dirs, no custom `skills` paths in settings.json.

| Name | desc chars | desc ~tok | body ~tok | Notes |
|------|-----------|-----------|-----------|-------|
| audit | 317 | 79 | 643 | OK |
| brainstorming | 261 | 65 | 2,441 | has scripts/ |
| browser-tools | 325 | 81 | 3,445 | desc was 622 → trimmed |
| frontend-design | 274 | 69 | 1,708 | desc was 411 → trimmed |
| harness-engineer | ~350 (folded) | ~85 | 804 | OK |
| map-integration | 320 | 80 | 1,437 | desc was 505 → trimmed |
| playwright-tester | 327 | 82 | 3,652 | desc was 746 → trimmed; largest body |
| ponytail | 329 | 82 | 1,501 | desc was 670 → now points to AGENTS.md ladder instead of restating |
| ponytail-review | 317 | 79 | 464 | desc was 472 → trimmed |
| refactoring-ui | 219 | 55 | 1,332 | OK |
| sdk-development | 327 | 82 | 3,450 | desc was 1,045; absorbed sdk-development-npm |
| skill-creator | 264 | 66 | 1,144 | desc was 664 → trimmed |
| systematic-debugging | 370 | 93 | 2,326 | largest desc, still < 100 tok |
| youtube-transcript | 191 | 48 | 150 | desc was 69 → added triggers (was vague) |

- Catalog (desc) total: **3,842 chars → ~961 tokens** (was 7,859 → ~1,965; **−51%**)
- Bodies (on-demand) total: ~25.9k tok across 14 skills — all ≤ ~3,700 tok, load on demand as designed
- Avg desc: **~69 tok** (was 131); max desc: ~93 tok (was 261). Zero descs > 250 tok (was 2). Zero > 100 tok (was 10).

## 4. Settings Snapshot

`~/.pi/agent/settings.json` (valid JSON, 254 B): theme dark, provider zai / model glm-5.2, thinking off, packages `pi-session-analyzer` + `pi-token-burden`, hideThinkingBlock. No custom `skills` paths. No project `.pi/settings.json`. `pi --version` 0.84.3. Prompt template: `prompts/commit.md` only. No changes since last audit.

## 5. Overlaps & Redundancy

1. ~~AGENTS.md ↔ ponytail duplicated ladder~~ — **resolved**: ponytail desc now references the always-on ladder rather than restating it.
2. ~~sdk-development ↔ sdk-development-npm near-twins~~ — **resolved**: merged into a single sdk-development skill (unique npm content preserved; changelog 2026-08-28).
3. ~~ponytail ↔ ponytail-review double surface~~ — boundary kept deliberately (review body exists only in ponytail-review); descriptions now tight enough (~80 tok each) that the cost is acceptable.
4. **AGENTS.md Skills section ↔ skill-creator desc** — the "load skill-creator first" rule is still stated twice. The AGENTS.md copy is the cheap always-on routing; acceptable, but the only remaining catalog redundancy (−5).

## 6. Score Breakdown

Start: **100**

| Check | Result | Deduction |
|-------|--------|-----------|
| Context size (all context files) | 502 tok ≤ 800 | −0 |
| Skills catalog | 14 skills (≤15); avg desc ~69 tok ≤ 100 | −0 |
| Any single desc > 250 tok | none (max ~93) | −0 |
| Progressive disclosure (huge body AND long desc) | 5 bodies > 2,000 tok but 0 descs > 100 tok | −0 |
| AGENTS.md ↔ skill duplication | ponytail ladder fixed; skill-creator rule still restated | −5 |
| Hygiene: empty/missing/vague descriptions | none; youtube-transcript triggers added | −0 |
| Hygiene: settings / discovery dir pollution | settings valid; **0** node_modules in skills (was 125 MB), 0 stray .zip (was 3), 0 ._* AppleDouble files (was ~30); skills/ total 556 KB | −0 |
| Portability quick-check | 0 hits for /Users/, /home/<user>, pbcopy, osascript, /opt/homebrew, launchctl in functional files | −0 |

**Total deductions: −5 → Score: 95/100 → Grade: Good — minor polish only**

## 7. Comparison to Previous Audit (2026-08-28T14:28Z)

| Metric | Previous | Current | Δ |
|--------|----------|---------|---|
| permanent_tokens (context + catalog) | ~2,467 | ~1,463 | **−1,004 (−41%)** |
| Harness Health Score | 50/100 (Fair) | **95/100 (Good)** | +45 |
| Skill count | 15 | 14 | −1 (sdk-development-npm merged) |
| Catalog desc tokens | ~1,965 | ~961 | −1,004 (−51%) |
| Avg desc tokens | 131 | ~69 | −47% |
| Max desc tokens | 261 | ~93 | −64% |
| Descs > 250 tok / > 100 tok | 2 / 10 | 0 / 0 | fixed |
| AGENTS.md | 2,008 B / 502 tok | unchanged | 0 (prefix-stable) |
| Skills dir size | ~125.6 MB | 556 KB | node_modules/zips/._ removed |
| Portability hits | some (AppleDouble, etc.) | 0 | fixed |

Extrapolating the earlier measured baseline (lean first-call prompt 2,557 tok; old full harness 5,731): the trimmed catalog predicts a full-harness first-call prompt of roughly 2,557 + 961 + ~700 scaffolding ≈ **~4,200 tok**, i.e. **−~1,500 tok on every API call** of every session vs the pre-trim state, re-sent each turn and partially offset by cache.

## 8. Remaining Opportunities (all optional)

1. skill-creator desc could drop its restated "load first" rule (~1 line, −20 tok) since AGENTS.md already routes it — marginal.
2. AGENTS.md at 502 tok is lean; no action.
3. Largest bodies (playwright-tester ~3.7k, browser-tools ~3.4k, sdk-development ~3.5k tok) are on-demand only — fine unless load frequency proves otherwise.

**Verdict: harness is healthy. No trim required; floor sits at ~1,463 tok with a stable 502-tok AGENTS.md prefix.**
