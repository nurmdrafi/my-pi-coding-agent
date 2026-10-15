# S3 — Implementation Plan

> Path note (2026-10-16): `native/` was later renamed to `custom-tools/`. The `native/` references below are historical.

Spec: `2026-10-15-s3-doc-check-design.md`. Cadence: TDD per step (tests red → implement → green); `node --test tests/doc-check.test.mjs` after each step; full-suite + smoke at the end only.

## Step 0 — Promote mdcmdcheck (move, no behavior change)

Move `skills/harness-engineer/scripts/mdcmdcheck.mjs` → `scripts/doc-check.mjs`; ROOT from `resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')` → `resolve(dirname(fileURLToPath(import.meta.url)), '..')`; add `"doc:check": "node scripts/doc-check.mjs"` to package.json. Capture `npm run doc:check` exit code + finding counts on the pristine repo before and after the move — must be identical. Update references (README skill-layout section, harness-engineer SKILL.md) to `npm run doc:check`. Commit: `feat(scripts): promote mdcmdcheck to scripts/doc-check.mjs`.

## Step 1 — Fixture scaffolding (test data first)

`tests/fixtures/doc-check/`: README-variant snippets (skills table, extensions section, env-var mentions) + a temp-tree builder helper (`mkTree(dir, {skills:[…], extensions:[…], code:[…]})` creating `skills/<n>/SKILL.md`, `extensions/<n>/index.ts`, `scripts/*.mjs`, `extensions/**/*.ts` with embedded `PI_*` strings). Tests: builder produces the expected paths (sanity).

## Step 2 — skills-inventory (red → green)

Tests: consistent fixture → exit 0; dir without row, row without dir, invocation `≠` row name, duplicate rows → exit 1 with the specific finding in output. Implement: table extraction (anchor `| Skill |…| Invocation |` header, parse name + invocation cells), derive names from `skills/*/SKILL.md`, diff both directions, missing/unparseable table → family fail finding.

## Step 3 — extensions-inventory (red → green)

Tests: bidirectional mismatch fails; top-level `handoff.ts`-style file in `extensions/` ignored. Implement: derive `extensions/*` dirs containing ≥1 `.ts`; extract names from README Extensions section; diff.

## Step 4 — env-vars (red → green)

Audit every `PI_[A-Z0-9_]+` found by grep across `extensions/`, `scripts/`, `skills/*/scripts/` — classify user-facing vs internal plumbing; seed the inline allowlist (one comment per entry). Tests: allowlisted var passes undocumented; non-allowlisted undocumented fails; documented-but-nonexistent fails; var inside `scripts/*.mjs` is found. Implement: grep + allowlist + bidirectional doc check against `README.md` + `extensions/README.md`.

## Step 5 — Family aggregation, `--json`, exit codes (red → green)

Tests: multi-family failure lists all findings, single exit 1; `--json` shape `{families:[{name,status,findings[]}]}`; all-green → exit 0. Implement: per-family status collection, human-readable grouped output + summary, `--json` branch.

## Step 6 — One-time doc pass

Badges `skills-22`/`extensions-2` → count-free; "All 22 skills" → "All skills"; tree `tools/` → `native/` + annotation refresh; "Zero environment variables" (§quick-start, §portability) → "zero env vars required for setup" + optional knobs named; CHANGELOG entry. Then run `npm run doc:check` — must be exit 0 (doc pass is what makes the new families green on the real repo). Commit: `docs(readme): remove volatile counts, fix tree and env-var wording`.

## Step 7 — CI wiring

`.github/workflows/release.yml`: add doc-check step next to existing checks (same Node setup job). Verify workflow syntax by inspection against existing steps.

## Step 8 — Final verification + registration

Full `node --test`; deliberate-drift smoke: edit one README table row → `npm run doc:check` exits 1 with that finding → revert, re-run exit 0; grep repo for stale `mdcmdcheck` references (none). MASTER.md §3 → `done` + §7 outcome line. Commit: `docs(specs): mark s3 done in master`.
