/**
 * S2 workdir preparation (spec §7.1): copy fixture → runs/<runId>/work,
 * `git init` + initial commit inside the copy (enables tests-unmodified checks).
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

/** `<UTC-timestamp>-<task-slug>` (spec §8), e.g. 20261015T101530-bugfix-t1. */
export function newRunId(taskId) {
  const ts = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '');
  return `${ts}-${taskId.replace(/\//g, '-')}`;
}

const GIT_ID = ['-c', 'user.email=bench@local', '-c', 'user.name=benchmark'];

function git(cwd, args) {
  const r = spawnSync('git', ['-C', cwd, ...GIT_ID, ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${(r.stderr || r.stdout).trim()}`);
  return r;
}

/**
 * Copy `<taskDir>/fixture/` → `<runsRoot>/<runId>/work`, git-init + initial commit.
 * Returns { runId, runDir, workDir }. Throws with a descriptive message on failure;
 * a partial runs/<runId>/ dir may be left behind for inspection (spec §10).
 */
export function prepareWorkdir(taskDir, runsRoot) {
  const fixtureDir = join(taskDir, 'fixture');
  if (!existsSync(fixtureDir)) throw new Error(`fixture directory not found: ${fixtureDir}`);
  let task;
  try { task = JSON.parse(readFileSync(join(taskDir, 'task.json'), 'utf8')); } catch (e) {
    throw new Error(`task.json unreadable in ${taskDir}: ${e.message}`);
  }
  let runId = newRunId(task.id);
  let runDir = join(runsRoot, runId);
  for (let n = 2; existsSync(runDir); n++) { // same-second collision → unique suffix
    runId = `${newRunId(task.id)}-${n}`;
    runDir = join(runsRoot, runId);
  }
  const workDir = join(runDir, 'work');
  mkdirSync(workDir, { recursive: true });
  try {
    cpSync(fixtureDir, workDir, { recursive: true });
    git(workDir, ['init', '-q']);
    git(workDir, ['add', '-A']);
    git(workDir, ['commit', '-qm', 'chore(bench): pristine fixture']);
  } catch (e) {
    throw new Error(`workdir preparation failed for ${runId}: ${e.message}`);
  }
  return { runId, runDir, workDir };
}
