# my-pi-coding-agent

Personal [pi coding agent](https://github.com/earendil-works/pi-coding-agent) harness — a
single portable `~/.pi/agent/` directory, synced via this git repo between machines.

**What you get:** a lean always-on behavioral core (AGENTS.md), 14 progressive-disclosure
skills, prompt templates, and an audit methodology that keeps the permanent token floor
~1.3K tokens. No env vars, no absolute paths — clone anywhere on macOS/Linux.

**Quick start (new machine):**

```sh
git clone <repo> ~/.pi/agent
cp office:~/.pi/agent/auth.json ~/.pi/agent/   # or /login per provider (secrets never in git)
mv ~/.agents/skills ~/.agents/skills.disabled.$(date +%Y%m%d-%H%M%S) 2>/dev/null  # stop legacy dir leaking
pi   # first run regenerates bin/, npm/, models-store.json
```

Requires Node LTS ≥ 22 (`.nvmrc` pins it). Full details below.

---

# Harness Architecture — current state (living doc)

Map of this pi harness. Re-read at the start of any harness-engineering session.
Update when structure, skill set, or always-on budget changes.

Last updated: 2026-12-17

## Portable unit

`~/.pi/agent/` — single directory to zip, sync, and restore on any macOS/Linux box.
No env vars; default path only.

```
~/.pi/agent/
├── AGENTS.md                 # ALWAYS-ON behavioral core (keep short & stable)
├── settings.json             # provider / model / theme / thinking
├── auth.json                 # keys (zai default + deepseek secondary; both portable)
├── models.json               # custom providers (empty: zai + deepseek are built-in)
├── models-store.json         # catalog cache
│
├── skills/                   # progressive disclosure (desc always-on; body on-demand)
│   ├── sdk-development/      # packages: Go/npm/CLI — codegen, pyramid, publish (merged
│   │                         #  sdk-development-npm into it 2026-08-28)
│   ├── playwright-tester/    # e2e via CDP-attached Chrome; isolated fallback
│   ├── browser-tools/        # live DOM via CDP :9222 (deps NOT bundled: npm install)
│   ├── map-integration/      # react-bkoi-gl / maplibre / deck.gl work
│   ├── harness-engineer/     # meta: audit/improve this harness
│   ├── ponytail/             # extended modes (core rules live in AGENTS.md)
│   ├── ponytail-review/      # over-engineering review format (sole carrier)
│   ├── frontend-design/      # new UI from scratch
│   ├── refactoring-ui/       # fix/polish existing UI
│   ├── brainstorming/
│   ├── systematic-debugging/
│   ├── audit/                # dead-code cleanup via static analysis
│   ├── skill-creator/        # SKILL.md spec + validator (scripts/validate-skill.mjs)
│   └── youtube-transcript/
│
├── prompts/                  # slash commands only (NOT in prefix)
│   └── commit.md             # kept minimal: --stat first, never plain git diff
│                             # (deleted preflight/changelog/bump/release — 0 uses,
│                             #  prescriptive bodies caused unbounded diffs + cache busts)
│
├── README.md                 # this file (incl. portability contract)
├── CHANGELOG.md      # append-only
├── skills-audit.md           # append-only skill-set decisions
├── .nvmrc
└── .gitignore                # git is the sync; secrets/caches excluded

# NOT BUNDLED (machine-local / auto-regen)
# bin/  npm/  sessions/  skills/**/node_modules/  *.log
```

## Layers (what loads when)

| Layer | What | When in context | Stability rule |
|-------|------|-----------------|----------------|
| System + tools | pi built-in | every turn | pi-managed |
| **AGENTS.md** | global behavioral rules | every turn | **must stay byte-stable** |
| Skill descriptions | frontmatter only | every turn | **must stay byte-stable** |
| Skill bodies | SKILL.md full text | on match or `/skill:name` | load on demand |
| Prompts | `/name` templates | only when invoked | not in prefix |
| Project AGENTS.md | repo rules | when present | overlays global |

## Always-on token budget (measure this)

Track after every harness change:

```sh
wc -c ~/.pi/agent/AGENTS.md
# + sum of all skill description lengths
```

| Component | Target | Notes |
|-----------|--------|-------|
| AGENTS.md | as small as possible (behavioral core only) | no stack essays, no skill lists |
| Skill descriptions | short; delete dead skills | largest descriptions cost every session |
| **Total always-on** | prefer ≤ ~2K tok | bodies/prompts stay out until needed |

Thinking default: `medium`. Bump per-task with `--thinking high` if needed.

## Skill discovery order

1. Project `.pi/skills/` / `.agents/skills/` (if trusted)
2. `~/.pi/agent/skills/` ← **canonical**
3. `~/.agents/skills/` ← neutralize manually (rename to `skills.disabled.<date>`) so it does not leak

Skills register as `/skill:<name>`. Bodies are **not** in context until needed.

## Persistence loop (ships in the bundle)

| File | When to update |
|------|----------------|
| `CHANGELOG.md` | every harness change (what / why / risk / measured delta) |
| `skills-audit.md` | skill set add/remove/merge |
| `HARNESS-ARCHITECTURE.md` | structure, budget, or sync/portability contract change |

## Portability contract

Goal: one self-contained config that works on **any macOS or Linux** machine by
replacing `~/.pi/agent/`. No environment variables, no absolute user paths.

### Git sync

`~/.pi/agent` is a git repo; **git is the only sync**.

- **Office (source of changes):**
  ```sh
  cd ~/.pi/agent && git add -A && git commit -m "harness: <what>" && git push
  ```
- **Home:**
  ```sh
  cd ~/.pi/agent && git pull
  ```
  Then start a fresh `pi` session (first run auto-installs bin/, npm/, models-store.json).
- **auth.json (secrets):** copy manually **once per machine** — it is never in git:
  ```sh
  scp office:~/.pi/agent/auth.json ~/.pi/agent/auth.json
  ```
  (pi also accepts `ZAI_API_KEY` / `DEEPSEEK_API_KEY` env vars, but pi does not
  auto-load any `.env`; auth.json is the single secrets file.)
- Never commit `auth.json`, `sessions/`, `bin/`, `npm/`, `**/node_modules/` —
  `.gitignore` enforces this; pi regenerates the rest on first run.

### Tracked in git (portable, OS-agnostic)

| Path | Purpose |
|---|---|
| `AGENTS.md` | Always-on behavioral core + efficiency ladder |
| `settings.json` | Provider/model/theme/thinking/packages (no secrets) |
| `models.json` | Custom providers (currently empty; both active providers are built-in) |
| `skills/` | All skills (real files, auto-trigger + `/skill:name`) |
| `prompts/` | Prompt templates |
| `skills-audit.md` | Skill audit + migration history (append-only) |
| `README.md` / `CHANGELOG.md` | This file + change log |
| `.nvmrc` | Pins required Node LTS (`22`) for `nvm use` in the harness dir |
| `.gitignore` | Secret/caches hygiene |

### Machine-local (gitignored, never synced)

| Path | Why |
|---|---|
| `auth.json` | Secrets — copy once per machine via `scp`; never in git. |
| `bin/fd`, `bin/rg` | Platform binaries. **pi auto-downloads** the correct arch (arm64/x86_64) on first run. |
| `npm/node_modules/` | Extension deps. **pi reinstalls** from `settings.json` → `packages` on first run (currently empty — all packages removed 2026-12-17). |
| `skills/**/node_modules/` | Per-skill deps (e.g. `browser-tools`: puppeteer-core, jsdom, `@mozilla/readability`, turndown). Regenerable — run `npm install` in the skill dir on first use (each skill documents this). |
| `models-store.json` | Built-in provider model catalog (regenerable cache). |
| `sessions/` | Session history, keyed by absolute project paths → inherently per-machine. |
| `*.log` | Debug logs. |

### Providers & API keys

Two providers, **both portable** (keys identical across machines):

- **`zai`** (in `auth.json`) — **default** provider, model `glm-5.2`.
- **`deepseek`** (in `auth.json`) — secondary, use via `/model`.

`models.json` holds no custom providers — `zai` and `deepseek` are built into pi.
`auth.json` is **not in git**; copy it once per machine (`scp`). When you rotate a
key, update `auth.json` (via `/login`) on each machine.

### Per-machine one-time setup (manual, post-clone)

After `git clone <repo> ~/.pi/agent` on a new machine:

1. **Secrets:** `scp office:~/.pi/agent/auth.json ~/.pi/agent/auth.json`
   (or run `/login` per provider).
2. **Neutralize `~/.agents/skills`** — pi *always* auto-scans this legacy dir; if it
   holds stale skills they leak into context (token cost). Rename it:
   `mv ~/.agents/skills ~/.agents/skills.disabled.$(date +%Y%m%d-%H%M%S)` (reversible).

`bin/`, `npm/`, `models-store.json` need no setup — pi regenerates them on first run.

### Portability rules enforced here

- No `/Users/...` or `/home/...` literals in any shipped file (only `~` / `$HOME`).
- Shell helpers are POSIX (`#!/usr/bin/env sh`) or bash-portable.
- No OS-only commands unguarded (`/proc` reads in `brainstorming` fall back to `ps`;
  `brainstorming/server.cjs` picks `xdg-open` on Linux vs `open` on macOS).
- No pi env vars (`PI_AGENT_DIR`, …) — config relies on the default `~/.pi/agent`.
- **Node LTS required (≥ 22).** `skills/browser-tools/package.json` sets `engines.node`; `~/.pi/agent/.nvmrc` pins `22` for `nvm use` inside the harness dir. To run `pi` on Node 22 from any directory: `nvm alias default 22`.

## Design rules (non-negotiable)

1. **Minimal core** — prefer deletion over addition. Never bloat the permanent prefix.
2. **Progressive disclosure** — skill bodies and long refs load only when needed.
3. **Cache is sacred** — AGENTS.md + skill descriptions must stay byte-stable within a session. Prefer a fresh session after prefix changes.
4. **rg first** — code navigation via `rg`. Bash only for real side-effects.
5. **Portability** — no absolute user paths in functional files (`~` / `$HOME` only). No unguarded OS-only commands.
6. **Primitives over features** — plan/debug/subagent via packages when needed; do not re-implement as always-on skills.
7. **Never move permanent behavioral rules** out of AGENTS.md into skills.

## Measurement (before → after every change)

```sh
wc -c ~/.pi/agent/AGENTS.md
# skill count + description byte sizes
ls ~/.pi/agent/prompts/*.md 2>/dev/null | wc -l
rg -n '/Users/|/home/|pbcopy|pbpaste|osascript|/opt/homebrew|launchctl' \
  ~/.pi/agent/AGENTS.md ~/.pi/agent/settings.json ~/.pi/agent/models.json \
  ~/.pi/agent/*.sh ~/.pi/agent/prompts/ ~/.pi/agent/skills/ \
  --glob '!**/harness-engineer/**' --glob '!**/node_modules/**'
```

Report deltas. No improvement claim without a number or a concrete behavioral before/after.

## Known constraints

- Core behavioral rules live in AGENTS.md (intentional). Edit rarely; each edit changes every session's prefix.
- Skills under `~/.pi/agent/skills/` are real files (not plugin cache). Upstream updates do not auto-propagate.
- `zai` (default) and `deepseek` (secondary) are built-in providers; `models.json` holds no custom providers. Both keys live in `auth.json` and are bundled.
- If `defaultThinkingLevel` drifts to `max`, restore to `medium`.

## Goal

Smaller, more stable, cache-friendly, rg-first, fully portable harness.
