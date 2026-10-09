---
name: skill-manager
description: "Create or modify SKILL.md files (agentskills.io spec + pi docs/skills.md); always runs the validator before finishing. Use for 'create a skill', 'new/fix/merge/rename/split skill', any SKILL.md or skill-directory change. NOT for ordinary project documentation."
disable-model-invocation: true
---

# Skill Manager

Creates skills that pass the [Agent Skills spec](https://agentskills.io/specification) and Pi's loader.
Read only the reference the current phase needs — not all three.

## References

- `references/skill-spec.md` — frontmatter constraints and directory layout (validator-enforced). Read while writing frontmatter or placing files.
- `references/writing-guide.md` — description formula, body structure, writing style, craft mistakes. Read while drafting SKILL.md content.
- `references/anti-patterns.md` — the six prompt anti-patterns + security checklist, distilled from the harness audit (harness-engineer). Read before validating; sweep every draft.

## Workflow

1. Ask (once) for the skill's purpose and trigger phrases if not obvious from the request.
2. `ls ~/.pi/agent/skills/` — reuse or extend an existing skill instead of creating a near-duplicate.
   Overlapping skills fragment triggering; prefer editing the older skill.
3. **Creating**: write `<skill-dir>/SKILL.md` following the references above; place bundled files per
   the layout in `references/skill-spec.md` — docs in `references/`, executables in `scripts/`, static
   data in `assets/`.
   **Modifying**: preserve the original `name` and directory name — never version-suffix (`-v2`);
   keep the description's trigger scope unless the user asks to change it; after moving or renaming
   any file, rg the whole skill dir for references to it, not just SKILL.md.
4. Anti-pattern gate: sweep the draft per `references/anti-patterns.md` — run its rg signatures over
   the skill dir, then judge each hit by its Calibration rules. Fix findings before validating.
5. Sanity check: draft 2–3 realistic test prompts (the kind a real user would type, with detail)
   and walk through whether the skill's instructions handle them. Strongest signal: do the task once
   skill-less and note the context you keep re-supplying — that repeated context is the skill body.
   Best test: a fresh agent instance with the skill loaded, on a real task. Ask the user to confirm
   the prompts, then adjust.
6. **Validation gate — mandatory after every create or modify, no exceptions:**
   ```bash
   node ~/.pi/agent/skills/skill-manager/scripts/validate-skill.mjs <skill-dir>  # loop until exit 0
   node ~/.pi/agent/skills/harness-engineer/scripts/mdcmdcheck.mjs              # if commands or file paths changed
   ```
   Fix and re-run until exit 0 — "should be fine" is not validation. The validator encodes the
   Agent Skills spec checks plus layout, XML-tag, reserved-word, and vagueness rules; mdcmdcheck
   verifies every command declared in the skill's markdown resolves (binaries, flags, script paths).
7. Pi picks up new or changed skills at startup or `/reload` — confirm the skill actually loads:
   invoke `/skill:name`, or after a session that used it run
   `bash ~/.pi/agent/skills/session-audit/scripts/skillcheck.sh <name>`.
   A skill missing from the system prompt after reload means frontmatter failed to parse.

## Checklist before finishing

- [ ] `name` matches directory; `description` ≤1024 chars, third person: what + triggers + when + NOT-for
- [ ] Body tight; long material split to `references/` (or `scripts/`/`assets/` by content type), linked one level deep
- [ ] Anti-pattern gate clean (`references/anti-patterns.md`): no rituals, boosters, stale examples, contradictions, dated configs
- [ ] Validator exit 0 (re-run after every fix); mdcmdcheck clean if commands/paths changed
- [ ] After `/reload`, the skill loads (`/skill:name` responds or skillcheck.sh confirms a read)
