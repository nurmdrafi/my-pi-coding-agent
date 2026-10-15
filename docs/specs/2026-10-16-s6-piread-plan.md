# S6 — Implementation Plan (`piread`)

Spec: `2026-10-16-s6-piread-design.md`. Cadence: TDD per step (red → implement → green). Rust work applies `skills/rust-skills` (priorities: `err-`, `mem-`, `opt-`, `api-`; no `unsafe`; clippy `-D warnings`). Conventional commits, `refs` the spec path. Test entrypoints: `cargo test` (crate), `node tests/piread-parity.test.mjs`, `node tests/permission-gate.test.mjs` (unchanged-green), `npm run doc:check`, `npm run typecheck`.

## Step 0 — Baseline

`node tests/permission-gate.test.mjs` (expect 241 green), `node tests/bench-suite.test.mjs`, `npm run doc:check`, `npm run typecheck` — all green before touching anything. Record `cargo --version` (release build requires it; graceful-skip path tested later).

## Step 1 — Crate skeleton, CLI contract

Tests first (in-crate): arg parse (`--path` required; `--offset` ≥1; `--limit` ≥1; unknown flag → exit 2 + stderr), `--version`/`--help`, JSON envelope shape (`ok`, error kinds `ENOENT|EACCES|EISDIR|io`, exit 0/3 mapping). Implement `native/piread/` (Cargo.toml mirroring pidx profile, `src/main.rs`; serde + serde_json only). `cargo test` + `cargo clippy -- -D warnings` green. Commit: `feat(piread): crate skeleton with CLI contract`.

## Step 2 — Read pipeline

Tests first: slice with offset/limit (1-based, inclusive), cap arithmetic (2000-line / 50000-byte, whichever first, overflow-safe), truncation note rendering (pinned against expected strings extracted from the built-in via a one-time fixture dump — captured in Step 3's oracle, asserted here as literals), binary detect (NUL ≤ 8 KiB), CRLF / no-trailing-EOL / empty / unicode, `totalLines` beyond cap, offset past EOF → empty content. Implement streaming (buffer ≤ cap + one lookahead line; never full-file buffer for large inputs). Green + clippy. Commit: `feat(piread): streaming read pipeline`.

## Step 3 — Extension + parity oracle suite

Tests first (`tests/piread-parity.test.mjs`, stubbed ExtensionAPI per `tests/lib/gate-stub.mjs` pattern):
- env unset → extension registers nothing (zero tools);
- env set → exactly one `read` tool active, sourced from piread, schema/description byte-equal to `createReadToolDefinition`'s;
- parity corpus (deterministic generator → temp dir): empty · 1-line · CRLF · no-EOL · unicode/emoji · 300-char lines · 2500-line · 60 KiB · NUL-binary · png/jpg · missing · directory · offset/limit matrix — piread-wrapped `execute` vs `builtin.execute` oracle: identical content arrays, `details`, `isError`;
- fallback: `bin/piread` absent / exits 3 / emits garbage → result equals oracle + one stderr fallback line.

Implement `extensions/piread/index.ts` (guard, private `builtin`, spread `createReadToolDefinition`, execute dispatch per spec §5.2, spawn resolved relative to extension dir). Green (requires `cargo build --release` + copy to `bin/piread` — add the copy as a manual step here; scripted in Step 5). Commit: `feat(piread): read-shadowing extension with parity suite`.

## Step 4 — Gate-compat lock-ins

Tests first (same file, real permission-gate through stubbed events): R1 read coverage certifies a piread-wrapped read result; S5 M2 edit-after-piread-read passes region requirement; protected-path read blocks at `tool_call` before any execution. Implement: none expected — lock-ins only; fix if red reveals ordering drift. Commit: `test(piread): lock in gate compatibility`.

## Step 5 — Build wiring + docs

`scripts/bootstrap.sh` + `scripts/after-pull.sh`: piread build/copy step mirroring pidx (cargo-missing → skip with Node-fallback note, which for read means "extension falls back to built-in" — same message pattern). README: `native/piread` row in the tree, `PI_NATIVE_READ` in the env-var set (keep `npm run doc:check` green). Commit: `chore(piread): build wiring and docs`.

## Step 6 — Micro-bench harness

Implement `tests/piread-bench.mjs` (no model): corpus classes × N=200 iterations × arms (oracle vs piread dispatch), wall-clock p50/p95 portable, RSS best-effort via `/usr/bin/time` (`-v`/`-l`), bare `--version` loop for spawn-overhead split; writes `benchmark/runs/piread-microbench-<date>.md`. Sanity-run locally; assert in-file that the table writes and medians are finite. Commit: `feat(piread): micro-bench harness`.

## Step 7 — S2 pair run + verdict (user-approved timing)

Fill `benchmark/arms.json` candidate arm (baseline config + `PI_NATIVE_READ=1`, bootstrap prerequisite note). Run the pair (`node benchmark/bench.mjs`), ≥2 repetitions, medians; extract S1 metrics per run record. Evaluate the decision rule (spec §6) → write `benchmark/runs/s6-verdict-<date>.md` (five axes, rule outcome, adoption recommendation stays default-off per D5). Commit: `bench(piread): S6 candidate pair run and verdict`.

## Step 8 — Full verification + registration

1. `cargo test` + clippy; `node tests/piread-parity.test.mjs`; `node tests/permission-gate.test.mjs`; `node tests/bench-suite.test.mjs`; `npm run doc:check`; `npm run typecheck`.
2. Sabotage smoke: `mv bin/piread .` → parity suite fallback section green; restore. Unset env → built-in path asserted by env-off test.
3. Update `CHANGELOG.md`; MASTER §3 S6 → done + §7 outcome line with measured deltas (parity, latency, tokens, verdict).
