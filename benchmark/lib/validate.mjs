/**
 * S2 validator runner (spec §5.2, §10): spawn a task's validate.mjs against a workdir
 * and parse its { pass, checks[] } JSON. A crashing validator (non-zero, no JSON)
 * yields grade FAIL with a synthetic `validator-crash` check.
 */
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

export function runValidator(taskDir, workDir) {
  const script = join(taskDir, 'validate.mjs');
  const r = spawnSync(process.execPath, [script, workDir], { encoding: 'utf8' });
  let grade = null;
  try {
    const parsed = JSON.parse(r.stdout);
    if (typeof parsed?.pass === 'boolean' && Array.isArray(parsed?.checks)) grade = parsed;
  } catch { /* unparseable → crash path below */ }
  if (!grade) {
    const why = r.status !== null ? `exit ${r.status}` : `signal ${r.signal}`;
    return {
      pass: false,
      checks: [{ name: 'validator-crash', pass: false,
        detail: `validator did not emit {pass, checks} JSON (${why}): ${(r.stderr || r.stdout || '').trim().slice(0, 300)}` }],
    };
  }
  return grade;
}
