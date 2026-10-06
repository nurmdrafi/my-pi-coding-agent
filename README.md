# pi agent harness

[![Release CI/CD](https://github.com/nurmdrafi/my-pi-coding-agent/actions/workflows/release.yml/badge.svg)](https://github.com/nurmdrafi/my-pi-coding-agent/actions/workflows/release.yml)
[![pi coding agent](https://img.shields.io/badge/pi-coding_agent-8A2BE2?logo=github&labelColor=555)](https://github.com/earendil-works/pi-coding-agent)
[![stars](https://img.shields.io/github/stars/nurmdrafi/my-pi-coding-agent?logo=github&labelColor=555)](https://github.com/nurmdrafi/my-pi-coding-agent/stargazers)
[![last commit](https://img.shields.io/github/last-commit/nurmdrafi/my-pi-coding-agent?logo=git&logoColor=white&label=updated&labelColor=555)](https://github.com/nurmdrafi/my-pi-coding-agent/commits)
[![Node](https://img.shields.io/badge/node_%E2%A5%BC_22.19_%C2%B7_.nvmrc_24-339933?logo=nodedotjs&logoColor=white)](#requirements)
[![platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux-555?logo=linux&logoColor=white)](#portability)
[![tmux](https://img.shields.io/badge/tmux-optional-555?logo=tmux&logoColor=white)](#subagents)
[![skills](https://img.shields.io/badge/skills-23-2563eb?logo=readthedocs&logoColor=white)](#skills)
[![License: MIT](https://img.shields.io/badge/license-MIT-yellow?logo=opensourceinitiative&logoColor=white)](LICENSE)

A portable, git-synced configuration for the [pi coding agent](https://github.com/earendil-works/pi-coding-agent) — one `~/.pi/agent/` directory that turns any macOS or Linux machine into a fully configured coding-agent workstation in minutes.

**Why this exists:** coding-agent configs rot — they accumulate always-on prompt bloat, machine-specific paths, and undocumented setup rituals. This harness treats the config itself as an engineered product: a lean behavioral core, 23 progressive-disclosure skills, an always-on extension that enforces discipline at the tool-call level, and a measured token budget (~1.7K tokens permanent floor) so every session starts cheap.

- **One directory, one repo** — `git clone` is the entire install; git is the only sync mechanism.
- **Zero environment variables, zero absolute paths** — everything works from the default `~/.pi/agent` location.
- **Measured, not guessed** — every harness change ships with a before/after number.

## Table of contents

- [Quick start](#quick-start)
- [Requirements](#requirements)
- [What's inside](#whats-inside)
- [Skills](#skills)
- [Subagents](#subagents)
- [Extensions](#extensions)
- [Context layers](#context-layers)
- [Always-on token budget](#always-on-token-budget)
- [Portability](#portability)
- [Design rules](#design-rules)
- [Known constraints](#known-constraints)
- [Maintaining this harness](#maintaining-this-harness)
- [License](#license)

## Quick start

Set up on a new machine: Node, pi, the repo — plus per-machine extras. Prereqs: git; tmux only for subagents — see [Requirements](#requirements).

```sh
# 1. Node ≥ 22.19 (`.nvmrc` pins 24)
nvm install 24

# 2. Install pi (official installer; pins deps, adds `pi update`)
curl -fsSL https://pi.dev/install.sh | sh
# npm alternative: npm install -g --ignore-scripts @earendil-works/pi-coding-agent

# 3. Clone the harness into pi's config dir
git clone https://github.com/nurmdrafi/my-pi-coding-agent.git ~/.pi/agent

# Additionally, per machine — copy extras from an existing machine
scp <your-other-machine>:~/.agents/skills/* ~/.pi/agent/skills/  # private skills, not in the repo
scp <your-other-machine>:~/.pi/agent/auth.json ~/.pi/agent/      # secrets — or /login per provider inside pi
```

Then start pi:

```console
$ pi
# First run regenerates bin/, npm/, git/, models-store.json automatically.
```

Optional, for subagents: `brew install tmux` (macOS) or `sudo apt install tmux` (Linux).

That's it — no env vars to export, no paths to fix.

## Requirements

| Requirement | Detail |
|---|---|
| Node.js | ≥ 22.19 (`.nvmrc` pins 24, the current LTS) |
| OS | macOS or Linux |
| tmux | Only if using subagents — see [Subagents](#subagents) |
| Git | For sync; `~/.pi/agent` is itself a repo |

## What's inside

```
~/.pi/agent/
├── AGENTS.md                 # Always-on behavioral core (kept short & byte-stable)
├── settings.json             # Provider / model / theme / thinking (no secrets)
├── auth.json                 # API keys — gitignored, copied once per machine
├── models.json               # Custom model defs (glm-5.3-flash)
├── models-store.json         # Catalog cache (machine-local, auto-regenerated)
│
├── skills/                   # one dir per skill: SKILL.md + scripts/ references/ assets/
├── extensions/               # Always-on TS extensions (permission-gate)
├── agents/                   # Subagent definitions (scout/researcher/worker/reviewer)
├── prompts/                  # /command prompt templates (ship)
├── tests/                    # Node test runner suite (permission-gate)
├── .github/workflows/        # Release CI/CD
├── package.json              # husky + commitlint (conventional commits)
│
├── README.md                 # This file
├── CHANGELOG.md              # Harness change log, latest-first
├── audit-reports/            # Dated audit reports (machine-local)
├── .nvmrc                    # Pins Node 24
└── .gitignore                # Secrets/caches hygiene
```

**Not bundled** (machine-local, auto-regenerated): `bin/`, `npm/`, `git/`, `sessions/`, `audit-reports/`, `skills/**/node_modules/`, `*.log`.

## Skills

2 of 23 skills are **auto-invocable** (the model loads them on match); the rest are manual — invoke with `/skill:<name>`. `/ship` (commit+push with scoped review) is not a skill — it is a prompt template in [`prompts/`](#whats-inside): zero context cost until invoked. Skill bodies never enter context until invoked.

| Skill | Purpose | Invocation |
|---|---|---|
| ponytail | Lazy-minimum intensity modes (lite/full/ultra) over the AGENTS.md ladder + over-engineering review mode | auto |
| web-search | Web search + URL extraction via Tavily CLI (`tvly search` / `tvly extract`) | `/skill:web-search` |
| systematic-debugging | Phased root-cause debugging (incl. error-class loops) before proposing any fix | auto |
| pre-push-review | CI-parity correctness review of the diff before commit/push | `/skill:pre-push-review` |
| auth | NextAuth v4 credentials auth for Next.js App Router against an external REST IdP | `/skill:auth` |
| brainstorming | Explore genuinely-unclear feature direction; one question at a time | `/skill:brainstorming` |
| browser-tools | Live DOM via CDP `:9222` — Playwright/e2e only (deps: `npm install` at skill root) | `/skill:browser-tools` |
| documentation-writer | Diátaxis-based tech writer: SDK docs, READMEs, CONTRIBUTING, docs audits | `/skill:documentation-writer` |
| domain-modeling | Build/sharpen a project's domain model — GLOSSARY.md terms, ADRs | `/skill:domain-modeling` |
| fallow-audit | Dead-code / unused-export / unused-dependency cleanup (fallow, knip, ts-prune, depcheck) | `/skill:fallow-audit` |
| frontend-design | New web components/pages/apps from scratch (detects the UI stack) | `/skill:frontend-design` |
| github-actions | Author/harden CI workflows: SHA-pinned actions, scoped secrets, actionlint | `/skill:github-actions` |
| grilling | Relentless one-question-at-a-time stress-testing of a plan/decision | `/skill:grilling` |
| harness-engineer | Meta: audit/improve this harness (budgets, evidence, skill audits) | `/skill:harness-engineer` |
| map-integration | Any map work: maplibre/mapbox-gl, deck.gl, turf, draw; Barikoi stack | `/skill:map-integration` |
| playwright-tester | e2e specs, stress/update-flow runs, bug-hunt iterations, untested-critical-path coverage | `/skill:playwright-tester` |
| prototype | Throwaway prototype (HTML state-model walkthrough / UI variations) to answer a design question | `/skill:prototype` |
| refactoring-ui | Audit/fix existing UI: hierarchy, spacing, color, depth, small UI defects | `/skill:refactoring-ui` |
| research | Delegate reading legwork to a background agent against high-trust sources | `/skill:research` |
| sdk-development | Installable packages (Go/npm/CLI): OpenAPI codegen, test, publish | `/skill:sdk-development` |
| session-audit | Token/cost waste audit of `~/.pi/agent/sessions` | `/skill:session-audit` |
| skill-manager | Create/modify SKILL.md + mandatory validator gate | `/skill:skill-manager` |
| wayfinder | Chart a too-big effort as a map of decision tickets on the issue tracker | `/skill:wayfinder` |

### Skill layout (validator-enforced)

```text
<name>/
├── SKILL.md        # required; the only loose file allowed at top level
├── scripts/        # executable code (.sh/.mjs/.py/...), incl. helper modules
├── references/     # additional docs read on demand (progressive disclosure)
└── assets/         # static resources: templates, images, data files
```

Layout is enforced by `node skills/skill-manager/scripts/validate-skill.mjs <skill-dir>` (exit 0 required); `node skills/harness-engineer/scripts/mdcmdcheck.mjs` additionally verifies every command/path declared in markdown resolves.

## Subagents

Opt-in. The `pi-interactive-subagents` package (`subagent` / `subagent_message` / `subagents_list` + `/subagent` command, ~1K tok/session tool defs) is pinned to a commit and patched locally for agents-only tmux + tmux ≥3.0 compat (upstream's pane filtering needs ≥3.2 — the patch lists unfiltered and filters in-process; works on macOS brew and distro apt builds alike). After a fresh clone or `pi update --extensions` (which re-clones and wipes the patch):

```sh
pi install git:github.com/amosblomqvist/pi-interactive-subagents@c3e8b53c0754ae5ccc19fdab5a7481ec039bc2f7
cd ~/.pi/agent/git/github.com/amosblomqvist/pi-interactive-subagents && \
  git apply ~/.pi/agent/patches/pi-interactive-subagents-detached-tmux.patch
```

Then `/reload` (or restart pi). Remove with `pi remove git:github.com/amosblomqvist/pi-interactive-subagents`.

**tmux is agents-only** (local patch — upstream requires pi inside tmux). The main terminal runs pi plain. When a subagent spawns and pi is not inside tmux, panes appear in a detached session `pi-agents` — attach with `tmux attach -t pi-agents`, detach with `Ctrl+b d`. The tmux binary is required either way.

Spawn-failure triage: `Subagents require tmux. Start pi inside tmux` = the **running session loaded unpatched upstream code** (patch was missing at load time, or the session predates the patch) — re-apply the patch (command above) and `/reload` or restart pi; the running process keeps its loaded code until then. `Install tmux (…)` = the binary is missing.

Agent definitions in `agents/` are plain files — inert without the package; when installed, they override package-bundled defs (discovery: project > global > package).

| Agent | Tools | Role |
|---|---|---|
| scout | read, grep, find, ls | read-only recon |
| researcher | read, bash | web research via `tvly` CLI |
| worker | read, write, edit, bash (+ may spawn scout, researcher) | general implementer |
| reviewer | read, bash, grep, find, ls (auto-loads `pre-push-review` skill) | pre-commit diff review; never commits/pushes |

No `model` pin — sub-agents inherit the harness default from `settings.json`; the spawn-time `model` param still overrides.

## Extensions

Always-on TypeScript modules in `extensions/` — loaded by pi, never in the model prefix. Currently two: **`permission-gate.ts`**, a `tool_call` interceptor providing:

- edit-anchor pre-validation (oldText must match a region actually read)
- reading/output economy rules (no `cat` viewing, capped `rg`/`git` output)
- identical re-run guard (R10)
- commitlint conventional-commit validation on `git commit -m` headers (R9)

**`handoff.ts`** adds `/handoff <goal>` — drafts a context-transfer prompt from the session (compaction-aware), saves it as a human-readable doc under `~/.pi/agent/handoff/<date>-<slug>.md`, then opens the new session with the draft.

Raw events (tool errors, guard blocks) land in pi's native `sessions/**/*.jsonl` — the audit toolkit derives every signal from there. Full docs: [`extensions/README.md`](extensions/README.md).

## Context layers

What is in context, and when:

| Layer | What | When in context | Stability rule |
|-------|------|-----------------|----------------|
| System + tools | pi built-in | every turn | pi-managed |
| **AGENTS.md** | global behavioral rules | every turn | **must stay byte-stable** |
| Skill descriptions | frontmatter only | every turn | **must stay byte-stable** |
| Skill bodies | SKILL.md full text | on match or `/skill:name` | load on demand |
| Project AGENTS.md | repo rules | when present | overlays global |

### Skill discovery order

1. Project `.pi/skills/` / `.agents/skills/` (if trusted)
2. `~/.pi/agent/skills/` ← **canonical**
3. `~/.agents/skills/` ← neutralize manually (rename to `skills.disabled.<date>`) so it does not leak

## Always-on token budget

The permanent prefix costs ~1.7K tokens per session (AGENTS.md 5,826 chars ≈ 1.5K + 2-entry auto-skill catalog ≈ 0.9K chars ≈ 0.25K, at ~4 chars/token; manual-skill descriptions stay out of the model-visible catalog; subagents tool defs removed — see [CHANGELOG.md](CHANGELOG.md)). Bodies and references stay out of context until needed.

| Component | Target | Notes |
|-----------|--------|-------|
| AGENTS.md | as small as possible (behavioral core only) | no stack essays, no skill lists |
| Skill descriptions | short; delete dead skills | largest descriptions cost every session |
| **Total always-on** | ≤ ~3.5K tok | all 23 descriptions always-on; no package tool defs |

Thinking is `off` by default (token economy); bump per-task with `--thinking high`.

## Portability

Goal: one self-contained config that works on any macOS or Linux machine by replacing `~/.pi/agent/`. No environment variables, no absolute user paths.

### Sync workflow (git is the only sync)

```sh
# Machine A (source of changes)
cd ~/.pi/agent && git add -A && git commit -m "harness: <what>" && git push

# Machine B
cd ~/.pi/agent && git pull
# then start a fresh pi session — first run regenerates bin/, npm/, git/, models-store.json
```

`auth.json` (secrets) is copied manually **once per machine** via `scp` (or `/login` per provider). It is never in git; `.gitignore` enforces this. On key rotation, update `auth.json` on each machine.

### Providers

| Provider | Role | Models |
|---|---|---|
| `zai` | default | `glm-5.3`; `models.json` adds `glm-5.3-flash` (1M context, reasoning) |
| `deepseek` | secondary (`/model`) | built-in catalog |

Both keys are identical across machines and live only in `auth.json`. pi also accepts `ZAI_API_KEY` / `DEEPSEEK_API_KEY` env vars but does not auto-load any `.env`; `auth.json` is the single secrets file.

### Tracked in git (portable, OS-agnostic)

| Path | Purpose |
|---|---|
| `AGENTS.md` | Always-on behavioral core + efficiency ladder |
| `settings.json` | Provider/model/theme/thinking (no secrets) |
| `models.json` | Custom model definitions |
| `agents/` | Subagent definitions (scout/researcher/worker/reviewer) |
| `prompts/` | Prompt templates (`/ship`: commit+push from session context) |
| `skills/` | All skills (auto-trigger + `/skill:name`) |
| `extensions/` | Always-on extensions (`permission-gate`) |
| `tests/` | Node test runner suite (`node --test tests/`) |
| `.github/workflows/` | Release CI/CD (version from CHANGELOG, on push to main) |
| `package.json` / `commitlint.config.js` | husky + commitlint: conventional-commit enforcement |
| `README.md` / `CHANGELOG.md` | This file + change log |
| `.nvmrc` | Pins Node 24 |
| `LICENSE` | MIT |
| `.gitignore` | Secret/caches hygiene |

### Machine-local (gitignored, never synced)

| Path | Why |
|---|---|
| `auth.json` | Secrets — copy once per machine; never in git |
| `bin/` | Platform binaries, auto-downloaded per arch (currently `fd`) |
| `npm/` | pi-managed `pi install npm:<pkg>` store |
| `git/` | pi-managed `pi install git:<repo>` clones (re-created on next `pi install git:…`) |
| `skills/**/node_modules/` | Per-skill deps — regenerable via `npm install` in the skill dir |
| `models-store.json` | Provider model catalog (regenerable cache) |
| `sessions/` | Session history, keyed by absolute project paths → per-machine |
| `audit-reports/` | Dated audit artifacts; reports name private projects, this repo is public |
| `*.log` | Debug logs |

### Portability rules (enforced)

- No `/Users/...` or `/home/...` literals in any shipped file (only `~` / `$HOME`).
- Shell helpers are POSIX (`#!/usr/bin/env sh`) or bash-portable.
- No unguarded OS-only commands (`/proc` reads fall back to `ps`; server script picks `xdg-open` on Linux vs `open` on macOS).
- No pi env vars (`PI_AGENT_DIR`, …) — config relies on the default `~/.pi/agent`.

## Design rules

1. **Minimal core** — prefer deletion over addition. Never bloat the permanent prefix.
2. **Progressive disclosure** — skill bodies and long refs load only when needed.
3. **Cache is sacred** — AGENTS.md + skill descriptions stay byte-stable within a session; prefer a fresh session after prefix changes.
4. **rg first** — code navigation via `rg`; bash only for real side-effects.
5. **Portability** — no absolute user paths; no unguarded OS-only commands.
6. **Primitives over features** — plan/debug/subagent via packages when needed; never re-implement as always-on skills.
7. **Never move permanent behavioral rules** out of AGENTS.md into skills.

## Known constraints

- Core behavioral rules live in AGENTS.md (intentional). Edit rarely — each edit changes every session's prefix.
- Skills are real files, not a plugin cache; upstream updates do not auto-propagate.
- Thinking defaults to `off` (deliberate token economy); raise per-task, not globally.

## Maintaining this harness

Quality gates in this repo:

- **Tests:** `node --test tests/` (currently covers `permission-gate`)
- **Conventional commits:** enforced by husky + commitlint on every commit
- **CI:** [Release workflow](https://github.com/nurmdrafi/my-pi-coding-agent/actions/workflows/release.yml) extracts the version from `CHANGELOG.md` on push to `main`

| File | Update when |
|------|-------------|
| [`CHANGELOG.md`](CHANGELOG.md) | every harness change (what / why / risk / measured delta) |
| `README.md` (this file) | structure, skill roster, budget, or sync/portability contract change |

**Goal:** smaller, more stable, cache-friendly, rg-first, fully portable harness.

## License

[MIT](LICENSE) © nurmdrafi

