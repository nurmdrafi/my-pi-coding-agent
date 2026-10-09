# Acceptance, artifacts, and timeout budgets

Read before reporting results or setting timeouts. Moved verbatim from the
SKILL.md body.

## Acceptance & artifacts

1. **Style-load ≠ a rendered map.** `isStyleLoaded()` + logo-visible + no-page-errors
   can ALL pass while the canvas is white (tiles never painted). A render claim
   needs a render gate: `idle` event (tiles parsed by the worker and painted) or
   a pixel sample. If the suite can pass on a white map, it does not verify
   rendering — say so, don't report "all green".
2. **Port the sibling repo's branding patterns verbatim before authoring.** When
   an upstream/sibling library already solved the exact UI contract (attribution
   dedupe via MutationObserver content-replace, logo size/margins, attribution
   expansion, control stacking), copy that implementation — inventing a different mechanism
   (e.g. `customAttribution` where the style also carries source attributions)
   ships duplicate copyright text and size/position mismatches on first headed
   review. Read the sibling's control components and CSS before writing a line.
3. **Preserve run artifacts the maintainer traces by hand.** Playwright empties
   `outputDir` at every run start — a maintainer who checks `test-results/`
   afterwards finds it wiped and cannot distinguish pass from never-ran. Use a
   timestamped `outputDir` (or copy artifacts to a retained `report/`) whenever
   a human reviews results.
4. **Headless-green is not acceptance for visual work.** Before reporting "all
   pass" on anything with visual requirements (branding, rendering, control
   layout), run the headed review flow or capture a per-case screenshot set, and
   point the maintainer at the artifacts — the maintainer must never have to
   click through each case to discover what actually failed.
5. **Set acceptance criteria first when a reference implementation exists** —
   derive them from the sibling repo's shipped behavior (component code + CSS +
   its own e2e assertions), get them acknowledged, then implement.

## Timeout budgeting (measure, then set once)

- ONE global `timeout` in `playwright.config.ts`, set from **measurement**, not dogma:
  run one representative spec, note phase costs (server start, load-to-app-ready, each
  interaction), then budget.
- Light pages: 10 s is plenty. Heavy pages — real network assets, CPU-rendered graphics
  (software WebGL), cold CI runners — legitimately need 30–60 s: a 10 s budget once
  manufactured four fake failures where ready-polling alone ate 4–6 s per page.
- Never override ad hoc via CLI `--timeout` — an override once faked failures on
  legitimately slow settle tests while the config already had budget.
- No per-test `test.setTimeout` patches to hide slowness; a long wait gets its own
  `expect.poll(..., { timeout })`.
- Budget setup separately from assertions: a full-load `goto` can eat the whole per-test
  budget before the first assertion runs.
- **A flake is a race, not a budget problem** — never bump timeouts or loosen polls in
  response; root-cause the registration/consumption race.
- User repeats a discipline correction → encode it in config immediately; a runtime
  promise is not a fix (one topic took four corrections before landing in config).

## Slow startup: measure before modifying

"Playwright is slow" is almost never `chromium.launch()`. Phase-timing script (run from
repo root so `@playwright/test` resolves; delete after measuring):

```js
import { chromium } from '@playwright/test'
const t = {};
const mark = async (n, f) => { const s = performance.now(); const r = await f(); t[n] = Math.round(performance.now() - s); return r };
const browser = await mark('launch', () => chromium.launch());
const ctx = await mark('newContext', () => browser.newContext());
const page = await mark('newPage', () => ctx.newPage());
await mark('goto', () => page.goto('http://127.0.0.1:PORT/'));
console.log(t); await browser.close();
```

Also measure separately: `webServer` cold start (poll `curl` until first 200), chained
`npm run build`, and `time curl localhost` vs `127.0.0.1` (IPv6/DNS delay).
Ranked root causes (validate by measurement): remote app/API deps inside tests > chained
build or slow webServer > per-test launch/install > proxy/DNS > network-mounted FS >
missing Linux deps/Xvfb > macOS Rosetta mismatch > excessive workers. Reference
(Linux/ext4, PW 1.62): launch ≈230 ms, context ≈30 ms, page ≈140 ms — near these, the
browser is NOT the problem; look at the test body and the server.
