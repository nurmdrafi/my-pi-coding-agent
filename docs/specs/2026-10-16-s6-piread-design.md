# S6 — Rust Native Tool Prototype (`piread`): Design Spec

Status: **spec'd** (plan → `2026-10-16-s6-piread-plan.md`)
Created: 2026-10-16
Parent: `docs/specs/MASTER.md` §3 (S6). Feedback basis: MASTER §1.2 P1 (improve tool execution), §1.3 (`read`: optimize first — bounded reads, line ranges, binary/image detection, concise output), §1.5 phase 3 (prototype Rust selectively), §1.6.3, §1.7 (Rust is a strategy, not the objective).
Decisions (rationale in §4–§6; approved in-session):
- D1 tool = `read` alone (not a combined file-inspection op) — cleanest A/B
- D2 Rust boundary = full read pipeline (open → slice → render → truncate → binary-detect) in one `piread` invocation; **operations-layer injection rejected** (§4)
- D3 integration = extension registers a tool named `read` that **shadows the built-in** (verified merge order, §3); **parallel-name tool rejected** (§4)
- D4 image path stays in TS (built-in instance) — resize needs model context
- D5 deliverable = verdict + evidence; adoption is a follow-up config flip, default stays off (`PI_NATIVE_READ=1` opt-in)

## 1. Problem

MASTER §1.3/§1.7: the feedback's hypothesis is that a single compiled executable doing the whole read pipeline (bounded slicing, line ranges, binary detection, concise output) can reduce local execution time and possibly tokens — but explicitly "a faster local tool is not necessarily a faster coding agent". Nobody has measured this. S6 prototypes exactly one tool behind the existing interface and lets S1/S2 data decide, comparing on the feedback's five axes: execution time, memory, correctness, output-token count, installation complexity.

## 2. Scope

**In scope:** new crate `native/piread/` → `bin/piread`; new extension `extensions/piread/` (env-gated); parity + gate-compat tests; deterministic micro-bench; S2 candidate-arm wiring + verdict report; README/doc:check updates; MASTER registration.

**Out of scope (non-goals):**
- Any other tool (`edit`/`write`/`bash` stay as-is; search stays on `rg`/`fd` — feedback §1.3 verdicts).
- Token-output changes to read semantics (same content, same notes — any "concise output" idea is a separate future change, judged on its own; S6 changes the executor, not the contract).
- Subagents/worker tool sets (main session only).
- Making `PI_NATIVE_READ` default-on (adoption decision follows the verdict).

## 3. Current state (verified 2026-10-16, do not re-explore)

| Layer | Where | Fact |
| --- | --- | --- |
| Built-in read | pi `dist/core/tools/read.ts` | Schema `{path, offset?, limit?}`; caps via `truncate.ts` (`DEFAULT_MAX_LINES=2000`, `DEFAULT_MAX_BYTES=50000`); renders text + tail notes like `[N more lines in file. Use offset=X to continue.]`; images (jpg/png/gif/webp/bmp) → image content with model-aware resize |
| SDK exports | `@earendil-works/pi-coding-agent` | `createReadTool(cwd, opts?)`, `createReadToolDefinition(cwd, opts?)`, `ReadOperations` (`readFile`/`access`/`detectImageMimeType`), `isReadToolResult`, truncation helpers — public |
| Name shadowing | `dist/core/agent-session.js` (~L2850–2895) | Tool registries are built-in-first `Map`s, then extension tools `set()` over them — an extension `registerTool({name:"read"})` **replaces** definition + callable; `tool_call`/`tool_result` events fire identically (name-based) |
| Event API | `dist/core/extensions/types.d.ts` | `tool_call` handler can block or mutate `event.input`; it cannot substitute results — so substitution must happen by owning `execute` (D3), not by intercepting |
| Permission-gate | `extensions/permission-gate/` | Hooks `read` at `tool_call` (protected-path confirm, S5 M2 region-read requirement, R1 read coverage) and `tool_result` (certify + stat snapshot) — all name/event-based, unaffected by who executes |
| Build flow | `scripts/bootstrap.sh` / `after-pull.sh` | cargo build `native/pidx` → copy to `bin/`; cargo-missing degrades gracefully — `piread` mirrors this |
| Benchmarks | `benchmark/` | `arms.json` has a placeholder `candidate` arm; `bench.mjs` start/finish/report; S1 metrics embed in run records |
| Extension gating precedent | `extensions/subagents/index.ts` | `PI_SUBAGENTS !== "1"` → no-op load — `PI_NATIVE_READ` mirrors this |

## 4. Approach (of three considered)

**Chosen — full-pipeline `piread` binary, shadow-registered as `read`.** One `bin/piread` spawn does the entire text-read pipeline and returns structured JSON; the extension maps it to the exact built-in result shape. Description/schema are reused verbatim from `createReadToolDefinition` so the system prompt (and prompt-cache prefix) is byte-identical between arms. This is the only version where the feedback's claimed wins (bounded slicing, detection, structured output in one process) can materialize; parity is enforced by an oracle test suite rather than by construction.

Rejected: **A. operations-layer injection** (`createReadTool({operations: rustOps})`) — Rust would only serve `readFile` bytes while slicing/rendering/truncation stay in TS; adds IPC overhead over the already-native `fs`; tests raw I/O speed, the wrong hypothesis.
Rejected: **C. parallel tool name** (`piread` as an extra tool) — model chooses between two read tools, confounding the A/B comparison and changing the system prompt (cache-hit metric corrupted).

## 5. Component contracts

### 5.1 Crate `native/piread/` (Rust 2024, deps: serde + serde_json only)

CLI: `piread --path <P> [--offset <1-based line>] [--limit <N>]` → exactly one JSON object on stdout.

```jsonc
// success
{ "ok": true, "content": "<rendered text, byte-identical to built-in>",
  "truncation": { "truncated": true, "totalLines": 4321, "maxLines": 2000,
                  "maxBytes": 50000, /* built-in truncate.ts fields, oracle-pinned */ } | null,
  "binary": false, "totalBytes": 12345 }
// failure
{ "ok": false, "error": { "kind": "ENOENT|EACCES|EISDIR|io", "message": "..." } }
```

Exit codes: 0 ok · 2 usage (stderr message, no JSON) · 3 I/O error (JSON on stdout). `--help`/`--version` supported.

- Rendering parity: line numbering absent (built-in returns raw lines), tail notes on truncation — exact bytes pinned by the oracle suite, not re-specified here.
- Streaming/caps: sequential scan, never buffer beyond cap + one lookahead line; `totalLines` counted by streaming (no full buffer); binary detect = NUL in first 8 KiB → `binary: true` and `content` set to whatever the built-in returns for that same file (its binary-file behavior is oracle-pinned in §5.3, not re-specified here).
- No `unsafe`; clippy `-D warnings`; in-crate unit tests for slicing, cap arithmetic (overflow-safe), binary detect, CRLF/no-EOL handling.
- Cargo release profile mirrors pidx (opt-level 3, lto fat, codegen-units 1, panic abort, strip).

### 5.2 Extension `extensions/piread/index.ts`

- Load guard: `process.env.PI_NATIVE_READ !== "1"` → register nothing (zero footprint when off — doc:check env family covers the variable).
- `const builtin = createReadTool(process.cwd())` — kept private as fallback, image path, and never registered.
- `pi.registerTool({ ...createReadToolDefinition(process.cwd()), execute })` — name/label/description/parameters verbatim (prompt-cache stable), `execute` overrides:
  1. image extension on `path` → `builtin.execute(...)`;
  2. else spawn `bin/piread` (resolved relative to the extension dir, no absolute user paths), parse JSON, rebuild the built-in result shape (content array + `details.truncation`);
  3. binary missing / non-zero exit / unparseable JSON → `builtin.execute(...)` and one stderr line `piread: fallback (<reason>) path=<p>` (fail-open to correctness; observability via `logs/`).
- No policy logic lives here (cross-cutting rule, §9): the gate's `tool_call` interception runs before any `execute`, unchanged.

> **Amendment (2026-10-16, spawn-floor fix):** the Step 6 micro-bench showed the per-call process spawn (~3.7–4.9 ms p50) dominating dispatch — piread was slower than the built-in on every corpus class. Dispatch step 2 now routes through a **persistent daemon**: a lazy-started, machine-local `bin/piread --serve` child speaking newline-delimited JSON over stdio (one request/response per line, id-matched, requests carry the caller's cwd). The daemon is unref'd while idle (never holds the host event loop), ref'd only while a response is in flight, restarts lazily on death, and exits on stdin EOF. The fail-open ladder becomes: daemon → **one-shot `bin/piread` spawn** (the pre-amendment path, still first-class — bootstrap scripts and cold-start fallback) → built-in, with exactly one `piread: fallback (<reason>)` stderr line per call (the terminal reason only). Envelope contract, parity suite, gate behavior, and the `PI_NATIVE_READ=1` gate are unchanged; the one-shot CLI keeps exit 0/2/3. Measured effect: dispatch p50 0.07–1.1 ms vs built-in 0.3–1.4 ms (faster on 6/7 corpus classes; only >50 KB single-blob reads regress, where the JSON round-trip exceeds the TS pipeline cost) — `benchmark/runs/piread-microbench-*.md`.

### 5.3 Parity oracle

The built-in instance (`builtin.execute`) is the oracle. Fixture corpus generated deterministically by the test into a temp dir (self-contained, no committed large fixtures): empty · 1-line · CRLF · LF-no-EOL · unicode/emoji · long lines · >2000-line · >50KB · binary-with-NUL · image files · missing · directory · offset/limit combos (offset beyond EOF, partial windows, limit 0/1, unset). Assert byte-identical content arrays, `details`, and `isError` between the piread-wrapped tool and the oracle.

## 6. Benchmark, metrics, decision rule

- **S2 arm**: `arms.json` candidate = baseline config + `PI_NATIVE_READ=1` (+ bootstrap note that `bin/piread` must be built). One pair of full runs, medians over ≥2 repetitions (feedback §1.4C). Comparison from embedded S1 metrics: read-tool p50/p95 latency, `tokens_per_task`, wall-clock per task, task success, cache-hit rate.
- **Micro-bench** (`tests/piread-bench.mjs`, no model): same corpus, N iterations per fixture class per arm (builtin execute vs piread dispatch); portable wall-clock p50/p95; RSS via `/usr/bin/time -v` (Linux) or `-l` (macOS), best-effort; plus a bare `piread --version` loop to separate spawn overhead from pipeline cost. Markdown table → `benchmark/runs/piread-microbench-<date>.md`.
- **Installation complexity**: qualitative note in the verdict (one cargo build + copy, mirrors pidx).
- **Decision rule (adopt iff all)**: (a) 100% parity suite green; (b) S2 task success no regression vs baseline arm; (c) read-tool p50 latency −10% or `tokens_per_task` −3%; (d) wall-clock regression ≤ 2%. Verdict + all numbers recorded in `benchmark/runs/s6-verdict-<date>.md` regardless of direction; default stays off either way (D5).

## 7. Residuals and risks

- **R1 spawn overhead may erase pipeline wins on small files** — expected possible outcome, not a defect; micro-bench quantifies it separately from pipeline cost. A negative verdict is a successful S6.
- **R2 name-shadow relies on verified-but-undocumented merge order** in `agent-session.js` — lock-in test asserts the shadow takes effect and exactly one `read` tool is active; an upstream order change fails loudly.
- **R3 upstream schema/description drift** on a pi version bump — parity suite pins current bytes; re-run tests after pi upgrades (typecheck already guards the compile surface).
- **R4 edge-case divergence** (exotic encodings, sparse files) — oracle fixtures cover the realistic matrix; runtime fallback bounds the blast radius to "built-in behavior".
- **R5 bench pair costs model budget** — runs happen with user-approved timing (S2 practice).

## 8. Testing summary

| Suite | Verifies | Run |
| --- | --- | --- |
| crate unit tests | slicing, cap arithmetic, binary detect, line endings | `cargo test` (in `native/piread/`) |
| `tests/piread-parity.test.mjs` | oracle parity (§5.3), fallback on missing/broken binary, env-off = no registration, name-shadow lock-in | `node tests/piread-parity.test.mjs` |
| gate-compat fixtures (same file) | R1 coverage certifies wrapped reads; S5 M2 region-read passes on piread output; protected-path read still blocks before execution | same run |
| micro-bench | latency/RSS table, spawn-overhead split | `node tests/piread-bench.mjs` (on demand) |
| S2 pair | end-to-end verdict inputs | `node benchmark/bench.mjs` |
| sabotage smoke | delete `bin/piread` → fallback green; unset env → built-in path | manual, once |

## 9. Cross-cutting separation (MASTER §1.4B)

Policy: permission-gate, untouched. Correctness: parity oracle + fallback. Efficiency: Rust pipeline + env gate. Observability: fallback stderr lines, S1 metrics, micro-bench table. Each independently runnable/testable; no efficiency path weakens a safety check.
