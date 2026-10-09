# Headed review runs and headless quirks

Read before running a headed suite or a review a human watches. Moved verbatim
from the SKILL.md body.

## Headed review runs (a human watches the browser)

- **Window sizing — never chase crop with size tweaks.** A fixed `viewport` crops right/bottom on any display whose usable area is smaller than viewport + OS window chrome (macOS menubar/dock, Linux panels differ per machine — the same fixed size fit one laptop and cropped another, on both OSes). For headed review runs use `viewport: null` + `launchOptions: { args: ['--start-maximized'] }`: the page renders at exactly the visible desktop area on every OS/display. Headless keeps Chromium's default size — fine when specs assert DOM/app state, never pixel layout.
- **Per-test hold:** wrap the `page` fixture itself (`page: async ({ page: basePage }, use, testInfo) => { await use(basePage); await hold(basePage, testInfo) }`) — lazy (instantiates a page only when the test depends on it) and applies in every spec file. Module-level hooks in a shared fixture module (`test.afterEach`) attach only to the FIRST importing file; an auto fixture instantiates the default page even for tests using `{ browser }` (stray about:blank window). Guard with `project.use.headless === false`, `page.isClosed()`, `page.url() !== 'about:blank'` — and wrap the hold body in try/catch: it is cosmetic, a destroyed execution context must never fail the test.
- **Geolocation tests:** prefer per-test `test.use({ geolocation, permissions: ['geolocation'] })` + `page.addInitScript` faking the API over `browser.newContext()` — one window, hold applies; a custom context is the usual source of "two windows at once" and a missing hold bar.
- **Consecutive camera actions** (zoomOut ×2, chained flyTo): wait for camera-idle between them. A click landing mid-ease cancels the animation and re-eases from the intermediate zoom (13 → 11.96 instead of 11) — the assertion fails while the code is correct.
- **One review harness across every headed suite:** shared review chrome — a
   per-suite restyle reads to the user as "visual UI does not match". Case transitions must be instant: snapshot/prepare heavy setup once (prebuilt apps, stored state) and reuse the browser across cases — a fresh launch or reinstall per case adds dead seconds after every hold.
- **Occluded/backgrounded windows freeze rendering** — Chromium pauses rAF + compositing for hidden, fully covered, or backgrounded windows. A headed review that "shows nothing" or stalls mid-animation is a harness artifact, not an app bug: verify by bringing the window to front, screenshotting, or headless mode before rerunning — reruns reproduce the same freeze.

## Headless quirks

- **Fullscreen**: fires `fullscreenchange` at load in headless → assert toggle
  direction-agnostically (class swaps between two known values), never initial direction.
- **Geolocation**: no permission prompt → override `navigator.geolocation` via
  `context.addInitScript` instead of granting permissions.
- **CPU-rendered graphics** rasterize slower than GPU → re-budget settle waits
  (see `acceptance-and-budgets.md`), prefer `expect.poll` with its own timeout.
