# Skills Audit & Pi Migration — Record

**Date:** 2026-08-11
**Scope:** all Claude Code session history (`~/.claude/projects/`, 264 transcripts, 40,727 lines)
**History range:** 2026-07-12 → 2026-08-10 (~30 days; this is the *entire* available history)
**Audience:** pi coding agent (primary harness going forward); Claude Code persisted for session lookup only.

---

## 1. Methodology

- **Real usage signal = Skill-tool invocations** (structured `{"name":"Skill","input":{"skill":"…"}}` calls). Unambiguous.
- **Slash-command counts were rejected as signal.** Patterns like `/ponytail`, `/frontend-design`, `/api` collide with file/API paths (`…/ponytail/ponytail/4.8.4/…`, `/rider-cod-deposits`). A leading-token check showed commands are almost never the first token of a user message (only `/superpowers` once) → the high counts were path noise, not invocations.
- **Token cost** = SKILL.md body size / 4 (invocation cost) + frontmatter description (always-on cost).
- **Always-on overlay detection:** ponytail's core directive ("lazy senior developer…") appears injected in every sampled session → it is an always-on behavioral overlay, not a per-task tool. This drives the pi design (core baked into `AGENTS.md`).

## 2. Real usage — all time (Skill-tool calls)

| Skill | Calls | Sessions | Last used | Verdict |
|---|--:|--:|---|---|
| frontend-design | 13 | 8 | 2026-08-06 | Keep |
| brainstorming | 11 | 10 | 2026-08-02 | Keep |
| systematic-debugging | 8 | 8 | 2026-07-29 | Keep |
| ponytail | 7 | 4 | 2026-07-30 | Keep (+ always-on overlay) |
| using-superpowers | 3 | 3 | 2026-07-26 | Keep (router) |
| writing-plans | 3 | 3 | 2026-07-28 | Keep |
| subagent-driven-development | 2 | 2 | 2026-07-20 | Remove (redundant w/ executing-plans, 7,027 tok) |
| refactoring-ui | 2 | 1 | 2026-07-30 | Keep (trim) |
| ponytail-review | 1 | 1 | 2026-07-21 | Keep |
| executing-plans | 1 | 1 | 2026-07-28 | Keep (drops its twin) |

**Never invoked (all time):** `adhd`, `caveman` + 6 sub-commands, `cavecrew`, `ponytail-audit/debt/gain/help`, `writing-skills` (6,597 tok), `test-driven-development`, `using-git-worktrees`, `verification-before-completion`, `dispatching-parallel-agents`, `finishing-a-development-branch`, `requesting-code-review`, `receiving-code-review`, `web-design-guidelines`, `vercel-react-best-practices`.

> Note: `adhd` showed 33 "slash" hits but 0 Skill-tool calls and 0 leading-token occurrences — path noise, not real use. Confirmed removal.

## 3. Overlap clusters collapsed

- **UI:** `frontend-design` (new) + `refactoring-ui` (fix) + `web-design-guidelines` → keep 2, drop 1.
- **Planning pipeline:** `brainstorming → writing-plans → executing-plans` kept; `subagent-driven-development` dropped (90% redundant with executing-plans, 12× the tokens).
- **Review:** `ponytail-review` kept; `requesting/receiving-code-review` + `caveman-review` dropped.
- **Methodology plugins:** ponytail kept (daily driver, always-on); caveman dropped (0 uses, injected into all 261 sessions — biggest always-on tax).

## 4. Actions taken

| # | Action | Location |
|---|---|---|
| 1 | Disabled caveman plugin | `~/.claude/settings.json` (`caveman@caveman: false`) |
| 2 | Moved 22 dead skills → archive | `~/.agents/skills-inactive/` (22 entries) |
| 3 | Trimmed refactoring-ui | 19,472 B → 4,695 B (−76%) |
| 4 | Cleaned skill-lock | removed `adhd`, `web-design-guidelines` from `~/.agents/.skill-lock.json` |
| 5 | Backed up Claude settings | `~/.claude/settings.json.pre-audit.bak` |
| 6 | **Migrated canonical skills → pi** | copied 9 skills as real files into `~/.pi/agent/skills/` |
| 7 | Enabled pi auto-trigger | stripped `disable-model-invocation: true` from all 9 |
| 8 | Ponytail always-on in pi | baked core directive into `~/.pi/agent/AGENTS.md` |
| 9 | De-duplicated shared root | moved the 9 + `vercel-react-best-practices` out of `~/.agents/skills/` → inactive |
| 10 | Workflow memory | wrote `~/.pi/agent/AGENTS.md` (identity, stack, work-style, skill triggers) |

## 5. Final state

```
~/.pi/agent/
├── AGENTS.md            # always-on: identity + ponytail core + stack + skill triggers
├── skills-audit.md      # this file
└── skills/              # 9 canonical skills (real files, auto-trigger + /skill:name)
    ├── ponytail/        ponytail-review/   frontend-design/   refactoring-ui/
    ├── brainstorming/   writing-plans/     executing-plans/
    └── systematic-debugging/   using-superpowers/
```

- **pi loads exactly 9 skills** from `~/.pi/agent/skills/`. `~/.agents/skills/` is empty → no collision warnings.
- **Auto-trigger:** on (descriptions in system prompt; model loads body on match).
- **Manual:** `/skill:<name>` (pi `enableSkillCommands` defaults true).
- **Always-on overlay:** ponytail core via `AGENTS.md`; full modes via `/skill:ponytail`.
- **Claude Code:** `~/.claude/` untouched except the caveman disable + backup; persisted for session-history lookup. Its `~/.claude/skills/` still holds the 9 (legacy).

## 6. Rollback

```bash
# Restore Claude settings
cp ~/.claude/settings.json.pre-audit.bak ~/.claude/settings.json
# Restore archived skills to shared root
mv ~/.agents/skills-inactive/* ~/.agents/skills/
# Remove pi skill migration
rm -rf ~/.pi/agent/skills ~/.pi/agent/AGENTS.md ~/.pi/agent/skills-audit.md
```

## 7. Caveats

- Pi-skill copies are **decoupled from plugin cache** (real files). Superpowers/frontend-design/ponytail updates won't propagate automatically — re-copy if you want a new version.
- Cross-skill markdown links to *removed* skills (e.g. a ref to `test-driven-development`) are now dangling inside kept skills; harmless (broken link, not a crash).
- `using-superpowers` says "require skill invocation before ANY response" — can make pi eager to load skills. Intentional (auto-trigger is desired); soften in `AGENTS.md` if it over-triggers.

## 8. Revision 2 — single-file consolidation (2026-08-11, after `/ponytail` revalidation)

**Prompt:** revalidate against pi's lightweight ethos; skills must trigger only when needed, not always; all skills = ONE file; NO separate inactive folder.

**Why the change:** the earlier 9-skill layout had two defects — `using-superpowers` forced skill loads on a "1% chance" mandate (over-trigger → wasted round-trips + 2–10 KB bodies per forced load), and the AGENTS.md skill table duplicated what pi already injects. Verified against pi docs (`docs/skills.md`): progressive disclosure means only descriptions are always in context; the model reads the body only when a task matches — auto-trigger is inherently on-demand. The only real over-trigger risk was forcing language, now deleted.

**Applied:**
1. Deleted `using-superpowers`, `writing-plans`, `executing-plans` (3 uses / 1 use / 0-value router + forcing mandate).
2. Merged the remaining 6 methodologies (`ponytail`, `ponytail-review`, `frontend-design`, `refactoring-ui`, `brainstorming`, `systematic-debugging`) into ONE skill file: `~/.pi/agent/skills/handbook.md` (35.8 KB, ~8.9 K tok on-demand). Stripped "MUST-invoke" phrasing from all bodies (gentle triggers only).
3. Deleted all 6 separate skill dirs; `~/.pi/agent/skills/` now holds exactly ONE file.
4. Deleted the separate inactive folder `~/.agents/skills-inactive/` (32 dirs) — collapsed into ONE archive: `~/.pi/agent/skills-archive.tar.gz` (332 K, 41 SKILL.md files, reversible). Removed empty `~/.agents/skills/`.
5. AGENTS.md: dropped the redundant 9-row skill table; now a short pointer to the handbook with an explicit rule — *read only the needed section; never load for trivial requests*. Ponytail core stays always-on in AGENTS.md (the user's behavioral overlay).

**Final state — one folder, one file, zero ceremony:**
```
~/.pi/agent/
├── AGENTS.md                    # always-on: identity + ponytail core + stack + work-style + handbook pointer
├── skills/handbook.md           # THE single skill (6 methodology sections, model picks the needed one)
├── skills-archive.tar.gz        # legacy skills, ONE file (no separate inactive folder)
└── skills-audit.md              # this record
```

**Always-on token cost:** AGENTS.md ~952 tok + handbook description 617ch (~160 tok) ≈ **~1.1 K tok/session** (vs ~1.9 K before; bodies stay on-demand). Over-trigger mandate gone.

## 9. Revision 3 — reverted to separate skills (2026-08-11)

**Prompt:** "all skills inside single file" was my mistake.

**Action:** the single-file design was reversed. Restored the 6 kept skills from `skills-archive.tar.gz` as separate skill dirs in `~/.pi/agent/skills/` (preserving `brainstorming/scripts/` and `refactoring-ui/references/`), deleted `handbook.md`, and re-applied the two fixes: `disable-model-invocation` stripped (auto-trigger ON for all 6) and the brainstorming description softened ("Use before any creative work" — no forcing language). `using-superpowers`, `writing-plans`, `executing-plans` stay removed. Archive kept intact as backup (also the source for restoring the removed 3).

**Note on remaining "MUST" phrases:** 5 hits remain, all inside skill bodies (e.g. systematic-debugging "You MUST complete each phase before proceeding"). These are the skills' own workflow discipline — not invocation mandates — and are kept deliberately; trigger-gentleness is enforced at the description level (all clean, none say "must invoke/load a skill").

**Final state (same as Revision 1 lean cut):**
```
~/.pi/agent/
├── AGENTS.md            # always-on: identity + ponytail core + stack + work-style + skill list
├── skills/              # 6 separate skills (auto-trigger ON + /skill:name)
│   ├── ponytail/  ponytail-review/  frontend-design/  refactoring-ui/
│   └── brainstorming/(scripts/)  systematic-debugging/
├── skills-archive.tar.gz  # all 38 legacy skills, single backup file (no inactive folder)
└── skills-audit.md      # this record
```

**Always-on cost:** AGENTS.md ~952 tok + 6 descriptions (1,983ch ≈ 500 tok) ≈ **~1.5 K tok/session**; bodies on-demand. No invocation mandates anywhere.

## 10. Revision 4 — frontend-design stack adaptation (2026-08-11)

**Prompt:** design guidance belongs only in frontend-design; user's projects span Ant Design v4, latest AntD, and shadcn/Tailwind.

**Action:** added `## Stack Adaptation (do this FIRST)` to `~/.pi/agent/skills/frontend-design/SKILL.md` — detect the project's UI stack from package.json/existing components, then design within its idioms: AntD v4/v5 (primitives + tokens/ConfigProvider, aesthetics as refinement), shadcn/ui + Tailwind (registry, cn(), tokens), or vanilla (full freedom). Description updated to signal stack detection (348ch, ≤1024). No global design block added to AGENTS.md; no other skill touched.

---

## 11. Revision 5 — portable-config migration (2026-08-11)

**Prompt:** make the pi config fully portable (macOS + Linux) so the same `~/.pi/agent/` works on any PC via Google-Drive replace; no env vars; preserve token/cache efficiency; persist the audit across machines.

**Context:** the curated office config (macOS, `/Users/nur/`) was copied into a project dir and adopted onto a home Linux box (`/home/nurmdrafi/`). The two trees differed: office = rich (AGENTS.md + 6 skills + this audit + archive); home = sparse (only `browser-tools` + `youtube-transcript`). `zai` key was already identical; `omniroute` (localhost proxy) key differs by design (per-machine local proxy, not the default provider).

**Portability defects found & fixed:**
1. `bin/fd` in the office copy was a **Mach-O arm64** binary — would not run on Linux. **Not copied**; pi auto-downloads the correct arch per machine. (Excluded from bundle.)
2. AGENTS.md hardcoded `~/Barikoi/` (office project root) — generalized to path-agnostic wording.
3. `~/.agents/skills/` on the home box held 7 stale skills (adhd, shadcn, tailwind-design-system, ui-ux-pro-max, vercel-react-best-practices, web-design-guidelines, + a stale frontend-design). pi *always* scans `~/.agents/skills` (confirmed in pi source: `package-manager.js` → `userAgentsSkillsDir = ~/.agents/skills`). These were never used (see §2) and are outside the portable bundle → **renamed** to `~/.agents/skills.disabled.<ts>` (reversible). `setup.sh` re-applies this on every new machine.
4. `defaultThinkingLevel` was `max` on the home box (heavy reasoning-token burn) → set to **medium** (office's curated default).
5. AGENTS.md skill list hardcoded "Six skills" → generalized (count-free) and the two tool skills (`browser-tools`, `youtube-transcript`) added.

**Adopted into `~/.pi/agent/` (merge, not replace):** `AGENTS.md`, the 6 methodology skills, `skills-audit.md`, `skills-archive.tar.gz`, `zen-provider.template.json`. Pre-existing `browser-tools` + `youtube-transcript` retained → **8 skills total**.

**New portable infra (all inside `~/.pi/agent/`):** `PORTABILITY.md` (the contract: in-bundle vs machine-local, API-key story, sync procedure), `setup.sh` (idempotent per-machine: neutralize `.agents`, sanity-check files), `bundle.sh` (builds `~/pi-portable-<date>.tar.gz` excluding `bin/`, `npm/`, `sessions/`, logs), `CHANGELOG.md` (continuous-improvement log).

**Excluded from bundle (machine-local / auto-regenerated):** `bin/` (pi-downloaded platform binaries), `npm/node_modules/` (pi reinstalls from `settings.json` → `packages`), `sessions/` (keyed by absolute project paths), `*.log`.

**Final state (portable unit = `~/.pi/agent/`):**
```
~/.pi/agent/
├── AGENTS.md                 # always-on identity + ponytail core + skill list (portable)
├── settings.json             # zai/glm-5.2/medium, packages (portable)
├── auth.json                 # zai key (identical, portable)
├── models.json               # zai default + omniroute(localhost, per-machine)
├── models-store.json         # built-in catalog (portable)
├── zen-provider.template.json
├── skills/                   # 8 skills (6 methodology + 2 tools), portable
├── skills-audit.md           # this record (append-only, travels in bundle)
├── skills-archive.tar.gz     # 38 legacy skills backup
├── PORTABILITY.md  setup.sh  bundle.sh  CHANGELOG.md
└── (machine-local, NOT bundled) bin/  npm/  sessions/  *.log
```

**Always-on cost:** ~1.4 K tok/session (AGENTS.md ~960 + 8 descriptions ~430); bodies on-demand. No env vars; default `~/.pi/agent` path on both OSes.

**Rollback:** `~/.pi-backups/pi-agent.pre-portable.<ts>.tar.gz`; restore `~/.agents/skills` from `~/.agents/skills.disabled.<ts>`.

---

## 12. Revision 6 — harness-engineer skill + slash commands + frontend-design pattern-audit (2026-08-11)

**Prompt:** create a harness-engineering skill; document current harness arch inside `.pi`; deliver the COMPLETE slash-command solution for changelog/bump/commit (previously incomplete); frontend-design keeps failing to follow existing design patterns.

**Evidence:** Claude Code session history (264 transcripts on this machine): commit-message asks in 117 sessions, design-mismatch language in 56, changelog in 45, bump-version in 3 — corroborating user self-report.

**Skill set change (8 → 9):** added `harness-engineer` (`/skill:harness-engineer`) — the portable harness-engineering methodology; auto-trigger on config-audit / portability / token-tuning intents. Body references the new `HARNESS-ARCHITECTURE.md`.

**Slash commands added (NEW resource type — `prompts/`):** `/commit`, `/changelog`, `/bump`, `/release` (renamed from `/ship` — see Rev 7). These are prompt templates (token-cheap — NOT injected into the always-on prefix; they live in the `/` autocomplete menu only). This is the complete solution for the user's recurring release workflow.

**frontend-design root-cause fix:** the skill's loud "BOLD / DISTINCTIVE / UNFORGETTABLE / NEVER converge on common choices" directives directly caused new UI to ignore existing AntD dashboards. Rev 4's "Stack Adaptation" patch was too weak to override them. **Fix:** inserted a MANDATORY **Pattern Audit** first step (read 2–3 sibling components, extract theme tokens / spacing / color / typography / component patterns, reproduce verbatim) that explicitly OVERRIDES all aesthetic-novelty directives when an existing UI exists; retuned the `description` to signal pattern-first; gated the creative "Design Thinking" section as greenfield-only.

**New doc:** `HARNESS-ARCHITECTURE.md` — living map (layout, skill discovery incl. `~/.agents` caveat, prefix composition, token budget, persistence loop, portability contract) so any future session resumes from known state.

**Final state (9 skills + 4 slash commands):**
```
~/.pi/agent/skills/   ponytail  ponytail-review  frontend-design(pattern-audit)  refactoring-ui
                      brainstorming  systematic-debugging  harness-engineer  browser-tools  youtube-transcript
~/.pi/agent/prompts/  commit  changelog  bump  release
```

**Always-on cost:** AGENTS.md ~1.05 K tok + 9 descriptions ~570 tok ≈ **~1.6 K tok/session**; bodies on-demand; prompt templates 0 at rest.

**Rollback:** per-change recoverable from `~/.pi-backups/` and `skills-archive.tar.gz`; frontend-design pre-edit text is in the pre-portable backup.

## 13. Revision 7 — session-driven retune: 4 descriptions + AGENTS.md dedup + /preflight (2026-08-11)

**Prompt:** review the harness, learn from CC + pi session history, find each skill's failures, create a prompt; then "fix all" + upgrade harness-engineer to always analyze sessions and compare before/after snapshots.

**Evidence (mined, not assumed):**
- CC `~/.claude/history.jsonl` (2,238 prompts / 212 sessions): skill mentions — brainstorming 122, refactoring-ui 100, frontend-design 60, ponytail 55, **systematic-debugging 0**, harness 0. Corrections — "do not" 49, "too much" 20, "wait" 20, "revert" 11, "wrong" 7. `~/.claude/plans/` (25) show UI skills CO-FIRING (`refactoring-ui-frontend-design-…`, `ui-ux-pro-max-frontend-design-…` ×3) = chooser's paralysis.
- pi `~/.pi/agent/sessions/` (excl. media): `/skill:harness-engineer` 48× (meta-work dominates), frontend-design body loaded 30×. Barikoi `dropx-merchant` session (9 corrections): "did you update district change logic on edit parcel?" (not propagated), "use same validation logic which used at add parcel" ×2 (not reusing sibling), "make sure do not change api payload" (scope creep).

**Per-skill verdict (evidence → action):**
- `systematic-debugging`: UNDER-triggered (0 CC uses) → description retuned to real bug language.
- `brainstorming`: OVER-triggered (5× corrected) → narrowed to genuinely-unclear intent.
- `frontend-design` ↔ `refactoring-ui`: co-fire paralysis → each description names the other as NOT-case. KEPT SPLIT (merge would bloat the 30× workhorse).
- `ponytail`: most-violated core (over-eng / scope / reuse / propagate) → addressed via new `/preflight` prompt (operationalizes rung-2 + grep-every-caller), not more rules.
- `ponytail-review`: KEPT (not folded) — evidence correction: ponytail body has NO review format; ponytail-review is the sole carrier of the `L<line>:<tag>` format. AGENTS.md's false "ponytail = review format" claim removed.
- `harness-engineer`: over-used for yak-shaving (48×) → noted; methodology upgraded, not gated.
- `browser-tools` / `youtube-transcript`: healthy, unchanged.

**Skill set change:** COUNT unchanged (9). 4 descriptions retuned in place; no add / remove / merge.

**New resource:** `/preflight` prompt (`prompts/preflight.md`, 0 prefix tokens) — 5-point pre-edit blast-radius / reuse / scope / contract / propagation contract.

**Always-on cost:** AGENTS.md ~1.2 K tok (was ~1.4 K) + 9 descriptions ~0.65 K tok ≈ **~1.8 K tok/session** (net leaner despite richer triggers). Bodies on-demand; `/preflight` 0 at rest.

**Rollback:** description + AGENTS.md edits reversible from `~/.pi-backups/`; `/preflight` is `rm prompts/preflight.md`. harness-engineer methodology changes are in `SKILL.md` (on-demand).

## 14. Revision 8 — SDK twin merge + catalog token trim (2026-08-28)

Driven by harness-audit-report.md (Health 50/100; avg desc 131 tok; 2 descs > 250 tok).

**Skill set change:** COUNT 15 → 14. `sdk-development-npm` merged into `sdk-development`
(desc + body deduped; unique npm content preserved: e2e-infra `.env` hygiene + no-invented-globals
rule added to `sdk-development` body §Testing). Audit evidence: ~95% of the npm twin's body was
already duplicated verbatim in `sdk-development` (package surface, externals, pack smoke,
pyramid, vitest pitfalls, upgrade protocol, docs set, R&D, publish gate).

**Descriptions shortened to ≤ ~85 tok** (targets ≤ 80, chars/4): sdk-development 1045→325,
playwright-tester 746→325, ponytail 670→327 (no longer restates the AGENTS.md ladder; points to it),
skill-creator 664→262, browser-tools 622→323, map-integration 505→318, ponytail-review 472→315
(boundary vs ponytail tightened: write/simplify → ponytail; review format stays here — per
Revision 7 evidence ponytail-review is sole carrier of the L<line>:<tag> format, so NOT merged),
audit 437→315, frontend-design 411→272, youtube-transcript 69→189 (was FAIL vague in validator;
now has triggers). Untouched: brainstorming, harness-engineer, refactoring-ui, systematic-debugging.

**Validator:** all 14 PASS (skill-creator validate-skill.mjs).

**Always-on cost:** catalog 7859 B (~1965 tok) → 4157 B (~1039 tok); floor 2467 → ~1541 tok.
**Rollback:** ~/.pi-backups/pi-skills.pre-trim.20260828-204608.tar.gz

---

## 2026-08-28 — audit mode folded into harness-engineer (no new skill)

Audit/scoring capability (permanent-token inventory, Health Score, harness-audit-report.md)
added as an "## Audit mode" section in the existing `harness-engineer` skill body —
on-demand content, zero new catalog entry. Description rewritten 470→350 chars
(~118→~87 tok) to cover audit triggers. Skill count stays 14.

---

## 2026-09-05 — session-audit added (COUNT 16 → 17)

**Skill set change:** new `session-audit` — ported from
github.com/foyzulkarim/skills (dev-pipeline/skills/session-audit, built for
Claude Code) to pi's session schema. Layered audit engine: L0/L1 deterministic
Node scripts (`bin/audit.mjs run|views|fetch` + `src/{parser,discover,rules,
pricing,views}.mjs`) digest `~/.pi/agent/sessions` into metadata-only
artifacts; SKILL.md is the L2/L3 reasoning layer (hypothesis loop →
attribution → dated report in `~/.pi/agent/audit-reports/`).

Port decisions: rates derived from logged `usage.cost` (no static price
table — prices the actual glm/deepseek mix); NO_SUBAGENT rule dropped (pi is
single-agent); compaction events counted as amplifier; timestamps normalized
(ISO strings in new transcripts, epoch-ms ints in old). Manual invocation
(`/skill:session-audit`) per 2026-09-02 policy. Desc 300 chars (~75 tok).
Validator: PASS.

## 2026-09-23 — pre-push-review added (COUNT 17 → 18, manual)

Source: 7-day audit of `ollama-review` issues from barikoi/code-review@v1
(11 issues / 17 findings, all MEDIUM, 4 repos). Checklist distilled from the
bot's prompt.md plus observed failure clusters: ~60% async/stale-state
lifecycle, 7/17 fix-induced regressions (one block took 5 consecutive fix
pushes). Manual invocation per user note ("I will trigger PR review manually
when needed") — disable-model-invocation: true, zero permanent-prefix cost.
Desc 299 chars. Validator: PASS.

## 2026-09-23 — audit lessons distributed to dev skills (bodies only)

pre-push-review gained §0 auto-sync: fetches barikoi/code-review prompt.md
per invocation (local clone → gh api raw → offline fallback); fetched prompt
is authoritative over the embedded empirical checklist. Dev skills updated
body-only (zero prefix delta): systematic-debugging (Phase 4 adjacent-path
check), refactoring-ui (§0b logic-in-UI rules), frontend-design (mutating-UI
logic guards), map-integration (§5.5–5.6 polygon-sync + geometry-load
guards). playwright-tester already covered CI/headless — skipped.
Descriptions byte-stable; validator re-run: PASS.
