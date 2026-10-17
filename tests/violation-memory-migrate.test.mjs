/**
 * Violation-store migration (legacy rows → current shape).
 *
 * The live store accumulated rows from three generations of writers:
 *
 *   A. {family,sid,ts}                 gate blocks, re-block/compaction refreshes
 *   B. {family,sid,ts,reason,path}     native-tool fallbacks (own family namespace)
 *   C. {kind:"violation"|"adoption",…} current shape
 *
 * Two of the legacy quirks make the data misleading rather than merely old:
 *
 * - Tool-written families ("Piread (fallback)" …) are NOT in FAMILY_LESSONS, so
 *   they can never produce a lesson, yet they inflate the family ranking that
 *   picks the top 3 injected lessons. In the live store they were 110 of the
 *   top-ranked entries.
 * - The 110 Piread-fallback rows were fully explained by a packaging defect
 *   (unsigned binary → SIGKILL on exec, fixed in scripts/lib/install-native.sh),
 *   so keeping them teaches the next session a lesson about a bug, not about
 *   its own behaviour.
 *
 * The migration is a pure function so it is testable without touching disk.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  LEGACY_TOOL_FAMILIES,
  migrateRows,
  isKnownFamily,
} from "../extensions/permission-gate/violation-memory.ts";

const now = 1_800_000_000_000;

test("legacy family rows gain kind:violation and keep family/sid/ts", () => {
  const out = migrateRows([{ family: "Anchor Guard", sid: "s1", ts: now }], { now });
  assert.deepEqual(out.rows, [
    { kind: "violation", family: "Anchor Guard", sid: "s1", ts: now },
  ]);
  assert.equal(out.migrated, 1);
  assert.equal(out.dropped, 0);
});

test("legacy tool-fallback rows are dropped (their cause was the signed-binary bug)", () => {
  const rows = [
    { family: "Piread (fallback)", sid: "s1", ts: now },
    { family: "Pibash (fallback)", sid: "s1", ts: now },
    { family: "Piedit (fallback)", sid: "s1", ts: now },
    { family: "Anchor Guard", sid: "s2", ts: now },
  ];
  const out = migrateRows(rows, { now });
  assert.deepEqual(
    out.rows.map((r) => r.family),
    ["Anchor Guard"],
  );
  assert.equal(out.dropped, 3);
  for (const fam of LEGACY_TOOL_FAMILIES) assert.equal(isKnownFamily(fam), false);
});

test("current-shape rows pass through untouched and unmarked", () => {
  const row = { kind: "adoption", tool: "piread", sid: "s1", ts: now };
  const out = migrateRows([row], { now });
  assert.deepEqual(out.rows, [row]);
  assert.equal(out.migrated, 0);
  assert.equal(out.dropped, 0);
});

test("rows outside the 30-day window are dropped (same rule as loadCounts)", () => {
  const old = now - 31 * 24 * 60 * 60_000;
  const out = migrateRows([{ family: "Anchor Guard", sid: "s1", ts: old }], { now });
  assert.equal(out.rows.length, 0);
  assert.equal(out.dropped, 1);
});

test("corrupt lines are skipped, never invented", () => {
  const out = migrateRows([null, 42, "x", { family: "Anchor Guard", sid: "s", ts: now }], { now });
  assert.equal(out.rows.length, 1);
  assert.equal(out.unparsable, 3);
});

test("a row with a reason keeps it, so the store can explain itself", () => {
  const out = migrateRows(
    [{ family: "Search (node_modules)", sid: "s", ts: now, reason: "glob exclusion" }],
    { now },
  );
  assert.equal(out.rows[0].reason, "glob exclusion");
});
