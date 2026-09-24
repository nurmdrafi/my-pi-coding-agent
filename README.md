# my-pi-coding-agent

[![pi coding agent](https://img.shields.io/badge/pi-coding_agent-8A2BE2)](https://github.com/earendil-works/pi-coding-agent)
[![Node](https://img.shields.io/badge/node_%E2%89%A522_%C2%B7_nvmrc_24-339933?logo=nodedotjs&logoColor=white)](#portability-contract)
[![platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux-555)](#portability-contract)
[![skills](https://img.shields.io/badge/skills-18-2563eb)](#skills)
[![always-on floor](https://img.shields.io/badge/always--on_floor_%7E1.5K_tok-f97316)](#always-on-token-budget-measure-this)

Personal [pi coding agent](https://github.com/earendil-works/pi-coding-agent) harness — a
single portable `~/.pi/agent/` directory, synced via this git repo between machines.

**What you get:** a lean always-on behavioral core (AGENTS.md), 18 progressive-disclosure
skills, and an audit methodology that keeps the permanent token floor ~1.5K tokens
(measured 2026-09-23: AGENTS.md 5,396 c + 2 model-visible descriptions 585 c ÷ 4).
No env vars, no absolute paths — clone anywhere on macOS/Linux.

## Quick start (new machine)

```sh
git clone <repo> ~/.pi/agent
cp office:~/.pi/agent/auth.json ~/.pi/agent/   # or /login per provider (secrets never in git)
mv ~/.agents/skills ~/.agents/skills.disabled.$(date +%Y%m%d-%H%M%S) 2>/dev/null  # stop legacy dir leaking
pi   # first run regenerates bin/, npm/, models-store.json
```

Requires Node ≥ 22 (`.nvmrc` pins 24, the current LTS). Full details below.

---

# Harness Architecture — current state (living doc)

Map of this pi harness. Re-read at the start of any harness-engineering session.
Update when structure, skill set, or always-on budget changes.

Last updated: 2026-09-24

## Portable unit

`~/.pi/agent/` — single directory to zip, sync, and restore on any macOS/Linux box.
No env vars; default path only.

```
~/.pi/agent/
├── AGENTS.md                 # ALWAYS-ON behavioral core (keep short & stable)
├── settings.json             # provider / model / theme / thinking (no secrets)
├── auth.json                 # keys — gitignored, copied once per machine
├── models.json               # custom model defs (glm-5.3-flash)
├── models-store.json         # catalog cache (machine-local, regen)
│
├── skills/                   # 18 skills; each: SKILL.md + scripts/ references/ assets/
├── extensions/               # always-on TS extensions (guards, error-log)
├── README.md                 # this file (incl. portability contract)
├── CHANGELOG.md              # harness change log, latest-first (newest on top)
├── skills-audit.md           # append-only skill-set decisions
├── .nvmrc                    # pins 24
└── .gitignore                # git is the sync; secrets/caches excluded

# NOT BUNDLED (machine-local / auto-regen)
# bin/  npm/  sessions/  skills/**/node_modules/  *.log
```

## Skills

Auto-invocable (the model may load them on match): **ponytail**, **tavily-search**.
Everything else is manual — invoke with `/skill:<name>`.

| Skill | Purpose | Invocation |
|---|---|---|
| ponytail | Lazy-minimum intensity modes (lite/full/ultra) over the AGENTS.md ladder | auto |
| tavily-search | Web research via Tavily CLI (`tvly search`) — primary research route | auto |
| auth | NextAuth v4 credentials auth for Next.js App Router against an external REST backend | `/skill:auth` |
| brainstorming | Explore genuinely-unclear feature direction; one question at a time | `/skill:brainstorming` |
| browser-tools | Live DOM via CDP `:9222` — Playwright/e2e only (deps: `npm install` at skill root) | `/skill:browser-tools` |
| fallow-audit | Dead-code / unused-export / unused-dependency cleanup (fallow, knip, ts-prune, depcheck) | `/skill:fallow-audit` |
| frontend-design | New web components/pages/apps from scratch (detects the UI stack) | `/skill:frontend-design` |
| harness-engineer | Meta: audit/improve this harness (budgets, evidence, skill audits) | `/skill:harness-engineer` |
| map-integration | Any map work: maplibre/mapbox-gl, deck.gl, turf, draw | `/skill:map-integration` |
| playwright-tester | e2e specs, stress/update-flow runs, bug-hunt iterations, slow-startup diagnosis | `/skill:playwright-tester` |
| ponytail-review | Over-engineering review: finds what to delete | `/skill:ponytail-review` |
| pre-push-review | CI-parity correctness review of the diff before commit/push | `/skill:pre-push-review` |
| refactoring-ui | Audit/fix existing UI: hierarchy, spacing, color, depth | `/skill:refactoring-ui` |
| sdk-development | Installable packages (Go/npm/CLI): OpenAPI codegen, test, publish | `/skill:sdk-development` |
| session-audit | Token/cost waste audit of `~/.pi/agent/sessions` | `/skill:session-audit` |
| skill-manager | Create/modify SKILL.md + mandatory validator gate | `/skill:skill-manager` |
| systematic-debugging | Phased root-cause debugging before proposing any fix | `/skill:systematic-debugging` |
| tavily-extract | URL → clean markdown via Tavily CLI (`tvly extract`) | `/skill:tavily-extract` |

### Skill layout (convention — validator-enforced)

```text
<name>/
├── SKILL.md        # required; the only loose file allowed at top level
├── scripts/        # executable code (.sh/.mjs/.py/...), incl. helper modules
├── references/     # additional docs read on demand (progressive disclosure)
└── assets/         # static resources: templates, images, data files
```

`package.json` + `node_modules/` are tolerated at the skill root for declared deps
(e.g. `browser-tools`). Enforced by
`node skills/skill-manager/scripts/validate-skill.mjs <skill-dir>` (exit 0 required);
`node skills/harness-engineer/scripts/mdcmdcheck.mjs` additionally verifies every
command/path declared in markdown resolves (also exits 1 on findings).

## Extensions

Always-on TypeScript modules in `extensions/` (loaded by pi, never in the model
prefix). `error-log.ts` captures every LLM runtime error — tool failures,
provider HTTP ≥ 400, compaction failures — into machine-local, gitignored
`logs/errors-YYYY-MM-DD.jsonl` — review live with `/errors [n]` or batch
with `skills/harness-engineer/scripts/error_audit.py --live`. Guards:
`token-economy-guard.ts` (reading/output economy) and `edit-anchor-guard.ts`
(oldText fabrication).

## Layers (what loads when)

| Layer | What | When in context | Stability rule |
|-------|------|-----------------|----------------|
| System + tools | pi built-in | every turn | pi-managed |
| **AGENTS.md** | global behavioral rules | every turn | **must stay byte-stable** |
| Skill descriptions | frontmatter only | every turn | **must stay byte-stable** |
| Skill bodies | SKILL.md full text | on match or `/skill:name` | load on demand |
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
| **Total always-on** | prefer ≤ ~2K tok | bodies/refs stay out until needed |

Thinking default: `off` (token economy). Bump per-task with `--thinking high` if needed.

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
| `README.md` (this file) | structure, budget, or sync/portability contract change |

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
| `settings.json` | Provider/model/theme/thinking (no secrets) |
| `models.json` | Custom model definitions (currently: `glm-5.3-flash`) |
| `skills/` | All skills (real files, auto-trigger + `/skill:name`) |
| `extensions/` | Always-on extensions (token-economy + edit-anchor guards, error-log) |
| `skills-audit.md` | Skill audit + migration history (append-only) |
| `README.md` / `CHANGELOG.md` | This file + change log |
| `.nvmrc` | Pins Node 24 (current LTS) for `nvm use` in the harness dir |
| `.gitignore` | Secret/caches hygiene |

### Machine-local (gitignored, never synced)

| Path | Why |
|---|---|
| `auth.json` | Secrets — copy once per machine via `scp`; never in git. |
| `bin/fd`, `bin/rg` | Platform binaries. **pi auto-downloads** the correct arch (arm64/x86_64) on first run. |
| `npm/node_modules/` | Extension deps. **pi reinstalls** from `settings.json` → `packages` on first run (currently none). |
| `skills/**/node_modules/` | Per-skill deps (e.g. `browser-tools`: puppeteer-core, jsdom, `@mozilla/readability`, turndown). Regenerable — `npm install` in the skill dir on first use. |
| `models-store.json` | Built-in provider model catalog (regenerable cache). |
| `sessions/` | Session history, keyed by absolute project paths → inherently per-machine. |
| `logs/` | Daily `errors-YYYY-MM-DD.jsonl` runtime-error logs from `error-log.ts` (like sessions/). |
| `*.log` | Debug logs. |

### Providers & API keys

Two providers, **both portable** (keys identical across machines):

- **`zai`** (key in `auth.json`) — **default** provider, model `glm-5.3`;
  `models.json` adds `glm-5.3-flash` (1M context, reasoning).
- **`deepseek`** (key in `auth.json`) — secondary, use via `/model`.

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
  `brainstorming/scripts/server.cjs` picks `xdg-open` on Linux vs `open` on macOS).
- No pi env vars (`PI_AGENT_DIR`, …) — config relies on the default `~/.pi/agent`.
- **Node ≥ 22 required.** `skills/browser-tools/package.json` sets `engines.node`;
  `~/.pi/agent/.nvmrc` pins `24` for `nvm use` inside the harness dir.

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
rg -n '/Users/|/home/|pbcopy|pbpaste|osascript|/opt/homebrew|launchctl' \
  ~/.pi/agent/AGENTS.md ~/.pi/agent/settings.json ~/.pi/agent/models.json \
  ~/.pi/agent/*.sh ~/.pi/agent/skills/ \
  --glob '!**/harness-engineer/**' --glob '!**/node_modules/**'
```

Report deltas. No improvement claim without a number or a concrete behavioral before/after.

## Known constraints

- Core behavioral rules live in AGENTS.md (intentional). Edit rarely; each edit changes every session's prefix.
- Skills under `~/.pi/agent/skills/` are real files (not plugin cache). Upstream updates do not auto-propagate.
- `zai` (default, `glm-5.3`) and `deepseek` (secondary) are built-in providers; `models.json` only defines `glm-5.3-flash`. Both keys live in `auth.json` and are bundled.
- Thinking default is `off` (deliberate token economy); raise per-task, not globally.

## Goal

Smaller, more stable, cache-friendly, rg-first, fully portable harness.
