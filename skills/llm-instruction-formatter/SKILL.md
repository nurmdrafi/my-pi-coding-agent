---
name: llm-instruction-formatter
description: Markdown formatting discipline for LLM rule/instruction files only — AGENTS.md/CLAUDE.md, system prompts, prompt templates, SKILL.md bodies, agent rule-set docs. Optimizes bold, headings, and list structure for LLM adherence and token economy. Formatting-only, preserves wording. Explicit invocation only. NOT for prose docs, READMEs, or changelogs (use documentation-writer); NOT for skill authoring guidance (use skill-creator).
disable-model-invocation: true
---

# LLM Instruction Formatter

Target: files carrying LLM rules/instructions — AGENTS.md/CLAUDE.md, system prompts, prompt templates, SKILL.md bodies, agent rule-set docs. Never prose docs, READMEs, changelogs.

Formatting-only. Preserve wording verbatim unless user asks rewrite. Never edit YAML frontmatter.

## Bold

- Delete aesthetic bold, label prefixes (`**Note:**`), paragraph bold, header stand-ins.
- Critical constraint → lexical marker first: `MUST`, `NEVER`, `ALWAYS`, `IMPORTANT`.
- Bold allowed only: single non-overridable rule needs extra weight and marker already present. Example: `**MUST NEVER** delete production data`.
- Dense constraint lists: zero bold — every line = rule, structure carries emphasis, over-bolding dilutes.
- Never bold whole paragraph or heading.

## Headings

- No level skips: `#` → `##` → `###`. Never `#` → `###`.
- No bold inside headings, no bold-as-heading. Bold pseudo-header → real heading, correct level.
- Small file: flat, one H1, no deeper levels unless warranted.
- Blank line before/after every heading.

## Lists

- Unordered: `-` only. Ordered: `1.`, `2.`, ... — sequential steps/workflows only.
- One marker style per file.
- One rule per bullet. Compound bullet → split. Keep rule + its direct exception/rationale together; split only independent rules.
- Comma-blob enumeration → sub-bullets or standalone list.
- Blank line before/after every list.
- Nested list: indent 2 spaces past parent marker.

## Procedure

1. Read target file(s) fully.
2. Restructure per rules, wording preserved, frontmatter untouched.
3. Write file.
4. Verify: `grep -nE '^#+ |^\*\*|^- |^[0-9]+\. ' <file>` — no skipped levels, no bold-as-headers, bold only on allowed cases, markers consistent, steps sequential.
5. Report bullet summary: de-bolded, headings fixed, lists split/re-marked.
