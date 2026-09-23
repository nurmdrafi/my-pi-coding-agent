---
name: frontend-design
description: "Build NEW web components/pages/apps from scratch. Detects UI stack (Ant Design, shadcn/Tailwind, vanilla), audits sibling components + tokens, extends established idioms. NOT editing/fixing/polishing existing UI (→ refactoring-ui) or logic-only changes with no new markup."
license: Complete terms in LICENSE.txt
disable-model-invocation: true
---

This skill guides creation of distinctive, production-grade frontend interfaces that avoid generic "AI slop" aesthetics. Implement real working code with exceptional attention to aesthetic details and creative choices.

The user provides frontend requirements: a component, page, application, or interface to build. They may include context about the purpose, audience, or technical constraints.

## Pattern Audit (MANDATORY FIRST STEP — overrides every aesthetic directive below)

Before writing any UI, determine whether you are **extending** an existing design system or **creating from scratch**. In an existing codebase you are ALWAYS extending.

1. **Read the closest siblings first.** Find 2–3 existing components/pages nearest to what you're building (`rg -l` for similar component names, then `read` them). Note their exact structure, classes, props, spacing, and how they compose the design-system primitives.
2. **Extract the design language:**
   - **Theme/tokens**: AntD `ConfigProvider` `theme`/`token` (v5) or less variables (v4); Tailwind `tailwind.config` + CSS variables; global CSS `:root` vars; the design-system package's exports.
   - **Spacing & layout scale**, **color palette + semantic mapping** (bg/text/border/states), **radius**, **shadows/elevation**, **typography stack** (font families, sizes, weights, line-heights), **motion**.
   - **Component patterns**: how does this codebase build a card / table / modal / form / button / empty-state / page-header? Reuse that pattern verbatim.
3. **Reproduce, don't redesign.** Use the SAME utility classes, SAME tokens, SAME primitives, SAME spacing rhythm, SAME file structure. The result must be indistinguishable from a screen the original team shipped.

**FORBIDDEN in an existing codebase (unless the user explicitly asks for a redesign):** introducing new fonts, a new color palette, a new CSS/styled system, a parallel component library, "bold/unforgettable" deviations, or decorative flourishes absent from siblings. "Match existing pages' patterns" is not aspirational — it is the hard requirement.

**Logic guards when the new UI mutates data (bot-hit classes, 2026-09):**
- Mutating routes/admin panels: permission gating wired from day one.
- Fetch-on-selection effects: staleness guard + `.catch` + clear the list while
  refetching (out-of-order responses must not repaint the old entity's data).
- Bulk-edit forms: open empty or track touched fields — a pre-filled field
  makes every `values.x ?? o.x` fallback dead code.
- Prefill into lazy tab panes (rc-tabs): `forceRender: true` or fill on
  activation, else the first `setFieldsValue` is silently dropped.
- Conditional visibility: check the polarity and the DEFAULT state of every
  span/collapse condition before shipping.

## Stack Adaptation (part of the Pattern Audit)

Before designing, detect the project's UI stack from `package.json` and existing components, and express the design through that stack's idioms — don't impose a foreign style system:

- **Ant Design (v4 or v5/latest)**: build with AntD primitives — Form, Table, Modal, Card, Space, Typography — themed via tokens (`ConfigProvider`, v5 `theme` algorithm / v4 less variables). Apply the aesthetics below as refinements on top of AntD (spacing, hierarchy, color system), not as a custom replacement.
- **shadcn/ui + Tailwind**: use the existing component registry, the `cn()` utility, and the project's Tailwind tokens/extensions; add new shadcn-style components rather than a parallel hand-rolled system.
- **Vanilla / other**: no established idioms — then apply the full aesthetic freedom below.

Match existing pages' patterns before introducing new ones.

## Design Thinking (GREENFIELD ONLY — skip if the Pattern Audit found an existing UI)

If the Pattern Audit found existing UI, you already have your direction: extend it. Stop here and build to match. The creative exploration below is ONLY for projects with no established aesthetic.

Before coding a greenfield UI, understand the context and commit to a BOLD aesthetic direction:
- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick an extreme: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian, etc. There are so many flavors to choose from. Use these for inspiration but design one that is true to the aesthetic direction.
- **Constraints**: Technical requirements (framework, performance, accessibility).
- **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?

**CRITICAL**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work - the key is intentionality, not intensity.

Then implement working code (HTML/CSS/JS, React, Vue, etc.) that is:
- Production-grade and functional
- Visually striking and memorable
- Cohesive with a clear aesthetic point-of-view
- Meticulously refined in every detail

## Frontend Aesthetics Guidelines

Focus on:
- **Typography**: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics; unexpected, characterful font choices. Pair a distinctive display font with a refined body font.
- **Color & Theme**: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes.
- **Motion**: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions. Use scroll-triggering and hover states that surprise.
- **Spatial Composition**: Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space OR controlled density.
- **Backgrounds & Visual Details**: Create atmosphere and depth rather than defaulting to solid colors. Add contextual effects and textures that match the overall aesthetic. Apply creative forms like gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, decorative borders, custom cursors, and grain overlays.

NEVER use generic AI-generated aesthetics like overused font families (Inter, Roboto, Arial, system fonts), cliched color schemes (particularly purple gradients on white backgrounds), predictable layouts and component patterns, and cookie-cutter design that lacks context-specific character.

Interpret creatively and make unexpected choices that feel genuinely designed for the context. No design should be the same. Vary between light and dark themes, different fonts, different aesthetics. NEVER converge on common choices (Space Grotesk, for example) across generations.

**IMPORTANT**: Match implementation complexity to the aesthetic vision. Maximalist designs need elaborate code with extensive animations and effects. Minimalist or refined designs need restraint, precision, and careful attention to spacing, typography, and subtle details. Elegance comes from executing the vision well.

Remember: Claude is capable of extraordinary creative work. Don't hold back, show what can truly be created when thinking outside the box and committing fully to a distinctive vision.
