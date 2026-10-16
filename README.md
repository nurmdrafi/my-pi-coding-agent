# pi agent harness

[![release CI](https://img.shields.io/github/actions/workflow/status/nurmdrafi/my-pi-coding-agent/release.yml?label=release%20CI&logo=githubactions&logoColor=2088FF&labelColor=24292f&style=flat-square)](https://github.com/nurmdrafi/my-pi-coding-agent/actions/workflows/release.yml)
[![release](https://img.shields.io/github/v/release/nurmdrafi/my-pi-coding-agent?logo=github&logoColor=white&labelColor=24292f&style=flat-square)](https://github.com/nurmdrafi/my-pi-coding-agent/releases)
[![license](https://img.shields.io/badge/license-MIT-2ea44f?logo=opensourceinitiative&logoColor=white&labelColor=24292f&style=flat-square)](LICENSE)
[![pi coding agent](https://img.shields.io/badge/pi-coding_agent-8A2BE2?logo=github&logoColor=white&labelColor=24292f&style=flat-square)](https://github.com/earendil-works/pi-coding-agent)
<br>
[![node](https://img.shields.io/badge/node_%E2%A5%BC_22.19_%C2%B7_.nvmrc_24-339933?logo=nodedotjs&logoColor=5FA04E&labelColor=24292f&style=flat-square)](#requirements)
[![macOS](https://img.shields.io/badge/macOS-6e7681?logo=apple&logoColor=A2AAAD&labelColor=24292f&style=flat-square)](#portability)[![Linux](https://img.shields.io/badge/Linux-FCC624?logo=linux&logoColor=FCC624&labelColor=24292f&style=flat-square)](#portability)
[![language](https://img.shields.io/badge/language-TypeScript-3178C6?logo=typescript&logoColor=white&labelColor=24292f&style=flat-square)](#extensions)
[![rust](https://img.shields.io/badge/rust-default-DEA584?logo=rust&logoColor=white&labelColor=24292f&style=flat-square)](#requirements)
[![tmux](https://img.shields.io/badge/tmux-optional-6e7681?logo=tmux&logoColor=1BB91F&labelColor=24292f&style=flat-square)](#subagents)
[![skills](https://img.shields.io/badge/skills-manual-2563eb?logo=readthedocs&logoColor=8CA1AF&labelColor=24292f&style=flat-square)](#skills)
[![extensions](https://img.shields.io/badge/extensions-ts-2563eb?labelColor=24292f&style=flat-square)](#extensions)

A portable, git-synced configuration for the [pi coding agent](https://github.com/earendil-works/pi-coding-agent) — one `~/.pi/agent/` directory that turns any macOS or Linux machine into a fully configured coding-agent workstation in minutes.

**Why this exists:** coding-agent configs rot — they accumulate always-on prompt bloat, machine-specific paths, and undocumented setup rituals. This harness treats the config itself as an engineered product: a lean behavioral core, progressive-disclosure skills, always-on extensions that enforce discipline at the tool-call level, and a measured token budget (~0.5K tokens permanent floor) so every session starts cheap.

- **One directory, one repo** — `git clone` is the entire install; git is the only sync mechanism.
- **Zero env vars required for setup, zero absolute paths** — everything works from the default `~/.pi/agent` location; optional knobs are documented where relevant, never required.
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

# 4. Bootstrap — npm deps, pidoc shim, pidx + piread + piedit builds (Rust tools are default; cargo missing is reported, never auto-installed)
sh ~/.pi/agent/scripts/bootstrap.sh
```

After bootstrap, later `git pull`s re-check the setup automatically — husky `post-merge`/`post-rewrite` run `scripts/after-pull.sh`: refresh npm deps when the lockfile moved, recreate the `pidoc` shim, rebuild `pidx`/`piread` when stale, then run a full `pidoc --fix` health check. Safe non-privileged fixes apply automatically; missing toolchains are reported, never installed.

Then verify and start pi:

```console
$ ~/.pi/agent/bin/pidoc
# expect 0 FAIL (warnings OK — e.g. no cargo yet means session-audit uses its Node fallback)

$ pi
# First run regenerates npm/, git/, models-store.json automatically; bin/ came from bootstrap.
```

Optional, for subagents: `brew install tmux` (macOS) or `sudo apt install tmux` (Linux).

That's it for the bootstrap itself; one optional shell export pins the same
tools in your own terminals — see [Custom tool binaries](#custom-tool-binaries).

## Custom tool binaries

`bin/` is gitignored and regenerated; pi prepends it to `PATH` for every bash
call, and your shell rc should prepend it too — zsh: `~/.zshenv`, bash:
`~/.bashrc` (`export PATH="$HOME/.pi/agent/bin:$PATH"`) — so terminals on
macOS and Linux resolve identically:

| Binary  | Purpose | Rebuild |
| ------- | ------- | ------- |
| `rg`    | Search default (permission-gate SS2 rg-first); built **with PCRE2** so `rg -P` never needs a grep fallback | `cargo install ripgrep --features pcre2 --root ~/.pi/agent` |
| `piread`| Native read tool (AGENTS.md tooling default; built-in `read` is the fallback and still certifies Anchor Guard edit coverage) | `scripts/bootstrap.sh` |
| `piedit`| Native edit tool (AGENTS.md tooling default; built-in `edit` is the fallback. Native diff/patch render — byte-identical jsdiff port — makes it 2.4–9.2× faster than the built-in; `piedit` calls are edit-kind in permission-gate, so Anchor Guard/coverage protection is unchanged) | `scripts/bootstrap.sh` |
| `pibash`| Native shell tool (built-in `bash` is the fallback. Byte-exact parity with the built-in envelope, pinned by `tests/pibash-parity.test.mjs`; `pibash` calls are bash-kind in permission-gate, so the H1 cap, R10 re-run guard, destructive analysis, and mutation tracking all apply) | `scripts/bootstrap.sh` |
| `pidx`, `fd`, `pidoc` | Session-audit fast path, `find` default (permission-gate SS3 fd-first), this health check | `scripts/bootstrap.sh` |

`pidoc` verifies all of the above — look for the `rg-pcre2`, `piread`, and
`shell-path` rows.

## Requirements

| Requirement | Detail                                                |
| ----------- | ----------------------------------------------------- |
| Node.js     | ≥ 22.19 (`.nvmrc` pins 24, the current LTS)           |
| OS          | macOS or Linux                                        |
| Terminal    | Any modern terminal (VS Code integrated terminal is the default here) |
| tmux        | Only if using subagents — see [Subagents](#subagents) |
| Rust (cargo) | Default requirement — builds the first-class native tools `piread` (text-file reader), `piedit` (text-file editor), `pibash` (shell runner), and `pidx` (session-log indexer), registered under their own TUI labels; see [Extensions](#extensions). Opt out per tool with `PI_NATIVE_READ=0` / `PI_NATIVE_EDIT=0` / `PI_NATIVE_PIDX=0` / `PI_NATIVE_BASH=0` (fails open to the built-in reader / editor / Node parser). Bootstrap prints the rustup command if cargo is missing |
| Git         | For sync; `~/.pi/agent` is itself a repo              |

## What's inside

```
~/.pi/agent/
├── AGENTS.md                 # Always-on behavioral core (kept short & byte-stable)
├── docs/                     # Scoped rule sets — load on demand via AGENTS.md links
├── settings.json             # Provider / model / theme / thinking (no secrets)
├── auth.json                 # API keys — gitignored, copied once per machine
├── models.json               # Custom model defs (glm-5.3-flash)
├── models-store.json         # Catalog cache (machine-local, auto-regenerated)
│
├── skills/                   # one dir per skill: SKILL.md + scripts/ references/ assets/
├── extensions/               # Always-on TS extensions (permission-gate, subagents, handoff)
├── agents/                   # Subagent definitions (scout/researcher/worker/reviewer)
├── custom-tools/             # Rust workspace: native helper crates (pidx — session-log indexer; piread — native read tool; piedit — native edit tool)
├── benchmark/                # Model-graded benchmark tasks + validators
├── codemode/                 # Codemode scripts (non-LLM helpers)
├── scripts/                  # Repo tooling (doc-check, agents-lint, gate-eval)
├── prompts/                  # /command prompt templates (/issue, /ship, /update-changelog)
├── tests/                    # Node test runner suite (permission-gate, doc-check)
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

All skills are **manual** — invoke with `/skill:<name>`; none auto-load on task match. `/ship` (commit+push with scoped review) is not a skill — it is a prompt template in [`prompts/`](#whats-inside): zero context cost until invoked. Skill bodies never enter context until invoked.

| Skill                     | Purpose                                                                                                 | Invocation                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| ponytail                  | Lazy-minimum intensity modes (lite/full/ultra) over the AGENTS.md ladder + over-engineering review mode | `/skill:ponytail`                   |
| web-search                | Web search + URL extraction via Tavily CLI (`tvly search` / `tvly extract`)                             | `/skill:web-search`                 |
| systematic-debugging      | Phased root-cause debugging (incl. error-class loops) before proposing any fix                          | `/skill:systematic-debugging`       |
| pre-push-review           | CI-parity correctness review of the diff before commit/push                                             | `/skill:pre-push-review`            |
| auth                      | NextAuth v4 credentials auth for Next.js App Router against an external REST IdP                        | `/skill:auth`                       |
| brainstorming             | Explore genuinely-unclear feature direction; one question at a time                                     | `/skill:brainstorming`              |
| browser-tools             | Live DOM via CDP `:9222` — Playwright/e2e only (deps: `npm install` at skill root)                      | `/skill:browser-tools`              |
| documentation-writer      | Diátaxis-based tech writer: SDK docs, READMEs, CONTRIBUTING, docs audits                                | `/skill:documentation-writer`       |
| fallow-audit              | Dead-code / unused-export / unused-dependency cleanup (fallow, knip, ts-prune, depcheck)                | `/skill:fallow-audit`               |
| frontend-design           | New web components/pages/apps from scratch (detects the UI stack)                                       | `/skill:frontend-design`            |
| github-actions            | Author/harden CI workflows: SHA-pinned actions, scoped secrets, actionlint                              | `/skill:github-actions`             |
| grill-me                  | Relentless one-question-at-a-time stress-testing of a plan/decision                                     | `/skill:grill-me`                   |
| harness-engineer          | Meta: audit/improve this harness (budgets, evidence, skill audits, anti-pattern sweep)                  | `/skill:harness-engineer`           |
| map-integration           | Any map work: maplibre/mapbox-gl, deck.gl, turf, draw; Barikoi stack                                    | `/skill:map-integration`            |
| llm-format-checker        | LLM-rule markdown format check/fix (AGENTS.md, system prompts, SKILL.md bodies): bold/heading/list discipline | `/skill:llm-format-checker`        |
| pidoc                     | Harness setup health check — node pin, cargo/pidx, helper CLIs, gate, settings, hooks, dirs, audit; `--fix` rebuilds pidx | `/skill:pidoc`                      |
| playwright-tester         | e2e specs, stress/update-flow runs, bug-hunt iterations, untested-critical-path coverage                | `/skill:playwright-tester`          |
| refactoring-ui            | Audit/fix existing UI: hierarchy, spacing, color, depth, small UI defects                               | `/skill:refactoring-ui`             |
| rust-skills               | Rust coding guidelines (265 rules, 26 categories): ownership, errors, async, unsafe, API, serde, testing | `/skill:rust-skills`                |
| sdk-development           | Installable packages (Go/npm/CLI): OpenAPI codegen, test, publish                                       | `/skill:sdk-development`            |
| session-audit             | Token/cost waste audit of `~/.pi/agent/sessions`                                                        | `/skill:session-audit`              |
| skill-manager             | Create/modify SKILL.md + mandatory validator gate                                                       | `/skill:skill-manager`              |

### Skill layout (validator-enforced)

```text
<name>/
├── SKILL.md        # required; the only loose file allowed at top level
├── scripts/        # executable code (.sh/.mjs/.py/...), incl. helper modules
├── references/     # additional docs read on demand (progressive disclosure)
└── assets/         # static resources: templates, images, data files
```

Layout is enforced by `node skills/skill-manager/scripts/validate-skill.mjs <skill-dir>` (exit 0 required); `npm run doc:check` additionally verifies harness commands/paths declared in markdown resolve — optional toolchains (e.g. Rust), reference-doc example artifacts, and machine-only tools are reported info-only.

## Subagents

Owned first-party code at `extensions/subagents/` (`subagent` / `subagent_message` / `subagents_list` + `/subagents` command) — vendored from `amosblomqvist/pi-interactive-subagents@c3e8b53c0754ae5ccc19fdab5a7481ec039bc2f7` (itself a tmux-only fork of HazAT's) with the former `patches/*.patch` folded in: agents-only tmux + tmux ≥3.0 compat (upstream's pane filtering needs ≥3.2 — we list unfiltered and filter in-process; works on macOS brew and distro apt builds alike) and the permission-gate extension re-enabled inside sandboxed subagent spawns (`PI_SUBAGENT_EXTRA_EXTENSIONS` colon-separated override). No `settings.json` → `packages` entry; `pi update --extensions` can no longer wipe it.

**Gated by default** — the spawning tools are registered inactive in top-level sessions (zero prompt tokens) until a trigger activates them:

- `/subagents on` / `/subagents off` — toggle for the session
- `/subagents [agent] [task]` — any spawn auto-enables; the agent name is optional (prose like `/subagents use the worker to fix X` picks the named agent; with no agent named at all, the session model routes by task via `subagents_list`)
- `PI_SUBAGENTS=1` — start active (scripted opt-in)

Subagent sessions always register active (the child's `--tools` sandbox governs). Activation appends the tool set before the next model request (one-time cached-prefix invalidation possible). Upstream updates are manual: fetch any clone, `git diff c3e8b53..<new> -- pi-extension`, apply into `extensions/subagents/`.

**Tests** — `node --test tests/subagents/test.ts` (unit, mock-based; also `node tests/subagents/system-prompt-mode.test.ts`). Integration under `tests/subagents/integration/`: real pi + real model inside tmux — model/timeout knobs (defined in `tests/subagents/integration/harness.ts`); the harness injects `PI_SUBAGENTS=1` so test sessions start with the tools active.

**tmux is agents-only** (local patch — upstream requires pi inside tmux). The main terminal runs pi plain. When a subagent spawns and pi is not inside tmux, panes appear in a detached session `pi-agents` — attach with `tmux attach -t pi-agents`, detach with `Ctrl+b d`. The tmux binary is required either way.

Spawn-failure triage: the model says it has no `subagent` tool = **spawn tools gated** — run `/subagents on` (or `/subagents <agent> <task>`) and retry. `Install tmux (…)` = the tmux binary is missing. Full setup, headless/print-mode behavior, and triage: [`extensions/subagents/README.md`](extensions/subagents/README.md).

Agent definitions in `agents/` are plain files — inert while the spawn tools are gated; discovery: project > global.

| Agent      | Tools                                                           | Role                                         |
| ---------- | --------------------------------------------------------------- | -------------------------------------------- |
| scout      | read, grep, find, ls                                            | read-only recon                              |
| researcher | read, bash                                                      | web research via `tvly` CLI                  |
| worker     | read, write, edit, bash (+ may spawn scout, researcher)         | general implementer                          |
| reviewer   | read, bash, grep, find, ls (auto-loads `pre-push-review` skill) | pre-commit diff review; never commits/pushes |

No `model` pin — sub-agents inherit the harness default from `settings.json`; the spawn-time `model` param still overrides.

## Extensions

Always-on TypeScript modules in `extensions/` — loaded by pi, never in the model prefix. Always-on modules, plus the gated `subagents/` tool set above: **`permission-gate/`**, a `tool_call` interceptor providing:

- edit-anchor pre-validation (oldText must match a region actually read)
- reading/output economy rules (in-context re-read guard, capped bash output)
- destructive-command confirm (chat approval, UI dialog, user-owned allowlist)
- identical re-run guard (R10)
- commitlint conventional-commit validation on `git commit -m` headers (R9)

**`handoff.ts`** adds `/handoff <goal>` — drafts a context-transfer prompt from the session (compaction-aware), opens it in the editor, then opens the new session with the draft; nothing is written to disk — the new session's first message is the artifact.

Raw events (tool errors, guard blocks) land in pi's native `sessions/**/*.jsonl` — the audit toolkit derives every signal from there. Full docs: [`extensions/README.md`](extensions/README.md).

**`piread/`** registers the Rust text-file reader as its own first-class tool labeled **`piread`** in the TUI (2026-10-16 redesign: it previously shadowed the built-in `read` under the same name). Parameters match the built-in reader verbatim; text files route to the native pipeline, images stay on `read`. Dispatch goes through a persistent `--serve` daemon (lazy-started, id-matched line protocol over stdio) so reads don't pay a process spawn per call; a one-shot CLI spawn and then the built-in implementation remain as fallback rungs. Default on; opt out with `PI_NATIVE_READ=0`, which registers nothing.

**`piedit/`** registers the Rust text-file editor as its own first-class tool labeled **`piedit`**. Parameters, schema, argument normalization, and TUI renderers match the built-in `edit` verbatim; the Rust side owns read → normalize → match → apply → write, and diff/patch rendering stays on the exported TypeScript `generateDiffString`/`generateUnifiedPatch` helpers so `details` is byte-identical by construction. Dispatch goes through a persistent `--serve` daemon (lazy-started, id-matched NDJSON over stdio) so edits don't pay a process spawn per call; a one-shot CLI spawn and then the built-in implementation remain as fallback rungs, all inside the exported `withFileMutationQueue`. Any transport or envelope failure falls back to the built-in executor plus one stderr line (fail-open). permission-gate treats `piedit` calls as edit-kind, so Anchor Guard, protected-path confirms, the M1/M2/M3 chain, and read→edit coverage binding all apply exactly as for `edit`. Default on; opt out with `PI_NATIVE_EDIT=0`, which registers nothing. Parity is enforced by `tests/piedit-parity.test.mjs` (58 cases: corpus, errors, unicode/CRLF/BOM, @/file:///~/NBSP path resolution, read-only/validation errors, daemon client, gate lock-ins).

**`pibash/`** registers the Rust shell runner as its own first-class tool labeled **`pibash`**. Parameters and prompt snippet are copied verbatim from `createBashToolDefinition`, and the crate owns spawn → stream → cap → truncate → spill → envelope; the extension layer keeps the session-sensitive parts (env and `PI_*` injection, cancellation, TUI renderers). Dispatch goes through a persistent `--serve` daemon (lazy-started, id-matched NDJSON over stdio, spawned in its own process group so a timeout kills the whole tree) so commands do not pay an extra process spawn per call; a one-shot CLI spawn and then the built-in implementation remain as fallback rungs. Any transport or envelope failure falls back to the built-in executor plus one stderr line (fail-open). permission-gate treats `pibash` calls as bash-kind, so the H1 output cap, R10 re-run guard, destructive-command analysis, malformed-input check, and mutation tracking all apply exactly as for `bash`. Built-in `bash` is blocked while pibash is registered (permission-gate P2, "Pibash-first") so shell work runs through the native pipeline — pibash runs the same schema and bash-kind rules and falls back to the built-in executor itself, so the block never strands the agent; `PI_NATIVE_BASH=0` disables pibash and restores `bash`. Default on. Parity is enforced by `tests/pibash-parity.test.mjs` (61 cases, byte-exact against the built-in for content, truncation, exit code, structured output, streaming, cancellation, and detached children) and bash-kind lock-ins in `tests/permission-gate.test.mjs`. pibash forwards the context env keys the built-in `bash` injects — `PI_SESSION_ID`, `PI_SESSION_FILE`, `PI_PROVIDER`, `PI_MODEL`, `PI_REASONING_LEVEL` — so commands see the same `PI_*` context.

**`pidx/`** registers the Rust session-log indexer as its own first-class tool labeled **`pidx`** — parses session transcripts into compact per-session extracts (turns, tool calls with param hashes, tool results, compactions, skill loads), incremental via a (size, mtime) cache so warm runs are O(changes). Session-audit's fast path and session-history analysis call it directly; failures throw and fall back to the Node parser. `PI_PIDX_MAX_INLINE` changes the inline extract cap (default 2000 chars). Default on; opt out with `PI_NATIVE_PIDX=0`.

### Native tool performance

Every number below is measured, not guessed — methodology and raw runs live in `benchmark/runs/*-microbench-*.md` and `CHANGELOG.md`. The read/edit/index numbers are Linux x64 (the current benchmark host); macOS and Linux path/keyboard parity is covered by the test suites, not by a second benchmark host.

**`pidx` — session-log indexing** (Rust vs the prior Node parser; this repo's archive, 474 sessions / 85 MB of transcripts, verified 2026-10-16):

| Corpus class | Built-in parser | Rust `pidx` | Speedup |
| --- | ---: | ---: | ---: |
| Warm (cache hit, 474/474 reused) | ~0.28 s | ~0.01 s (14 ms measured) | **~28×** |
| Cold (full re-parse, 474 sessions) | ~0.45 s | ~0.22 s (original host 0.22 s; slower host 0.80 s) | **~2×** |
| Warm peak RSS | ~290 MB | ~17 MB | **~17× less memory** |

Warm runs are O(changes), not O(archive): the state store replays unchanged sessions from cached byte ranges without re-parsing or re-serializing.

**`piread` — text-file reads** (daemon dispatch vs the built-in reader; linux x64, node v24, N=200/arm, p50 ms, confirmation run B from `benchmark/runs/piread-microbench-2026-10-15-daemon-opt.md`):

| Corpus class | Built-in reader | Rust `piread` (daemon) | Speedup |
| --- | ---: | ---: | ---: |
| One-line file | 0.304 | 0.114 | **2.7×** |
| CRLF file | 0.292 | 0.072 | **4.1×** |
| Unicode text | 0.277 | 0.060 | **4.6×** |
| Long lines | 0.263 | 0.089 | **3.0×** |
| 2500 lines | 1.393 | 0.505 | **2.8×** |
| 60 KB single blob | 0.629 | 0.703 | ~1× (parity) |
| 60 KB head slice | 0.416 | 0.238 | **1.7×** |

The 60 KB single-blob class sits at measured parity: the residual Δ ≤ +0.07 ms is within run-to-run variance (noise floor), separate from the structural costs described next, and the earlier regression is closed. The persistent daemon removes the **3.4–3.6 ms per-call spawn floor** the one-shot CLI arm pays (3.1–5.7 ms); daemon RSS is 2 MB. Structural floor (not variance): ~0.083 ms round-trip scheduling + ~0.10 ms Node-side `JSON.parse` of large envelopes — pinned by result parity with the built-in.

**`piedit` — text-file edits** (daemon dispatch vs the built-in `edit`; linux x64, node v24, N=100/arm, p50 ms, `benchmark/runs/piedit-microbench-2026-10-16.md`, after the native Rust diff/patch render `17e4792`):

| Corpus class | Built-in `edit` | Rust `piedit` (daemon) | Speedup |
| --- | ---: | ---: | ---: |
| Small exact | 0.513 | 0.288 | **1.8×** |
| Small fuzzy (trailing ws) | 0.445 | 0.308 | **1.4×** |
| Mid exact (1 of 200) | 0.893 | 0.342 | **2.6×** |
| Mid multi (2 of 200) | 0.854 | 0.327 | **2.6×** |
| Multiline block | 2.556 | 1.033 | **2.5×** |
| Large (~1 MiB) | 90.630 | 36.416 | **2.5×** |

Same test on a tmpfs corpus, where the shared ~18–20 ms ext4 truncate+write drops out and the structural ratios surface:

| Corpus class | Built-in `edit` | Rust `piedit` (daemon) | Speedup |
| --- | ---: | ---: | ---: |
| Small exact | 0.428 | 0.180 | **2.4×** |
| Small fuzzy (trailing ws) | 0.411 | 0.182 | **2.3×** |
| Mid exact (1 of 200) | 0.817 | 0.215 | **3.8×** |
| Mid multi (2 of 200) | 0.623 | 0.235 | **2.7×** |
| Multiline block | 2.483 | 0.738 | **3.4×** |
| Large (~1 MiB) | 88.246 | 9.628 | **9.2×** |

Every class is at or below the built-in. The wins come from the 2026-10-16 perf pass plus the native render: one shared `FuzzyView` (the JS semantics re-normalize the whole content **per edit** — matching pre-pass, replacement base, and every occurrence count; the Rust side builds the fuzzy view lazily once, observably identical because the function is deterministic and idempotent), NFKC skipped entirely for pure-ASCII input with no per-line allocations, `Cow` LF/BOM normalization, and Buffer-based line scanning in both Node clients (the previous `setEncoding` string path re-flattened the rope on every pipe chunk — O(n²) on MiB-scale envelopes). The large class now runs at ~2.5× instead of parity: the Rust side renders the diff/patch (`src/diff.rs`, a byte-identical jsdiff port pinned by the parity suite plus `tests/piedit-diff-fuzz.mjs`), so the TypeScript `generateDiffString`/`generateUnifiedPatch` pass and the `{baseContent,newContent}` IPC payload are both gone. The disk corpus lives on an ~84%-full ext4 root, where a 590 KB truncate+write costs ~18–20 ms that **both** arms pay (identical `writeFile` semantics, R4), flooring the ratio; on tmpfs the large class reaches **9.2×** (88.2 → 9.6 ms). The earlier +30.9 ms regression and the size-based-routing follow-up are retired. Parity held throughout: crate 40/40, `tests/piedit-parity.test.mjs` 51/51, `tests/piedit-diff-fuzz.mjs` 0 failures, clippy `-D warnings` clean.

**`pibash` — shell commands** (daemon dispatch vs the built-in `bash`; linux x64, node v24, N=60/arm, p50 ms, `benchmark/runs/pibash-microbench-2026-10-16.md`):

| Command class | Built-in `bash` | Rust `pibash` (daemon) | Speedup | Bare-spawn floor |
| --- | ---: | ---: | ---: | ---: |
| `true` | 4.13 | 2.84 | **1.5x** | 3.88 |
| `printf hi` | 4.06 | 2.88 | **1.4x** | 3.65 |
| `rg --version` | 5.79 | 4.54 | **1.3x** | 5.24 |
| `seq 1 1000` | 4.94 | 3.82 | **1.3x** | 4.30 |
| `seq 1 2500` (line cap) | 6.45 | 5.30 | **1.2x** | 4.35 |
| `seq 1 50000` (byte cap) | 10.60 | 13.53 | **0.8x** | 6.58 |
| `head -c 200000 /dev/zero | md5sum` | 7.10 | 5.16 | **1.4x** | 6.66 |
| stdout+stderr mix | 4.90 | 2.97 | **1.6x** | 4.59 |
| `exit 3` | 5.09 | 2.85 | **1.8x** | 4.58 |

Eight of nine classes beat the built-in (1.2-1.8x). The win is not output shaping - it is that the daemon removes the per-call process spawn, so `pibash` lands at or below a bare `spawn('/bin/bash')` floor on the cheap classes. The single regression is `seq 1 50000`, and the cost is the envelope, not the shell: the built-in result shape carries the payload twice (`content[0].text` plus the 1 MiB-capped `structuredContent.output`), so any byte-parity implementation must materialize and ship both. The daemon does remove the one genuinely redundant copy - `truncation.content` is always an exact prefix of the display text, so `--serve` omits it and the extension restores it, keeping `details.truncation` byte-identical (~14 KB smaller envelope on the large class). Parity held throughout: crate 47/47, `tests/pibash-parity.test.mjs` 51/51, permission-gate 266/266, clippy `-D warnings` clean.

## Context layers

What is in context, and when:

| Layer              | What                    | When in context           | Stability rule            |
| ------------------ | ----------------------- | ------------------------- | ------------------------- |
| System + tools     | pi built-in             | every turn                | pi-managed                |
| **AGENTS.md**      | global behavioral rules | every turn                | **must stay byte-stable** |
| Scoped rule docs   | `docs/*.md` rule sets   | task touches the area     | read on demand            |
| Skill descriptions | frontmatter only        | every turn                | **must stay byte-stable** |
| Skill bodies       | SKILL.md full text      | on match or `/skill:name` | load on demand            |
| Project AGENTS.md  | repo rules              | when present              | overlays global           |

### Skill discovery order

1. Project `.pi/skills/` / `.agents/skills/` (if trusted)
2. `~/.pi/agent/skills/` ← **canonical**
3. `~/.agents/skills/` ← neutralize manually (rename to `skills.disabled.<date>`) so it does not leak

## Always-on token budget

The permanent prefix costs ~0.5K tokens per session (AGENTS.md 2,249 bytes ≈ 0.5K at ~4 chars/token; scoped rules now live in `docs/` and load on demand; the 2 formerly auto-invocable skills went manual, so no skill descriptions sit in the model-visible catalog; subagents tool defs removed — see [CHANGELOG.md](CHANGELOG.md)). Bodies and references stay out of context until needed.

| Component           | Target                                      | Notes                                                       |
| ------------------- | ------------------------------------------- | ----------------------------------------------------------- |
| AGENTS.md           | as small as possible (behavioral core only) | no stack essays, no skill lists                             |
| Skill descriptions  | short; delete dead skills                   | all manual — zero per-session cost                       |
| **Total always-on** | ≤ ~1K tok                                   | AGENTS.md only; no auto-skill catalog, no package tool defs |

Thinking is `off` by default (token economy); bump per-task with `--thinking high`.

## Portability

Goal: one self-contained config that works on any macOS or Linux machine by replacing `~/.pi/agent/`. No env vars required for setup, no absolute user paths.

### Sync workflow (git is the only sync)

```sh
# Machine A (source of changes)
cd ~/.pi/agent && git add -A && git commit -m "harness: <what>" && git push

# Machine B
cd ~/.pi/agent && git pull
# fresh clone instead? sh scripts/bootstrap.sh (deps + shims + pidx + health check)
# then start a fresh pi session — first run regenerates npm/, git/, models-store.json
```

`auth.json` (secrets) is copied manually **once per machine** via `scp` (or `/login` per provider). It is never in git; `.gitignore` enforces this. On key rotation, update `auth.json` on each machine.

### Providers

| Provider   | Role                 | Models                                                                |
| ---------- | -------------------- | --------------------------------------------------------------------- |
| `zai`      | default              | `glm-5.3`; `models.json` adds `glm-5.3-flash` (1M context, reasoning) |
| `deepseek` | secondary (`/model`) | built-in catalog                                                      |

Both keys are identical across machines and live only in `auth.json`. pi also accepts `ZAI_API_KEY` / `DEEPSEEK_API_KEY` env vars but does not auto-load any `.env`; `auth.json` is the single secrets file.

### Tracked in git (portable, OS-agnostic)

| Path                                    | Purpose                                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `AGENTS.md` + `docs/`                   | Behavioral core (always-on) + scoped rule sets loaded on demand                                       |
| `settings.json`                         | Provider/model/theme/thinking (no secrets)                                                              |
| `models.json`                           | Custom model definitions                                                                                |
| `agents/`                               | Subagent definitions (scout/researcher/worker/reviewer)                                                 |
| `prompts/`                              | Prompt templates (`/issue`: in-context validate→propose→fix; `/ship`: commit+push; `/update-changelog`) |
| `skills/`                             | All skills (manual, `/skill:name`)                                                                 |
| `extensions/`                           | Always-on extensions (permission-gate, subagents, handoff)                                                                |
| `tests/`                                | permission-gate + doc-check suites, gate-eval audits (`npm run gate:eval`)                                                           |
| `.github/workflows/`                    | Release CI/CD (version from CHANGELOG, on push to main)                                                 |
| `package.json` / `commitlint.config.js` | husky + commitlint: conventional-commit enforcement                                                     |
| `README.md` / `CHANGELOG.md`            | This file + change log                                                                                  |
| `.nvmrc`                                | Pins Node 24                                                                                            |
| `LICENSE`                               | MIT                                                                                                     |
| `.gitignore`                            | Secret/caches hygiene                                                                                   |

### Machine-local (gitignored, never synced)

| Path                      | Why                                                                               |
| ------------------------- | --------------------------------------------------------------------------------- |
| `auth.json`               | Secrets — copy once per machine; never in git                                     |
| `bin/`                    | Platform binaries, auto-downloaded per arch (currently `fd`)                      |
| `npm/`                    | pi-managed `pi install npm:<pkg>` store                                           |
| `git/`                    | pi-managed `pi install git:<repo>` clones (re-created on next `pi install git:…`) |
| `skills/**/node_modules/` | Per-skill deps — regenerable via `npm install` in the skill dir                   |
| `models-store.json`       | Provider model catalog (regenerable cache)                                        |
| `sessions/`               | Session history, keyed by absolute project paths → per-machine                    |
| `audit-reports/`          | Dated audit artifacts; reports name private projects, this repo is public         |
| `*.log`                   | Debug logs                                                                        |

### Portability rules (enforced)

- No `/Users/...` or `/home/...` literals in any shipped file (only `~` / `$HOME`).
- Shell helpers are POSIX (`#!/usr/bin/env sh`) or bash-portable.
- No unguarded OS-only commands (`/proc` reads fall back to `ps`; server script picks `xdg-open` on Linux vs `open` on macOS).
- No pi env vars required for setup — config relies on the default `~/.pi/agent` (the vendored extension respects upstream `PI_CODING_AGENT_DIR` where set).

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

- **Tests:** `node --test "tests/**/*.test.mjs"` (permission-gate, 176 cases); `npm run gate:eval` aggregates the fixture suite with the block-recovery and replay audits and prints a final JSON metrics line. Subagent tests: see [Subagents](#subagents).
- **Conventional commits:** enforced by husky + commitlint on every commit
- **CI:** [Release workflow](https://github.com/nurmdrafi/my-pi-coding-agent/actions/workflows/release.yml) extracts the version from `CHANGELOG.md` on push to `main`

| File                           | Update when                                                          |
| ------------------------------ | -------------------------------------------------------------------- |
| [`CHANGELOG.md`](CHANGELOG.md) | every harness change (what / why / risk / measured delta)            |
| `README.md` (this file)        | structure, skill roster, budget, or sync/portability contract change |

**Goal:** smaller, more stable, cache-friendly, rg-first, fully portable harness.

## License

[MIT](LICENSE) © nurmdrafi
