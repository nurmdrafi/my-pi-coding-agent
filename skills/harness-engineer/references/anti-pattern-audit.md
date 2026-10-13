# Anti-Pattern Audit — checklist

Operational checklist for anti-pattern sweep (Audit mode step 4) — six prompt anti-patterns, workflow mapping, security checklist for skills, prompts, extensions.

Scope: `skills/`, `prompts/`, `extensions/` + config surfaces they touch (`settings.json`, `AGENTS.md`, credentialed dirs). NOT: session token waste (→ session-audit), dead code (→ fallow-audit), over-engineering review (→ ponytail).

## Method

1. Inventory: `ls skills/ prompts/`; `rg --files extensions | head -20`.
2. Mechanical rg-signature pass (below) over `skills/*/SKILL.md` + `prompts/*.md`; sort by hit count. Read only flagged files, flagged regions only — never page whole catalog.
3. Judge each hit per Calibration — presence alone ≠ finding.
4. Contradiction pass: description vs body (trigger semantics); skill instructions vs `AGENTS.md`; cross-skill overlaps.
5. Security pass over extensions, skill scripts, vendored deps, credentialed files.
6. Report per format below into `audit-reports/{skills,harness}/`, dated filename + provenance header. Diff vs newest prior report — recurring finding = process failure, not one-off.

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

Zero hits on signature = result — record pass, don't dig.

## Six prompt anti-patterns

1. Verification rituals — "double-check your work", "verify twice". Models comply literally → duplicated reasoning loops. Fix: delete; keep single scoped checks ("run validator once, fix, re-run").
2. Emphasis boosters — CRITICAL / YOU MUST stacked on vague advice. Fix: reasoned imperative — explain why once, per skill-manager writing-style rule ("Heavy caps-lock MUSTs are a yellow flag").
3. Mandatory scaffolds — hardcoded step-by-step/scratchpad procedures. Mitigated when user-invoked (`disable-model-invocation`) or tightly trigger-scoped; flag when description lets them load for ordinary turns.
4. Stale examples — few-shots/test scaffolds from another harness, wrong paths, old-model references, creation logs. Fix: delete files; don't rewrite to "fit".
5. Contradictory rules — description vs body giving opposite trigger semantics; skill instructions vs `AGENTS.md` (forced installs vs ask-before-install). Carve-out the body documents as deliberate (invocation = approval) = consistent, not contradictory.
6. Dated configurations — model names, thinking budgets, temperature overrides. Fix: remove or parameterize to current harness setting.

## Calibration

- Earned emphasis — encodes real precedence rule or precise constraint ("in an existing codebase you are ALWAYS extending"; "the offer MUST be its own message") → pass.
- Booster — emphasis on vague advice ("CRITICAL: be bold") → fix.
- Rhetoric without semantics ("violating the spirit of…") → delete.
- Structural bugs spotted en route (spliced bullet lists, orphaned bullets, duplicated headers) → report; they mark edits inserted without reading around.

## Workflow anti-patterns (pi mapping)

- `AGENTS.md` > 200 lines or > ~800 tok → crowd-out (already scored in Health Score; don't double-report).
- Always-on packages/MCP: `settings.json` `packages`, any `mcpServers` → idle resident cost; prefer CLI-wrapper skills over resident servers.
- Progressive-disclosure failures: huge bodies AND long descriptions (already scored).
- Session pile: >30-day JSONLs → audit close step prunes.

## Security checklist

- Plaintext creds (e.g. `tavily/config.json`): locate, verify dir perms (0700) + `.gitignore` entry before severity — both present = informational, not finding.
- `curl | bash` installs in skill bodies: unpinned pipe-to-shell + "do not skip / never fall back" = supply-chain exposure AND `AGENTS.md` ask-first violation. Fix: ask-first gate; pin only if installer verifiably supports versions (check script, don't assume).
- Vendored `node_modules`: lockfile present? Declared deps actually imported (`rg` imports)? Unimported → delete dep, don't align versions. Same package two majors (e.g. `puppeteer` + `puppeteer-core`) → doubled dependency surface.
- Extensions: no embedded secrets, no execution of untrusted content; deny-wrapper patterns around built-in tools = model to follow.
- CI-advice skills teach SHA pinning, not mutable tags.

## Report format

Verdict table (area → pass/hit) → per-pattern findings with `file:line`, severity, one-line fix → ranked priority fixes → "what's already good" (false-positive credit anchors future calibration, keeps audit fair).
