---
name: refactoring-ui
description: Audit and fix existing web UIs — hierarchy, spacing, color, depth. Use when the UI "looks off", needs polish, a design system, or dark mode. FIXING/POLISHING existing UI only — NOT for building new UI → frontend-design.
license: MIT
metadata:
  author: wondelai
  version: "1.3.0-slim"
---

# Refactoring UI (slim)

Audit-first system for **fixing existing UIs**. Sibling of `frontend-design` (greenfield). Apply when reviewing or polishing frontend code.

**Core: design in grayscale first, add color last.** Great UI is systems, not talent — constrained scales for spacing, type, color, and shadows. Start with too much whitespace, then remove.

## 0. House style wins over this skill (hard rules from real failures)
- Before redesigning ANY page, audit 2-3 sibling pages in the same app section and copy their EXACT layout idiom: wrapper padding, page width (full-width vs constrained), heading size/tag, card style object. The app's established pattern beats this skill's generic advice every time. A "better" design that breaks app consistency is a bug, not an improvement.
- Verify how real data keys work before using them (e.g. `localStorage.getItem('x')` — confirm the key against the code that WRITES it, not a copy-pasted page).
- Do NOT run a production build to verify style-only changes in a dev-server project — HMR shows it live. Build only when imports/deps changed.
- After ANY scripted/regex edit to JSX, parse every touched file (esbuild --loader:.jsx) before declaring success. A regex count check is NOT verification. Prefer `edit` tool over ad-hoc python replace for JSX blocks — string replace on JSX nests/duplicates tags silently.

## Scoring
Rate the UI 0–10 on the principles below. State the score and the specific fixes to reach 10.

## 1. Hierarchy — not everything can be important
- Three levers: **size, weight, color**. Combine, don't stack — primary = large OR bold OR dark, not all three.
- Reserve "all three" for the single most important element on the page.
- De-emphasize labels (form labels, table headers, metadata): smaller / lighter / uppercase-small. **Values win over labels.**
- Semantic color ≠ visual weight — a muted danger button beats a screaming one for routine actions.

## 2. Spacing & sizing — relationships, not arbitrary values
- Scale: **4, 8, 16, 24, 32, 48, 64** (`p-1 p-2 p-4 p-6 p-8 p-12 p-16`).
- Start with too much whitespace, then remove — you'll almost never remove enough.
- Space **between** groups > space **within** groups.
- Constrain text to 45–75 chars (`max-w-prose` ~65ch); forms 300–500px (`max-w-md`). Full-width is almost never right.

## 3. Typography — modular scale, two families max
- Scale (1.25 ratio): **12, 14, 16, 20, 24, 30, 36** (`text-xs/sm/base/lg/xl`).
- Headings tight (leading 1.0–1.25), body relaxed (1.5–1.75). Wider text → more leading.
- Emphasis via 600–700, not everywhere. Body weight ≥ 400.
- Two fonts max — or one family with weight variation.

## 4. Color — system first, grayscale first
- 5–9 shades per color (50–900). Darkest is 900-gray (`#111827`), never pure black.
- Pure grays look dead — add a subtle tint (cool → blue `#64748b`, warm → `#78716c`).
- Body text ≥ 4.5:1 contrast; large (18px+) ≥ 3:1. Use `#374151` (gray-700) on white.
- HSL variants: lighter = +lightness / −saturation / hue→60; darker = −lightness / +saturation / hue→0 or 240.
- Never convey meaning by color alone — always pair with text/icon.

## 5. Depth & shadows — elevation scale
- Small = raised (buttons/cards `shadow-sm/md`); large = floating (dropdowns/modals `shadow-lg/xl`).
- Two-part shadow: tight dark (crispness) + large soft (atmosphere). Color = transparent dark, not opaque gray.
- Depth without shadow: lighter top border + darker bottom border, subtle gradient, offset overlap.
- If everything floats, nothing has depth.

## 6. Images & icons — treat as design elements
- Icons sized to context, consistent stroke/style (`w-4 h-4` inline, `w-6 h-6` nav, `w-8 h-8` feature).
- Images: `object-fit: cover` + fixed `aspect-ratio` — never distort.
- Text on images needs an overlay (`bg-gradient-to-t from-black/60 to-transparent`).
- Empty states: illustration + clear CTA, not bare text.

## 7. Layout — don't center everything
- Left-align text by default; center only short headlines, heroes, single CTAs, empty states.
- Let images bleed past card bounds; overlap containers; vary emphasis between items in a list.
- Sidebars 240–320px on a lighter bg. Page container `max-w-4xl mx-auto`.

## Quick diagnostic
| Check | If it fails → |
|---|---|
| Squint/blur test: does hierarchy read? | boost primary vs secondary contrast |
| Works in grayscale? | strengthen size/weight/spacing (don't lean on color) |
| Enough whitespace? | add more, especially between groups |
| Labels quieter than values? | smaller / lighter / uppercase labels |
| Spacing on the scale? | kill arbitrary px (13/17/23) |
| Text width constrained? | `max-w-prose` on text blocks |
| Contrast ≥ 4.5:1? | gray-700+ on white |
| Shadow matches elevation? | align to sm/md/lg/xl by purpose |

## Common fixes
| Symptom | Fix |
|---|---|
| "Looks amateur" | more whitespace, constrain widths |
| "Feels flat" | add depth differentiation (shadow / border-bottom) |
| "Hard to read" | +line-height, constrain width, +contrast |
| "All looks the same" | vary size/weight/color — primary vs secondary |
| "Cluttered" | group related items, grow inter-group spacing |
| "Colors clash" | desaturate, more grays, stick to system palette |
| "Buttons don't pop" | +contrast vs surroundings, +shadow |

Based on Wathan & Schoger, *Refactoring UI*.
