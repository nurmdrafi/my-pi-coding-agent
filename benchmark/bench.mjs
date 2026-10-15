#!/usr/bin/env node
/**
 * S2 benchmark suite CLI (spec: docs/specs/2026-10-15-s2-benchmark-design.md §7).
 * Commands: start | finish | report | list | check-tasks.
 * Zero-dependency; errors exit 1 with {error} JSON on stderr (spec §10).
 */
import { writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadArms, getArm, getTask, discoverTasks } from './lib/manifests.mjs';
import { prepareWorkdir } from './lib/workdir.mjs';
import { runValidator } from './lib/validate.mjs';
import { runMetrics } from './lib/metrics.mjs';
import { readStub, flipStub, writeRecord, readRecords } from './lib/runs.mjs';
import { aggregateCells } from './lib/aggregate.mjs';
import { buildPayload, renderMarkdown, nextReportBase } from './lib/report.mjs';

const BENCH = dirname(fileURLToPath(import.meta.url));
export const DEFAULTS = {
  tasksDir: join(BENCH, 'tasks'),
  armsPath: join(BENCH, 'arms.json'),
  runsRoot: join(BENCH, 'runs'),
  resultsDir: join(BENCH, 'results', 'runs'),
  reportsDir: join(BENCH, 'results'),
  metricsScript: join(BENCH, '..', 'skills', 'session-audit', 'scripts', 'metrics.mjs'),
};

const HELP = `usage: node benchmark/bench.mjs <command> [options]

commands:
  start --task <class/id> --arm <name>
        Copy the task fixture into benchmark/runs/<runId>/work, git-init it, print the
        prompt + arm config + next steps. Then run the agent with cwd = workdir.
  finish --run <runId> --session <sessionId|path> [--sessions-dir DIR]
        Grade the workdir (task validate.mjs), attach S1 metrics, write the run record.
  report [--task <id>...] [--arm <name>...] [--include-partial]
        Aggregate completed records into results/report-YYYY-MM-DD.md (+ .json sibling).
  list  Tasks, arms, and run counts per task x arm.
  check-tasks
        QA every task: pristine fixture must FAIL validation, patched must PASS.

options (defaults suit repo-root usage; overridable for tests):
  --tasks-dir DIR --arms FILE --runs-root DIR --results-dir DIR --reports-dir DIR`;

function parseArgs(argv) {
  const opts = { tasks: [], arms: [] };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const flag = (name) => { opts[name] = argv[++i]; };
    const push = (name) => { opts[name].push(argv[++i]); }; // repeatable (report filters, spec §7.4)
    if (a === '--task') push('tasks');
    else if (a === '--arm') push('arms');
    else if (a === '--run') flag('run');
    else if (a === '--session') flag('session');
    else if (a === '--sessions-dir') flag('sessionsDir');
    else if (a === '--tasks-dir') flag('tasksDir');
    else if (a === '--arms') flag('armsPath');
    else if (a === '--runs-root') flag('runsRoot');
    else if (a === '--results-dir') flag('resultsDir');
    else if (a === '--reports-dir') flag('reportsDir');
    else if (a === '--include-partial') opts.includePartial = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else positional.push(a);
  }
  return { opts, positional };
}

const die = (msg) => { console.error(JSON.stringify({ error: msg })); process.exit(1); };

// ---------------------------------------------------------------- start (spec §7.1)

function cmdStart(opts) {
  const taskId = opts.tasks[0];
  const armName = opts.arms[0];
  if (!taskId || !armName) die('start requires --task <class/id> and --arm <name>');
  const arm = getArm(loadArms(opts.armsPath), armName);
  const task = getTask(opts.tasksDir, taskId);
  const { runId, runDir, workDir } = prepareWorkdir(task.dir, opts.runsRoot);
  const startedAt = new Date().toISOString();
  writeFileSync(join(runDir, 'run.json'),
    JSON.stringify({ runId, task: task.id, arm: arm.name, startedAt, status: 'started' }, null, 1));
  console.log(`=== S2 run started ===
runId: ${runId}
task:  ${task.id} — ${task.title}
arm:   ${arm.name}${arm.baseline ? ' (baseline)' : ''}

--- task prompt (paste into the agent session) ---
${task.prompt}

--- arm config — apply MANUALLY before the session, never auto-applied (spec §6) ---
${arm.config}

--- workdir (run the agent with cwd = this path) ---
${workDir}

next: run the agent in the workdir with the prompt above, then:
  node benchmark/bench.mjs finish --run ${runId} --session <sessionId>`);
}

// ---------------------------------------------------------------- finish (spec §7.3)

function cmdFinish(opts) {
  if (!opts.run || !opts.session) die('finish requires --run <runId> and --session <sessionId|path>');
  if (!/^[A-Za-z0-9._-]+$/.test(opts.run)) die(`invalid run id: ${opts.run}`);
  const runDir = join(opts.runsRoot, opts.run);
  const stub = readStub(runDir, opts.run);
  if (stub.status === 'done') die(`run already finished: ${opts.run}`);
  const task = getTask(opts.tasksDir, stub.task);
  const grade = runValidator(task.dir, join(runDir, 'work'));
  let metrics, metricsError; // schema mismatch throws loudly (spec §12)
  ({ metrics, metricsError } = runMetrics(opts.session, opts));
  const record = {
    schema: 's2-run/1', runId: stub.runId, task: stub.task, arm: stub.arm,
    startedAt: stub.startedAt, finishedAt: new Date().toISOString(), sessionId: opts.session,
    grade: grade.pass ? 'SUCCESS' : 'FAIL', checks: grade.checks, metrics, metricsError,
  };
  writeRecord(opts.resultsDir, record);
  flipStub(runDir, stub);
  const ok = record.checks.filter((c) => c.pass).length;
  console.log(`${record.grade} — run ${record.runId} (${record.task} @ ${record.arm}): ` +
    `${ok}/${record.checks.length} checks passed; metrics ${metrics ? 'ok' : `incomplete (${metricsError})`}`);
}

// ---------------------------------------------------------------- report (spec §7.4, §9)

function cmdReport(opts) {
  let records = readRecords(opts.resultsDir);
  if (opts.tasks.length) records = records.filter((r) => opts.tasks.includes(r.task));
  if (opts.arms.length) records = records.filter((r) => opts.arms.includes(r.arm));
  if (records.length === 0) {
    console.log('no completed runs to report — nothing written');
    return;
  }
  const cells = aggregateCells(records, { includePartial: opts.includePartial });
  const date = new Date().toISOString().slice(0, 10);
  const payload = buildPayload(cells, { date, includePartial: opts.includePartial });
  mkdirSync(opts.reportsDir, { recursive: true });
  const base = nextReportBase(opts.reportsDir, date);
  writeFileSync(join(opts.reportsDir, `${base}.md`), renderMarkdown(payload) + '\n');
  writeFileSync(join(opts.reportsDir, `${base}.json`), JSON.stringify(payload, null, 1) + '\n');
  console.log(`wrote ${join(opts.reportsDir, `${base}.md`)} (+ .json sibling); ` +
    `${records.length} runs, ${cells.length} (task × arm) cells`);
}

// ---------------------------------------------------------------- list (spec §7.5)

function cmdList(opts) {
  const tasks = discoverTasks(opts.tasksDir);
  const arms = loadArms(opts.armsPath);
  const records = readRecords(opts.resultsDir);
  const count = (task, arm) => records.filter((r) => r.task === task && r.arm === arm).length;
  console.log(`tasks (${tasks.length}):`);
  for (const t of tasks) console.log(`  ${t.id} — ${t.class} — ${t.title}`);
  console.log(`arms (${arms.length}):`);
  for (const a of arms) console.log(`  ${a.name}${a.baseline ? ' (baseline)' : ''} — ${a.description}`);
  console.log('runs per task × arm:');
  for (const t of tasks) for (const a of arms) console.log(`  ${t.id} × ${a.name}: ${count(t.id, a.name)}`);
}

// ---------------------------------------------------------------- check-tasks (spec §5.4)

/** QA one task on a scratch copy: pristine must FAIL, patched must PASS. */
function checkTask(task) {
  const scratch = mkdtempSync(join(tmpdir(), 's2-check-'));
  try {
    const { workDir } = prepareWorkdir(task.dir, scratch); // copy + git init, never touches source
    const pristine = runValidator(task.dir, workDir);
    if (pristine.pass) return { ok: false, why: 'pristine fixture already passes (task is solved or ungradeable)' };
    const applied = spawnSync('git', ['-C', workDir, 'apply', join(task.dir, 'solution.patch')]);
    if (applied.status !== 0) {
      return { ok: false, why: `solution.patch does not apply: ${applied.stderr.trim().slice(0, 200)}` };
    }
    const patched = runValidator(task.dir, workDir);
    if (!patched.pass) {
      return { ok: false, why: `patched fixture still fails: ${patched.checks.filter((c) => !c.pass).map((c) => c.name).join(', ')}` };
    }
    return { ok: true, checks: patched.checks.length, pristineFails: pristine.checks.filter((c) => !c.pass).length };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function cmdCheckTasks(opts) {
  const tasks = discoverTasks(opts.tasksDir);
  if (!tasks.length) die(`no tasks found under ${opts.tasksDir}`);
  let failed = 0;
  for (const task of tasks) {
    const r = checkTask(task);
    if (r.ok) console.log(`OK ${task.id} (pristine fails on ${r.pristineFails} check(s); patched passes ${r.checks} checks)`);
    else { failed++; console.log(`FAIL ${task.id} — ${r.why}`); }
  }
  if (failed) process.exit(1);
}

// ---------------------------------------------------------------- dispatch

const [, , cmd, ...rest] = process.argv;
const { opts, positional } = parseArgs(rest);
const optsWithDefaults = { ...DEFAULTS, ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined)) };
if (!cmd || opts.help) { console.log(HELP); process.exit(cmd ? 0 : 1); }
else if (cmd === 'start') { try { cmdStart(optsWithDefaults); } catch (e) { die(e.message); } }
else if (cmd === 'finish') { try { cmdFinish(optsWithDefaults); } catch (e) { die(e.message); } }
else if (cmd === 'report') { try { cmdReport(optsWithDefaults); } catch (e) { die(e.message); } }
else if (cmd === 'list') { try { cmdList(optsWithDefaults); } catch (e) { die(e.message); } }
else if (cmd === 'check-tasks') { try { cmdCheckTasks(optsWithDefaults); } catch (e) { die(e.message); } }
else die(`unknown command: ${cmd}\n${HELP}`);
