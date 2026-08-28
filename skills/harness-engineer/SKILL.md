---
name: harness-engineer
description: >
  Inspect, audit/score, diagnose, and improve THIS pi harness — architecture,
  AGENTS.md budget, skill catalog, token efficiency, portability; implement and
  log changes. Use when: "audit harness", "health score", "permanent tokens",
  "trim skills", "AGENTS.md budget", "improve the harness", "make pi portable",
  or when the harness feels bloated.
---

# Harness Engineer

Make **this** harness leaner, more cache-stable, and fully portable (macOS + Linux).
Evidence over opinion. Prefer deletion and lazy-loading.

## Non-negotiable principles

1. **Minimal core** — delete before add. Never bloat the permanent prefix.
2. **Cache is sacred** — system prompt + tool defs + AGENTS.md + skill *descriptions* must stay byte-stable for a session. Prefer a fresh session after prefix changes.
3. **rg first** — code navigation via `rg`. Bash only for real side-effects (tests, builds, git, package managers).
4. **Progressive disclosure** — skills expose only name + description; bodies load on demand.
5. **Portability** — no absolute user paths in functional files (`~` / `$HOME` only). No unguarded OS-only commands. No pi env vars for config location (default `~/.pi/agent`).
6. **Never move permanent behavioral rules** out of `AGENTS.md` into this skill or other skills.

## Snapshot loop (mandatory)

Before any edit and again at the end, capture:

```sh
wc -c ~/.pi/agent/AGENTS.md
# skill count + description byte sizes
ls ~/.pi/agent/prompts/*.md 2>/dev/null | wc -l
# portability hits (see check below)
```

Report BEFORE → AFTER for every field. No improvement claim without a number.

## Scope

- `~/.pi/agent/` (and project `.pi/`): `AGENTS.md`, `settings.json`, `models.json`, skills, prompts
- `HARNESS-ARCHITECTURE.md`, `CHANGELOG.md`, `skills-audit.md` — the living map; re-read before any change

If `HARNESS-ARCHITECTURE.md` is missing, create a minimal version first.

## Audit mode

One skill covers the full loop: inspect → audit/score → diagnose → change → measure → log. Audit-only mode: **do not modify any files** (except writing the report) unless the user asks.

1. **Inventory** (chars/4 as token heuristic):
   - Context files: `AGENTS.md` (+ any always-loaded file) byte size → tokens.
   - Every skill: `description` field char count → tokens (extract frontmatter only, never load bodies).
   ```sh
   wc -c ~/.pi/agent/AGENTS.md
   awk '/^description:/{f=1;next} /^---/{f=0} f' ~/.pi/agent/skills/*/SKILL.md | wc -c
   ```
2. **Compute permanent floor** = context tokens + Σ skill-description tokens.
3. **Health Score** — start at 100, deduct (same rules as 2026-08-28 audit):
   - context > 800 tok: −10; skill count > 15: −10
   - any single desc > 250 tok: −10; avg desc > 100 tok: −10
   - huge body (>2,000 tok) AND long desc (>100 tok): −5 per skill (progressive-disclosure failure)
   - AGENTS.md ↔ skill rule duplication: −5 per overlap
   - vague/missing descriptions: −5 each; skills-dir pollution (node_modules, .zip, ._*): −5 each class
   - portability quick-check hits in functional files: −5 per class
4. **Write `harness-audit-report.md`** — same structure as the 2026-08-28 report: executive summary, inventory table, top consumers, overlaps, score breakdown, comparison to previous report if present (delta per metric).
5. Report BEFORE → AFTER numbers; recommendations ranked by impact. Implement only on request, then log per *Workflow* step 5.

## Workflow

1. **Discover** — list loaded context files, skills (name + desc + path), prompts, non-portable items. Re-read `HARNESS-ARCHITECTURE.md`. Capture BEFORE snapshot.
2. **Diagnose** — rank by impact: unused/overlapping skills, AGENTS.md bloat that belongs in a skill, bash-used-for-search, non-portable paths, unstable prefix material.
3. **Propose** — prefer deletions/merges. For each change: path, before→after, why (cache/tokens/portability), risk, rollback.
4. **Implement** — only approved/safe edits. Ask before destructive or large writes. Tell user to start a fresh session after prefix changes.
5. **Persist** — append dated entry to `CHANGELOG.md` (include `Measured:` before→after). Update `HARNESS-ARCHITECTURE.md` or `skills-audit.md` when architecture or skill set changes.

Optional deep evidence (only when user asks for skill-usage audit):

- pi sessions: `~/.pi/agent/sessions/*/*.jsonl` — skill loads, `/skill:` invocations, correction words
- Rank skills: auto-load vs explicit vs never fire

## Portability quick-check

```sh
rg -n '/Users/|/home/|pbcopy|pbpaste|osascript|/opt/homebrew|launchctl' \
  ~/.pi/agent/AGENTS.md ~/.pi/agent/settings.json ~/.pi/agent/models.json \
  ~/.pi/agent/*.sh ~/.pi/agent/prompts/ ~/.pi/agent/skills/ \
  --glob '!**/harness-engineer/**' --glob '!**/node_modules/**'
```

Zero hits required in functional files.

## Output format

- BEFORE snapshot
- Problems (by impact)
- Recommended changes (diffs + risk)
- Actions taken
- AFTER snapshot + delta
- Portability status
- Changelog entry (`Measured:` line required)

## Goal

Smaller, more stable, cache-friendly, rg-first, fully portable harness.
