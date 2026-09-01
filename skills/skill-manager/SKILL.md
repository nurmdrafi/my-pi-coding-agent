---
name: skill-manager
description: "Create or modify SKILL.md files (agentskills.io spec + pi docs/skills.md); run the validator on every change. Use for 'create a skill', 'new/fix/merge/rename/split skill'. NOT for ordinary project documentation."
disable-model-invocation: true
---

# Skill Manager

Creates skills that pass the [Agent Skills spec](https://agentskills.io/specification) and Pi's loader.

## Hard rules (spec-enforced)

1. Skill = a directory containing exactly one `SKILL.md`; everything else freeform.
2. Frontmatter fields — only these (unknown fields are ignored by Pi):
   - `name` (required): 1–64 chars, lowercase `a-z 0-9 -` only, no leading/trailing hyphen, no `--`,
     and **must match the directory name**.
   - `description` (required): 1–1024 chars. This alone decides when the agent loads the skill.
   - Optional: `license`, `compatibility` (≤500 chars), `metadata`, `allowed-tools`,
     `disable-model-invocation`. Omit optionals unless genuinely needed.
3. Missing description → Pi refuses to load the skill. Everything else warns but loads.
4. Location for personal skills: `~/.pi/agent/skills/<name>/`. Project skills: `.pi/skills/<name>/`.

## Description formula (the part that matters most)

One sentence packing: **what it does + trigger phrases/keywords + when to use + what it is NOT for**
(redirect to a sibling skill). Follow the existing skills' style — read a sibling
`~/.pi/agent/skills/*/SKILL.md` first for tone and negative-scope idiom.

Good: "Extracts text and tables from PDF files, fills PDF forms. Use when the user mentions PDFs, forms,
or document extraction — even if they never say 'PDF' explicitly. NOT for images."
Bad: "Helps with PDFs."

Models tend to undertrigger skills. Make descriptions a little pushy: cover casual phrasings and
cases where the user doesn't name the artifact but clearly needs it.

## Body guidelines

- Under 500 lines and ideally <5000 tokens — loaded fully once activated. Three-level loading:
  1. metadata (name + description) — always in context; 2. SKILL.md body — on trigger;
  3. bundled resources — on demand, scripts can run without loading at all.
- Sections: concise instructions, worked examples (commands/code), common pitfalls/checklist.
- Progressive disclosure: keep the main SKILL.md tight; push long reference material into
  `references/*.md` files linked with **relative paths one level deep** from the skill root.
  For a reference file >300 lines, give it a table of contents. When a skill spans multiple
  domains/frameworks, split by variant (`references/aws.md`, `references/gcp.md`, ...) so only
  the relevant file is read.
- `scripts/` for deterministic/repetitive code, `assets/` for files used in output (templates,
  icons, fonts). Helper commands go in `scripts/`.
- Prose only unless a script is truly needed; if a skill ships scripts, they must be self-contained.

## Writing style

- Imperative form ("Extract…", "Run…"), not "you should…".
- Explain **why** an instruction matters instead of stacking MUST/ALWAYS — models generalize
  from reasoning better than from rigid rules. Heavy caps-lock MUSTs are a yellow flag.
- For output formats, give an exact template; for conventions, give short Input → Output examples.
- Generalize: a skill runs across many unseen prompts. Don't overfit instructions to the current
  examples; cut anything not pulling its weight (lean beats exhaustive).

1. Ask (once) for the skill's purpose and trigger phrases if not obvious from the request.
2. `ls ~/.pi/agent/skills/` — reuse or extend an existing skill instead of creating a near-duplicate.
   Overlapping skills fragment triggering; prefer editing the older skill.
3. Write `<skill-dir>/SKILL.md` following the rules above. If updating an existing skill,
   preserve its original `name` and directory name — never version-suffix (`-v2`).
4. Sanity check: draft 2–3 realistic test prompts (the kind a real user would type, with detail),
   and mentally walk through whether the skill's instructions handle them. Ask the user to
   confirm the prompts, then adjust.
5. Validate (offline, no network needed):
   ```bash
   node scripts/validate-skill.mjs <skill-dir>
   ```
   Fix anything reported. (The official `skills-ref` validator needs Python ≥3.10 and network;
   this script encodes the same checks plus a vagueness heuristic.)
6. Pi picks up new skills at startup — restart the session (or `/skill:name` after restart) to confirm
   the skill appears; a skill missing from the system prompt means frontmatter failed to parse.

## Checklist before finishing

- [ ] `name` matches directory, lowercase-hyphenated, ≤64 chars
- [ ] `description` ≤1024 chars: what + triggers + when + NOT-for
- [ ] Body <500 lines; long material split to `references/`
- [ ] Relative file references, one level deep
- [ ] Validator passes with exit 0
