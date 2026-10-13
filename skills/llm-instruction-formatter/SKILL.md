---
name: llm-instruction-formatter
description: Markdown formatting discipline for LLM rule/instruction files only — AGENTS.md/CLAUDE.md, system prompts, prompt templates, SKILL.md bodies, agent rule-set docs. Optimizes bold, headings, and list structure for LLM adherence and token economy. Formatting-only, preserves wording. Explicit invocation only. NOT for prose docs, READMEs, or changelogs (use documentation-writer); NOT for skill authoring guidance (use skill-creator).
disable-model-invocation: true
---

# LLM Instruction Formatter

Optimize Markdown carrying LLM rules/instructions: AGENTS.md/CLAUDE.md, system prompts, prompt templates, SKILL.md bodies, agent rule-set docs. Apply to every such file; never prose docs, READMEs, changelogs.

Formatting-only: preserve wording/semantics verbatim unless user asks rewrite. Never edit YAML frontmatter.

## Bold
- Remove aesthetic bold, label prefixes, paragraph blocks, header stand-ins.
- Prefer lexical markers (`MUST`, `NEVER`, `IMPORTANT`) over bold for critical constraints. Bold only when single non-overridable rule needs weight after marker present (e.g. `**MUST NEVER** delete production data`).
- Dense rule lists where every line = constraint: no bold — structure/position carry emphasis; over-bolding dilutes.
- Never bold whole paragraph or heading.

## Headings
- Strict nesting: never skip levels (`#`→`##`→`###`, not `#`→`###`).
- No bold inside headings, no bold-as-heading. Convert bold pseudo-headers → real headings at correct level.
- Deeper levels only when warranted; small file stays flat under single H1.
- Blank line before/after every heading.

## Lists
- `-` unordered; `1.` strictly sequential steps/workflows.
- One marker style per file.
- One clause/rule per bullet. Split compound multi-rule bullets.
- Keep rule + direct exception/rationale together; split only independent rules.
- Comma-blob enumerations → sub-bullets or standalone list.
- Blank line before/after every list.
- Nested lists: consistent indent (2 spaces relative to parent marker).

## Procedure
1. Read target file(s) fully.
2. Restructure per rules, preserve wording. Frontmatter untouched.
3. Write file.
4. Verify: `grep -nE '^#+ |^\*\*|^\- |^[0-9]+\. ' <file>` — no skipped heading levels, no bold-as-headers, bold only on critical constraints, markers consistent, sequential steps numbered.
5. Report brief bullet summary (de-bolded, heading levels fixed, lists split/re-marked).
