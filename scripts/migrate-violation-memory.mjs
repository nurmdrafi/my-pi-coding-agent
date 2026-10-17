#!/usr/bin/env node
/**
 * One-shot migration of the live violation store (logs/violation-memory.ndjson).
 *
 * The gate migrates on load (>200 lines), but that only happens on the next
 * session start; running this now means the injected lessons stop reflecting
 * the legacy data immediately. The gate uses the same pure function
 * (migrateRows), so this script cannot drift from runtime behavior.
 *
 * Usage: node scripts/migrate-violation-memory.mjs [--dry-run] [--path <file>]
 */
import { readFileSync, writeFileSync, renameSync, copyFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { migrateRows } from "../extensions/permission-gate/violation-memory.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const pathIdx = args.indexOf("--path");
const target =
  pathIdx !== -1 && args[pathIdx + 1]
    ? resolve(args[pathIdx + 1])
    : process.env.PGATE_MEMORY
      ? resolve(process.env.PGATE_MEMORY)
      : join(homedir(), ".pi", "agent", "logs", "violation-memory.ndjson");

export function migrateFile(file, { now = Date.now(), write = true } = {}) {
  const raw = readFileSync(file, "utf8");
  const parsed = [];
  let unparsable = 0;
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      parsed.push(JSON.parse(line));
    } catch {
      unparsable++;
    }
  }
  const result = migrateRows(parsed, { now });
  const lines = result.rows.map((r) => `${JSON.stringify(r)}\n`).join("");
  if (write) {
    const tmp = `${file}.migrate`;
    writeFileSync(tmp, lines);
    renameSync(tmp, file);
  }
  return {
    before: parsed.length,
    after: result.rows.length,
    migrated: result.migrated,
    dropped: result.dropped,
    unparsable: unparsable + result.unparsable,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (!dryRun) copyFileSync(target, `${target}.bak`);
    const r = migrateFile(target, { write: !dryRun });
    console.log(
      `violation-memory: ${target}` +
        `\n  rows: ${r.before} -> ${r.after}` +
        `\n  migrated: ${r.migrated}  dropped: ${r.dropped}  unparsable: ${r.unparsable}` +
        (dryRun ? "\n  (dry run — nothing written)" : `\n  backup: ${target}.bak`),
    );
  } catch (err) {
    console.error(`violation-memory: migration failed: ${String(err)}`);
    process.exitCode = 1;
  }
}
