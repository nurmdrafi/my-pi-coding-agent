# Test pyramid, browser-mode pitfalls, e2e infra, pack smoke

Detail behind SKILL.md Testing section.

## SDK test pyramid (npm component libraries)

| Layer | Proves | Rules |
|---|---|---|
| Unit (jsdom, mocked engine) | Component logic | Mocks track real API — mocked test fails after legit component change → suspect **mock** first (a mock once lacked `getContainer` + `once`). Grep repo for existing test helpers before writing new; consult mature upstream reference (e.g. react-map-gl for maplibre wrappers) for idioms BEFORE authoring specs. |
| Browser mode (real engine in Chromium) | Real engine integration | Alias package name to repo `src/` in vitest config — verify alias; never accidentally test installed/stale copy. |
| E2e vs built `dist/` | Shipped artifact | Verify host app actually resolves package name to `dist/` — suite once silently tested installed npm copy while build sat untested. Rebuild before e2e after library changes. See `playwright-tester` skill for case-registry pattern. |
| Pack smoke | Installable tarball | Below. |

## Vitest browser-mode pitfalls

- `actUntil(helper)` = event-registration primitive — promise executor runs once. `actUntil((resolve) => { if (cond) resolve() })` hangs forever when event already fired.
- Vitest 4 has no module-level `test.setTimeout` — spec using it fails at collection (looks like test failure). Per-file: `vi.setConfig({ testTimeout })`.
- Stability claims need 6–8× repeated full-suite runs; "3× green" once hid ~50% flake resurfacing immediately.
- **Flake = race, not timeout problem** — never bump timeouts/loosen polls in response; find registration/consumption race. Bug class fixed anywhere in session → re-scan own newer test code for same pattern before running.
- Version-specific APIs: verify vs installed version's docs/types, never memory.
- **Cite every assertion's source**: framework behavior (`memo()` returns object since React 18), CJS support, externals — from docs/build output/tests, not memory. Can't cite where fact came from → verify before asserting.

## E2e infra details

- `.env` for test-app keys (e.g. API key); commit `.env.example`, gitignore `.env` precisely (not `.env*`).
- Cases use app's real env mechanism — no invented `window.__*__` globals; a case fallback once referenced undefined one, crashed.
- Sibling-reference rule: same org ships sibling wrapper over same engine → sibling's shipped components/CSS ARE acceptance criteria for visual contracts (attribution content + dedupe, logo asset/size/margins, control stacking). Port verbatim — novel mechanism (e.g. `customAttribution` where style also carries source attributions → duplicate copyright) ships visible bugs. Port its render gate (`idle` = tiles parsed + painted, not just `isStyleLoaded()` — white canvas passes style-load) + its review harness (per-case pass/fail HUD, retained artifacts), never build weaker equivalent.

## Pack smoke test (`test:pack`)

Prove consumer-installed tarball actually loads:

1. Build fresh, `npm pack`.
2. Extract tarball into temp sandbox.
3. Sandbox: import package by name (exercises exports map), assert key exports exist + styles resolve. React `memo()` returns object since React 18 — assert `typeof X !== 'undefined'`, never `=== 'function'`.
4. Offline: symlink sandbox `node_modules` entries per external (from build output, see SKILL.md Bundle externals). ESM-only dependency (maplibre-gl v6) makes `require()` fail by construction — smoke-test path you actually support.
