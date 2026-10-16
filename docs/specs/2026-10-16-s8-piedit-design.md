# S8 — Rust Native Edit Tool (`piedit`): Design Spec

> Path note (2026-10-16): `native/` was later renamed to `custom-tools/` (now a Cargo workspace). Read `native/X` below as `custom-tools/X`.

Status: **implemented — gate overridden by explicit user direction** (plan → `2026-10-16-s8-piedit-plan.md`)
Created: 2026-10-16
Parent: `docs/specs/MASTER.md` §3. Feedback basis: MASTER §1.2 P1 (improve tool execution), §1.3 (`edit`: optimize correctness first — exact matching, ambiguity rejection, stale-file checks matter more than raw speed), §1.5 phase 3 (prototype Rust selectively), §1.7 (Rust is a strategy, not the objective; measure before optimizing).
Predecessors: S6 `piread` (`2026-10-16-s6-piread-design.md`) — the extension pattern, dispatch ladder, parity-oracle method, and gate-compat lock-ins are reused wholesale.

**Naming note.** MASTER §3 reserves S7 for orchestration tuning; this project is designated **S8**. The earlier in-chat label "s7-piedit" is superseded. Existing uncommitted facts (2026-10-18 piread individual-registration redesign, commit `62b9cd1`) are treated as the baseline for S8's extension pattern.

Decisions (rationale in §4–§6; to be approved in-session before implementation):
- **D1 tool = `edit` alone** — clean A/B; `write`/`bash` stay as-is (feedback §1.3).
- **D2 Rust boundary = read → normalize → match → apply → write.** Diff/patch **rendering stays in TypeScript** via the SDK's exported `generateDiffString`/`generateUnifiedPatch`. A full jsdiff port to Rust is **rejected** (§4) — it moves the byte-parity risk onto the largest, least-valuable surface.
  - *Amendment (2026-10-16, user speed mandate "3–4× faster than edit"):* superseded — rendering moved to Rust (`src/diff.rs`, byte-identical jsdiff port; `renderDiff: true` protocol) because the TS render was 57–59% of the hot path and capped any further speedup. The parity risk D2 avoided is now covered by a stronger oracle: the parity suite's diff-adversarial corpus plus `tests/piedit-diff-fuzz.mjs` differential fuzz.
- **D3 integration = individual registration** named `piedit` (label `piedit`), following the 2026-10-18 piread redesign — **not** name-shadowing `edit` (§4).
- **D4 gate compatibility = permission-gate treats `piedit` as edit-kind**: Anchor Guard pre-validation, S5 M1 stat-bind / M2 region-read / M3 content-hash chain, and read→edit coverage binding all apply to `piedit` exactly as to `edit`.
- **D5 dispatch = fail-open ladder: `--serve` daemon → one-shot `bin/piedit` spawn → built-in `edit`.** Originally a one-shot spawn only (edit is far less frequent than read, and per-call file I/O dominates); Step 6's bench measured a ~4.3 ms per-call spawn floor that put every small/mid edit 4–7× behind the in-process built-in, so the daemon was revisited (plan §Step 6 / §Contingencies) and implemented: it brings small/mid edits to parity or slightly below the built-in. The one-shot spawn remains the fallback rung for daemon transport loss.
- **D6 default-on**, opt out with `PI_NATIVE_EDIT=0` (registers nothing).
- **D7 decision gate = Step 0 measures the edit hot path before any Rust is written.** If matching cannot beat the diff+write cost, S8 is aborted and effort redirects to S7 (gate steering) — MASTER §1.7: "a negative verdict is a successful [sub-project]." Every number is recorded either way.

**Implementation outcome (2026-10-16).** Step 0 returned the negative the gate anticipated (match+apply 20.2%, diff+patch 58.6%, write 13.5%; `benchmark/runs/s8-hotpath-2026-10-16.md`), and the plan's own contingency said stop. The user directed building `piedit` regardless, so the sub-project was completed with the spec's boundary intact (D1–D4, D6, D7) and **D5 revised**: the Step 6 bench showed the one-shot spawn floor (~4.3 ms) was the dominant cost, so a persistent `--serve` daemon became the primary rung. Shipped: crate `native/piedit/` (25 unit tests, clippy clean), extension `extensions/piedit/` (fail-open daemon → one-shot → built-in), permission-gate edit-kind additions, build wiring, README/CHANGELOG. Verification: parity **40/40** (`tests/piedit-parity.test.mjs`), permission-gate **246/246** unchanged, `doc:check` **4/4**. Measured vs the built-in (`benchmark/runs/piedit-microbench-2026-10-15.md`): small exact **0.335 vs 0.527 ms**, small fuzzy **0.326 vs 0.499 ms**, mid multi 0.688 vs 0.793 ms, mid exact/multiline at parity, large 1 MiB **120.3 vs 89.4 ms** (R6 IPC regression — size-based routing is the follow-up). The honest read: the win is real but small and bounded to common small/mid edits; the >1 MiB class should route to the built-in.

## 1. Problem

`edit` is the second-most-used mutation tool in the corpus (2,147 calls across 474 sessions). The feedback's per-tool verdict (MASTER §1.3) is explicit that `edit` should be optimized for **correctness first**, not raw speed: exact matching, ambiguity rejection, and stale-file checks outrank execution time. S8 therefore tests a narrow hypothesis — *can the match + apply + write pipeline run in Rust with byte-identical behavior and a measurable local-execution win, without weakening any correctness or policy check?* — and is prepared to answer "no."

The reason to test it at all: the built-in `edit` pipeline is the only remaining frequently-called tool whose execution is a pure local text operation (S6 already took `read`; `bash` stays on the shell, `write` is creation-cheap per feedback §1.3, search stays on `rg`/`fd`). If native execution helps anywhere else, it is here.

## 2. Scope

**In scope:** new crate `native/piedit/` → `bin/piedit`; new extension `extensions/piedit/` (env-gated, default-on); permission-gate edit-kind additions for the `piedit` name; parity + gate-compat tests; deterministic micro-bench; docs (`README`, `doc:check` env family); MASTER registration.

**Out of scope (non-goals):**
- **Diff/patch algorithm reimplementation in Rust** (D2) — rendering stays on the exported TS helpers; only `baseContent`/`newContent` cross the boundary.
- Any other tool (`read`/`write`/`bash` unchanged; search stays `rg`/`fd`).
- Changing `edit` semantics, error strings, or result shape — S8 swaps the executor, not the contract.
- `withFileMutationQueue` reimplementation — the extension reuses the exported queue (D2/§5.2).
- ~~A persistent `--serve` daemon for edit~~ — **implemented** (D5 revised): Step 6 showed the spawn cost was material, so the daemon is now the primary rung with one-shot and built-in as fallbacks.
- Making `PI_NATIVE_EDIT` default-off; adoption follows the Step 7 verdict, but the D6 default is on (mirrors the piread adoption flip), reversible with `PI_NATIVE_EDIT=0`.

## 3. Current state (verified 2026-10-16, do not re-explore)

| Layer | Where | Fact |
| --- | --- | --- |
| Built-in `edit` definition | pi `dist/core/tools/edit.js` | Schema `{path: string, edits: Array<{oldText, newText}>}`; `prepareArguments` normalizes edits sent as a JSON string / single object / legacy `oldText`+`newText`; `validateEditInput` rejects empty `edits`; `constrainedSampling:{type:"json_schema",strict:"prefer"}`; `renderShell:"self"`; `...editRenderers` |
| Built-in `edit` executor | same | `withFileMutationQueue(abs)` → `ops.access` → `ops.readFile` (Buffer) → `splitBom` → `detectLineEnding` → `normalizeToLF` → `applyEditsToNormalizedContent` → `bom + restoreLineEndings(newContent, ending)` → `ops.writeFile` → `generateDiffString` + `generateUnifiedPatch` → result `{content:[{type:"text",text:"Successfully replaced N block(s) in <path>."}], details:{diff, patch, firstChangedLine}}` |
| Matching internals | pi `dist/core/tools/edit-diff.js` | `applyEditsToNormalizedContent`: LF-normalize each old/new; empty-oldText error; per-edit `fuzzyFindText` (exact `indexOf` first, else NFKC + smart-quote/dash/space/trailing-ws normalization); if **any** edit uses fuzzy, `replacementBaseContent = normalizeForFuzzyMatch(content)`; uniqueness via `countOccurrences` (normalized split); intra-call overlap check; apply in reverse offset order, or `applyReplacementsPreservingUnchangedLines` on the fuzzy path; `baseContent === newContent` → no-change error |
| Diff rendering | pi `dist/core/tools/edit-diff.js` | `generateDiffString` (jsdiff `diffLines`, 4 context lines, line-numbered display) and `generateUnifiedPatch` (jsdiff `createTwoFilesPatch`, `FILE_HEADERS_ONLY`) — **both exported** from the package root |
| File-mutation queue | pi package root | `withFileMutationQueue` is **exported**; serializes same-path writes in-process |
| SDK exports (runtime-verified) | `@earendil-works/pi-coding-agent` | `createEditTool`, `createEditToolDefinition`, `generateDiffString`, `generateUnifiedPatch`, `withFileMutationQueue` all `function` at runtime |
| Permission-gate (edit-kind) | `extensions/permission-gate/index.ts` | `isToolCallEventType("edit", event)` branch (L460): malformed-path block, symlink-resolved protected-path confirm, `validateEditAnchors` (Anchor Guard + M1 stat / M2 region / M3 hash), `pendingEdits.set({kind:"edit"})`; file-path scrape at L1035–1058 lists `read`/`piread`/`write`/`edit`; `tool_result` consumes `pendingEdits` (L885) |
| Anchor Guard | `extensions/permission-gate/anchor-guard.ts` | Name-driven via the `edit` branch; fuzzy/exact anchor existence, uniqueness with line numbers, intra-call overlap, `toLF` + `normalizeForFuzzyMatch` mirror of edit-diff.js |
| Extension pattern | `extensions/piread/index.ts` | Individual registration `{...definition, name, label, description, promptGuidelines, execute, renderCall}`; private built-in instance as fallback; fail-open ladder; per-call `piread: fallback (<reason>) path=<p>` stderr + `logs/violation-memory.ndjson`; `PI_NATIVE_READ=0` opt-out |
| Build flow | `scripts/bootstrap.sh` / `after-pull.sh` | cargo build `native/<crate>` → copy to `bin/`; cargo-missing degrades gracefully — `piedit` mirrors this |

## 4. Approach (of three considered)

**Chosen — B. Hybrid: Rust owns match + apply + write; TypeScript owns diff/patch rendering.** `bin/piedit` reads the request from stdin, reads the target file, strips BOM, normalizes line endings, performs the exact/fuzzy match, uniqueness/overlap/no-change validation, applies the edit, writes the final bytes, and returns `{baseContent, newContent}` (LF, no BOM) plus the error message on failure. The extension — which owns `execute` — wraps the call in the exported `withFileMutationQueue`, then calls the exported `generateDiffString`/`generateUnifiedPatch` on the returned `baseContent`/`newContent` to build `details` byte-identically to the built-in **by construction**. This confines hand-written parity to matching/error strings (a bounded, testable surface) and leaves the largest and riskiest output — the jsdiff rendering — on the original code.

Rejected — **A. Full-pipeline Rust including diff.** Byte-identical reproduction of jsdiff's `diffLines` (Myers variant with specific tie-breaking) and `createTwoFilesPatch` (`FILE_HEADERS_ONLY`) is the highest-risk part of the whole project and buys the least: diff rendering is not where template-level wins live, and any divergence corrupts `details`, the TUI preview, and the parity oracle. D2 keeps it in TS.

Rejected — **C. Name-shadowing `edit`** (the pre-redesign piread pattern). Superseded by the 2026-10-18 individual-registration decision (`62b9cd1`): a shadow makes both tools render as one label, collides with any other edit registration, and hides which executor ran. An individual `piedit` name keeps observability and matches the read precedent; permission-gate is extended to treat `piedit` as edit-kind (D4) so no policy check is lost.

Fallback — **no native edit.** If Step 0 measures that matching is a small fraction of `edit` wall-clock (diff + fsync dominate) or Step 7's decision rule fails, S8 is aborted and the effort moves to S7. This is an anticipated, acceptable outcome (D7).

## 5. Component contracts

### 5.1 Crate `native/piedit/` (Rust 2024; deps: serde, serde_json, unicode-normalization)

CLI: `piedit --path <P>` reading a JSON request object from **stdin** (edits payloads are multi-line/arbitrary-bytes — never argv):

```jsonc
// stdin
{ "edits": [ { "oldText": "…", "newText": "…" } ] }
// stdout — success
{ "ok": true, "baseContent": "<LF, BOM-stripped>", "newContent": "<LF, BOM-stripped>" }
// stdout — failure
{ "ok": false, "error": { "kind": "ENOENT|EACCES|ENOTDIR|EMPTY_OLDTEXT|NOT_FOUND|DUPLICATE|OVERLAP|NO_CHANGE|io",
                          "message": "<byte-identical to built-in>" } }
```

Exit codes: 0 ok · 2 usage (stderr, no JSON) · 3 I/O or validation error (JSON on stdout). `--help`/`--version` supported.

- **Matching parity** (the hand-written surface): port `applyEditsToNormalizedContent` exactly — LF normalization of old/new; empty-oldText guard; `fuzzyFindText` (exact `indexOf` first, else `normalizeForFuzzyMatch`); if any edit is fuzzy, `replacementBaseContent = normalizeForFuzzyMatch(content)`; uniqueness via normalized-occurrence count; sort by match index then check overlap; reverse-order apply, or `applyReplacementsPreservingUnchangedLines` on the fuzzy path; no-change guard. **Error `message` strings are byte-identical to `edit-diff.js`** (the six `get*Error` builders) and pinned by the oracle.
- **Rust writes the file** (`bom + restoreLineEndings(newContent, originalEnding)`), so the extension need not re-write; the extension reads file bytes only for the `access`-vs-write distinction (see §5.2).
- **Normalization fidelity risk**: JS `String.prototype.trimEnd` trims the Unicode whitespace set and `normalize("NFKC")` is full NFKC — Rust `char::is_whitespace` differs on a few code points and `unicode-normalization`'s NFKC is the standard algorithm. The oracle corpus (including exotic-whitespace and composed/decomposed fixtures) is the arbiter; any divergence is a hard fail, not a tolerance.
- **Atomicity**: temp-file + rename in the target directory (same behavior class as `fs.writeFile` semantics is *not* atomic-by-default; S8 must not weaken the built-in's write contract — record the exact built-in write semantics and match them; if the built-in is a plain `writeFile`, piedit does the same and leaves queue-serialization to the extension).
- No `unsafe`; clippy `-D warnings`; in-crate unit tests for slicing/normalization/error strings. Cargo release profile mirrors `pidx`/`piread` (opt-level 3, lto fat, codegen-units 1, panic abort, strip).

### 5.2 Extension `extensions/piedit/index.ts`

- Load guard: `PI_NATIVE_EDIT === "0"` → register nothing; otherwise register (default-on, D6).
- `const builtin = createEditTool(process.cwd())` — private fallback, never registered.
- `pi.registerTool({ ...createEditToolDefinition(process.cwd()), name: "piedit", label: "piedit", description, promptGuidelines, execute, renderCall })` — schema, `prepareArguments`, `constrainedSampling`, `renderShell`, and renderers stay verbatim from the built-in definition (so input normalization and TUI behavior are unchanged); only name/label/description/promptGuidelines/execute/renderCall are piread-style overrides.
- `execute`:
  1. `withFileMutationQueue(absPath, async () => { … })` wrapping the whole dispatch (reuses the exported queue; keeps same-path serialization identical to the built-in).
  2. spawn `bin/piedit` (resolved relative to the extension dir, no absolute user paths), send the request JSON on stdin, parse the envelope.
  3. on `ok`, build `details` with the exported `generateDiffString(baseContent, newContent)` and `generateUnifiedPatch(path, baseContent, newContent)`; return `content:[{type:"text",text:`Successfully replaced ${edits.length} block(s) in ${path}.`}]`.
  4. on validation error (`ok:false`), throw the exact built-in `Error` message (so the model sees identical text and retry semantics).
  5. on binary-missing / non-zero exit / unparseable JSON → `builtin.execute(...)` + one stderr line `piedit: fallback (<reason>) path=<p>` and a `logs/violation-memory.ndjson` entry (reuse the piread `family:"Piread (fallback)"` schema shape under a `Piedit (fallback)` family).
- No policy logic lives here (cross-cutting rule, §9): the gate's `tool_call` interception runs before any `execute`.

### 5.3 Permission-gate additions (D4)

- Add `isToolCallEventType("piedit", event)` to the edit-kind branch (L460) — Anchor Guard, protected-path confirm, `pendingEdits.set({kind:"edit"})` all apply.
- Add `call.name === "piedit"` to the file-path scrape (L1035–1058) so read→edit binding and post-edit coverage/certification fire.
- `tool_result` handler (L885) stays kind-driven; no change if it keys on `pendingEdits` kind rather than tool name (verify during implementation).
- Mirror the piread `[piread native]` marker decision: piedit has no equivalent marker (the result line is already short and unambiguous) — implemented as such; no marker is appended, and the read-coverage line-count logic is a no-op for edit results.

### 5.4 Parity oracle

The built-in `edit` tool (`createEditTool(cwd)`) is the oracle. Deterministic fixtures generated by the test into a temp dir; for each case, run both arms against **fresh copies** of the same fixture and assert: final file bytes identical; thrown error `message` identical (or both succeed); `content` text identical; `details.diff`, `details.patch`, `details.firstChangedLine` identical. Matrix: single exact edit · multi-disjoint edits · fuzzy edit (trailing whitespace / smart quotes / en-dash / NBSP) · duplicate-anchor → `DUPLICATE` · overlap → `OVERLAP` · empty oldText · no-change · not-found · CRLF file · no-trailing-EOL file · BOM file · unicode/emoji · large file (>1 MiB, hash-chain boundary) · missing file · read-only file · directory path · malformed input (`edits` as JSON string / single object / legacy shape) · offset/normalization edge cases. Fallback cases: `bin/piedit` absent / exits 3 / emits garbage → result equals oracle + one stderr line.

## 6. Benchmark, metrics, decision rule

- **Step 0 hot-path split** (before any Rust): instrument the built-in `edit` on a deterministic corpus and separate match+apply time from `generateDiffString`/`generateUnifiedPatch` time and write time. This is the abort gate (D7): if diff/write dominate, the hybrid cannot win on the axis that matters.
- **Micro-bench** (`tests/piedit-bench.mjs`, no model): corpus classes × N iterations × arms (builtin `edit` vs `piedit` dispatch); portable wall-clock p50/p95; RSS best-effort (`/usr/bin/time -v`/`-l`); a bare `piedit --version` loop to separate spawn cost; markdown table → `benchmark/runs/piedit-microbench-<date>.md`.
- **S2 pair** (user-approved timing): candidate arm = baseline + `PI_NATIVE_EDIT=1`; ≥2 repetitions, medians; S1 metrics (edit-tool p50/p95, edit-failure/retry rate, `tokens_per_task`, wall-clock, task success, cache-hit).
- **Decision rule (adopt iff all)**: (a) 100% parity suite green; (b) S2 task success no regression; (c) edit-tool p50 latency −10% **or** `tokens_per_task` −3%; (d) wall-clock regression ≤ 2%; (e) zero new gate `known_bug` failures / `fp_rate` non-regression. Verdict + all numbers in `benchmark/runs/s8-verdict-<date>.md` regardless of direction.
- **Installation complexity**: qualitative note (one cargo build + copy, mirrors pidx/piread).

## 7. Residuals and risks

- **R1 no-win hypothesis** — matching may be a small fraction of edit cost; the hybrid then cannot beat the built-in. Step 0 measures it; a negative result aborts S8 (D7). This is expected and not a defect.
- **R2 fuzzy-normalization divergence** — Rust `trimEnd`/NFKC may differ from JS on exotic code points. Mitigated by an explicit Unicode-whitespace/composition fixture family and hard-fail parity; residual bounded to the fuzzy path (exact-path parity is trivial string equality).
- **R3 error-string drift** — the six `get*Error` messages are pinned as literals; a pi version bump that changes them fails loudly (re-run after upgrades).
- **R4 write-semantics divergence** — if the built-in is not atomic, piedit must not silently become atomic (or vice versa); implementation records the exact built-in write call and matches it. Queue serialization stays on the exported `withFileMutationQueue`.
- **R5 gate regression** — adding a second edit-kind name must not fork Anchor Guard or M1/M2/M3 logic; lock-in tests assert identical block reasons for `edit` vs `piedit` on the same fixture, and `npm run gate:eval` shows no new failures.
- **R6 IPC envelope cost on large files** — `baseContent`+`newContent` cross the boundary as JSON; for large files this may offset pipeline wins (the piread 60 KB-blob precedent). Micro-bench isolates it; if it regresses, the honest verdict is "keep built-in for large files" (possible follow-up: size-based routing).
- **R7 bench pair costs model budget** — runs happen with user-approved timing (S2 practice).

## 8. Testing summary

| Suite | Verifies | Run |
| --- | --- | --- |
| crate unit tests | normalization, matching, overlap/uniqueness, error strings | `cargo test` (in `native/piedit/`) |
| `tests/piedit-parity.test.mjs` | oracle parity (§5.4) — 40 cases; fallback on missing/broken binary; env-off = no registration; individual-name lock-in; daemon client (concurrent id matching, lazy restart, pre-abort); gate edit-kind lock-ins | `node tests/piedit-parity.test.mjs` |
| gate lock-ins (same file) | Anchor Guard/M1/M2/M3 identical for `piedit`; protected-path blocks before execution; read→`piedit` coverage binding | same run |
| micro-bench | latency/RSS table, spawn-cost split | `node tests/piedit-bench.mjs` (on demand) |
| S2 pair | end-to-end verdict inputs | `node benchmark/bench.mjs` |
| sabotage smoke | delete `bin/piedit` → fail-open green; unset env → built-in path; revert a matching fix → parity red, restore → green | manual, once |
| full gates | `cargo clippy -D warnings`, `npm run typecheck`, `npm run doc:check`, `node tests/permission-gate.test.mjs` unchanged-green | task end |

## 9. Cross-cutting separation (MASTER §1.4B)

Policy: permission-gate (edit-kind extension, D4) — independently tested via gate lock-ins. Correctness: parity oracle + fail-open fallback; Rust matching pinned to the built-in. Efficiency: Rust match+apply pipeline, env gate, micro-bench. Observability: fallback stderr + violation log, S1 metrics, bench table. Each independently runnable/testable; no efficiency path weakens a safety check, and no policy check moves into Rust.
