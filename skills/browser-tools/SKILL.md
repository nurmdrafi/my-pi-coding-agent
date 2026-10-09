---
name: browser-tools
description: "Playwright/e2e testing ONLY via CDP :9222: verify UI fixes in the running app, live replay of failing specs, DOM inspection, screenshots, storageState for e2e work. NOT research/web content (→ web-search), NOT manual QA, NOT general debugging (→ systematic-debugging), NOT frontend design (→ refactoring-ui)."
disable-model-invocation: true
---

# Browser Tools

## Invocation & reuse rules (mandatory)

- Load this skill before ANY live-browser interaction (navigation, eval,
  screenshots, DOM inspection of a running page, replaying failing specs).
- Do NOT use a browser when filesystem/shell/static-code inspection answers
  the question; state briefly (internal workflow) what the browser is for
  before starting it.
- Reproducible automated E2E → `playwright-tester` skill (Playwright Test
  fixtures), not ad-hoc scripting here. This skill is for interactive/live
  work; its rules complement, never duplicate, that skill's.
- Reuse: do not launch a second Chrome if an existing debug session on :9222
  is alive and safe to reuse — connect to it. Reuse existing tabs/contexts
  when safe (`--new` only when the current tab must not be disturbed).
- **Verify tab targeting before trusting eval output**: after `browser-nav`
  (especially `--new`), confirm the next eval lands in the intended tab — the
  standard recon reports URL + title first, and they must match the target.
  An eval once ran in a stale "New Tab" and read as a blank page, sending the
  investigation down a false path.
- Close only resources the current task created; leave the developer's
  browser and tabs as found.
- Never expose a debugging port beyond localhost (no `0.0.0.0` binding, no
  public host port-forwarding for :9222).
- After each session, record evidence: URL, title, console errors, network
  errors, screenshot paths — in the reply or task report.
- Record whether the browser was **launched fresh, reused, or attached via
  CDP** in any report that involves timings.

## Routing

**This skill exists for Playwright/e2e testing only.** Anything else routes elsewhere:

- Read-only research / web content → web-search skill (`tvly search`, `tvly extract`); for static pages `{baseDir}/scripts/web-fetch.mjs <url> <maxChars>` is the cheapest extractor (headless, capped, no quota). Never this skill for research.
- Manual QA / visual review → refactoring-ui or user-driven, not agent browser driving.
- General debugging (runtime errors, wrong data) → systematic-debugging; go live only when the failing spec needs it.
- Failing e2e/browser-mode spec the runner log doesn't explain → live replay: `references/debugging.md` (go live after ONE unexplained failure).
- Out of scope: frontend feature testing outside e2e specs, visual inspection for design review, scraping for research, auth debugging outside e2e sessions, one-off DOM poking. If a task is not part of a Playwright/e2e effort, it does not need this skill's Chrome.

## Tools

CDP tools against Chrome on `:9222` (macOS + Linux): per-script usage,
setup (`npm install` once), pre-flight, and fresh-vs-`--profile` guidance in
`references/tools.md`.

## References

- `references/tools.md` — per-script usage, setup, pre-flight, profile trade-offs, slow-startup attribution.
- `references/debugging.md` — live replay of failing specs: procedure, error/console/network collector, canary probe, engine-source-as-ground-truth.
- `references/efficiency.md` — eval patterns: standard recon, DOM-over-screenshots, single-call IIFEs, batching, polling.
