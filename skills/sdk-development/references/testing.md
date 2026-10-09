# Test pyramid, browser-mode pitfalls, e2e infra, pack smoke

Detail behind the SKILL.md Testing section. Moved verbatim from the body.

### SDK test pyramid (npm component libraries)

| Layer | What it proves | Rules |
|---|---|---|
| Unit (jsdom, mocked engine) | Component logic | Mocks must track the real API — when a mocked test fails after a legit component change, suspect the **mock** first (a mock once lacked `getContainer` and `once`). Grep the repo for existing test helpers before writing new ones; consult the mature upstream reference (e.g. react-map-gl for maplibre wrappers) for idioms BEFORE authoring specs. |
| Browser mode (real engine in Chromium) | Real engine integration | Alias the package name to repo `src/` in vitest config — and verify the alias; never accidentally test an installed/stale copy. |
| E2e vs built `dist/` | The shipped artifact | Verify the host app actually resolves the package name to `dist/` — a suite once silently tested an installed npm copy while the build sat untested. Rebuild before e2e after library changes. See `playwright-tester` skill for the case-registry pattern. |
| Pack smoke | The installable tarball | See below. |

### Vitest browser-mode pitfalls

- `actUntil(helper)` is an **event-registration** primitive — its promise executor runs once.
  `actUntil((resolve) => { if (cond) resolve() })` hangs forever when the event has already
  fired or hasn't fired yet → flaky suite. Register the event (`onLoad={resolve}`) or use
  `waitFor` for polling.
- Vitest 4 has no module-level `test.setTimeout` — a spec using it fails at **collection**
  (looks like a test failure). Per-file: `vi.setConfig({ testTimeout })`.
- Stability claims need 6–8× repeated full-suite runs; "3× green" once hid a ~50% flake that
  resurfaced immediately.
- **A flake is a race, not a timeout problem** — never bump timeouts or loosen polls in
  response; find the registration/consumption race. When a bug class is fixed anywhere in
  the session, re-scan your own newer test code for the same pattern before running.
- Version-specific APIs: verify against the installed version's docs/types, not memory.
- **Cite every assertion's source**: framework behavior (`memo()` returns an object since
  React 18), CJS support, externals — from docs/build output/tests, not memory. If you can't
  cite where a fact came from, verify before asserting it.

### E2e infra details

- `.env` for test-app keys (e.g. API key); commit `.env.example`, gitignore `.env`
  precisely (not `.env*`).
- Cases use the app's real env mechanism — no invented `window.__*__` globals;
  a case fallback once referenced an undefined one and crashed.
- **Sibling-reference rule**: when the same org ships a sibling wrapper over
  the same engine, the sibling's shipped components/CSS ARE the acceptance criteria for visual
  contracts (attribution content & dedupe, logo asset/size/margins, control
  stacking). Port them verbatim — a novel mechanism (e.g. `customAttribution`
  where the style also carries source attributions → duplicate copyright) ships
  visible bugs to the maintainer. Port its render gate (`idle` = tiles parsed &
  painted, not just `isStyleLoaded()` — a white canvas passes style-load) and its
  review harness (per-case pass/fail HUD, retained artifacts) rather than
  building a weaker equivalent.

### Pack smoke test (`test:pack`)

Prove the tarball a consumer installs actually loads:

1. Build fresh, `npm pack`.
2. Extract the tarball into a temp sandbox.
3. In the sandbox, import the package **by name** (exercises the exports map), assert key
   exports exist and styles resolve. React `memo()` returns an **object** since React 18 —
   assert `typeof X !== 'undefined'`, never `=== 'function'`.
4. Offline: symlink the sandbox's `node_modules` entries for each external (from build output,
   see SKILL.md Bundle externals). An ESM-only dependency (maplibre-gl v6) makes `require()` fail by construction —
   smoke-test the path you actually support.
