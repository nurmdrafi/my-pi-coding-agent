# pi agent harness

[![release CI](https://img.shields.io/github/actions/workflow/status/nurmdrafi/my-pi-coding-agent/release.yml?label=release%20CI&logo=githubactions&logoColor=2088FF&labelColor=24292f&style=flat-square)](https://github.com/nurmdrafi/my-pi-coding-agent/actions/workflows/release.yml)
[![release](https://img.shields.io/github/v/release/nurmdrafi/my-pi-coding-agent?logo=github&logoColor=white&labelColor=24292f&style=flat-square)](https://github.com/nurmdrafi/my-pi-coding-agent/releases)
[![license](https://img.shields.io/badge/license-MIT-2ea44f?logo=opensourceinitiative&logoColor=white&labelColor=24292f&style=flat-square)](LICENSE)
[![pi coding agent](https://img.shields.io/badge/pi-coding_agent-8A2BE2?logo=github&logoColor=white&labelColor=24292f&style=flat-square)](https://github.com/earendil-works/pi-coding-agent)
<br>
[![stars](https://img.shields.io/github/stars/nurmdrafi/my-pi-coding-agent?logo=github&logoColor=white&labelColor=24292f&style=flat-square)](https://github.com/nurmdrafi/my-pi-coding-agent/stargazers)
[![forks](https://img.shields.io/github/forks/nurmdrafi/my-pi-coding-agent?logo=github&logoColor=white&labelColor=24292f&style=flat-square)](https://github.com/nurmdrafi/my-pi-coding-agent/forks)
[![contributors](https://img.shields.io/github/contributors/nurmdrafi/my-pi-coding-agent?logo=github&logoColor=white&labelColor=24292f&style=flat-square)](https://github.com/nurmdrafi/my-pi-coding-agent/graphs/contributors)
[![issues](https://img.shields.io/github/issues/nurmdrafi/my-pi-coding-agent?logo=github&logoColor=white&labelColor=24292f&style=flat-square)](https://github.com/nurmdrafi/my-pi-coding-agent/issues)
[![commits/month](https://img.shields.io/github/commit-activity/m/nurmdrafi/my-pi-coding-agent?logo=git&logoColor=F05032&labelColor=24292f&style=flat-square)](https://github.com/nurmdrafi/my-pi-coding-agent/commits)
[![last commit](https://img.shields.io/github/last-commit/nurmdrafi/my-pi-coding-agent?logo=git&logoColor=F05032&labelColor=24292f&style=flat-square)](https://github.com/nurmdrafi/my-pi-coding-agent/commits)
[![repo size](https://img.shields.io/github/repo-size/nurmdrafi/my-pi-coding-agent?logo=github&logoColor=white&labelColor=24292f&style=flat-square)](https://github.com/nurmdrafi/my-pi-coding-agent)
<br>
[![node](https://img.shields.io/badge/node_%E2%A5%BC_22.19_%C2%B7_.nvmrc_24-339933?logo=nodedotjs&logoColor=5FA04E&labelColor=24292f&style=flat-square)](#requirements)
[![macOS](https://img.shields.io/badge/macOS-6e7681?logo=apple&logoColor=A2AAAD&labelColor=24292f&style=flat-square)](#portability)[![Linux](https://img.shields.io/badge/Linux-FCC624?logo=linux&logoColor=FCC624&labelColor=24292f&style=flat-square)](#portability)
[![language](https://img.shields.io/badge/language-TypeScript-3178C6?logo=typescript&logoColor=white&labelColor=24292f&style=flat-square)](#extensions)
[![tmux](https://img.shields.io/badge/tmux-optional-6e7681?logo=tmux&logoColor=1BB91F&labelColor=24292f&style=flat-square)](#subagents)
[![skills](https://img.shields.io/badge/skills-20-2563eb?logo=readthedocs&logoColor=8CA1AF&labelColor=24292f&style=flat-square)](#skills)
[![extensions](https://img.shields.io/badge/extensions-2-2563eb?labelColor=24292f&style=flat-square)](#extensions)
[![token floor](https://img.shields.io/badge/token_floor-%E2%89%88_0.7K-2ea44f?labelColor=24292f&style=flat-square)](#always-on-token-budget)

A portable, git-synced configuration for the [pi coding agent](https://github.com/earendil-works/pi-coding-agent) — one `~/.pi/agent/` directory that turns any macOS or Linux machine into a fully configured coding-agent workstation in minutes.

**Why this exists:** coding-agent configs rot — they accumulate always-on prompt bloat, machine-specific paths, and undocumented setup rituals. This harness treats the config itself as an engineered product: a lean behavioral core, 20 progressive-disclosure skills, an always-on extension that enforces discipline at the tool-call level, and a measured token budget (~0.7K tokens permanent floor) so every session starts cheap.

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
├── prompts/                  # /command prompt templates (/issue, /ship, /update-changelog)
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

All 20 skills are **manual** — invoke with `/skill:<name>`; none auto-load on task match. `/ship` (commit+push with scoped review) is not a skill — it is a prompt template in [`prompts/`](#whats-inside): zero context cost until invoked. Skill bodies never enter context until invoked.

| Skill | Purpose | Invocation |
|---|---|---|
| ponytail | Lazy-minimum intensity modes (lite/full/ultra) over the AGENTS.md ladder + over-engineering review mode | `/skill:ponytail` |
| web-search | Web search + URL extraction via Tavily CLI (`tvly search` / `tvly extract`) | `/skill:web-search` |
| systematic-debugging | Phased root-cause debugging (incl. error-class loops) before proposing any fix | `/skill:systematic-debugging` |
| pre-push-review | CI-parity correctness review of the diff before commit/push | `/skill:pre-push-review` |
| auth | NextAuth v4 credentials auth for Next.js App Router against an external REST IdP | `/skill:auth` |
| brainstorming | Explore genuinely-unclear feature direction; one question at a time | `/skill:brainstorming` |
| browser-tools | Live DOM via CDP `:9222` — Playwright/e2e only (deps: `npm install` at skill root) | `/skill:browser-tools` |
| documentation-writer | Diátaxis-based tech writer: SDK docs, READMEs, CONTRIBUTING, docs audits | `/skill:documentation-writer` |
| domain-modeling | Build/sharpen a project's domain model — GLOSSARY.md terms, ADRs | `/skill:domain-modeling` |
| fallow-audit | Dead-code / unused-export / unused-dependency cleanup (fallow, knip, ts-prune, depcheck) | `/skill:fallow-audit` |
| frontend-design | New web components/pages/apps from scratch (detects the UI stack) | `/skill:frontend-design` |
| github-actions | Author/harden CI workflows: SHA-pinned actions, scoped secrets, actionlint | `/skill:github-actions` |
| grill-me | Relentless one-question-at-a-time stress-testing of a plan/decision | `/skill:grill-me` |
| harness-engineer | Meta: audit/improve this harness (budgets, evidence, skill audits, anti-pattern sweep) | `/skill:harness-engineer` |
| map-integration | Any map work: maplibre/mapbox-gl, deck.gl, turf, draw; Barikoi stack | `/skill:map-integration` |
| playwright-tester | e2e specs, stress/update-flow runs, bug-hunt iterations, untested-critical-path coverage | `/skill:playwright-tester` |
| refactoring-ui | Audit/fix existing UI: hierarchy, spacing, color, depth, small UI defects | `/skill:refactoring-ui` |
| sdk-development | Installable packages (Go/npm/CLI): OpenAPI codegen, test, publish | `/skill:sdk-development` |
| session-audit | Token/cost waste audit of `~/.pi/agent/sessions` | `/skill:session-audit` |
| skill-manager | Create/modify SKILL.md + mandatory validator gate | `/skill:skill-manager` |

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

Owned first-party code at `extensions/subagents/` (`subagent` / `subagent_message` / `subagents_list` + `/subagents` command) — vendored from `amosblomqvist/pi-interactive-subagents@c3e8b53c0754ae5ccc19fdab5a7481ec039bc2f7` (itself a tmux-only fork of HazAT's) with the former `patches/*.patch` folded in: agents-only tmux + tmux ≥3.0 compat (upstream's pane filtering needs ≥3.2 — we list unfiltered and filter in-process; works on macOS brew and distro apt builds alike) and the permission-gate extension re-enabled inside sandboxed subagent spawns (`PI_SUBAGENT_EXTRA_EXTENSIONS` colon-separated override). No `settings.json` → `packages` entry; `pi update --extensions` can no longer wipe it.

**Gated by default** — the spawning tools are registered inactive in top-level sessions (zero prompt tokens) until a trigger activates them:

- `/subagents on` / `/subagents off` — toggle for the session
- `/subagents [agent] [task]` — any spawn auto-enables; the agent name is optional (prose like `/subagents use the worker to fix X` picks the named agent; with no agent named at all, the session model routes by task via `subagents_list`)
- `PI_SUBAGENTS=1` — start active (scripted opt-in)

Subagent sessions always register active (the child's `--tools` sandbox governs). Activation appends the tool set before the next model request (one-time cached-prefix invalidation possible). Upstream updates are manual: fetch any clone, `git diff c3e8b53..<new> -- pi-extension`, apply into `extensions/subagents/`.

**Tests** — `node --test tests/subagents/test.ts` (unit, mock-based; also `node tests/subagents/system-prompt-mode.test.ts`). Integration under `tests/subagents/integration/`: real pi + real model inside tmux — `PI_TEST_MODEL` / `PI_TIMEOUT` knobs; the harness injects `PI_SUBAGENTS=1` so test sessions start with the tools active.

**tmux is agents-only** (local patch — upstream requires pi inside tmux). The main terminal runs pi plain. When a subagent spawns and pi is not inside tmux, panes appear in a detached session `pi-agents` — attach with `tmux attach -t pi-agents`, detach with `Ctrl+b d`. The tmux binary is required either way.

Spawn-failure triage: the model says it has no `subagent` tool = **spawn tools gated** — run `/subagents on` (or `/subagents <agent> <task>`) and retry. `Install tmux (…)` = the tmux binary is missing.

Agent definitions in `agents/` are plain files — inert while the spawn tools are gated; discovery: project > global.

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

The permanent prefix costs ~0.7K tokens per session (AGENTS.md 2,702 chars ≈ 0.7K at ~4 chars/token; the 2 formerly auto-invocable skills went manual, so no skill descriptions sit in the model-visible catalog; subagents tool defs removed — see [CHANGELOG.md](CHANGELOG.md)). Bodies and references stay out of context until needed.

| Component | Target | Notes |
|-----------|--------|-------|
| AGENTS.md | as small as possible (behavioral core only) | no stack essays, no skill lists |
| Skill descriptions | short; delete dead skills | all 20 manual — zero per-session cost |
| **Total always-on** | ≤ ~1K tok | AGENTS.md only; no auto-skill catalog, no package tool defs |

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
| `prompts/` | Prompt templates (`/issue`: in-context validate→propose→fix; `/ship`: commit+push; `/update-changelog`) |
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

