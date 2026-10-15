#!/usr/bin/env node
/**
 * S2 benchmark-suite tests (spec: docs/specs/2026-10-15-s2-benchmark-design.md §11).
 * Run: node --test tests/bench-suite.test.mjs  (or directly).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadArms, getArm, discoverTasks, getTask } from '../benchmark/lib/manifests.mjs';
import { newRunId, prepareWorkdir } from '../benchmark/lib/workdir.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BENCH = join(HERE, '..', 'benchmark');
const FIX = join(HERE, 'fixtures', 'bench');
const tmp = () => mkdtempSync(join(tmpdir(), 'bench-suite-'));

const runCli = (...args) => spawnSync(process.execPath, [join(BENCH, 'bench.mjs'), ...args], { encoding: 'utf8' });

// ---------------------------------------------------------------- manifests (Step 1)

test('manifests: arms.json loads with a baseline:true entry', () => {
  const arms = loadArms(join(BENCH, 'arms.json'));
  assert.ok(Array.isArray(arms) && arms.length >= 2);
  assert.equal(arms.filter((a) => a.baseline).length, 1);
  const b = getArm(arms, 'baseline');
  assert.equal(b.baseline, true);
  for (const k of ['name', 'description', 'config']) assert.equal(typeof b[k], 'string', `arm.${k}`);
});

test('manifests: unknown arm name rejected', () => {
  const arms = loadArms(join(BENCH, 'arms.json'));
  assert.throws(() => getArm(arms, 'nope'), /unknown arm: nope/);
});

test('manifests: arms.json rejects zero or multiple baselines', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'a.json'), JSON.stringify([{ name: 'x', description: 'd', config: 'c' }]));
  assert.throws(() => loadArms(join(dir, 'a.json')), /baseline/);
  writeFileSync(join(dir, 'b.json'),
    JSON.stringify([{ name: 'x', description: 'd', config: 'c', baseline: true }, { name: 'y', description: 'd', config: 'c', baseline: true }]));
  assert.throws(() => loadArms(join(dir, 'b.json')), /baseline/);
  rmSync(dir, { recursive: true, force: true });
});

const mkTask = (root, id, taskJson) => {
  mkdirSync(join(root, id), { recursive: true });
  writeFileSync(join(root, id, 'task.json'), JSON.stringify(taskJson));
};

test('manifests: discoverTasks walks <class>/<id>/task.json and returns sorted entries', () => {
  const dir = tmp();
  mkTask(dir, 'bugfix/t1', { id: 'bugfix/t1', class: 'bugfix', title: 'B1', prompt: 'fix t1' });
  mkTask(dir, 'feature/t2', { id: 'feature/t2', class: 'feature', title: 'F2', prompt: 'add f2' });
  const tasks = discoverTasks(dir);
  assert.deepEqual(tasks.map((t) => t.id), ['bugfix/t1', 'feature/t2']);
  assert.equal(tasks[0].dir, join(dir, 'bugfix/t1'));
  assert.equal(tasks[0].title, 'B1');
  assert.equal(tasks[0].prompt, 'fix t1');
  rmSync(dir, { recursive: true, force: true });
});

test('manifests: task.json missing prompt rejected', () => {
  const dir = tmp();
  mkTask(dir, 'bugfix/t1', { id: 'bugfix/t1', class: 'bugfix', title: 'B1' });
  assert.throws(() => discoverTasks(dir), /prompt/);
  rmSync(dir, { recursive: true, force: true });
});

test('manifests: task id/path mismatch rejected', () => {
  const dir = tmp();
  mkTask(dir, 'bugfix/t1', { id: 'bugfix/t9', class: 'bugfix', title: 'B', prompt: 'p' });
  assert.throws(() => discoverTasks(dir), /id mismatch/);
  rmSync(dir, { recursive: true, force: true });
});

test('manifests: getTask unknown id rejected; traversal rejected', () => {
  const dir = tmp();
  mkTask(dir, 'bugfix/t1', { id: 'bugfix/t1', class: 'bugfix', title: 'B', prompt: 'p' });
  assert.equal(getTask(dir, 'bugfix/t1').id, 'bugfix/t1');
  assert.throws(() => getTask(dir, 'bugfix/zz'), /unknown task: bugfix\/zz/);
  assert.throws(() => getTask(dir, '../evil'), /invalid task id/);
  rmSync(dir, { recursive: true, force: true });
});

test('scaffolding: .gitignore covers benchmark/runs/', () => {
  const gi = readFileSync(join(HERE, '..', '.gitignore'), 'utf8');
  assert.ok(/(^|\n)benchmark\/runs\/(\n|$)/.test(gi));
});

// ---------------------------------------------------------------- workdir prep (Step 3)

const SYN = join(FIX, 'task-syn');

test('workdir: prepareWorkdir copies fixture, git-inits, and commits (spec §7.1)', () => {
  const runsRoot = tmp();
  const { runId, runDir, workDir } = prepareWorkdir(SYN, runsRoot);
  assert.match(runId, /^\d{8}T\d{6}-bugfix-task-syn$/);
  assert.equal(runDir, join(runsRoot, runId));
  assert.equal(workDir, join(runDir, 'work'));
  assert.ok(existsSync(join(workDir, '.git')));
  assert.equal(readFileSync(join(workDir, 'failing.js'), 'utf8'),
    readFileSync(join(SYN, 'fixture', 'failing.js'), 'utf8'));
  const log = spawnSync('git', ['-C', workDir, 'log', '--oneline'], { encoding: 'utf8' });
  assert.equal(log.status, 0);
  assert.ok(log.stdout.trim().length > 0, 'initial commit exists');
  // source fixture untouched
  assert.ok(!existsSync(join(SYN, 'fixture', '.git')));
  rmSync(runsRoot, { recursive: true, force: true });
});

test('workdir: runId collisions within the same second get a -2 suffix', () => {
  const runsRoot = tmp();
  const a = prepareWorkdir(SYN, runsRoot);
  const b = prepareWorkdir(SYN, runsRoot);
  assert.notEqual(a.runId, b.runId);
  assert.ok(b.runId.startsWith(a.runId.replace(/(-\d+)?$/, '')));
  assert.ok(existsSync(join(b.workDir, 'failing.js')));
  rmSync(runsRoot, { recursive: true, force: true });
});

test('workdir: missing fixture dir throws', () => {
  assert.throws(() => prepareWorkdir(join(FIX, 'no-such'), tmp()), /fixture/);
});
