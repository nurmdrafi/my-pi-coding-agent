---
name: sdk-development
description: "Develop, test, publish installable packages — Go modules, npm SDKs/component libraries, plugins, CLIs: OpenAPI codegen, exports map, test pyramid, pack smoke, publish gate, semver upgrades, docs-as-contract. Use for SDK/library/publish/version-bump. NOT app e2e (→ playwright-tester), map work (→ map-integration), CI itself."
disable-model-invocation: true
---

# Package/SDK Development

Building and shipping installable packages: generated API SDKs, hand-written libraries, plugins,
CLIs — Go module, npm package, or plugin bundle. Core rule for libraries consumed by others:
**docs are a contract** — every README feature, prop, and code example must run against the
built artifact.

## Archetypes (detect first)

1. **Generated SDK** — OpenAPI spec via codegen (oapi-codegen / openapi-ts). Two layers, separate:
   - `gen/` / `*.gen.ts` — auto-generated, **never hand-edit**; change the spec, regenerate,
     re-apply scripted post-fixes (e.g. `float32`→`float64`, casing-collision field drops).
   - `client/` / `src/lib/` — hand-written: simplified request types, client-side validation
     *before any HTTP call*, API-key injection, timeouts, SDK error types, defaults.
   - Sibling SDK in another language → defaults/validation/error semantics must match exactly;
     note parity in comments. Deliberate divergence is documented, not silent.
   - API drift lives in a "Known API drift — intentional, do not fix" table in CONTRIBUTING.md;
     absorb it in the hand-written layer (tolerant `UnmarshalJSON`/zod for number-or-string
     fields, documented auth ambiguities like `api_key` vs `key`).
2. **Hand-written library** (component lib, plugin, CLI) — no codegen layer; tests and docs carry
   the safety net instead.

## Package surface (npm)

- Define `exports` in package.json (`.` import/require conditions, plus subpaths like
  `./styles`). List `files`. Peer-deps for host frameworks (`react`, `react-dom`).
- Verify the surface mechanically (pack smoke below), never by eyeballing config — the exports
  map is what consumers resolve, and typos are invisible until install.

### Bundle externals

Externals come from the **build config / emitted output**, not from scanning top-of-file
imports — a scan once missed `maplibre-gl` because it was imported mid-file, and the offline
smoke sandbox then failed on resolution. Grep the built `dist/` entry for `require(` / `from`
specifiers, or read the bundler config.

## Testing

- **SDKs: real API, real responses.** No mocks, no smoke-only tests. Required env
  (e.g. `BARIKOI_API_KEY`) read properly — tests fail loudly when missing, never skip silently.
- **Native test runners** — `node:test`, `go test`. No heavy test-framework dependency.
- Table-driven per endpoint/method: happy path, each validation error, non-2xx and timeout
  mapped to SDK error types distinguishable via `errors.As` / typed catches.
- **Coverage:** ≥80%, excluding auto-generated files — coverage *and* lint configs both
  exclude `gen/` (`.golangci.yml` paths, vitest coverage exclude). npm: `vitest run
  --coverage` wired into `npm test` itself, so every run reports coverage, not just CI;
  Go: `make cover` in CI with `go tool cover -func=coverage.out` as the source of truth.
- **Completeness rule:** every public API/method ships at least one test — "do the tests
  cover all APIs we provide?" is a pre-release question, answer it before tagging.
- **Test layout:** per-module test files mirroring source (`client_test.go`,
  `geocoding_test.go`, `routing_test.go`, `search_test.go`, `integration_test.go`, …) plus
  `helpers_test.go` for shared fixtures; unit tests run without env vars where possible,
  integration tests behind the real env keys.
- **Plugins/CLIs:** smoke-test a real local install (`claude --plugin-dir <dir>`, packed tarball,
  or `go run` from a consumer repo); store reports under `docs/smoke-tests/` with findings and
  token cost so runs stay comparable across versions.
- **Consumer testing (npm): tarball method, never `npm link`** (symlinks cause phantom-symbol
  bugs — two React/peer copies):
  ```bash
  npm pack                      # builds <pkg>-<version>.tgz
  cd ../consumer-app && npm install ../<pkg>/<pkg>-<version>.tgz
  ```
  Alternative: `yalc publish` + `yalc add <pkg>`. Exercise the core feature in the real app.
- **Regression rule:** the previous published version is the behavior contract. When something
  breaks after a bump (asset, rendering, export), diff against how the previous version did it
  and match — don't invent new behavior mid-version.

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
  response; find the registration/consumption race. When a bug class is fixed anywhere in the
  session, re-scan your own newer test code for the same pattern before running.
- Version-specific APIs: verify against the installed version's docs/types, not memory.
- **Cite every assertion's source**: framework behavior (`memo()` returns an object since
  React 18), CJS support, externals — from docs/build output/tests, not memory. If you can't
  cite where a fact came from, verify before asserting it.

### E2e infra details

- `.env` for test-app keys (e.g. API key); commit `.env.example`, gitignore `.env`
  precisely (not `.env*`).
- Cases use the app's real env mechanism — no invented `window.__*__` globals;
  a case fallback once referenced an undefined one and crashed.
- **Sibling-reference rule (bkoi-gl-js postmortem 2026-09-16)**: when the same
  org ships a sibling wrapper over the same engine (react-bkoi-gl ⇄ bkoi-gl),
  the sibling's shipped components/CSS ARE the acceptance criteria for visual
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
   see above). An ESM-only dependency (maplibre-gl v6) makes `require()` fail by construction —
   smoke-test the path you actually support.

## Pre-publish gate (in order)

```
typecheck → lint → unit → browser-mode (npm) → e2e vs dist → README example validation
→ publint → pack smoke / consumer check → dependency hygiene → CHANGELOG → user publishes
```

1. Build, lint, typecheck, full test suite — green. npm packages enforce via
   `prepublishOnly` (`check-types && build && test`); a failing test blocks the release — fix,
   don't bypass. Anything gated/deferred gets a tracked issue, not a silent skip.
2. README validation: extract every fenced example, compile against the real package
   (`go vet` scratch program / `tsc --noEmit`). An example that doesn't build is a bug.
   Documented examples are **executable specs** — test each verbatim as an e2e case; docs and
   library must move together. No local toolchain? Run through Docker (`docker run --rm -v
   "$PWD":/app -w /app golang:… go vet …`) — never skip it.
3. `npx publint` (npm) — fix exports/types/package.json warnings.
4. Consumer check: packed tarball installed in a real app, core feature exercised. The e2e host
   app must import **every published entry point** (main, `./styles`, subpaths) — not just the
   main import; a branding element once tested as "missing" because the host never imported the
   styles export.
5. Dependency hygiene if touched: exact pins (no `^`), committed `.npmrc`,
   `npm/pnpm audit --audit-level high`, only non-breaking upgrades. Sweep dead `package.json`
   scripts and stray files too — every script must be runnable and referenced; unreferenced
   scratch files get deleted, not parked.
6. CHANGELOG.md complete for this version, missing shipped versions backfilled.
7. **User reviews and commits/publishes manually.** Agent never commits, pushes, or publishes
   unprompted — it suggests the commit message and waits. User may want to test live first.
8. `npm publish --access public` (or let CI release — below).

## CI/CD

- **CI on push to main (and PRs):** lint + build + full tests (`make lint`, `make cover` /
  `vitest run --coverage`); golangci-lint runs as its own job. Lint config excludes
  generated paths (`.golangci.yml` → `gen/`) — same exclusion as coverage.
- **Coverage badge:** CI extracts the total (`go tool cover -func=coverage.out`) and commits
  a color-coded `coverage.json` endpoint back to the repo — live coverage on the README.
- **CodeQL** security scan workflow alongside CI. Validate workflow edits with `actionlint`
  before committing them.
- **Release workflow (changelog-driven):** extracts the version from the top `## [x.y.z]`
  CHANGELOG heading, that section's body as the release notes, tags `v{x.y.z}`, creates the
  GitHub Release (`softprops/action-gh-release`), publishes to npm. Hard-won gotchas: escape
  dots when matching the version in the heading (`1.26.1` → `1\.26\.1`), pass the version
  between steps via step outputs (env vars don't survive), and dry-run the extraction script
  locally before tagging. The release ships whatever version is on top of the changelog —
  missing release notes means a missing or malformed changelog entry; fix the changelog, never
  hand-write notes elsewhere.
- **Go modules:** no publish step — tag and push; consumers resolve via `proxy.golang.org`.
  pkg.go.dev reads the proxy, not GitHub tags; badges update only after the version is first
  requested. The lag is normal — don't chase it.

## Dependency major upgrades

An engine major bump (maplibre 5→6) silently breaks the documented surface: event payloads
lose fields (`lngLat` vanished from drag events — the README's own example crashed),
private-internals gates drift (`style._loaded`), event timing shifts (`styledata` fires before
`load`).

Protocol:
1. Bump, rebuild, run the **README-matrix e2e first** — fastest signal of contract breakage.
2. Keep the wrapper's documented contract: enrich/normalize engine events the docs promise
   (react-map-gl enriches drag events; so must the wrapper).
3. Guard mount-timing races with retries/ready-flags, not one-shot listeners
   (`map.once('styledata')` fires before the style is actually queryable).
4. Breaking API changes → semver **major** + migration notes.

## Documentation (the fixed set)

| File | Content |
|---|---|
| README.md | User-facing: description, install, quick start, per-feature examples (all validated), badges — npm/pkg.go.dev interactive labels, not bundlephobia. The feature matrix is the e2e case registry's source of truth; every documented feature must have a case. Never expose internal patterns as README examples. |
| CONTRIBUTING.md | The most important dev doc: quick start/setup, local package testing (tarball method), codegen workflow (if any), CI pipeline, npm hooks (`prepublishOnly`), test strategy with the exact gate commands (typecheck → unit → browser → e2e → pack smoke), release process, drift table. |
| DEVELOPMENT.md | Optional deeper dive: architecture, internals, design decisions. Create when CONTRIBUTING gets crowded; don't duplicate content between them. |
| LICENSE | MIT file at repo root, referenced from README badge. |
| CHANGELOG.md | Keep-a-Changelog format `## [x.y.z] - YYYY-MM-DD`. Entries land **with** the change (one coherent entry per version), user-facing outcomes only — no process minutiae, no internal jargon, test counts not test-file lists. Single source of truth for versions: package version is read from here, never hand-bumped independently. |
| AGENTS.md / CLAUDE.md | Generic agent instructions only — nothing task-specific, **no git permissions or instructions** (agent does not commit; it only suggests messages). |

## Versioning

- Semver: breaking API change → major, new endpoint/feature → minor, fix → patch.
- Shipped versions missing from the changelog → backfill before the next release.
- After a regression ships: patch release restoring parity with the previous version's
  behavior, changelog entry explaining both the regression and the fix.

## R&D and comparison workflow

- **New feature / R&D on the library surface:** document first (README entry), then implement
  against the test pyramid — unit mock → browser spec → e2e case → pack smoke — so every
  feature lands with its executable spec. Spike R&D in a branch, but the merge gate is the
  full pyramid, never a demo.
- **Comparing with other packages:** read the comparison target's docs AND its shipped dist —
  compare API surface, exports, peer-dep handling, event-payload contracts. Comparing from
  docs/source surface alone once missed mid-file externals and behavior deltas. When adopting
  a pattern, note the delta in README/CHANGELOG.
