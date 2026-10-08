# Anti-Pattern Audit — checklist

Operational checklist for the anti-pattern sweep (Audit mode, step 4) —
six prompt anti-patterns, workflow mapping, and a security checklist for
skills, prompts, and extensions.

**Scope:** `skills/`, `prompts/`, `extensions/`, plus config surfaces they
touch (`settings.json`, `AGENTS.md`, credentialed dirs). NOT for: session
token waste (→ session-audit), dead code (→ fallow-audit), over-engineering
review (→ ponytail).

## Contents

1. [Method](#method)
2. [rg signatures](#rg-signatures)
3. [The six prompt anti-patterns](#the-six-prompt-anti-patterns)
4. [Calibration](#calibration)
5. [Workflow anti-patterns (pi mapping)](#workflow-anti-patterns-pi-mapping)
6. [Security checklist](#security-checklist)
7. [Report format](#report-format)

## Method

1. Inventory: `ls skills/ prompts/`; `rg --files extensions | head -20`.
2. Mechanical rg-signature pass (below) over `skills/*/SKILL.md` and
   `prompts/*.md`; sort by hit count. Read only flagged files, only flagged
   regions — never page the whole catalog.
3. Judge each hit per Calibration — presence alone is not a finding.
4. Contradiction pass: description vs body (trigger semantics); skill
   instructions vs `AGENTS.md`; cross-skill overlaps.
5. Security pass over extensions, skill scripts, vendored deps, credentialed
   files.
6. Report per format below into `audit-reports/{skills,harness}/` with the
   dated filename + provenance header convention. Diff against the newest
   prior report — a finding that recurs across reports is a process failure,
   not a one-off.

## rg signatures

```sh
# verification rituals
rg -i "double-check|verify twice|triple-check|re-?check|make sure" skills/*/SKILL.md prompts/*.md
# emphasis boosters
rg "MUST ALWAYS|CRITICAL|IMPORTANT|MANDATORY|VITAL|ESSENTIAL|maximally|You MUST|YOU MUST|ALWAYS " skills/*/SKILL.md prompts/*.md
# forced scaffolds
rg -i "step-by-step|scratchpad|think aloud" skills/*/SKILL.md prompts/*.md
# dated configs / stale model references (prose too, not just frontmatter)
rg -i "claude|anthropic|gpt-4|opus|sonnet|thinking.?budget|temperature" skills/*/SKILL.md prompts/*.md extensions/*.ts
# stale version pins
rg -n "actions/[a-z-]+@v[0-9]" skills/
# secrets (exclude env/argv/placeholder reads before flagging)
rg -n -i "api[_-]?key|secret|token|password|Bearer " extensions/ skills/*/scripts/
```

Zero hits on a signature is a result — record the pass, don't dig for more.

## The six prompt anti-patterns

1. **Verification rituals** — "double-check your work", "verify twice".
   Models comply literally → duplicated reasoning loops. Fix: delete; keep
   single scoped checks ("run the validator once, fix, re-run").
2. **Emphasis boosters** — CRITICAL / YOU MUST stacked on vague advice.
   Fix: reasoned imperative — explain why once, per skill-manager's
   writing-style rule ("Heavy caps-lock MUSTs are a yellow flag").
3. **Mandatory scaffolds** — hardcoded step-by-step or scratchpad
   procedures. Mitigated when user-invoked (`disable-model-invocation`) or
   tightly trigger-scoped; flag when the description lets them load for
   ordinary turns.
4. **Stale examples** — few-shots or test scaffolds imported from another
   harness, wrong paths, old-model references, creation logs. Fix: delete
   the files; do not rewrite them to "fit".
5. **Contradictory rules** — description vs body giving opposite trigger
   semantics; skill instructions vs `AGENTS.md` (forced installs vs
   ask-before-install). A carve-out the body documents as deliberate
   (invocation = approval) is consistent, not contradictory.
6. **Dated configurations** — model names, thinking budgets, temperature
   overrides. Fix: remove or parameterize to whatever the current harness
   setting is.

## Calibration

- **Earned emphasis** — encodes a real precedence rule or precise constraint
  ("in an existing codebase you are ALWAYS extending"; "the offer MUST be
  its own message") → pass.
- **Booster** — emphasis on vague advice ("CRITICAL: be bold") → fix.
- **Rhetoric with no semantics** ("violating the spirit of…") → delete.
- **Structural bugs spotted en route** (spliced bullet lists, orphaned
  bullets, duplicated headers) → report; they mark edits inserted without
  reading around them.

## Workflow anti-patterns (pi mapping)

- `AGENTS.md` > 200 lines or > ~800 tok → crowd-out (already scored in the
  Health Score; don't double-report).
- Always-on packages/MCP: `settings.json` `packages`, any `mcpServers`
  config → idle resident cost; prefer CLI-wrapper skills over resident
  servers.
- Progressive-disclosure failures: huge bodies AND long descriptions
  (already scored).
- Session pile: >30-day JSONLs → the audit close step already prunes.

## Security checklist

- **Plaintext creds** (e.g. `tavily/config.json`): locate, then verify dir
  perms (0700) and a `.gitignore` entry before assigning severity — both
  present = informational, not a finding.
- **`curl | bash` installs in skill bodies**: unpinned pipe-to-shell plus
  "do not skip / never fall back" = supply-chain exposure AND an
  `AGENTS.md` ask-first violation. Fix: ask-first gate; pin only if the
  installer verifiably supports versions (check the script — don't assume).
- **Vendored `node_modules`**: lockfile present? Are the declared deps
  actually imported (`rg` the imports)? Unimported → delete the dep rather
  than align versions. Same package at two majors (e.g. `puppeteer` +
  `puppeteer-core`) → doubled dependency surface.
- **Extensions**: no embedded secrets, no execution of untrusted content;
  deny-wrapper patterns around built-in tools are the model to follow.
- **CI-advice skills** should teach SHA pinning, not mutable tags.

## Report format

Verdict table (area → pass/hit) → per-pattern findings with `file:line`,
severity, one-line fix → ranked priority fixes → **"what's already good"**
(false-positive credit anchors future calibration and keeps the audit fair).
