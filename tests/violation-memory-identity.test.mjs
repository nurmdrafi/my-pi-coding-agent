/**
 * Violation-memory identity and record shape.
 *
 * Two defects made the store's counts meaningless:
 *
 * 1. `sid` was a per-PROCESS `randomUUID()` written independently by the gate
 *    and by each native tool. The stored ids never matched a real conversation:
 *    of 365 distinct sids in the live store, ZERO appeared in sessions/*.jsonl,
 *    and the native tools each minted their own id for the same process. So
 *    "distinct sessions" (the MEMORY_THRESHOLD premise, H7) counted processes,
 *    not sessions.
 *
 * 2. Rows had two shapes — the gate wrote `{family,sid,ts}`, the tools wrote
 *    `{family,sid,ts,reason,path}` for a DIFFERENT family namespace. Reading the
 *    gate-written rows for a reason yields null, so the store cannot explain
 *    its own top entries.
 *
 * These tests pin one identity (the harness's PI_SESSION_ID) and one shape.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  memorySid,
  violationRecord,
  adoptionRecord,
} from "../extensions/permission-gate/violation-memory.ts";

test("sid comes from the harness session id, not a fresh uuid", () => {
  assert.equal(memorySid({ PI_SESSION_ID: "01a1499a-6e72-76ed-a9e8-68f17f2e2439" }), "01a1499a-6e72-76ed-a9e8-68f17f2e2439");
});

test("sid is stable across calls for one session", () => {
  const env = { PI_SESSION_ID: "abc-123" };
  assert.equal(memorySid(env), memorySid(env));
});

test("a missing session id degrades to a per-process value, never to a shared one", () => {
  const a = memorySid({});
  const b = memorySid({});
  assert.match(a, /^pid-\d+$/);
  // Two processes must not collapse into one id.
  assert.equal(a, b, "same process → same id (pinned within a process)");
  assert.notEqual(memorySid({}, 4242), memorySid({}, 4243));
});

test("violation rows carry a reason and optional path, same shape for every producer", () => {
  const rec = violationRecord({
    family: "Piread (fallback)",
    sid: "s1",
    ts: 1_700_000_000_000,
    reason: "binary",
    path: "/tmp/x",
  });
  assert.deepEqual(rec, {
    kind: "violation",
    family: "Piread (fallback)",
    sid: "s1",
    ts: 1_700_000_000_000,
    reason: "binary",
    path: "/tmp/x",
  });
  // No path → the key is omitted rather than stored as null.
  const bare = violationRecord({ family: "Anchor Guard", sid: "s1", ts: 1 });
  assert.equal("path" in bare, false);
  assert.equal(bare.kind, "violation");
});

test("adoption rows share the sid namespace with violations", () => {
  const rec = adoptionRecord({ tool: "piread", sid: "s1", ts: 5 });
  assert.deepEqual(rec, { kind: "adoption", tool: "piread", sid: "s1", ts: 5 });
  assert.equal(rec.sid, violationRecord({ family: "x", sid: "s1", ts: 5 }).sid);
});
