# S8 — Implementation Plan (`piedit`)

Spec: `2026-10-16-s8-piedit-design.md` (**draft — do not start Step 1+ until the spec is approved**).
Cadence: TDD per step (red → implement → green). Rust work applies `skills/rust-skills` (priorities: `err-`, `mem-`, `opt-`, `api-`; no `unsafe`; clippy `-D warnings`). Conventional commits, `refs` the spec path. Test entrypoints: `cargo test` (crate), `node tests/piedit-parity.test.mjs`, `node tests/piedit-bench.mjs`, `node tests/permission-gate.test.mjs` (unchanged-green), `npm run doc:check`, `npm run typecheck`.

## Step 0 — Baseline + hot-path split + abort gate (no Rust yet)

Run the existing green baseline: `node tests/piread-parity.test.mjs` (150), `node tests/permission-gate.test.mjs`, `node tests/bench-suite.test.mjs`, `npm run doc:check`, `npm run typecheck`; record `cargo --version`.

Then measure the built-in `edit` hot path on a deterministic corpus and split **match+apply** time from **`generateDiffString`/`generateUnifiedPatch`** time and **write** time. Write the numbers to `benchmark/runs/s8-hotpath-<date>.md`.

**Abort gate (D7/R1):** if diff/write dominate and match+apply is a small fraction, STOP — record the negative finding, mark S8 `aborted` in MASTER §7, and redirect to S7. No Rust code is written in an abort. Commit: `bench(s8): edit hot-path split and feasibility gate` (or `docs(s8): abort finding` if aborted).

## Step 1 — Crate skeleton, CLI/envelope contract

Tests first (in-crate): arg parse (`--path` required; unknown flag → exit 2 + stderr), `--version`/`--help`, stdin request parse (`edits` required, array), JSON envelope shape (`ok`, error kinds `ENOENT|EACCES|ENOTDIR|EMPTY_OLDTEXT|NOT_FOUND|DUPLICATE|OVERLAP|NO_CHANGE|io`, exit 0/2/3 mapping). Implement `native/piedit/` (`Cargo.toml` mirroring pidx/piread profile, `src/main.rs`; serde + serde_json + unicode-normalization). `cargo test` + `cargo clippy -- -D warnings` green. Commit: `feat(piedit): crate skeleton with CLI contract`.

## Step 2 — Match + apply + write pipeline

Tests first: LF normalization of old/new; empty-oldText guard; exact `indexOf`; fuzzy `normalizeForFuzzyMatch` (trailing ws, NFKC, smart quotes, dashes, spaces); any-fuzzy ⇒ replacement base is fuzzy-normalized content; uniqueness via normalized occurrence count; overlap detection after index sort; reverse-order apply; `applyReplacementsPreservingUnchangedLines` on the fuzzy path; `baseContent === newContent` → no-change; **all six error messages byte-equal to `edit-diff.js` literals** (extract once via the oracle in Step 3, asserted here as literals); BOM strip + `detectLineEnding` + `restoreLineEndings`; final write replicates the built-in write semantics exactly (record the call; no silent atomicity change — R4). Streaming/bounded memory; no full-file buffering beyond what matching requires (matching needs the whole file; document the bound). Green + clippy. Commit: `feat(piedit): match, apply, and write pipeline`.

## Step 3 — Extension + parity oracle suite

Tests first (`tests/piedit-parity.test.mjs`, stubbed ExtensionAPI per `tests/lib/gate-stub.mjs` pattern; the built-in `createEditTool` is the oracle):
- env `PI_NATIVE_EDIT=0` → extension registers nothing; unset/`1` → exactly one tool named `piedit`, individual name/label, schema byte-equal to `createEditToolDefinition`'s, description/promptGuidelines piread-style overrides;
- parity corpus (§5.4) against **fresh copies** per arm: final bytes, thrown error message, `content`, `details.{diff,patch,firstChangedLine}` all identical;
- fallback: `bin/piedit` absent / exits 3 / emits garbage → result equals oracle + one `piedit: fallback` stderr line + one violation-log line.

Implement `extensions/piedit/index.ts` (guard, private builtin, spread definition with name/label/description/promptGuidelines/execute/renderCall overrides, `withFileMutationQueue` wrap, spawn relative to extension dir, diff via exported `generateDiffString`/`generateUnifiedPatch`). Requires `cargo build --release` + copy to `bin/piedit` (manual here, scripted in Step 5). Green. Commit: `feat(piedit): native edit extension with parity suite`.

## Step 4 — Gate-compat lock-ins

Tests first (same file, real permission-gate through stubbed events): `piedit` triggers the edit-kind branch — Anchor Guard block reasons identical to `edit` on the same stale/duplicate/overlap fixture; M2 region-read requirement enforced; M3 hash-chain block + coverage-drop on stale; protected-path `piedit` blocks at `tool_call` before execution; read→`piedit` coverage binding certifies the post-edit span. Implement permission-gate additions (D4): `isToolCallEventType("piedit")` in the edit branch + `call.name === "piedit"` in the file-path scrape; verify the `tool_result` handler is kind-driven. Green + `npm run gate:eval` no new failures. Commit: `test(piedit): lock in gate edit-kind compatibility`.

## Step 5 — Build wiring + docs

`scripts/bootstrap.sh` + `scripts/after-pull.sh`: `piedit` build/copy step mirroring `pidx`/`piread` (cargo-missing → skip with the fallback note: extension falls back to the built-in `edit`). README: `native/piedit` in the tree, `PI_NATIVE_EDIT` in the env-var set, Extensions section entry with its TUI label, native-tool performance note. Keep `npm run doc:check` green. Commit: `chore(piedit): build wiring and docs`.

## Step 6 — Micro-bench harness

Implement `tests/piedit-bench.mjs` (no model): corpus classes × N iterations × arms (builtin `edit` vs `piedit` dispatch); portable wall-clock p50/p95; RSS best-effort; bare `piedit --version` loop for spawn-cost split; large-file class to expose the R6 IPC cost. Writes `benchmark/runs/piedit-microbench-<date>.md`. Sanity-run; assert the table writes and medians are finite. If spawn cost is material, evaluate a `--serve` daemon here (currently a non-goal, D5). Commit: `feat(piedit): micro-bench harness`.

## Step 7 — S2 pair run + verdict (user-approved timing)

Fill `benchmark/arms.json` candidate arm (baseline config + `PI_NATIVE_EDIT=1`, bootstrap prerequisite note). Run the pair (`node benchmark/bench.mjs`), ≥2 repetitions, medians; extract S1 metrics per run record. Evaluate the decision rule (spec §6): parity, task success, edit p50/`tokens_per_task`, wall-clock, gate `fp_rate`. Write `benchmark/runs/s8-verdict-<date>.md` (five axes, rule outcome, adoption recommendation). Commit: `bench(piedit): S8 candidate pair run and verdict`.

## Step 8 — Full verification + registration

1. `cargo test` + clippy; `node tests/piedit-parity.test.mjs`; `node tests/permission-gate.test.mjs`; `node tests/bench-suite.test.mjs`; `npm run doc:check`; `npm run typecheck`.
2. Sabotage smoke: `mv bin/piedit .` → parity suite fallback section green; restore. Revert one matching fix → parity red; restore → green. Unset env → built-in path asserted by the env-off test.
3. Update `CHANGELOG.md`; MASTER §3 S8 → done/aborted + §7 outcome line with measured deltas (parity, latency, tokens, verdict).

## Contingencies

- **Step 0 abort** → no Steps 1–8; S8 recorded as a measured negative; proceed to S7 (gate steering).
- **R2 fuzzy divergence** that cannot be closed cheaply → narrow the Rust path to the **exact-match fast path only**, falling back to the built-in on any fuzzy edit (keeps most calls native without a full normalization port); re-measure; if still no win, abort.
- **R6 large-file regression** → size-based routing (native below a threshold, built-in above), documented in the verdict.
