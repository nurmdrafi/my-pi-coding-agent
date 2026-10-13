# Acceptance, artifacts, and timeout budgets

Read before reporting results or setting timeouts.

## Acceptance & artifacts

- Style-load ≠ rendered map. `isStyleLoaded()` + logo-visible + no-page-errors can ALL pass while canvas is white (tiles never painted). Render claim needs render gate: `idle` event (tiles parsed by worker + painted) or pixel sample. Suite can pass on white map → it doesn't verify rendering — say so, don't report "all green".
- Port sibling repo's branding patterns verbatim before authoring. Upstream/sibling library already solved exact UI contract (attribution dedupe via MutationObserver content-replace, logo size/margins, attribution expansion, control stacking) → copy that implementation — inventing different mechanism (e.g. `customAttribution` where style also carries source attributions) ships duplicate copyright text + size/position mismatches on first headed review. Read sibling's control components + CSS before writing a line.
- Preserve run artifacts maintainer traces by hand. Playwright empties `outputDir` every run start — maintainer checking `test-results/` afterwards finds it wiped, can't distinguish pass from never-ran. Timestamped `outputDir` (or copy artifacts to retained `report/`) whenever a human reviews results.
- Headless-green ≠ acceptance for visual work. Reporting "all pass" on anything visual (branding, rendering, control layout) → run headed review flow or capture per-case screenshot set, point maintainer at artifacts — maintainer must never click through each case to discover what failed.
- Reference implementation exists → set acceptance criteria first — derive from sibling repo's shipped behavior (component code + CSS + its own e2e assertions), get acknowledged, then implement.

## Timeout budgeting (measure, then set once)

- ONE global `timeout` in `playwright.config.ts`, set from measurement not dogma: run representative spec, note phase costs (server start, load-to-app-ready, each interaction), then budget.
- Light pages: 10 s plenty. Heavy pages — real network assets, CPU-rendered graphics (software WebGL), cold CI runners — legitimately need 30–60 s: 10 s budget once manufactured four fake failures where ready-polling alone ate 4–6 s/page.
- Never ad-hoc CLI `--timeout` — override once faked failures on legitimately slow settle tests while config already had budget.
- No per-test `test.setTimeout` patches hiding slowness; long wait gets own `expect.poll(..., { timeout })`.
- Budget setup separately from assertions: full-load `goto` can eat whole per-test budget before first assertion.
- Flake = race, not budget problem — never bump timeouts/loosen polls in response; root-cause the registration/consumption race.
- User repeats a discipline correction → encode in config immediately; runtime promise ≠ fix (one topic took four corrections before landing in config).

## Slow startup: measure before modifying

"Playwright is slow" almost never `chromium.launch()`. Phase-timing script (run from repo root so `@playwright/test` resolves; delete after measuring):

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

Also measure separately: `webServer` cold start (poll `curl` until first 200), chained `npm run build`, `time curl localhost` vs `127.0.0.1` (IPv6/DNS delay).

Ranked root causes (validate by measurement): remote app/API deps inside tests > chained build or slow webServer > per-test launch/install > proxy/DNS > network-mounted FS > missing Linux deps/Xvfb > macOS Rosetta mismatch > excessive workers. Reference (Linux/ext4, PW 1.62): launch ≈230 ms, context ≈30 ms, page ≈140 ms — near these, browser NOT the problem; look at test body + server.
