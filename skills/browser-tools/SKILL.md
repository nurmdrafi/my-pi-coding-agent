---
name: browser-tools
description: "Playwright/e2e testing ONLY via CDP :9222: live replay of failing specs, DOM inspection, screenshots, storageState for e2e work. NOT research/web content (→ tavily-search / tavily-extract skills), NOT manual QA, NOT general debugging (→ systematic-debugging), NOT frontend design (→ refactoring-ui)."
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

## Slow startup: measure before modifying

If browser interaction feels slow, attribute the delay before changing
anything. Time, separately: CDP connection (`curl -sf localhost:9222/json/version`
  in a loop until it answers — that's Chrome's readiness), context discovery
  (`/json/list`), page discovery, and first action
  (`browser-eval.js '1+1'` end-to-end). Classify the delay as: connection,
  browser launch, context creation, page creation, navigation, or application
  readiness (app boot / API dependencies). Typical signatures: everything fast
  except `goto`-like actions → application/server, not the browser; slow first
  `browser-eval` but fast later → connection setup; slow `/json/version` →
  Chrome itself (profile size, flags, Rosetta on macOS arm64).

Chrome DevTools Protocol tools for agent-assisted web automation. These tools connect to Chrome running on `:9222` with remote debugging enabled. Works on macOS and Linux.

## Setup

Run once before first use (deps are not committed):

```bash
cd {baseDir}/browser-tools
npm install
```

Pre-flight before any session: `node_modules` exists in
`{baseDir}/browser-tools`, the dev server is reachable
(`curl -sf localhost:PORT`), and `:9222` is not already taken by another
debug Chrome instance.

## Start Chrome

```bash
{baseDir}/browser-start.js              # Fresh profile
{baseDir}/browser-start.js --profile    # Copy user's profile (cookies, logins)
CHROME_PATH=/path/to/chrome {baseDir}/browser-start.js   # Explicit executable
```

Launch Chrome with remote debugging on `:9222`. Chrome is auto-detected per OS (macOS: `/Applications`, Linux: `google-chrome`/`chromium`/snap); override with `CHROME_PATH` if detection fails.

Fresh vs `--profile`:
- **Fresh (default)** — clean, reproducible state; use whenever the task
  doesn't need the developer's logins.
- **`--profile`** — only when the target requires the user's auth/cookies.
  Costs: extensions, service workers, stale caches and other profile state can
  interfere. Never assert through `--profile` state when reproducibility
  matters — record a `storageState` instead and feed it to Playwright.

## Navigate

```bash
{baseDir}/browser-nav.js https://example.com
{baseDir}/browser-nav.js https://example.com --new
```

Navigate to URLs. Use `--new` flag to open in a new tab instead of reusing current tab.

## Evaluate JavaScript

```bash
{baseDir}/browser-eval.js 'document.title'
{baseDir}/browser-eval.js 'document.querySelectorAll("a").length'
```

Execute JavaScript in the active tab. Code runs in async context. Use this to extract data, inspect page state, or perform DOM operations programmatically.

## Screenshot

```bash
{baseDir}/browser-screenshot.js
```

Capture current viewport and return temporary file path. Use this to visually inspect page state or verify UI changes.

## Pick Elements

```bash
{baseDir}/browser-pick.js "Click the submit button"
```

**IMPORTANT**: Use this tool when the user wants to select specific DOM elements on the page. This launches an interactive picker that lets the user click elements to select them. The user can select multiple elements (Cmd/Ctrl+Click) and press Enter when done. The tool returns CSS selectors for the selected elements.

Common use cases:
- User says "I want to click that button" → Use this tool to let them select it
- User says "extract data from these items" → Use this tool to let them select the elements
- When you need specific selectors but the page structure is complex or ambiguous

## Cookies

```bash
{baseDir}/browser-cookies.js
```

Display all cookies for the current tab including domain, path, httpOnly, and secure flags. Use this to debug authentication issues or inspect session state.

## Extract Page Content

```bash
{baseDir}/browser-content.js https://example.com
```

Navigate to a URL and extract readable content as markdown. Uses Mozilla Readability for article extraction and Turndown for HTML-to-markdown conversion. Works on pages with JavaScript content (waits for page to load).

## When to Use

**This skill exists for Playwright/e2e testing only.** Anything else routes elsewhere:

- Read-only research / web content → tavily-search / tavily-extract skills (`tvly search`, `tvly extract`); for static pages `{baseDir}/web-fetch.mjs <url> <maxChars>` is the cheapest extractor (headless, capped, no quota). Never this skill for research.
- Manual QA / visual review → refactoring-ui or user-driven, not agent browser driving.
- General debugging (runtime errors, wrong data) → systematic-debugging; go live only when the failing spec needs it.

### Debugging failing e2e / browser-mode specs

When a Playwright or Vitest-browser spec fails and the runner log doesn't
explain it, inspect the live case instead of guessing from stack traces.
**Go live after ONE unexplained failure** — repeated log re-reads are the
anti-pattern: in the source session, hours of log analysis were settled in
minutes of live replay, which surfaced real library bugs the logs never
showed (crashing documented patterns, event-payload changes).

0. **Consume runner artifacts first**: the failure screenshot/trace/report and
   saved run logs usually answer the question with zero execution (see
   `playwright-tester` "Debugging a FAIL"). When the user asks for a screenshot
   of a failing case, prefer the runner's failure screenshot over a live one.
   Go live only when the artifacts don't explain the failure.
1. Start the dev/test server in the background (e.g. `npm run e2e:serve &`).
2. `{baseDir}/browser-start.js` → `{baseDir}/browser-nav.js <failing case URL>`.
3. **Install the error collector immediately after navigation** (snippet
   below — idempotent, survives this tab), then run the standard recon eval
   (Efficiency Guide) as the baseline.
4. Replay the spec's steps with `browser-eval.js` IIFEs — query the DOM, read
   app state (`window.__MAP__`, logs), compare against what the spec asserts.
5. Fix the spec or the app, then re-run the runner headless to confirm.

Vitest Browser Mode specs debug the same way — the same CDP Chrome serves
them; replay the failing case URL exactly as for Playwright specs.

**Error + console + network collector** (install once per tab, read after
replay with `browser-eval.js 'JSON.stringify(window.__DBG__)'`):

```javascript
(function(){
  if (!window.__DBG__) {
    window.__DBG__ = {errors: [], console: [], requests: []};
    addEventListener("error", e => __DBG__.errors.push(String(e.error || e.message)));
    addEventListener("unhandledrejection", e => __DBG__.errors.push("rejection: " + e.reason));
    const ce = console.error;
    console.error = function(){ __DBG__.console.push([].map.call(arguments, String).join(" ")); ce.apply(null, arguments) };
    const of = window.fetch;
    window.fetch = function(){ var u = String(arguments[0]);
      return of.apply(this, arguments).then(
        function(r){ __DBG__.requests.push(u + " " + r.status); return r },
        function(e){ __DBG__.requests.push(u + " failed"); throw e }) };
  }
  return "collector installed";
})()
```

For requests made before the collector, read
`performance.getEntriesByType("resource").map(e => e.name + " " + e.responseStatus)`.

Pitfalls seen in practice:
- **Blank page, no error overlay**: read trapped page errors — if the harness
  exposes a page-error recorder (`window.__pageErrors__`), read it; otherwise
  install `window.addEventListener('error'/'unhandledrejection')` collectors
  via an init script, reload, then read. Swallowed render errors are invisible
  otherwise.
- **Bare-specifier imports don't resolve in page context** — `browser-eval`
  runs in the page, not a bundler. Use IIFEs over already-loaded globals, or
  probe via the harness.

### Event-flow tracing (canary probe)

When a listener seems registered but never fires, instrument the live object's
event system and replay — this settles "registered vs consumed vs removed"
questions in one round where log-guessing failed repeatedly:

```javascript
// Canary next to the suspect registration
map.once('mouseup', () => console.log('canary-once-fired'))
const origOnce = map.once.bind(map)
map.once = (ev, fn) => { console.log('once-reg:', ev); return origOnce(ev, fn) }
// then read the log after replay: registration without firing = remover or
// event-name mismatch; canary fires but handler doesn't = different instance
```

### Engine source is ground truth

When live behavior contradicts expectation, read the installed library's
source (its dist in `node_modules`) for the binding/gating logic — `grep` the
dist for `_on`, `once(`, event names. Source explains WHY (binding target,
state machine, payload shape); the live probe confirms. Two failed
synthetic-event strategies and an "event payload lost a field" mystery were
both answered by reading the dist directly — payload changes across major
versions (e.g. drag events losing `lngLat`) are visible in the shipped code
and its `.d.ts`.

### Out of scope

Route elsewhere (see When to Use): frontend feature testing outside e2e specs, visual inspection for design review, scraping for research, auth debugging outside e2e sessions, one-off DOM poking. If a task is not part of a Playwright/e2e effort, it does not need this skill's Chrome.

---

## Efficiency Guide

### DOM Inspection Over Screenshots

**Don't** take screenshots to see page state. **Do** parse the DOM directly:

```javascript
// Get page structure
document.body.innerHTML.slice(0, 5000)

// Find interactive elements
Array.from(document.querySelectorAll('button, input, [role="button"]')).map(e => ({
  id: e.id,
  text: e.textContent.trim(),
  class: e.className
}))
```

### Complex Scripts in Single Calls

Wrap everything in an IIFE to run multi-statement code:

```javascript
(function() {
  // Multiple operations
  const data = document.querySelector('#target').textContent;
  const buttons = document.querySelectorAll('button');
  
  // Interactions
  buttons[0].click();
  
  // Return results
  return JSON.stringify({ data, buttonCount: buttons.length });
})()
```

### Batch Interactions

**Don't** make separate calls for each click. **Do** batch them:

```javascript
(function() {
  const actions = ["btn1", "btn2", "btn3"];
  actions.forEach(id => document.getElementById(id).click());
  return "Done";
})()
```

### Typing/Input Sequences

```javascript
(function() {
  const text = "HELLO";
  for (const char of text) {
    document.getElementById("key-" + char).click();
  }
  document.getElementById("submit").click();
  return "Submitted: " + text;
})()
```

### Reading App/Game State

Extract structured state in one call:

```javascript
(function() {
  const state = {
    score: document.querySelector('.score')?.textContent,
    status: document.querySelector('.status')?.className,
    items: Array.from(document.querySelectorAll('.item')).map(el => ({
      text: el.textContent,
      active: el.classList.contains('active')
    }))
  };
  return JSON.stringify(state, null, 2);
})()
```

### Waiting for readiness (poll, never blind sleep)

Blind sleeps are the flake factory banned in `playwright-tester`; same rule
here. Poll a predicate — page first, then app readiness:

```bash
for i in $(seq 1 20); do
  {baseDir}/browser-eval.js 'document.readyState' | grep -q interactive && break
  sleep 0.25
done
```

```javascript
// App readiness: poll the engine's own readiness API in one eval —
// e.g. a map engine exposes loaded()/isStyleLoaded(); a framework exposes a
// mount/store flag. Pick the predicate the spec actually waits on.
(async () => {
  const t0 = Date.now();
  while (Date.now() - t0 < 10000) {
    const m = window.__APP__ || window.__MAP__;
    if (m && m.isReady && m.isReady())
      return JSON.stringify({ready: true, ms: Date.now() - t0});
    await new Promise(r => setTimeout(r, 200));
  }
  return JSON.stringify({ready: false});
})()
```

### Standard recon (always start here)

One eval, one stable shape — URL, title, readyState, trapped errors, console
errors, interactive elements, exposed app state. Install the error collector
first (debugging section above) so the error fields populate:

```javascript
(() => JSON.stringify({
  url: location.href,
  title: document.title,
  readyState: document.readyState,
  pageErrors: (window.__DBG__ && __DBG__.errors) || window.__pageErrors__ || [],
  consoleErrors: (window.__DBG__ && __DBG__.console) || [],
  interactives: Array.from(document.querySelectorAll('button, input, a, [role="button"]'))
    .slice(0, 25).map(e => ({tag: e.tagName, id: e.id, text: (e.textContent || '').trim().slice(0, 30)})),
  appState: Object.keys(window).filter(k => /^__/.test(k))
}))()
```

Then target specific elements based on what you find.
