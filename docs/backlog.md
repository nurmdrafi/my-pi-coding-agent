# Backlog — next development pass

Open work, captured at the end of the native-tool round (compaction, daemon
isolation, refcount fixes, README perf refresh). Ordered by what I would take
first, with the reason it is first.

## 1. `pibash` `seq 50000` regression — the one measured performance loss

**Symptom.** `pibash` is the only arm slower than the built-in oracle on a
representative case: **+3.57 ms at p50** (`12.216` → `15.783` ms), and the gap
grows with output size. Small-command classes sit within ±0.3 ms, so this is
purely an output-size effect.

**Cause (known).** The envelope ships the payload twice —
`content[0].text` *and* `structuredContent.output` — and it is
parity-pinned, so it cannot be dropped unilaterally.

**Why not fixed already.** `structuredContent` is documented in
`pi-agent-core/dist/types.d.ts:376` as *"Not sent to the model"*, so the
duplication costs **zero model tokens** — only serialization and host memory.
Removing it is a perf change, not a token change, and it would break the parity
contract that `permission-gate` H1 and the bash parity suite depend on.

**Options.**
- (a) Drop the duplicate field and update `tests/pibash-parity.test.mjs` to
  assert on `text` only. Fast, but changes the wire contract.
- (b) Keep both but stop *serializing* twice: build `structuredContent` from the
  already-serialized text rather than re-encoding. Preserves the contract.
- (c) Accept it; document as a known trade-off (current state).

**Recommendation:** (b) — the contract survives and the redundant encode goes
away. Needs a micro-bench before/after to prove the win.

## 2. `doc:check` is non-deterministic

`npm run doc:check` intermittently reports three false failures:

```
FLAG NOT IN HELP: pidx --out
FLAG NOT IN HELP: pi --extension
FLAG NOT IN HELP: pi --session
```

All three flags *are* in the respective `--help` output; a rerun passes. It
appears in `scripts/doc-check.mjs`, which probes `--help` via a subprocess and
caches into `helpCache`. Suspects: a subprocess timeout swallowed as empty
stdout, or the cache being populated from a failed probe.

**Impact:** a red CI gate that goes green on retry trains people to ignore it —
worse than no gate.

**Fix:** distinguish "probe failed" from "flag absent" and retry once before
reporting; add a test with a deliberately failing probe.
**Effort:** small.

## 3. `permission-gate` S4/S5 failures (pre-existing, unrelated)

Two cases fail on `main` and have failed throughout this round — confirmed by
running the suite against a stashed tree:

```
FAIL  S4 protected path: write via symlink into HOME/.ssh confirms  (expected blocked, got pass)
FAIL  S5 policy: protected-path edit confirms through H2 before binding blocks  (expected blocked, got pass)
```

2 of 285. Both are `HOME/.ssh` symlink cases: the target resolves *through* the
link into `<fake-home>/.ssh`, and the ladder returns pass where a block is
expected.

**Why it matters:** these are protected-path guards. A real bypass would look
exactly like this. Tests failing may mean the guard has a hole, or that the
fixture drifted — both need to be told apart before anything ships.

**Not investigated yet.** Should be the first security-shaped thing looked at,
not the first thing overall only because it is not coupled to current changes.

## 4. Rust daemons are typecheck-verified on Linux, not run

`cargo check --target x86_64-unknown-linux-gnu` passes for all four crates, but
a real Linux *link* needs a cross-linker that is not installed here. So:

- `setpgid(0, 0)` in `procgroup.rs` is verified on macOS and by POSIX guarantee
  (glibc, musl, and Apple libSystem all export it) — **not by execution on
  Ubuntu**.
- Daemon RSS probes read `/proc`, so they are skipped off-Linux.

**Action:** add a Linux CI job that runs `cargo test --release` and
`node tests/daemon-process-group.test.mjs`. Until then the Linux story rests on
the typecheck plus one test file, which is thinner than the macOS evidence.

## 5. `piread` compaction: revisit the tail source

Compaction currently tails the *already-truncated* body, so on a 6001-line file
the tail is around line 1000, not line 6001. The continuation notice
(`[Showing lines 1-2000 of 6001. …]`) is kept last so the reader still learns
the file continues, which contains the damage — but a tail from the real end of
the file would be more useful.

**Trade-off:** tailing the real EOF means the head and tail describe different
byte ranges, and it changes the parity story further. Worth a design note before
code.

## 6. `tests/` scratch files

`tests/.child.tmp.mjs`, `.childwd`, `.crossrung`, `.iso2`, `.mkchild`, `.mkwd`,
`.probe`, `.rc` — eight throwaway repro harnesses kept deliberately (user
asked to retain them in case they help future work). They are dot-prefixed and
excluded by the `tests/**/*.test.mjs` glob, so they never run in CI. Their
durable equivalents are `daemon-exit.test.mjs`,
`piread-daemon-settle.test.mjs`, `daemon-process-group.test.mjs`, and
`pidoc-portability.test.mjs`. Delete once the related bugs stop being live.

## Closed this round (for context)

- `piread`/`piedit` event-loop drain: they ref'd `stdin`/`stdout` but not
  `proc`, so the loop drained mid-await → unsettled top-level await (exit 13).
- `piread`/`piedit` exit-path leak: `maybeUnrefStreams` unref'd the pipes but
  never the `proc` that `refWhilePending` ref'd, pinning the host forever
  (`model-visible-baseline.mjs` hung after printing its report).
- Daemons inherited the client's process group, so any group-wide signal
  (`pibash`'s own `kill_tree`, job control, CI timeout) killed them.
- `piread` shipped ~9 KB per oversized read with no shaping at all.
- `piedit` had the `proc`-not-ref'd variant of the same bug; `pibash` was
  already correct.
