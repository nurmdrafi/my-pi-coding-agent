# CI/CD and dependency major upgrades

Moved verbatim from the SKILL.md body.

## CI/CD

- **CI on push to main (and PRs):** lint + build + full tests (`make lint`, `make cover` /
  `vitest run --coverage`); golangci-lint runs as its own job. Lint config excludes
  generated paths (`.golangci.yml` → `gen/`) — same exclusion as coverage.
- **Coverage badge:** CI extracts the total (`go tool cover -func=coverage.out`) and commits
  a color-coded `coverage.json` endpoint back to the repo — live coverage on the README.
- **CodeQL** security scan workflow alongside CI. Validate workflow edits with `actionlint`
  before committing them.
- **Release workflow (changelog-driven):** extracts the version from the top `## [x.y.z]`
  CHANGELOG heading, that section's body as the release notes, tags `v{x.y.z}`, creates
  the GitHub Release (`softprops/action-gh-release`), publishes to npm. Hard-won gotchas: escape
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
