# S5 — Edit-Validation Hardening: Design Spec

Status: **spec'd** (implementation plan → `2026-10-16-s5-edit-hardening-plan.md`)
Created: 2026-10-16
Parent: `docs/specs/MASTER.md` §3 (S5). Feedback basis: MASTER §1.2 P1 (edit validation resistant to stale/ambiguous context), §1.3 (`edit`: optimize correctness first — exact matching, ambiguity rejection, stale-file checks matter more than raw speed), §1.4B (policy/correctness separation), roadmap phase 2.
Decisions (documented rationale in §5–§7; flagged for user review at the review gate):
- D1 stale-bind block via stat comparison at edit/write `tool_call` (§5.1)
- D2 region-read requirement for edit + blind-write block for write (§5.2)
- D3 content-hash chaining at mutation/inject certification points only; **version-counter rejected** (§5.3 — answers the master's seed question)
- D4 multi-match ambiguity: verified already enforced by the pi edit tool (fuzzy-space uniqueness) and mirrored by anchor-guard with line numbers — lock-in tests only, no new rule (§5.4)

## 1. Problem

MASTER §1.2 P1: "Reading a region once does not prove it is unchanged at edit time." The model's anchors come from context; the file may change underneath (bash command, git, watcher, another process). Verified against source, the current layers leave four holes:

1. **Stale-edit wrong-location match.** The pi edit tool validates anchors against the file at execution time (`edit-diff.js`: exact → fuzzy match, uniqueness, overlap). If drift changed the anchor bytes, the edit fails as a tool error — recoverable but costs retries (S1 `failedThenSucceeded`). If the anchor still matches *somewhere* — duplicated blocks, boilerplate, a region whose surroundings drifted — the edit **lands silently**, possibly not where the model intended. Execution-time matching cannot detect this class; only binding the edit to content the model actually saw can.
2. **No stale check exists before edit/write.** anchor-guard stats the file (`preStat`) but uses it only post-hoc at `tool_result` (drop coverage on drift, 2026-10-11 item 6). Nothing forces a re-read after external drift — the stale edit reaches the tool.
3. **No read requirement before edit.** A path never read this session (model editing from assumption or from `bash cat` output, neither tracked) passes if its anchor happens to match — the luck-match case of hole 1, and the biggest silent-corruption vector for `write` (blind full overwrite silently reverts external changes).
4. **Stat-based freshness has a same-stat tail.** mtime+size miss two writes in the same mtime tick with equal size, and `touch -r` restores mtime deliberately.

## 2. Scope

**In scope:** edit/write binding checks + hash chaining inside `extensions/permission-gate/` (anchor-guard, read-coverage, index); new test sections in `tests/permission-gate.test.mjs`; measurement via S2 bench rerun and `gate:eval` replay; MASTER registration.

**Out of scope (non-goals):**
- Changing the pi edit tool itself (`dist/core/tools/edit-diff.js` is upstream; the gate mirrors, never patches).
- Hashing on plain-read certification (hot path — rejected, §7 residual R2).
- Post-compaction exemption from D2 — after `session_compact` coverage is empty and anchors unverifiable by definition; forcing one targeted re-read per file is correct behavior, not friction to engineer away.
- Interpreter-escape / path-policy work — S4's domain, untouched.
- Any latency optimization of the edit tool itself — S6's domain.

## 3. Current state (verified, do not re-explore)

| Layer | Where | What it validates | Gap |
| --- | --- | --- | --- |
| pi edit tool | `dist/core/tools/edit-diff.js` | At execution: exact→fuzzy match, fuzzy-space uniqueness (`countOccurrences` on the replacement base), overlap, no-op | Wrong-location silent match (hole 1); nothing about what the model saw |
| anchor-guard | `extensions/permission-gate/anchor-guard.ts` | At `tool_call`: existence (exact+fuzzy) with corrective snippet, uniqueness with line numbers, intra-call overlap; derives post-edit spans, `preStat`, `fuzzy` flag | `preStat` used only post-hoc (hole 2); no read requirement (hole 3) |
| read-coverage | `extensions/permission-gate/read-coverage.ts` | Per-path span union + stat snapshot; freshness = mtime+size equality | Same-stat tail (hole 4); no content hash anywhere |
| write path | `index.ts` write handler | Protected-path confirm (S4 fix 8) only | No staleness/blind checks at all (holes 2–3) |

Reason-family plumbing already fits: `Anchor Guard (Stale):` / `Anchor Guard (Unread):` match both `familyOfReason` (`tests/lib/gate-stub.mjs`) and `BLOCK_FAMILY_RE` (`violation-memory.ts`) — no regex changes.

## 4. Approach (of three considered)

**Chosen — bind edits to certified reads, all inside permission-gate.** Three mechanisms (§5) turn holes 1–4 into cheap pre-execution blocks whose reasons carry the exact fix (targeted re-read), converting silent corruption and tool-retry failures into one-turn recoveries. Reuses the single file read anchor-guard already does; one extra read per mutation certification for the hash chain.

Rejected: **patch/wrap the pi edit tool with expected-content hashes in `edits[]`** — changes the tool contract the model was trained on; upstream tool, we mirror instead. Rejected: **version counter per path** — see §5.3 (strictly weaker than stat for the adversary that matters).

## 5. Mechanisms

All three run inside `validateEditAnchors` (edit) and the write handler, after the policy checks (protected-path confirm — unchanged). Order: M1 stat → M3 hash → anchor validation (existing existence/uniqueness/overlap, which also derives each anchor's original line span) → M2 region → `pendingEdits.set`. M2 needs those derived origSpans, so it runs after anchor validation; M1/M3 gate first because they are cheap stat/hash compares on the read anchor-guard already performs.

### 5.1 M1 — stale-bind block (edit + write)

If a coverage entry exists for the path and both stats are present and `entry.stat ≠ fresh preStat` (mtimeMs or size) → block (either stat missing → skip, fail-open like the existing freshness check):

> `Anchor Guard (Stale): '<shown>' changed on disk since your last read (mtime/size) — re-read the region (offset/limit), then re-send the edit.`

- Covers every external writer (bash, git, watcher) at mtime granularity regardless of cause — no command-text guessing, same principle as R1 freshness.
- Our own edit/write re-certifies with post-op stat (existing behavior), so back-to-back in-harness edits pass naturally.
- Path display clamped (`shown`, last 56 chars) — reason stays inside the ~220c diet.

### 5.2 M2 — region-read requirement (edit + write-to-existing)

**Edit:** M2 uses each anchor's *original* line span (new `origSpans` return field — exact anchors only, derived during anchor validation) and requires every non-fuzzy anchor's span to intersect a certified span of the path:

- No coverage entry at all → `Anchor Guard (Unread): '<shown>' not read this session — read lines A–B (offset/limit) first.`
- Coverage exists but an anchor's region intersects nothing (e.g. read lines 1–50, anchor at 200) → same family, naming the anchor's line range.
- Fuzzy anchors carry no original span (indices live in normalized space) → require only that *some* coverage exists for the path (any certified span); M1 still binds stat. Documented residual R3.
- File missing on disk (ENOENT in anchor-guard's read) → pass through unchanged (the tool reports; `write` creating a new file also passes — existence check via `lstat`).

**Write:** existing file with no coverage entry → `Anchor Guard (Unread): '<shown>' exists but was never read this session — read it before overwriting.` New file → allow. Rationale: a blind full overwrite silently reverts external changes — worst failure class; one targeted read is the cheap recovery.

Line-number alignment argument (why intersection is sound): M1 guarantees the file is byte-identical to the latest certification's stat; spans truncated at `firstEditedLine` only keep lines above the first edit (unshifted); post-edit certifications are in post-application coordinates — whenever M1 passes, anchor origSpans and coverage spans live in the same coordinate space.

### 5.3 M3 — content-hash chaining at mutation points (seed-question answer)

- **Store:** sha256 (truncated 16 hex) of file content at (a) edit/write `tool_result` — post-op content, one extra `readFile`, capped at 1 MiB (above → stat-only); (b) the inject-certification path, which already reads the file (free).
- **Compare:** at edit/write `tool_call`, hash the content anchor-guard already read; `entry.hash` present and ≠ current → block `Anchor Guard (Stale): … changed without mtime/size change (fast write / restored mtime) — re-read before editing.`
- **Why not version-counter:** a counter only sees in-harness mutations (edit/write tool_results — already covered by post-op stat+hash) and is blind to bash/external writers — the adversary holes 2–4 are about. Stat catches those at ms granularity; hash closes the same-stat tail. A counter adds state without adding detection. **Content-hash wins.**
- **Why not hash on reads too:** every read `tool_result` would need a full-file read+hash on the hot path (S1's latency metrics exist precisely to protect this). Mutation points are rare; the read→same-stat-drift→edit sequence stays stat-only — residual R2.

### 5.4 D4 — multi-match ambiguity (verified, lock-in only)

The pi edit tool: if any anchor in a call matches only fuzzily, the whole replacement base becomes fully normalized content and uniqueness is counted in that space (`countOccurrences(replacementBaseContent, …)`) — ambiguous multi-match is rejected at execution time. anchor-guard mirrors with line numbers. S5 adds lock-in tests (mixed exact+fuzzy call, exact-anchor + fuzzy-duplicate elsewhere) and makes no rule change — blocking exact matches that merely have fuzzy twins elsewhere adds friction for no demonstrated failure (YAGNI, rejected in design review).

## 6. Policy separation (MASTER §1.4B)

- **Policy** (protected-path H2 confirm, destructive rules): untouched.
- **Correctness** (M1–M3 binding, anchor validation): anchor-guard + read-coverage; fails safe — any internal error surfaces through the S4 fail-closed wrap as a generic block, and the pi tool's own execution-time validation remains the final net beneath the gate.
- **Efficiency** (R1 dup-read, big-read): untouched; S5 blocks *add* required reads by design — the trade is one targeted read vs a wrong edit.
- **Observability:** new blocks carry distinct `Anchor Guard (Stale)` / `Anchor Guard (Unread)` family strings — visible in violation-memory and `gate:eval` family stats without regex changes.

## 7. Risks / residuals

- **R1 — new friction surface.** Post-compaction, post-mutating-bash, and first-edit-per-path now require a re-read. Aligned with existing semantics (compaction comment: "nothing is in context anymore"); quantified by the S2 rerun (§8) — acceptance gates on it.
- **R2 — read→same-stat-external-drift→edit** stays uncovered (§5.3). Rare tail (sub-ms same-size external write); documented, revisit only if bench shows it.
- **R3 — fuzzy anchors** need only any-coverage (not region intersection); normalized-space indices make region proof impossible. M1 stat-bind still applies.
- **R4 — resumed sessions** have no stored hashes (hydration replays entries, not content) → M3 silently absent after resume; M1 stat-bind still active. Fail-open exactly where content is unknowable, matching R1's existing posture.
- **R5 — write-path cost:** one ≤1 MiB read+hash per write of an existing file; writes are rare; S1 latency metrics will show if this ever matters.

## 8. Measurement

- **Unit/behavior:** `node tests/permission-gate.test.mjs` new "S5" section (families in §9).
- **Replay:** `npm run gate:eval` before/after — `fp_rate` must not regress beyond the documented new block families; `tokens_per_task` delta recorded.
- **Bench:** rerun `node benchmark/bench.mjs` (same tasks, gate arm) → record as the S5 run; compare vs the `s2-run/1` baseline on `edits.failureRate`, `edits.failedThenSucceeded`, `edits.failedTerminal`, `tokens_per_task`. Expected: `failedThenSucceeded` drops (stale edits now blocked earlier with cheaper recovery), `tokens_per_task` within documented tolerance.
- Sabotage smoke per S4 precedent: revert one M-check → its test section goes red → restore.

## 9. Test families (`tests/permission-gate.test.mjs`, same cases-array + exit pattern)

1. **M1 stale (edit):** read → external write (content+stat change) → edit blocked `Stale`; targeted re-read → same edit passes. Mutating-bash variant: `sed -i` via runBash → edit blocked.
2. **M1 stale (write):** read → external change → write blocked; re-read → passes.
3. **M2 unread (edit):** never-read path, valid anchor → blocked `Unread` naming line range; read covering the anchor → passes; read window *not* covering the anchor (read 1–10, anchor at 50) → blocked naming 50's range; ENOENT new file → passes to the tool; fuzzy anchor with any coverage → passes binding (lock-in of R3).
4. **M2 unread (write):** existing never-read → blocked; ENOENT → passes; post-`session_compact` edit → blocked until re-read (lock-in).
5. **M3 hash chain:** read → same-stat silent change (`fs.utimesSync` restoring mtime, same size) → edit blocked `Stale` (hash); own edit (tool_result stores hash) → same-stat silent change → next edit blocked; >1 MiB file → hash skipped, stat-only (boundary lock-in); resumed-session entry without hash → passes M3 (R4 lock-in).
6. **D4 lock-ins:** mixed exact+fuzzy call → coverage dropped for path (existing `fuzzy` path, now asserted alongside binding); exact anchor + fuzzy-only duplicate elsewhere → still allowed (documented decision); exact multi-match → blocked with line numbers (existing, unchanged).
7. **Policy separation regression:** protected-path edit still confirms through H2 *before* any binding block; binding checks never bypass policy order.

## 10. Acceptance criteria

1. All §9 families red→green in `node tests/permission-gate.test.mjs`; full file exit 0; sabotage smoke red on each M-check revert.
2. `gate:eval`: `new_fail: 0`; `fp_rate` regression only from documented new block families (verified by family breakdown); replay `tokens_per_task` delta recorded in the plan's completion note.
3. S2 bench rerun recorded; `edits.failedThenSucceeded` not worse than baseline and `edits.failureRate` not worse; any `tokens_per_task` increase ≤ the documented re-read cost (target: ≤5%).
4. Zero new files, zero new dependencies; changes confined to `extensions/permission-gate/`, `tests/permission-gate.test.mjs`, `CHANGELOG.md`, MASTER registration, benchmark results recording.
