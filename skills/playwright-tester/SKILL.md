---
name: playwright-tester
description: "Playwright test automation — e2e specs, stress/update-flow runs, bug-hunt iterations, slow-startup diagnosis. Attaches to running Chrome (CDP :9222) for logged-in sessions; falls back to isolated runs. Use for any Playwright/e2e/browser-automation task. NOT one-off DOM poking (→ browser-tools), component specs (Vitest), CI."
disable-model-invocation: true
---

# Playwright Tester (CDP attach, session reuse)

## Invocation rules

- Load this skill before writing or changing any Playwright test or config code.
- No browser at all when shell, static-code, or unit tests answer the question.
- One-off live inspection / screenshots / DOM poking → `browser-tools`. Reproducible
  automated tests → here. Complements, never duplicates.

## Acceptance & artifacts (bkoi-gl-js postmortem 2026-09-16)

1. **Style-load ≠ a rendered map.** `isStyleLoaded()` + logo-visible + no-page-errors
   can ALL pass while the canvas is white (tiles never painted). A render claim
   needs a render gate: `idle` event (tiles parsed by the worker and painted) or
   a pixel sample. If the suite can pass on a white map, it does not verify
   rendering — say so, don't report "all green".
2. **Port the sibling repo's branding patterns verbatim before authoring.** When
   an upstream/sibling library already solved the exact UI contract (attribution
   dedupe via MutationObserver content-replace, logo SVG at fixed 88×23 with
   `margin:0 0 -4px -4px`, always-expanded attribution, logo anchor position vs
   stacked controls), copy that implementation — inventing a different mechanism
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

## Modes — pick before scaffolding

1. **CDP attach (default)**: live dev server + developer's Chrome on `:9222`, real
   logged-in session, `workers: 1`. For stress runs, update-flow crosschecks, live debugging.
2. **CI / isolated fallback**: fresh launch, auth via `storageState` — record once
   (`context.storageState({ path: 'e2e/.auth/state.json' })`), then
   `use: { storageState: … }`. Parallel workers fine here — `workers: 1` is a
   shared-session constraint. `webServer` serves the production build,
   `reuseExistingServer: !process.env.CI`. The CDP-attach fixture never ships to CI;
   guard with `process.env.CI` so one config serves both modes.
3. **Boundary with component tests**: component-level behavior against repo source
   (rendering, props, events) belongs in Vitest browser mode; whole-app/user flows and
   anything against the **built artifact** belong here.

## Pre-flight (mandatory, ~30 s)

0. **Detect, don't assume the URL**: before writing a target URL, find running
   dev servers (poll common ports, `lsof -iTCP -sTCP:LISTEN`, or the repo's
   documented start command). One running server → use it silently. Multiple →
   ask. None → offer to start one. This is the same one-owner rule as §3,
   applied before the first navigation.

1. `npx playwright --version` resolves in the target repo; chromium binary installed
   (`npx playwright install chromium` — idempotent; long installs run detached, never
   inside the test command).
2. Env/credentials present; commit `.env.example`, gitignore `.env` precisely — a broad
   `.env*` pattern once swallowed the example file.
3. **Ports — one server owner**: kill zombie dev servers from aborted tool calls
   (`pkill -f "[v]ite e2e"` — bracket so pkill never self-matches). Never mix a manual
   server with the runner's `webServer`: with `reuseExistingServer` local, the runner once
   silently reused a zombie → whole suite failed in ~250 ms, misread for two rounds as
   "server never started". If a port answers, `curl` its health; when diagnosing, verify
   run output actually contains `[WebServer]` startup lines.
4. **Recon first, full suite second**: run the single failing spec before any full-suite
   run; long suites via `nohup … > /tmp/e2e.log 2>&1 &` + poll — a full suite can outlive
   a tool call and get aborted mid-run.
5. **"Nothing happened" = diagnose the window, not the app** (2026-09-15, react-bkoi-gl:
   ~45 min of blind `e2e:review` reruns): Chromium freezes rendering (rAF + compositing)
   for occluded/backgrounded windows, so map/canvas/animation steps silently no-op in a
   headed browser that isn't visible. Before rerunning anything, capture a screenshot
   or re-run the one step headless — if headless works, the app is fine and the window
   was occluded. One harness check beats N blind reruns.

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

## Performance rules

1. Built-in fixtures (`test('…', async ({ page }) => …)`) — `browser` is worker-scoped
   and shared; `page` is per-test isolated. Never `chromium.launch()` inside a test.
2. Expensive shared setup → worker-scoped custom fixture, not per-test setup.
3. Browser install is environment setup, never part of the test command.
4. `reuseExistingServer: !process.env.CI`; see Pre-flight §3 on mixing servers.
5. CI prefers the production build; library repos run e2e against `dist/`.
6. Always `headless: true` — headed only when the user explicitly asks for it.
   No need to announce or explain the headless default; the user knows.
7. Never `slowMo` as a perf fix; no per-test launches to "isolate" flake.
8. Chromium flags: none by default — add one only when required, documented, reason
   recorded in config, and measurably better. (Legit exception: headless GPU/WebGL needs
   `--use-angle=swiftshader --enable-unsafe-swiftshader`, plus `--disable-dev-shm-usage`
   in containers; `--no-sandbox` only in Docker/CI.)
9. Tracing/screenshots/video limited to `on-first-retry` / `retain-on-failure`.
10. Report before/after timings with every performance change.

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

## Locator strategy

Selectors describe what a user sees, in priority order:
1. `page.getByRole()` with an accessible name
2. `page.getByLabel()` for form controls
3. `page.getByText()` for visible content
4. `page.getByTestId()` when the app provides a test contract
5. CSS/structured selectors last — derived from rendered DOM (recon), never source guesses

Waits: actions auto-wait for actionability; use web-first assertions
(`await expect(locator).toBeVisible()`) or `locator.waitFor()` — never
`waitForSelector`, fixed sleeps, or `networkidle` (SPAs with polling never go
idle; poll app-readiness predicates instead).

```js
await page.getByLabel('Email').fill(process.env.E2E_EMAIL);
await page.getByRole('button', { name: 'Sign in' }).click();
await page.waitForURL('**/dashboard');
await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
```

Never claim success without asserting the resulting page state — report
actions, failures, and artifact paths from what the page actually shows.

## Reconnaissance-then-action

Before writing selectors on a dynamic app: wait for load, inspect the rendered DOM
(`page.content()`, `locator("button").all()`), screenshot. Selectors come from rendered
state, never source guesses.

- Never assert an attribute the component doesn't forward (`data-testid`, classes) —
  verify forwarding in the live DOM first.
- React StrictMode double-mounts duplicate ids → assert count-tolerantly (`>= n`) via
  `expect.poll`.
- Visual identity living in CSS (icons as `background-image`, glyphs): assert computed
  style, not child elements — and make sure the host app imports every published
  stylesheet/entry point (a logo once "vanished" because the test host never imported
  the library's styles export).
- Cap everything a recon or probe step returns before it lands in context:
  `JSON.stringify(x).slice(0, 500)` for `page.evaluate` dumps, `| tail -20` on
  test-run output, and `-o` / `| cut -c1-200` when grepping a library's `dist` —
  minified lines are megabytes long; `head -N` bounds lines, not bytes.

Recon tools: `browser-tools` skill (CDP eval on the running case, same-origin state, no
login automation) or `npx playwright codegen <url>` — generating specs without either is
the failure mode this section prevents.

## Trusted input

Native canvas/gesture components (maps, drawings, editors) bind real container-level
`mousedown` and ignore synthetic `dispatchEvent`. Drive them with real
`page.mouse.down()/move()/up()`. Before ANY synthetic-input attempt, grep the library's
dist in `node_modules` for its event binding — it states the binding target outright;
two rounds of failed synthetic probing were once answered by one source grep.

## Headless quirks

### Headed review runs (a human watches the browser)

- **Window sizing — never chase crop with size tweaks.** A fixed `viewport` crops right/bottom on any display whose usable area is smaller than viewport + OS window chrome (macOS menubar/dock, Linux panels differ per machine — the same fixed size fit one laptop and cropped another, on both OSes). For headed review runs use `viewport: null` + `launchOptions: { args: ['--start-maximized'] }`: the page renders at exactly the visible desktop area on every OS/display. Headless keeps Chromium's default size — fine when specs assert DOM/app state, never pixel layout.
- **Per-test hold:** wrap the `page` fixture itself (`page: async ({ page: basePage }, use, testInfo) => { await use(basePage); await hold(basePage, testInfo) }`) — lazy (instantiates a page only when the test depends on it) and applies in every spec file. Module-level hooks in a shared fixture module (`test.afterEach`) attach only to the FIRST importing file; an auto fixture instantiates the default page even for tests using `{ browser }` (stray about:blank window). Guard with `project.use.headless === false`, `page.isClosed()`, `page.url() !== 'about:blank'` — and wrap the hold body in try/catch: it is cosmetic, a destroyed execution context must never fail the test.
- **Geolocation tests:** prefer per-test `test.use({ geolocation, permissions: ['geolocation'] })` + `page.addInitScript` faking the API over `browser.newContext()` — one window, hold applies; a custom context is the usual source of "two windows at once" and a missing hold bar.
- **Consecutive camera actions** (zoomOut ×2, chained flyTo): wait for camera-idle between them. A click landing mid-ease cancels the animation and re-eases from the intermediate zoom (13 → 11.96 instead of 11) — the assertion fails while the code is correct.
- **One HUD across every headed suite:** framework-test review and e2e review share the same review chrome (bottom-center pill, timed progress bar) — a per-suite restyle once read to the user as "visual UI does not match". Case transitions must be instant: snapshot/prepare heavy setup once (prebuilt apps, stored state) and reuse the browser across cases — a fresh launch or reinstall per case adds dead seconds after every hold.
- **Occluded/backgrounded windows freeze rendering** — Chromium pauses rAF + compositing for hidden, fully covered, or backgrounded windows. A headed review that "shows nothing" or stalls mid-animation is a harness artifact, not an app bug: verify by bringing the window to front, screenshotting, or headless mode before rerunning — reruns reproduce the same freeze.

- **Fullscreen**: fires `fullscreenchange` at load in headless → assert toggle
  direction-agnostically (class swaps between two known values), never initial direction.
- **Geolocation**: no permission prompt → override `navigator.geolocation` via
  `context.addInitScript` instead of granting permissions.
- **CPU-rendered graphics** rasterize slower than GPU → re-budget settle waits
  (see Timeout budgeting), prefer `expect.poll` with its own timeout.

## Library / SDK e2e

When the target is a library, not an app:

- **Case registry**: one small case per documented feature, served at `?case=<id>` by a
  tiny host app; specs only navigate + assert. Add a case index page so humans click
  through every scenario — the suite must run without an agent.
- **Run against the built artifact and verify resolution**: the host app must alias the
  package name to `dist/` — a suite once silently tested an installed npm copy while the
  build sat untested. Verify the alias actually resolves; rebuild before e2e after
  library changes.
- Host app imports **every published entry point** (main, `./styles`, subpaths) and uses
  the app's real env mechanism (`.env`) — no invented `window.__*__` globals.
- Install a permanent page-error recorder before app code (`window.__pageErrors__`) —
  a blank page with no dev overlay is otherwise undiagnosable.
- Consult a mature upstream reference repo BEFORE authoring specs (a suite written
  against guessed idioms was rewritten after a user redirect); grep the target repo for
  existing helpers before writing new ones.

## Update-flow stress pattern (per iteration)

1. **Baseline** — fetch record via `apiGet` in the connected tab: same origin, same token
   the app uses; never a separate HTTP client.
2. **Mutate** — drive the UI, real timing.
3. **UI-wipe check** — assert the form still shows the typed value right before save
   (catches async re-seed races that silently revert edits).
4. **Save**.
5. **Crosscheck** — `diffRec(before, after, [...edits, ...serverFields])`: every field
   NOT edited must equal baseline. Screenshot every failure.
6. **Report row** — pattern, edits, field diffs, uiWipe flag, duration; timestamped
   files (`report-<stamp>.json/.md`) so stale reports never read as fresh.

Pattern matrix: no-edit-save, single-field, rapid multi-field, toggle-only, cancel-reopen,
async-race (save before full record arrives), cross-wipe (edit A → assert B survives).
When all pass, add harder patterns instead of repeating.

Lessons that keep paying: auth self-heal (retry once on 401 after `refreshAuth`); parse
JSON-string blobs before compare/spread (spreading a string seeds nothing silently);
`Record<string, unknown>` for API payloads (`object` fails tsc); `workers: 1` for shared
state; fail-fast errors that include the exact relaunch command; server-derived fields in
the diff ignore list.

## Debugging a FAIL

- Read the report row first: `uiWipe: true` → UI race (form re-seed / `resetFields` on
  async arrival). Field diffs only → payload bug: capture the submit request via
  `page.on("request")` and compare sent vs intended.
- Reuse on-disk artifacts before re-running: failure traces, screenshots, saved run logs
  often answer with zero execution.
- After a fix, re-run ONLY the failing spec(s) (`npx playwright test spec.ts -g "name"`)
  before any full suite.
- One unexplained failure → go live with `browser-tools` replay instead of more
  log-guessing (hours of log analysis were once settled in minutes of live replay).

## Scaffold

Copy from `{baseDir}/template/`: `playwright.config.ts`, `e2e/fixtures/*.ts` (`cdp`,
`api`, `report`), `e2e/example.spec.ts`. All e2e code lives in the target repo (`e2e/`).
Add `"e2e": "playwright test"` to package.json. Env config: `E2E_APP_URL`,
`E2E_AUTH_TOKEN_KEY`, `E2E_EMAIL`, `E2E_PASSWORD`, `E2E_ITERATIONS` — credentials never
hardcoded. Adapt only the `ADAPT` markers: selectors, endpoints, token key,
server-managed fields.
