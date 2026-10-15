/**
 * S2 run lifecycle IO (spec §7, §8): the `runs/<runId>/run.json` stub and the
 * committed `results/runs/<runId>.json` records.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Parse runs/<runId>/run.json; throws `unknown run` when absent. */
export function readStub(runDir, runId) {
  const p = join(runDir, 'run.json');
  if (!existsSync(p)) throw new Error(`unknown run: ${runId} (no run.json under the runs root)`);
  return JSON.parse(readFileSync(p, 'utf8'));
}

/** Flip the stub to status:"done" (spec §7.3). */
export function flipStub(runDir, stub) {
  writeFileSync(join(runDir, 'run.json'), JSON.stringify({ ...stub, status: 'done' }, null, 1));
}

/** Write results/runs/<runId>.json (committed record). */
export function writeRecord(resultsDir, record) {
  mkdirSync(resultsDir, { recursive: true });
  writeFileSync(join(resultsDir, `${record.runId}.json`), JSON.stringify(record, null, 1) + '\n');
}

/** All parsed records in results/runs (unknown/unparseable files skipped). */
export function readRecords(resultsDir) {
  if (!existsSync(resultsDir)) return [];
  return readdirSync(resultsDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try { return JSON.parse(readFileSync(join(resultsDir, f), 'utf8')); } catch { return null; }
    })
    .filter((r) => r?.schema === 's2-run/1');
}
