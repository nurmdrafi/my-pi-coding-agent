#!/usr/bin/env node
/**
 * refactor/t1 validator (contract: spec §5.2).
 * node validate.mjs <workdir> → { pass, checks[] } JSON on stdout; exit 0 iff pass.
 * Grading: tests still green + structural assertions (new module exists, duplicate
 * gone, delegation present) + tests unmodified (spec §5.2 refactor row).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const workdir = process.argv[2];
if (!workdir) {
  console.error(JSON.stringify({ error: 'usage: node validate.mjs <workdir>' }));
  process.exit(1);
}

const checks = [];
const add = (name, pass, detail) => checks.push({ name, pass, detail });

// ---- tests-green: run the fixture's node:test suite (cwd = workdir;
// NODE_TEST_CONTEXT must be stripped or a validator spawned from inside a test
// runner makes the child exit 0 silently)
const env = { ...process.env };
delete env.NODE_TEST_CONTEXT;
delete env.NODE_TEST_WORKER_ID;
const t = spawnSync(process.execPath, ['--test'], { cwd: workdir, encoding: 'utf8', env });
const pass = /[ℹ#] pass (\d+)$/m.exec(t.stdout);
add('tests-green', t.status === 0, t.status === 0
  ? `${pass ? pass[1] : '?'} tests passed`
  : `tests failed (exit ${t.status}): ${(t.stdout + t.stderr).trim().split('\n').slice(-2).join(' | ').slice(0, 300)}`);

// ---- structural: new module exists
const taxPath = join(workdir, 'src', 'tax.js');
add('tax-module-exists', existsSync(taxPath), existsSync(taxPath) ? 'src/tax.js present' : 'src/tax.js missing');

// ---- structural: duplicated math gone, prices.js delegates to tax.js
let prices = '';
try { prices = readFileSync(join(workdir, 'src', 'prices.js'), 'utf8'); } catch { /* read as empty */ }
const noRound = !/Math\.round/.test(prices);
const delegates = /from\s+['"]\.\/tax\.js['"]/.test(prices);
add('duplicate-gone', noRound && delegates, noRound && delegates
  ? 'prices.js carries no rounding math and imports from ./tax.js'
  : `prices.js still ${noRound ? 'lacks the ./tax.js import' : 'contains Math.round math'}`);

// ---- tests-unmodified: git worktree state must show no touched test files
const st = spawnSync('git', ['-C', workdir, 'status', '--porcelain'], { encoding: 'utf8' });
const lines = st.status === 0 && st.stdout.trim() ? st.stdout.trim().split('\n') : [];
const testRe = /\.test\.[cm]?js$/;
const touched = lines.map((l) => l.slice(3).split(' -> ').pop()).filter((p) => testRe.test(p));
add('tests-unmodified', st.status === 0 && touched.length === 0, st.status !== 0
  ? `git status failed (exit ${st.status})`
  : touched.length ? `test files changed: ${touched.join(', ')}` : 'no test files changed');

const ok = checks.every((c) => c.pass);
console.log(JSON.stringify({ pass: ok, checks }));
process.exit(ok ? 0 : 1);
