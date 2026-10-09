# Writing guide — description and body craft

Read while drafting SKILL.md content. Best-practice source (opinionated community
recommendations, not spec): [SKILL.md best practices](https://www.mdskills.ai/docs/skill-best-practices).
Anti-pattern sweep (what not to write): `anti-patterns.md`.

## Description formula (the part that matters most)

One sentence packing: **what it does + trigger phrases/keywords + when to use + what it is NOT for**
(redirect to a sibling skill). Follow the existing skills' style — read a sibling
`~/.pi/agent/skills/*/SKILL.md` first for tone and negative-scope idiom.

Good: "Extracts text and tables from PDF files, fills PDF forms. Use when the user mentions PDFs, forms,
or document extraction — even if they never say 'PDF' explicitly. NOT for images."
Bad: "Helps with PDFs."

Models tend to undertrigger skills. Make descriptions a little pushy: cover casual phrasings and
cases where the user doesn't name the artifact but clearly needs it.

Always third person ("Extracts…", never "I can help…") — the description lands in the system
prompt and first person confuses discovery. Pack in the concrete nouns/verbs a user would
type (for Excel work: both "Excel" and ".xlsx"). Quick test: with 100 skills loaded, would
the agent know exactly when to pick this one?

## Body guidelines

- Under 500 lines and ideally <5000 tokens — loaded fully once activated. Three-level loading:
  1. metadata (name + description) — always in context; 2. SKILL.md body — on trigger;
  3. bundled resources — on demand, scripts can run without loading at all.
- Add only context the agent doesn't already have — it knows how to code, common formats, and
  libraries. Challenge every paragraph ("does this need explaining?"); every filler token
  pushes out the user's request.
- Match freedom to fragility: creative/analysis work → goal-level steps; established patterns →
  preferred shape with room to adapt; fragile operations (migrations, deploys, publish) →
  exact commands ("run exactly this, do not modify").
- Multi-step operations → numbered steps (sequences are followed far better than prose);
  branching tasks → explicit conditional routing ("creating? §A; editing? §B"), with large
  workflows in their own reference file.
- Build feedback loops into procedures: do → validate → fix → re-validate, "only proceed when
  validation passes" — without the explicit loop, agents validate once and move on.
- Sections: concise instructions, worked examples (commands/code), common pitfalls/checklist.
- Progressive disclosure: keep the main SKILL.md tight (table of contents, not encyclopedia);
  push long reference material into `references/*.md` files linked with **relative paths one
  level deep** from the skill root (SKILL.md → A → B chains get partially read). Give a
  reference file over ~100 lines a table of contents. When a skill spans multiple
  domains/frameworks, split by variant (`references/aws.md`, `references/gcp.md`, ...) so only
  the relevant file is read. Name files descriptively (`form-validation.md`, not `doc2.md`) —
  filenames drive what the agent chooses to read.
- `scripts/` for deterministic/repetitive code, `assets/` for files used in output (templates,
  icons, fonts). Helper commands go in `scripts/`; script security rules live in `anti-patterns.md`.
- Prose only unless a script is truly needed; if a skill ships scripts, they must be self-contained.
  File placement follows the layout in `skill-spec.md`.

## Writing style

- Imperative form ("Extract…", "Run…"), not "you should…".
- Explain **why** an instruction matters instead of stacking MUST/ALWAYS — models generalize
  from reasoning better than from rigid rules. Heavy caps-lock MUSTs are a yellow flag.
- For output formats, give an exact template; for conventions, give short Input → Output examples.
- Generalize: a skill runs across many unseen prompts. Don't overfit instructions to the current
  examples; cut anything not pulling its weight (lean beats exhaustive).
- One term everywhere — "endpoint" or "route", not both; inconsistent terminology confuses
  the agent the same way it confuses people.

## Common craft mistakes

- Explaining things the agent already knows (JSON, REST, CSV) — pure token loss.
- Option lists ("use pypdf, or pdfplumber, or PyMuPDF…") — pick one default; mention an
  alternative only when the choice genuinely depends on context (e.g. scanned PDFs need OCR).
- Windows backslash paths — always forward slashes.
- Vague skill names (`helper`, `utils`, `tools`, `documents`) — the name is a routing signal;
  prefer gerund or action names (`processing-pdfs`, `process-pdfs`), and keep the naming
  pattern consistent across the collection.

Dated instructions and session residue are anti-patterns, not craft — see `anti-patterns.md`.
