---
name: harness-engineer
description: >
  Inspect, diagnose, and improve THIS pi harness — leaner AGENTS.md, stable
  prefix, token efficiency, skill discipline, full macOS/Linux portability.
  Use when: "audit my config", "improve the harness", "make pi portable",
  "reduce token usage", "tune AGENTS.md/skills/settings", or when the
  harness feels bloated or non-portable.
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
- `HARNESS-ARCHITECTURE.md`, `CHANGELOG.md`, `skills-audit.md`

If `HARNESS-ARCHITECTURE.md` is missing, create a minimal version first.

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
