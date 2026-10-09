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
  (e.g. `API_KEY`) read properly — tests fail loudly when missing, never skip silently.
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

Pyramid layers, browser-mode pitfalls, e2e infra details, and the pack smoke
procedure: `references/testing.md`.

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
8. `npm publish --access public` (or let CI release — `references/ci-and-upgrades.md`).

CI/CD pipelines and dependency major upgrades (engine-major contract breakage
protocol): `references/ci-and-upgrades.md`.

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
