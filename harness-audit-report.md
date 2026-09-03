# Pi Harness Audit Report — Standards-Aligned

Generated: 2026-09-03 (local) · CWD: `~/.pi/agent` · Mode: **audit-only, no files changed**
Token method: chars/4 heuristic (±15–25% vs real tokenizer); measured numbers quoted from `scripts/usage-metrics.py` (session logs, real token counts) where available.

## Part E — Executive Summary

> **Delta 2026-09-03 (post-audit changes, same day):** tavily-search enabled for model invocation then its description trimmed 510 → 209 chars. Current state: **permanent_tokens ≈ 688** (context 587 + catalog ~101: ponytail 49 + tavily-search 52), **2 model-invocable skills**, 14 manual-only. Health Score stays 90 — the −10 node_modules deduction is now an accepted trade-off (tree retained deliberately; double-gitignored at root and skill-local). Benchmark basis: bench deleted; evidence + reusable tooling in `skills/harness-engineer/{scripts,evidence}`. Full-day log: CHANGELOG 2026-09-03.

- **permanent_tokens ≈ 636 at audit time** (context 587 + catalog 49) · **Health Score 90/100 (Good)** · **skill_count 16** — 1 model-invocable (`ponytail`), 15 manual-only (`disable-model-invocation: true`, intentional lean mode since 2026-09-02).
- Verdict vs community standards: **Pass overall** (4 Pass, 2 Partial — measurement discipline and catalog description length).
  - Progressive disclosure is near-maximal: only 49 tok of skill catalog sits in the prefix; ~29k tok of skill bodies load on demand.
  - Token residency is managed with measured evidence: 97% cache hit on the default model across 2,573 turns.
  - Gap: no same-task lean-vs-full A/B; success/turns/wall-time not tracked per task.
- Top 3 permanent consumers: (1) pi's own system prompt + tool defs — ~4.5–5.3k tok measured first-turn, **outside harness control**; (2) `AGENTS.md` 587 tok; (3) `ponytail` description 49 tok. The user-controlled harness is ~12% of the real prefix.
- **Ready for loop engineering: Yes** — the permanent floor is small and cache-stable; measured cost concentrates in output/reasoning tokens and 300–436-turn session tails, which is exactly what loop discipline (stop conditions, exit-code verification, compaction) addresses.
- Caveat: floor figures are chars/4; measured figures (cache %, first-turn sizes, per-model profile) come from session logs.

## Part A — Inventory (facts only)

### A1. Context files

Paths checked: `~/.pi/agent/{AGENTS.md,SYSTEM.md,APPEND_SYSTEM.md,CLAUDE.md}`, project `AGENTS.md`/`CLAUDE.md`/`.pi/` in CWD and parent. Found exactly one always-loaded file:

| Path | Bytes | Lines | ~tok | Role |
|------|-------|-------|------|------|
| `~/.pi/agent/AGENTS.md` | 2,348 | 31 | 587 | Behavioral core, communication, token economy, safety, cadence. Terse imperatives. |

Not present: SYSTEM.md, APPEND_SYSTEM.md, CLAUDE.md, project-level context. `prompts/commit.md` (489 B) is an on-demand template, not always-loaded. `README.md` (11.7 KB), `CHANGELOG.md` (82 KB), `skills-audit.md` (22 KB) are living docs — disk-only, never in the prefix.

### A2. Skills

Discovery: `~/.pi/agent/skills/*/SKILL.md` (pi default; no path overrides in settings.json). **16 valid SKILL.md**, all frontmatter-valid per prior `validate-skill.mjs` runs.

State: **15 of 16 carry `disable-model-invocation: true`** (CHANGELOG 2026-09-02: "catalog block 3934 desc chars + wrapper → 0 bytes; visible-in-prompt skills 16 → 0"; `ponytail` re-enabled the same day). Direct evidence: this session's model-visible catalog lists only `ponytail`.

| Skill | Desc chars | Desc ~tok | Body bytes | Body ~tok | In prefix? |
|-------|-----------|-----------|------------|-----------|------------|
| ponytail | 195 | 49 | 6,302 | 1,576 | **yes** |
| audit | 321 | 80 | 2,985 | 746 | manual-only |
| brainstorming | 267 | 67 | 10,145 | 2,536 | manual-only |
| browser-tools | 307 | 77 | 14,806 | 3,702 | manual-only |
| frontend-design | 276 | 69 | 7,237 | 1,809 | manual-only |
| harness-engineer | 233 | 58 | 5,299 | 1,325 | manual-only |
| map-integration | 320 | 80 | 8,834 | 2,209 | manual-only |
| playwright-tester | 331 | 83 | 15,585 | 3,896 | manual-only |
| ponytail-review | 321 | 80 | 2,263 | 558 | manual-only |
| refactoring-ui | 225 | 56 | 5,773 | 1,443 | manual-only |
| sdk-development | 333 | 83 | 14,531 | 3,633 | manual-only |
| skill-manager | 213 | 53 | 4,907 | 1,227 | manual-only |
| systematic-debugging | 275 | 69 | 9,680 | 2,420 | manual-only |
| tavily-extract | 466 | 117 | 2,934 | 734 | manual-only |
| tavily-search | 510 | 128 | 3,796 | 949 | manual-only |
| youtube-transcript | 191 | 48 | 868 | 217 | manual-only |

- **Permanent catalog (enabled only): 195 chars ≈ 49 tok.**
- All-16 description total: 4,784 chars ≈ 1,196 tok (hypothetical, if every flag were removed).
- Body total: ~116 KB ≈ 29k tok — all on-demand; none loaded unless invoked.

### A3. Settings snapshot

| Item | Value |
|------|-------|
| pi version | 0.84.4 |
| defaultProvider / defaultModel | `zai` / `glm-5.2` |
| models.json | declares `glm-5.3-flash` only (glm-5.2 resolves via `models-store.json`) |
| packages / extensions | none installed (`pi list` not run; settings has no `extensions` key) |
| skills path overrides | none |
| thinking | off, hidden |

### A4. Permanent floor estimate

```
permanent_tokens ≈ context (587) + enabled catalog (49) ≈ 636 tok
```
Excludes: skill bodies (29k tok, on-demand), session history, tool results, pi's own system prompt (~4.5–5.3k tok measured first-turn on 2026-09-03 sessions: 5,128 / 5,263 tok).

### A5. Hygiene / portability

- `skills/browser-tools/node_modules` — present (185 top-level entries; jsdom/puppeteer tree). Gitignored (`**/node_modules/` per README portability contract), regenerable via `npm install`.
- No zips, no `._*` AppleDouble inside `skills/`. `skills-archive.tar.gz` (330 KB) sits at agent root — disk-only, outside the skills dir rule.
- Portability scan (`/Users/|/home/|pbcopy|pbpaste|osascript|/opt/homebrew|launchctl` over AGENTS.md, settings.json, models.json, bin/, scripts/, prompts/, skills/ excl. harness-engineer + node_modules): **0 hits**.

## Part B — Metrics

| Metric | Value | How computed |
|--------|-------|----------------|
| permanent_tokens | **≈ 636** | context + enabled catalog (chars/4) |
| context_tokens | ≈ 587 | AGENTS.md 2,348 B / 4 |
| catalog_tokens | **≈ 49** enabled (≈ 1,196 if all 16 enabled) | sum of enabled descriptions / 4 |
| skill_count | 16 (1 enabled / 15 manual-only) | valid SKILL.md count |
| avg_desc_tokens | 49 enabled · 75 all-16 | catalog / count |
| max_desc_tokens | 49 enabled · 128 all (tavily-search) | max desc / 4 |
| descs_over_100 / over_250 | 0 / 0 enabled · 2 / 0 all-16 | count desc/4 > threshold |
| AGENTS.md_tokens | ≈ 587 | 2,348 / 4 |
| Health Score | **90 / 100 — Good** | rubric below |

### Score breakdown (start 100)

| Check | Result | Deduction |
|-------|--------|-----------|
| Context size | 587 tok (≤ 800) | 0 |
| Catalog avg desc | 49 enabled (≤ 100) | 0 |
| Any single desc | max 49 enabled | 0 |
| Progressive disclosure | no skill has body >2,000 AND desc >100 | 0 |
| Duplication AGENTS↔skills | ponytail *references* the AGENTS.md ladder (pointer, not restatement) | 0 (prior −5 "standing ruling" retired — current rubric penalizes restatement only) |
| Hygiene pollution | `skills/browser-tools/node_modules` | **−10** |
| Portability | 0 hits in functional files | 0 |
| Skills disabled / empty catalog | 15 manual-only — intentional lean mode | 0 (noted) |

**Total: −10 → 90/100 (Good).**

### Measured evidence (usage-metrics.py, real tokens)

| Model | Turns | in/t | out/t | rsn/t | Cache % | Cost |
|-------|-------|------|-------|-------|---------|------|
| glm-5.2 (default) | 2,573 | 2,016 | 565 | 310 | **97%** | $37.41 |
| glm-5.3 | 423 | 1,855 | 549 | 317 | 97% | $7.67 |
| glm-5.3-flash | 423 | 2,043 | 662 | 355 | 99% | $2.49 |

First-turn prefix trend (last 8 sessions): 2,190–6,015 tok; post-lean-catalog sessions (2026-09-02+) sit at 2,190–5,263. Cost tail: three sessions of 322–436 turns account for ~$34.5 — long sessions, not prefix size, drive spend.

## Part C — Community standard validation

Reference principles are widely cited practitioner material: Anthropic's Agent Skills / progressive-disclosure pattern and "Building effective agents"; Anthropic's context-engineering guidance (compounding cost of resident context, "context rot"); HumanLayer's advanced context engineering (residency + measurement); Manus context-engineering notes (KV-cache stability → byte-stable prefix); Claude Code best-practices guidance for CLAUDE.md/AGENTS.md hygiene (short, specific, failure-backed rules).

| # | Principle | Standard expectation | This harness | Verdict | Evidence |
|---|-----------|----------------------|--------------|---------|----------|
| 1 | Permanent vs on-demand context | Small always-on prefix; specialized knowledge loads on demand (progressive disclosure / lazy skills) | 636-tok floor; 15/16 skills manual-only; 29k tok bodies never resident | **Pass** | This session's catalog = ponytail only (49 tok); CHANGELOG 2026-09-02 measured catalog block → 0 bytes |
| 2 | Token residency | Prior context re-sends every turn → cost compounds; measure permanent floor separately from task trajectory | Floor (636) separated from measured per-turn residency (2,016 in/t avg) and cache (97%) | **Pass** | usage-metrics.py: in/t 2,016, cache 97% on glm-5.2; prefix trend tracked per session |
| 3 | Measurement discipline | Lean baseline vs full harness on SAME tasks; report success + turns + tokens + time; beware cache hiding cost | Real-token metrics exist (per-model, cache %, cost tail, prefix trend) but no controlled same-task A/B; no per-task success/turns/wall-time | **Partial** | usage-metrics.py output above; no A/B harness or task-success metric found |
| 4 | AGENTS.md hygiene | Short, specific, failure-backed rules; no lint leakage, no skill bodies; low hundreds of lines max | 31 lines / 587 tok; terse imperatives with failure-backed phrasing ("Never re-run a command whose result is already in context"); zero lint/skill leakage | **Pass** | AGENTS.md inventory A1; no linter-rule duplication; no skill content |
| 5 | Harness vs loop separation | Loop state (goal, verify, stop conditions) must NOT bloat the always-on file | AGENTS.md holds 3 lines of cadence *philosophy* only; loop state lives in CHANGELOG/README/scripts on disk | **Pass** | AGENTS.md "Cadence" block vs CHANGELOG 972 lines of persisted loop state |
| 6 | Skill catalog design | Short trigger-focused descriptions; merge near-duplicates; avoid twin skills | Descriptions are trigger-focused with explicit NOT-routing; but 2 descs >100 tok (tavily pair: 117/128) and browser-tools ↔ playwright-tester share the Playwright/CDP domain (cross-routed, defensible) | **Partial** | A2 table; manual-only status makes this cosmetic — affects /skill menu, not the prefix |

**Overall: Pass** (4 Pass, 2 Partial). The lean catalog makes the two Partials cost-free today; they only matter if skills are ever re-enabled for model invocation.

## Part D — Gaps vs community practice

### D1. Metric gaps (ranked)

1. **No same-task A/B (lean vs full).** Community practice isolates the harness variable by running identical tasks with and without context/skills. Current evidence is correlational (prefix trend), not controlled.
2. **No per-task success / turns / wall-time.** Tokens alone can't show the harness helps; lean-vs-full must report outcome quality too.
3. **Cache can hide cost.** 97% cache hit means marginal input cost is suppressed; an uncached first-call comparison (fresh session, cold cache) is the honest number for "what does the harness add per session".
4. **chars/4 floor estimate.** ±15–25% vs real tokenizer; the 636 figure should be validated once against a session log's first-turn usage.

### D2. Design gaps (ranked, all minor)

1. `skills/browser-tools/node_modules` — 185-entry tree inside skills dir. Gitignored + regenerable; disk hygiene and score only (−10).
2. AGENTS.md growth trend: 1,460 B (Aug 31) → 2,348 B (Sep 3), +222 tok from round-trip-economy rephrasing. Still under the 800-tok threshold; watch the slope, not the point.
3. Two long descriptions (tavily-search 510 ch, tavily-extract 466 ch) exceed trigger-focused brevity; manual-only, so /skill-menu UX cost only.
4. `skills-archive.tar.gz` (330 KB) at agent root — disk clutter, not a rules violation (outside `skills/`).

### D3. Recommended measurement add-on (exact commands, not run)

```sh
# 0) measured baselines (real tokenizer)
python3 ~/.pi/agent/scripts/usage-metrics.py

# 1) lean baseline: fresh HOME (no AGENTS.md, no skills), same auth
mkdir -p /tmp/pi-lean-home/.pi/agent
cp ~/.pi/agent/auth.json /tmp/pi-lean-home/.pi/agent/
HOME=/tmp/pi-lean-home pi --provider zai --model glm-5.2 \
  --mode json --no-session -p "<TASK>" > /tmp/lean.json

# 2) full harness, same task, fresh session (uncached first call)
pi --provider zai --model glm-5.2 \
  --mode json --no-session -p "<TASK>" > /tmp/full.json

# 3) compare from JSON usage blocks: prompt_tokens (first call),
#    completion_tokens, turns (tool rounds), and wall time via `time`
```

Fixed tasks for the pair: **T1** (deterministic search): "In this repo, list every caller of `buildSystemPrompt` with file:line." **T2** (small edit): "Add a one-line doc comment above function X in file Y." Report success + turns + tokens + wall time for both configurations.

## Delta vs previous report (2026-08-31)

| Metric | 2026-08-31 | Now | Δ |
|--------|-----------|-----|---|
| Health Score | 90 | 90 | 0 (deductions shifted: pollution-only) |
| Permanent floor | ~1,356 tok | ~636 tok | **−720** |
| Context tokens | 365 | 587 | +222 (economy-rule rephrasing) |
| Catalog in prefix | ~991 (14, all model-visible) | ~49 (1 enabled) | **−942** (disable-model-invocation, 2026-09-02) |
| Skill count | 14 | 16 | +2 (tavily-search, tavily-extract; skill-creator→skill-manager) |
| Bodies total | ~105 KB | ~116 KB | +11 KB, all on-demand |
| Portability hits | 0 | 0 | 0 |
| Measured evidence | usage-metrics.py added | + cache 97%, prefix trend, cost tail | deeper |

No files were modified by this audit (report rewrite only).
