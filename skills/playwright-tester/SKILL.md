---
name: playwright-tester
description: "Playwright test automation — e2e specs, stress/update-flow runs, bug-hunt iterations, slow-startup diagnosis. Attaches to running Chrome (CDP :9222) for logged-in sessions; falls back to isolated runs. Use for any Playwright/e2e/browser-automation task, including 'untested critical paths' / 'no e2e coverage' gaps (auth flow, 401 ladder, wallet/settlement). NOT one-off DOM poking (→ browser-tools), component specs (Vitest), CI."
disable-model-invocation: true
---

# Playwright Tester (CDP attach, session reuse)

## Invocation rules

- Load this skill before writing or changing any Playwright test or config code.
- No browser at all when shell, static-code, or unit tests answer the question.
- One-off live inspection / screenshots / DOM poking → `browser-tools`. Reproducible
  automated tests → here. Complements, never duplicates.

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
5. **"Nothing happened" = diagnose the window, not the app** — blind reruns of a
   headed suite are the failure mode: Chromium freezes rendering (rAF + compositing)
   for occluded/backgrounded windows, so map/canvas/animation steps silently no-op in a
   headed browser that isn't visible. Before rerunning anything, capture a screenshot
   or re-run the one step headless — if headless works, the app is fine and the window
   was occluded. One harness check beats N blind reruns.

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
`page.mouse.down()/move()/up()`. Before ANY synthetic-input attempt, rg the library's
dist in `node_modules` for its event binding — it states the binding target outright;
two rounds of failed synthetic probing were once answered by one `rg` of the source.

## Scaffold

Copy from `{baseDir}/assets/`: `playwright.config.ts`, `e2e/fixtures/*.ts` (`cdp`,
`api`, `report`), `e2e/example.spec.ts`. All e2e code lives in the target repo (`e2e/`).
Add `"e2e": "playwright test"` to package.json. Env config: `E2E_APP_URL`,
`E2E_AUTH_TOKEN_KEY`, `E2E_EMAIL`, `E2E_PASSWORD`, `E2E_ITERATIONS` — credentials never
hardcoded. Adapt only the `ADAPT` markers: selectors, endpoints, token key,
server-managed fields.

## References

- `references/acceptance-and-budgets.md` — acceptance & artifacts rules, timeout budgeting, slow-startup measurement.
- `references/headed-review.md` — headed review runs (window sizing, per-test hold, camera, occlusion) and headless quirks.
- `references/library-and-stress.md` — library/SDK e2e (case registry), update-flow stress pattern, debugging a FAIL.
