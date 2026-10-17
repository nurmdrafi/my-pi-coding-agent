/**
 * Lesson counts: one session must be one vote.
 *
 * `loadCounts` merges two sources into `counts[family]`:
 *
 *   - NDJSON rows → distinct sids in the 30-day window, and
 *   - the frozen legacy JSON blob → its historical depth per family.
 *
 * The two were not defined in the same unit. NDJSON contributes "number of
 * distinct sessions", the blob contributes ONE regardless of depth
 * (`n > 0 ? 1 : 0`). MEMORY_THRESHOLD then compares that mixed number, so the
 * threshold's premise ("a lesson after N distinct sessions") is only meaningful
 * if every contribution counts sessions.
 *
 * The blob is pre-NDJSON: one number per family, no session ids, and it is
 * never written again. Its honest session contribution is therefore a floor of
 * 1 — anything derived from `n` (depth) would fabricate sessions that cannot be
 * attributed. That is what the code did; this pins it, and pins the family
 * normalization that must happen first.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mergeLessonCounts } from "../extensions/permission-gate/violation-memory.ts";

test("legacy depth contributes one session, never its raw depth", () => {
  const counts = mergeLessonCounts({}, { "Anchor Guard": 7 });
  assert.equal(counts["Anchor Guard"], 1, "depth 7 is not 7 sessions");
});

test("NDJSON sessions and the legacy floor add up", () => {
  const counts = mergeLessonCounts({ "Anchor Guard": 4 }, { "Anchor Guard": 3 });
  assert.equal(counts["Anchor Guard"], 5);
});

test("a zero/negative legacy count contributes nothing", () => {
  assert.deepEqual(mergeLessonCounts({}, { "Anchor Guard": 0 }), {});
  assert.deepEqual(mergeLessonCounts({}, { "Anchor Guard": -2 }), {});
});

test("NDJSON side passes through untouched", () => {
  const counts = mergeLessonCounts({ Commitlint: 9 }, {});
  assert.equal(counts.Commitlint, 9);
});

test("the result never mutates its inputs", () => {
  const ndjson = { Commitlint: 2 };
  const legacy = { "Anchor Guard": 1 };
  mergeLessonCounts(ndjson, legacy);
  assert.deepEqual(ndjson, { Commitlint: 2 });
  assert.deepEqual(legacy, { "Anchor Guard": 1 });
});

test("a family present in both is summed exactly once", () => {
  const counts = mergeLessonCounts({ "Search (node_modules)": 5 }, { "Search (node_modules)": 1 });
  assert.equal(counts["Search (node_modules)"], 6);
  assert.equal(Object.keys(counts).length, 1);
});
