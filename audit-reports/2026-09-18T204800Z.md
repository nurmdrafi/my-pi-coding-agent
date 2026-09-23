# Harness Audit — 2026-09-15

## Executive summary

Harness is portable and lean. Zero portability hits. Only 2 of 17 skills are
model-visible (`ponytail`, `tavily-search`) — description/session mismatch cannot
confuse the model for the other 15 (all `disable-model-invocation: true`, user-invoked
via `/skill:` only). Health score **75/100** (context 1,080 tok, 17 skills, one
AGENTS↔skill overlap). One edit made: ponytail description trimmed.

## Inventory (BEFORE → AFTER)

| item | BEFORE | AFTER |
|---|---|---|
| AGENTS.md | 4,321 B ≈ 1,080 tok | unchanged |
| skills | 17 | 17 |
| Σ descriptions | 5,224 c ≈ 1,306 tok | 5,198 c ≈ 1,300 tok |
| largest desc | tavily-extract 479 c (~120 tok) | unchanged |
| ponytail desc | 424 c (~106 tok) | **398 c (~99 tok)** |
| prompts | 1 (`commit.md`) | unchanged |
| portability hits | 0 | 0 |

Permanent floor (model-visible): AGENTS.md 1,080 + ponytail 99 + tavily-search 222/4≈56
≈ **1,235 tok**. Disabled skills cost zero prefix.

## Score breakdown

| rule | delta |
|---|---|
| context > 800 tok | −10 (1,080 tok) |
| skill count > 15 | −10 (17) |
| any desc > 250 tok | 0 |
| avg desc > 100 tok | 0 (avg ~77 tok) |
| PD failure (huge body + long desc) | 0 |
| AGENTS ↔ skill duplication | −5 (ponytail ladder: intended — floor in AGENTS.md, detail on skill load) |
| vague desc / pollution / portability | 0 |
| **total** | **75** |

## Usage evidence (`skill_usage_audit.py`)

High: browser-tools 7, session-audit 5, ponytail-review 4, sdk-development 4,
harness-engineer 3, tavily-search 3. Low: frontend-design 2, brainstorming/map-integration/ponytail/skill-manager 1 each.
**Unused: fallow-audit, refactoring-ui, systematic-debugging, tavily-extract, youtube-transcript (0 each — all disabled-invocation, so zero prefix cost).**

## Actions taken

- `skills/ponytail/SKILL.md`: description 424→398 c; removed ladder restatement
  (lives in AGENTS.md), kept all fire cues (user words + over-engineering smells)
  and now says what loading adds (full rules, when-NOT-to-be-lazy, intensity table).

## Recommendations (not implemented — need approval)

1. **Archive the 5 unused skills** → skill count 17→12 (score +10). Saves ~0 prefix
   tokens (all disabled); benefit is catalog clarity only. Risk: `frontend-design` and
   `brainstorming` descriptions cross-reference `refactoring-ui`/`systematic-debugging`
   — update those pointers if deleted.
2. AGENTS.md at 1,080 tok is 35% over the 800-tok line but dense and audit-driven;
   further cuts would delete measured rules. Recommend leaving until next audit shows waste from it.

## Portability status

PASS — `rg '/Users/|/home/|pbcopy|osascript|/opt/homebrew|launchctl'` over AGENTS.md,
settings, models, prompts, skills (excl. harness-engineer/node_modules): zero hits.
Skill bodies reference `<skill-dir>`/`$HOME` only.

Start a fresh session for the ponytail description change to take cache-stable effect.
