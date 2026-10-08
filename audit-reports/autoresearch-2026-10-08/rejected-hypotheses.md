# Rejected / deferred hypotheses — with measured reasons

## Measured and rejected
1. **Error-result output capping** — historical error outputs: 193K chars ≈ 48K tok across 122 sessions, but only 3 results >8KB (~80 tok/session of savings). Not worth hiding diagnostics. (replay instrumentation: `err_ctx_chars`, `err_big_count`)
2. **Cap tighter than 100L/4KB** — calibration curve: 100/3K saves 31.1% and 60/3K saves 33.0% vs 26.4% at 100/4K, but spill count climbs 204→292→391 (of 4.2k commands). Chose the knee; going tighter trades follow-up read turns for diminishing returns.
3. **B14 (`rg do src/` raising loopDepth bypasses `^git log`)** — did not reproduce in fixture form; R5 was subsequently deleted entirely by H1 step 5, making the anchor moot.
4. **B16 (heredoc body split as segments)** — became moot when R2 viewing blocks were deleted (H1 step 1); heredoc prose can no longer false-fire an output rule.
5. **H8 split monolith (shell-parse.ts / coverage.ts / anchors.ts + header→CHANGELOG)** — deferred, not rejected: zero token effect, 103 tests already cover the single file, and the suite runner + temp agent homes copy `permission-gate.ts` as ONE file (a split breaks isolation). CHANGELOG.md entry written instead; structural split left as a user decision.

## Considered and not pursued (evidence-based)
6. **Persisting R1 coverage across sessions** (W1 residual) — violates session statelessness, large complexity, and H6 hydration already covers the resume slice; the cross-session remainder is bounded by per-session reading discipline.
7. **W10 prose enforcement via gate** — assistant prose cannot be capped by a tool_result hook; suite transcripts show prose ≈138 tok/run avg (max 699 on a plan task) on current workload — the historical 35% share came from older report-style sessions, addressed instead by AGENTS.md v2's tighter Communication rules.
8. **R10 window/parameters retuning** — replay shows 0 unintended re-run blocks; nothing left to relax without losing the guard.

## Grader truths discovered along the way (benchmark-validity fixes, not results)
- Whole-suite `test_pass` scored unrelated tasks against a seeded failing test (12 false failures; t03 completed 3/3 scored 0).
- `analyzeRun` predated H1: reads via `cat`/`ls` (legal post-cap) weren't counted; blocked destructive attempts were counted as mutations (t08 artifact).
Both fixed; all eras rescored uniformly with `scripts/rescore-suite.mjs`.

# Open questions for the user (brief §8.6)
1. **H2 allowlist file** — should the destructive list be configurable via JSON next to the extension (e.g. allow `rm` inside `$TMPDIR`, or auto-approve `git commit` in repos with a `PGATE_TRUST` marker)? Current default: fixed list, 2-min verbatim approval window.
2. **Plain `git push` (non-force) confirm** — currently always confirms (mirrors AGENTS.md "ask before push"). Keep, or limit confirms to force-push?
3. **Rename/split (H8)** — `permission-gate.ts` now mixes permission (H2/commitlint) and economy (cap/R1/R10). Split into `permission-gate.ts` + `tool-economy.ts`? Zero token impact; user call.
4. **Cap ceiling** — 100L/4KB chosen at the savings/spill knee; user-tunable constant if workflows need longer raw output.
5. **Applying the final diff to the live `~/.pi` install** — not done per ground rules; `docs/final-diff.patch` awaits review.

## Rejected post-close (suite evidence, 81 runs)
9. **A1-A7 AGENTS.md shrink (v2)** — success −5 to −8pts, mistakes ~2-5x vs h1-era AGENTS.md on the same gate: terser instructions stall multi-step edits (6 max-turns kills) and weaken recovery from destructive blocks (verbatim retries instead of asking). v1 redundant wording is load-bearing. Shipped AGENTS.md = v1 (unchanged).
