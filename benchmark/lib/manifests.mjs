/**
 * S2 task/arm manifest loading + validation (spec §5.1, §6).
 * Zero-dependency; throws descriptive Errors on invalid input.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const TASK_CLASSES = ['bugfix', 'feature', 'refactor', 'test-repair'];
const ID_RE = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/;

/** arms.json → validated array. Enforces exactly one baseline arm (spec §6). */
export function loadArms(path) {
  if (!existsSync(path)) throw new Error(`arms manifest not found: ${path}`);
  let arms;
  try { arms = JSON.parse(readFileSync(path, 'utf8')); } catch (e) { throw new Error(`arms manifest unreadable: ${e.message}`); }
  if (!Array.isArray(arms) || arms.length === 0) throw new Error('arms manifest must be a non-empty array');
  const seen = new Set();
  for (const a of arms) {
    for (const k of ['name', 'description', 'config']) {
      if (typeof a?.[k] !== 'string' || !a[k]) throw new Error(`arm entry missing string ${k}`);
    }
    if (seen.has(a.name)) throw new Error(`duplicate arm name: ${a.name}`);
    seen.add(a.name);
  }
  const baselines = arms.filter((a) => a.baseline === true).length;
  if (baselines !== 1) throw new Error(`arms manifest must declare exactly one baseline:true arm (got ${baselines})`);
  return arms;
}

/** Lookup by name; throws `unknown arm: <name>`. */
export function getArm(arms, name) {
  const a = arms.find((x) => x.name === name);
  if (!a) throw new Error(`unknown arm: ${name}`);
  return a;
}

/** Walk <tasksRoot>/<class>/<id>/task.json → sorted validated entries (spec §5.1). */
export function discoverTasks(tasksRoot) {
  if (!existsSync(tasksRoot)) return [];
  const tasks = [];
  for (const cls of readdirSync(tasksRoot)) {
    if (!TASK_CLASSES.includes(cls)) continue;
    const clsDir = join(tasksRoot, cls);
    for (const id of readdirSync(clsDir)) {
      const dir = join(clsDir, id);
      const tj = join(dir, 'task.json');
      if (!statSync(dir).isDirectory() || !existsSync(tj)) continue;
      let t;
      try { t = JSON.parse(readFileSync(tj, 'utf8')); } catch (e) { throw new Error(`${tj}: ${e.message}`); }
      if (t.id !== `${cls}/${id}`) throw new Error(`${tj}: id mismatch (want "${cls}/${id}", got "${t.id ?? 'none'}")`);
      if (t.class !== cls) throw new Error(`${tj}: class mismatch (want "${cls}", got "${t.class ?? 'none'}")`);
      if (typeof t.title !== 'string' || !t.title) throw new Error(`${tj}: missing title`);
      if (typeof t.prompt !== 'string' || !t.prompt) throw new Error(`${tj}: missing prompt`);
      tasks.push({ id: t.id, class: t.class, title: t.title, prompt: t.prompt, dir });
    }
  }
  return tasks.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Lookup by `<class>/<id>`; throws on unknown or malformed id. */
export function getTask(tasksRoot, id) {
  if (typeof id !== 'string' || !ID_RE.test(id)) throw new Error(`invalid task id: ${id}`);
  const t = discoverTasks(tasksRoot).find((x) => x.id === id);
  if (!t) throw new Error(`unknown task: ${id}`);
  return t;
}
