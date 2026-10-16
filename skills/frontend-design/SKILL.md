---
name: frontend-design
description: "Build NEW web components/pages/apps from scratch. Detects UI stack (Ant Design, shadcn/Tailwind, vanilla), audits sibling components + tokens, extends established idioms. NOT editing/fixing/polishing existing UI (→ refactoring-ui) or logic-only changes with no new markup."
license: Complete terms in LICENSE.txt
disable-model-invocation: true
---

Build distinctive, production-grade frontend interfaces; avoid generic "AI slop" aesthetics. Real working code, exceptional attention to aesthetic detail + creative choices.

Input: frontend requirements — component/page/app/interface; maybe purpose, audience, constraints.

Prevention catalog (from the repo review audit) — new UI ships under error boundary with loading/empty/error states, wired into global error handler, heavy work off render path.

## Pattern Audit (MANDATORY FIRST — overrides every aesthetic directive below)

Before any UI: **extending** existing design system or **creating from scratch**? Existing codebase → ALWAYS extending.

1. Read closest siblings first: 2–3 existing components/pages nearest to target (`rg -l` similar names, then `read`). Note exact structure, classes, props, spacing, primitive composition.
2. Extract design language:
   - Theme/tokens: AntD `ConfigProvider` `theme`/`token` (v5) or less variables (v4); Tailwind `tailwind.config` + CSS variables; global CSS `:root` vars; design-system package exports.
   - Spacing/layout scale
   - Color palette + semantic mapping (bg/text/border/states)
   - Radius
   - Shadows/elevation
   - Typography stack (families, sizes, weights, line-heights)
   - Motion
   - Component patterns: how codebase builds card/table/modal/form/button/empty-state/page-header → reuse verbatim.
3. Reproduce, don't redesign. SAME utility classes, tokens, primitives, spacing rhythm, file structure. Result indistinguishable from original team's screen.

### FORBIDDEN in existing codebase (unless user explicitly asks redesign)

New fonts, new palette, new CSS/styled system, parallel component library, "bold/unforgettable" deviations, decorative flourishes absent from siblings. "Match existing patterns" = hard requirement, not aspiration.

### Logic guards (new UI mutating data)

- Mutating routes/admin panels: permission gating from day one.
- Fetch-on-selection effects: staleness guard + `.catch` + clear list while refetching (out-of-order responses never repaint old entity's data).
- Bulk-edit forms: open empty or track touched fields — pre-filled field makes every `values.x ?? o.x` fallback dead code.
- AntD edit forms: `initialValues` bind only at Form mount — fetch-then-fill needs remount gate (loading spinner) or `form.setFieldsValue`; display-only `defaultValue` in `Form.Item` leaves store empty, submits placeholder garbage (`moment(undefined)` formats as today).
- Prefill into lazy tab panes (rc-tabs): `forceRender: true` or fill on activation, else first `setFieldsValue` silently dropped.
- Conditional visibility: check polarity + DEFAULT state of every span/collapse condition before shipping.
- AntD Table pagination — controlled means ALL of it together: `current` + `pageSize` as state + `onChange(page, pageSize)` setting both. Wiring only `current` while hardcoding `pageSize` silently ignores the size changer (looks broken/uncontrolled). Server-side tables: reset `page` to 1 whenever a filter/refresh replaces the dataset. Client-side tables: antd v4 keeps internal/controlled `current` when `dataSource` is replaced — no clamp — so shorter refetched data lands on an empty out-of-range page; reset to 1 on dataset change (effect or at fetch site).
- Temporary demo/test data for manual verification: fence with `── DEMO ──` markers, never guard or alter live-action handlers beyond a warning, and purge completely (grep `DEMO|demoMode`) the moment the user confirms — never left in a diff.
- Lazy routes + Suspense: boundary INSIDE persistent shell, around content slot (`<Outlet />`), never above layout. Top-level `<Suspense>` wrapping whole route tree unmounts navbar/sidebar every navigation → shell disappears, full-height spinner flashes = flicker not load, loses scroll position. Shell-less fallback (login/403/404) + first layout-chunk load at outer boundary; in-section navigation handled by inner one. Size inner fallback to content area (`minHeight: 60vh`), not `100vh` — no shell jump. Check codebase for existing scoped pattern first — sibling layout with `<Suspense fallback={null}>` around local panels = precedent to copy.

### Runtime robustness + errors (new UI ships this)

- Error boundaries wrap the page + major subtrees — one thrown panel must not blank the app.
- Every async surface: loading/empty/error states; a failed poll keeps the last good view.
- Non-2xx = error, not data: reject, set timeouts, surface the failure; never a silent empty state.
- Validate/parse API values pre-use — nullable/string numbers hitting `.toFixed`/`.map`/`.charAt` blank the UI.
- No success toast/modal close on a failed mutation; reset prior entity state on selection change.
- One owner per failure: a single global layer catches/normalizes/logs/decides — components don't each re-handle (no duplicate toasts/logs/sign-outs).
- Handlers at every level: process (`window.onerror`, `unhandledrejection`), router/app error page, component boundaries, data layer (one API interceptor).
- Classify every status/kind, never one generic message: network/timeout, 400/422 validation, 401 auth, 403 permission, 404 missing, 409 conflict, 429 throttle, 5xx server — each → user message + recovery action.
- Never swallow: no empty `catch`, no `console.error` stripped in prod.
- Retry only transient failures, with backoff — never infinite, never deterministic.
- Fallback UI: error page/boundary with reset/retry; keep the last good view.

## Stack Adaptation (part of Pattern Audit)

Detect UI stack from `package.json` + existing components; express design through that stack's idioms — never impose foreign style system:

- **Ant Design (v4/v5)**: AntD primitives — Form, Table, Modal, Card, Space, Typography — themed via tokens (`ConfigProvider`, v5 `theme` algorithm / v4 less variables). Aesthetics below = refinements on top of AntD (spacing, hierarchy, color), not custom replacement.
- **shadcn/ui + Tailwind**: existing component registry, `cn()` utility, project Tailwind tokens/extensions; new shadcn-style components, not parallel hand-rolled system.
- **Vanilla/other**: no established idioms → full aesthetic freedom below.

Match existing patterns before introducing new ones.

## Design Thinking (GREENFIELD ONLY — skip if Pattern Audit found existing UI)

Existing UI found → direction known: extend it, build to match. Creative exploration ONLY for no-established-aesthetic projects.

Before coding greenfield:
- Purpose: what problem, who uses it?
- Tone: pick an extreme: brutally minimal, maximalist chaos, retro-futuristic, organic, luxury/refined, playful, editorial, brutalist, art deco, soft/pastel, industrial. Inspirations only; design true to one direction.
- Constraints: framework, performance, accessibility.
- Differentiation: what makes this UNFORGETTABLE? The one memorable thing?

Commit to clear conceptual direction, execute with precision. Bold maximalism + refined minimalism both work — key = intentionality, not intensity.

Implementation (HTML/CSS/JS, React, Vue, …): production-grade, functional, visually striking, cohesive point-of-view, meticulous detail.

## Aesthetics Guidelines

- Typography: beautiful, unique, interesting fonts. Avoid Arial/Inter/generics; distinctive characterful choices elevating aesthetics. Pair distinctive display font + refined body font.
- Color/theme: cohesive aesthetic, CSS variables. Dominant colors + sharp accents > timid even palettes.
- Motion: animations + micro-interactions; CSS-only for HTML, Motion library for React when available. High-impact moments: one well-orchestrated page load with staggered reveals (`animation-delay`) > scattered micro-interactions. Scroll-triggering, surprising hover states.
- Spatial composition: unexpected layouts, asymmetry, overlap, diagonal flow, grid-breaking, generous negative space OR controlled density.
- Backgrounds/details: atmosphere + depth, not default solid colors. Contextual effects/textures matching aesthetic: gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, decorative borders, custom cursors, grain overlays.

NEVER generic AI aesthetics: overused fonts (Inter, Roboto, Arial, system), clichéd schemes (purple gradients on white), predictable layouts, cookie-cutter design lacking context character.

Interpret creatively, unexpected context-designed choices. No two designs same. Vary light/dark themes, fonts, aesthetics. NEVER converge on common choices (Space Grotesk) across generations.

Match implementation complexity to vision: maximalist = elaborate code, extensive animations/effects; minimalist = restraint, precision, spacing/typography/subtle detail. Elegance = executing vision well.

Don't hold back — commit fully to distinctive vision.
