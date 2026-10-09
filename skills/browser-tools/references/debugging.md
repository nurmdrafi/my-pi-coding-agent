# Debugging failing e2e / browser-mode specs live

Read when a Playwright or Vitest-browser spec fails and the runner log doesn't
explain it — inspect the live case instead of guessing from stack traces.

**Go live after ONE unexplained failure** — repeated log re-reads are the
anti-pattern: live replay routinely settles in minutes what hours of log
analysis couldn't, surfacing real library bugs the logs never show (crashing
documented patterns, event-payload changes).

**Occluded-window freeze — check the harness before rerunning.** Chromium
freezes rendering (rAF + compositing) for occluded/backgrounded windows. If a
headed visual/e2e step reports "nothing happened", suspect this first:
verify by bringing the window to front or capturing a screenshot before
rerunning the suite — blind reruns reproduce the same freeze.

## Procedure

0. **Consume runner artifacts first**: the failure screenshot/trace/report and
   saved run logs usually answer the question with zero execution (see
   `playwright-tester` "Debugging a FAIL"). When the user asks for a screenshot
   of a failing case, prefer the runner's failure screenshot over a live one.
   Go live only when the artifacts don't explain the failure.
1. Start the dev/test server in the background (e.g. `npm run e2e:serve &`).
2. `{baseDir}/scripts/browser-start.js` → `{baseDir}/scripts/browser-nav.js <failing case URL>`.
3. **Install the error collector immediately after navigation** (snippet
   below — idempotent, survives this tab), then run the standard recon eval
   (`references/efficiency.md`) as the baseline.
4. Replay the spec's steps with `browser-eval.js` IIFEs — query the DOM, read
   app state (any global the app exposes, e.g. `window.__APP__`), compare against what the spec asserts.
5. Fix the spec or the app, then re-run the runner headless to confirm.
6. A live window that shows nothing moving is usually occlusion, not a bug:
   Chromium suspends rAF/compositing for backgrounded or covered windows, so
   map/canvas interactions replay silently. Bring the tab to front (or run the
   step headless) before concluding events don't fire — don't rerun the suite.

Vitest Browser Mode specs debug the same way — the same CDP Chrome serves
them; replay the failing case URL exactly as for Playwright specs.

## Error + console + network collector

Install once per tab, read after replay with
`browser-eval.js 'JSON.stringify(window.__DBG__)'`:

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

## Pitfalls seen in practice

- **Blank page, no error overlay**: read trapped page errors — if the harness
  exposes a page-error recorder (`window.__pageErrors__`), read it; otherwise
  install `window.addEventListener('error'/'unhandledrejection')` collectors
  via an init script, reload, then read. Swallowed render errors are invisible
  otherwise.
- **Bare-specifier imports don't resolve in page context** — `browser-eval`
  runs in the page, not a bundler. Use IIFEs over already-loaded globals, or
  probe via the harness.

## Event-flow tracing (canary probe)

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

## Engine source is ground truth

When live behavior contradicts expectation, read the installed library's
source (its dist in `node_modules`) for the binding/gating logic — `rg` the
dist for `_on`, `once(`, event names. Source explains WHY (binding target,
state machine, payload shape); the live probe confirms. Two failed
synthetic-event strategies and an "event payload lost a field" mystery were
both answered by reading the dist directly — payload changes across major
versions (e.g. drag events losing `lngLat`) are visible in the shipped code
and its `.d.ts`.

## Slow startup: measure before modifying

If browser interaction feels slow, attribute the delay before changing
anything. Time, separately: CDP connection (`curl -sf localhost:9222/json/version`
in a loop until it answers — that's Chrome's readiness), context discovery
(`/json/list`), page discovery, and first action
(`scripts/browser-eval.js '1+1'` end-to-end). Classify the delay as: connection,
browser launch, context creation, page creation, navigation, or application
readiness (app boot / API dependencies). Typical signatures: everything fast
except `goto`-like actions → application/server, not the browser; slow first
`browser-eval` but fast later → connection setup; slow `/json/version` →
Chrome itself (profile size, flags, Rosetta on macOS arm64).
