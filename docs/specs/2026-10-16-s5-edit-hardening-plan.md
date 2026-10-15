# S5 — Implementation Plan

Spec: `2026-10-16-s5-edit-hardening-design.md`. Cadence: TDD per step (red → implement → green); `node tests/permission-gate.test.mjs` after each step; `npm run gate:eval` + bench rerun at the end only. Conventional commits, `refs` the spec path.

## Step 0 — Baseline

Run `node tests/permission-gate.test.mjs` (must be green, 204 tests) and `npm run gate:eval`; record `fixture_total`, `fixture_pass`, `known_bug_fail`, `new_fail`, `fp_rate`, `tokens_per_task` for the end-of-work delta report.

## Step 1 — Hash plumbing in read-coverage (no behavior change)

Tests first: `hashText`/`hashFile` unit cases (deterministic sha256-16, 1 MiB cap → `undefined` above, ENOENT → `undefined`); `certify` accepts and stores `hash`; entry type carries `hash?: string`. Implement in `read-coverage.ts`: `hashText`, `hashFile` (size-capped), extend `certify` signature. Green + full file green. Commit: `feat(gate): content-hash storage in read-coverage`.

## Step 2 — M1 stale-bind for edit (§5.1)

Tests first (family 1): read → external write (content + stat change) → edit blocked with `Anchor Guard (Stale):` reason + re-read fix; re-read → same edit passes; mutating-bash (`sed -i` through runBash) → edit blocked; back-to-back own edits still pass (post-op stat re-certified). Implement: `validateEditAnchors` takes the path's coverage entry; after its `readFile`+`stat`, `entry.stat` present and ≠ fresh stat → early block before anchor matching. Keep anchor-guard's return signature; binding block returns the same `{block, reason}` shape. Commit: `feat(gate): block edits against stat-drifted files`.

## Step 3 — M3 hash compare for edit + post-op hash store (§5.3)

Tests first (family 5): read → same-stat silent change (`fs.utimesSync` restores mtime, same byte size) → edit blocked `Stale`; own successful edit (tool_result stores `hashFile`) → subsequent same-stat silent change → next edit blocked; >1 MiB → hash skipped, stat-only; coverage entry without hash (resumed session shape) → passes M3. Implement: `validateEditAnchors` hashes the content it already read (`hashText`), compares when `entry.hash` present and stat matched; `index.ts` edit/write `tool_result` stores `hashFile(path)` into the coverage entry after certification; inject-certification path stores `hashText(disk)` (free — already read). Commit: `feat(gate): hash-chain binding for edits`.

## Step 4 — M2 region-read requirement for edit (§5.2)

Tests first (family 3): never-read path, valid anchor → blocked `Anchor Guard (Unread):` naming the anchor's line range; targeted read covering the anchor → passes; read window not covering the anchor → blocked naming that range; ENOENT → passes through; fuzzy anchor with any coverage → passes binding (R3 lock-in); post-`session_compact` → blocked until re-read. Implement: `validateEditAnchors` computes `origSpans` (original 1-based line spans per exact anchor — reuse the position-sorted span walk) and returns them; after M1/M3 pass: no coverage entry → block; else each exact anchor's origSpan must intersect some certified span (reuse span-intersection logic alongside `coversAll`), fuzzy anchors require only existence of coverage. Commit: `feat(gate): require certified read of the edited region`.

## Step 5 — M1+M3+M2 for write (§5.1–§5.3)

Tests first (families 2+4): read → external change → write blocked `Stale`; never-read existing file → write blocked `Unread`; ENOENT → passes; read → same-stat silent change → write blocked; our own prior write this session → later write passes. Implement in `index.ts` write handler (before `pendingEdits.set`): prior entry → fresh `snapshot` (+`hashFile` when stat matched and `entry.hash` present) → mismatch blocks; no prior entry → `lstat` existence → exists blocks `Unread`. Commit: `feat(gate): stale and blind-write binding for the write tool`.

## Step 6 — D4 lock-ins + policy-order regressions (§5.4, §9.6–7)

Tests first: mixed exact+fuzzy call → path coverage dropped (existing `fuzzy` behavior asserted alongside binding); exact anchor + fuzzy-only duplicate elsewhere → allowed (documented decision); exact multi-match → blocked with line numbers (existing); protected-path edit hits the H2 confirm before any binding block (order lock-in); binding block on a protected path never skips policy. Implement: none expected — lock-ins only; fix if red reveals ordering drift. Commit: `test(gate): lock in multi-match and policy-order semantics`.

## Step 7 — Full verification + measurement

1. `node tests/permission-gate.test.mjs` — exit 0, all sections.
2. Sabotage smoke: revert M1 → family 1+2 red; revert hash compare → family 5 red; revert region check → family 3 red; restore each.
3. `npm run gate:eval` — `new_fail: 0`; `fp_rate` family breakdown shows only documented `Anchor Guard (Stale|Unread)` additions; record deltas vs Step 0.
4. Bench: `node benchmark/bench.mjs` full run (gate arm) → record as S5 run; compare vs `s2-run/1` baseline on `edits.failureRate`, `failedThenSucceeded`, `failedTerminal`, `tokens_per_task`.
5. `npm run typecheck` (gate TS changed).
6. Update `CHANGELOG.md`, MASTER §3 (Status: done) + §7 outcome line with measured deltas.

Acceptance per spec §10; deviations from the spec recorded in the completion note, not silently.
