# CI/CD and dependency major upgrades

## CI/CD

- CI on push to main (+ PRs): lint + build + full tests (`make lint`, `make cover` / `vitest run --coverage`); golangci-lint own job. Lint config excludes generated paths (`.golangci.yml` → `gen/`) — same exclusion as coverage.
- Coverage badge: CI extracts total (`go tool cover -func=coverage.out`), commits color-coded `coverage.json` endpoint back to repo — live coverage on README.
- CodeQL security scan workflow alongside CI. Validate workflow edits with `actionlint` before committing.
- Release workflow (changelog-driven): extracts version from top `## [x.y.z]` CHANGELOG heading, that section's body as release notes, tags `v{x.y.z}`, creates GitHub Release (`softprops/action-gh-release`), publishes to npm. Gotchas: escape dots matching version in heading (`1.26.1` → `1\.26\.1`), pass version between steps via step outputs (env vars don't survive), dry-run extraction script locally before tagging. Release ships whatever version tops changelog — missing release notes = missing/malformed changelog entry; fix changelog, never hand-write notes elsewhere.
- Go modules: no publish step — tag + push; consumers resolve via `proxy.golang.org`. pkg.go.dev reads proxy, not GitHub tags; badges update only after version first requested. Lag normal — don't chase.

## Dependency major upgrades

Engine major bump (maplibre 5→6) silently breaks documented surface: event payloads lose fields (`lngLat` vanished from drag events — README's own example crashed), private-internals gates drift (`style._loaded`), event timing shifts (`styledata` fires before `load`).

Protocol:
1. Bump, rebuild, run README-matrix e2e first — fastest contract-breakage signal.
2. Keep wrapper's documented contract: enrich/normalize engine events docs promise (react-map-gl enriches drag events; so must wrapper).
3. Guard mount-timing races with retries/ready-flags, not one-shot listeners (`map.once('styledata')` fires before style actually queryable).
4. Breaking API changes → semver major + migration notes.
