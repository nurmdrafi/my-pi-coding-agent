/**
 * scripts/migrate-violation-memory.mjs — the one-shot store migration.
 *
 * The gate migrates on load; this script exists so the same rewrite can be
 * applied now instead of at the next session start. It must reuse the gate's
 * migrateRows (no second implementation to drift) and must keep a backup.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { migrateFile } from "../scripts/migrate-violation-memory.mjs";

function fixture(rows) {
  const dir = mkdtempSync(join(tmpdir(), "vm-migrate-"));
  const file = join(dir, "violation-memory.ndjson");
  writeFileSync(file, rows.map((r) => `${JSON.stringify(r)}\n`).join(""));
  return { dir, file };
}

const now = 1_800_000_000_000;

test("migrates a mixed legacy store in place", () => {
  const { dir, file } = fixture([
    { family: "Anchor Guard", sid: "s1", ts: now },
    { family: "Piread (fallback)", sid: "s1", ts: now },
    { kind: "adoption", tool: "pibash", sid: "s1", ts: now },
  ]);
  try {
    const r = migrateFile(file, { now });
    assert.deepEqual(
      { before: r.before, after: r.after, migrated: r.migrated, dropped: r.dropped },
      { before: 3, after: 2, migrated: 1, dropped: 1 },
    );
    const rows = readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(rows[0].kind, "violation");
    assert.equal(rows[1].kind, "adoption");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a torn tail line is counted, never fatal", () => {
  const { dir, file } = fixture([{ family: "Commitlint", sid: "s1", ts: now }]);
  try {
    writeFileSync(file, readFileSync(file, "utf8") + '{"family":"Anchor');
    const r = migrateFile(file, { now });
    assert.equal(r.unparsable, 1);
    assert.equal(r.after, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an empty store stays empty instead of throwing", () => {
  const { dir, file } = fixture([]);
  try {
    const r = migrateFile(file, { now });
    assert.equal(r.after, 0);
    assert.equal(readFileSync(file, "utf8"), "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("--dry-run style (write:false) leaves the file untouched", () => {
  const { dir, file } = fixture([{ family: "Commitlint", sid: "s1", ts: now }]);
  try {
    const before = readFileSync(file, "utf8");
    migrateFile(file, { now, write: false });
    assert.equal(readFileSync(file, "utf8"), before);
    assert.equal(existsSync(`${file}.migrate`), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
