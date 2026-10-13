# Codemode hardening test — 2026-10-14

Environment: pi agent harness, QuickJS sandbox, 4 tools (read, bash, edit, write). 25 checks over 4 rounds.

## Results — all framework checks PASS

| # | Check | Result |
|---|---|---|
| 1 | text()/return ordering, ==> text N/M <== markers | PASS |
| 2 | console output in separate <console_output> block, after text items | PASS |
| 3 | exit() halts script immediately; later code unreachable | PASS |
| 4 | Sandbox isolation: process/require/fetch/setTimeout undefined; globals limited to documented set | PASS |
| 5 | searchTools BM25 ranking; empty result for nonsense query | PASS |
| 6 | describeTool/describeNamespace return undefined for unknown names | PASS |
| 7 | Nonexistent tool call rejects with available-tools hint | PASS |
| 8 | bash non-zero exit resolves object (exit_code=3), no throw | PASS |
| 9 | read missing file rejects ENOENT | PASS |
| 10 | Promise.allSettled mixed fulfilled/rejected | PASS |
| 11 | store persists across codemode calls (round 2 → 3) | PASS |
| 12 | store per-value limit enforced: 262202 > 262144 chars throws with guidance | PASS |
| 13 | store(key, undefined) deletes key | PASS |
| 14 | Failed script: store writes rolled back (cm.rollback, cm.big absent) | PASS |
| 15 | Failed script keeps partial output + Script error + stack line | PASS |
| 16 | @options not on line 1 rejected before script runs | PASS |
| 17 | timeout_ms: busy loop killed at exactly 1500 ms | PASS |
| 18 | Never-settling promise fails immediately (no timers), exact doc error | PASS |
| 19 | max_output_tokens: head+tail kept, truncation warning + full temp file path | PASS |
| 20 | VM memory 256 MB: huge alloc → InternalError: out of memory | PASS |
| 21 | Nested codemode: tools.codemode does not exist (blocked) | PASS |
| 22 | bash output cap ~1 MiB: 1.7 MB → truncated=true + full_output_path, head+tail kept | PASS |
| 23 | image() validates input, rejects garbage with hint | PASS |
| 24 | write → edit → read round-trip correct; stale oldText rejected by Anchor Guard (exact+fuzzy) | PASS |
| 25 | Models catalog: 1554 chat / 60 image / 34 classifier entries listed | PASS (list only) |

## Permission-gate probes (harmless-if-executed targets)

| Probe | Result |
|---|---|
| rm /tmp/<missing-file> | BLOCKED: Permission Gate (Destructive) — correct |
| rm own session-created temp file | ALLOWED — gate tracks session artifacts, permits own cleanup |
| echo "npm install left-pad" | ALLOWED — no substring false positive — correct |
| benign echo control | ALLOWED — correct |
| git -C /tmp/<missing-dir> reset --hard | **ALLOWED (git failed, exit 128) — GATE GAP: -C prefix evades pattern** |
| sudo -n true | **ALLOWED (failed, password required) — GATE GAP: sudo not matched** |

## Findings

1. **Gate gap (medium):** `git -C <dir> reset --hard` evades the destructive pattern; only bare `git reset --hard` matched. No damage in test (target dir nonexistent). Suggest matching git subcommands regardless of leading -C.
2. **Gate gap (medium):** `sudo -n true` allowed through. Failed only because sudo needed a password. Suggest blocking any sudo invocation without prior approval.
3. Models: getAvailableOfType returns 0 for image and classifier with current credentials — classify()/generateImages() (incl. 4-call concurrency limit) untested live. Catalog listing works.
4. Anomaly: gate-probe script wall time 124.8 s though its commands are instant — blocked rm appears to trigger a slow gate path (possible ask-timeout). Worth investigating.
5. max_output_tokens warning reports original token count (10014) not the cap (50) — cosmetic only.

## Verdict

Codemode framework behavior matches documentation exactly across all 25 checks; sandbox escape, resource limits, rollback semantics, and output caps all enforced. Two permission-gate pattern gaps found (git -C, sudo); no rule violated during testing, no real files/dirs/repo touched.
