// Ghostty terminal setup tests — node:test.
// Drives scripts/setup-ghostty.sh + scripts/pi-ghostty.sh against throwaway
// HOME/XDG trees with a stub `ghostty` (and, for macOS resolution, a stub
// `uname`). Deterministic via GHOSTTY_BIN / GHOSTTY_CONFIG overrides — no real
// Ghostty install is required and no user config is touched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const setupScript = join(repoRoot, 'scripts', 'setup-ghostty.sh');
const launchScript = join(repoRoot, 'scripts', 'pi-ghostty.sh');

const KEYBIND = 'keybind = alt+backspace=text:\\x1b\\x7f';
const LEGACY = 'keybind = shift+enter=text:\\n';

let seq = 0;
function sandbox() {
  const root = mkdtempSync(join(tmpdir(), `ghostty-${process.pid}-${seq++}-`));
  const home = join(root, 'home');
  const bin = join(home, 'bin');
  mkdirSync(bin, { recursive: true });
  const ghosttyBin = join(bin, 'ghostty');
  writeFileSync(ghosttyBin, '#!/bin/sh\necho "ghostty 1.2.3"\n');
  chmodSync(ghosttyBin, 0o755);
  const xdg = join(home, '.config');
  const env = {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: xdg,
    GHOSTTY_BIN: ghosttyBin,
    PATH: `${bin}:${process.env.PATH}`,
  };
  return { root, home, bin, ghosttyBin, xdg, env };
}

function runSetup(s, args = [], extraEnv = {}) {
  return spawnSync('sh', [setupScript, ...args], { encoding: 'utf8', env: { ...s.env, ...extraEnv } });
}

function runLaunch(s, args = [], extraEnv = {}) {
  return spawnSync('sh', [launchScript, ...args], { encoding: 'utf8', env: { ...s.env, ...extraEnv } });
}

function linuxConfig(s) {
  return join(s.xdg, 'ghostty', 'config.ghostty');
}

function backupsOf(file) {
  const dir = dirname(file);
  if (!existsSync(dir)) return [];
  const base = file.split('/').pop();
  return readdirSync(dir).filter((e) => e.startsWith(`${base}.bak.`));
}

// ---------- fresh setup ----------

test('fresh Linux setup creates config.ghostty with the Pi keybind', () => {
  const s = sandbox();
  try {
    const r = runSetup(s);
    assert.equal(r.status, 0, r.stderr);
    const file = linuxConfig(s);
    assert.ok(existsSync(file), 'config.ghostty not created');
    const body = readFileSync(file, 'utf8');
    assert.ok(body.includes(KEYBIND), body);
    assert.equal(backupsOf(file).length, 0, 'fresh create must not back up');
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test('second run is idempotent: byte-identical, reports already configured', () => {
  const s = sandbox();
  try {
    assert.equal(runSetup(s).status, 0);
    const file = linuxConfig(s);
    const first = readFileSync(file, 'utf8');
    const r2 = runSetup(s);
    assert.equal(r2.status, 0, r2.stderr);
    assert.equal(readFileSync(file, 'utf8'), first, 'file changed on second run');
    assert.equal(backupsOf(file).length, 0, 'idempotent run must not back up');
    assert.match(r2.stdout, /already|up to date|no change/i);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test('preserves unrelated settings and backs up before modifying', () => {
  const s = sandbox();
  try {
    const file = linuxConfig(s);
    mkdirSync(dirname(file), { recursive: true });
    const original = 'font-size = 14\ntheme = Adventure\n';
    writeFileSync(file, original);
    chmodSync(file, 0o640);
    const before = statSync(file).mode & 0o777;
    assert.equal(runSetup(s).status, 0);
    const body = readFileSync(file, 'utf8');
    assert.ok(body.includes('font-size = 14'), body);
    assert.ok(body.includes('theme = Adventure'), body);
    assert.ok(body.includes(KEYBIND), body);
    assert.equal(statSync(file).mode & 0o777, before, 'file mode must be preserved');
    const baks = backupsOf(file);
    assert.equal(baks.length, 1, 'expected exactly one backup');
    assert.equal(readFileSync(join(dirname(file), baks[0]), 'utf8'), original);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test('replaces a conflicting alt+backspace binding', () => {
  const s = sandbox();
  try {
    const file = linuxConfig(s);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, 'keybind = alt+backspace=text:\\x07\n');
    assert.equal(runSetup(s).status, 0);
    const body = readFileSync(file, 'utf8');
    assert.ok(body.includes(KEYBIND), body);
    assert.ok(!body.includes('\\x07'), body);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test('already-correct keybind without marker is left untouched (no backup)', () => {
  const s = sandbox();
  try {
    const file = linuxConfig(s);
    mkdirSync(dirname(file), { recursive: true });
    const original = `${KEYBIND}\n`;
    writeFileSync(file, original);
    assert.equal(runSetup(s).status, 0);
    assert.equal(readFileSync(file, 'utf8'), original);
    assert.equal(backupsOf(file).length, 0);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

// ---------- legacy mapping ----------

test('legacy shift+enter mapping warns but is preserved by default', () => {
  const s = sandbox();
  try {
    const file = linuxConfig(s);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${LEGACY}\n`);
    const r = runSetup(s);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout + r.stderr, /legacy|shift\+enter|shift\+enter=text/i);
    const body = readFileSync(file, 'utf8');
    assert.ok(body.includes(LEGACY), 'legacy mapping should survive by default');
    assert.ok(body.includes(KEYBIND), 'keybind still added');
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test('--remove-legacy removes the mapping', () => {
  const s = sandbox();
  try {
    const file = linuxConfig(s);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${LEGACY}\nfont-size = 12\n`);
    const r = runSetup(s, ['--remove-legacy']);
    assert.equal(r.status, 0, r.stderr);
    const body = readFileSync(file, 'utf8');
    assert.ok(!body.includes(LEGACY), body);
    assert.ok(body.includes('font-size = 12'), body);
    assert.ok(body.includes(KEYBIND), body);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

// ---------- shell integration ----------

test('shell-integration = none warns and is not changed', () => {
  const s = sandbox();
  try {
    const file = linuxConfig(s);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, 'shell-integration = none\n');
    const r = runSetup(s);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout + r.stderr, /shell.integration/i);
    const body = readFileSync(file, 'utf8');
    assert.ok(body.includes('shell-integration = none'), body);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

// ---------- platform path resolution ----------

test('macOS setup targets the Application Support config.ghostty', () => {
  const s = sandbox();
  try {
    writeFileSync(join(s.bin, 'uname'), '#!/bin/sh\necho Darwin\n');
    chmodSync(join(s.bin, 'uname'), 0o755);
    assert.equal(runSetup(s).status, 0);
    const file = join(s.home, 'Library', 'Application Support', 'com.mitchellh.ghostty', 'config.ghostty');
    assert.ok(existsSync(file), `expected ${file}`);
    assert.ok(readFileSync(file, 'utf8').includes(KEYBIND));
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test('legacy config file is reused instead of creating config.ghostty', () => {
  const s = sandbox();
  try {
    const legacyFile = join(s.xdg, 'ghostty', 'config');
    mkdirSync(dirname(legacyFile), { recursive: true });
    writeFileSync(legacyFile, 'font-size = 15\n');
    assert.equal(runSetup(s).status, 0);
    assert.ok(readFileSync(legacyFile, 'utf8').includes(KEYBIND));
    assert.ok(!existsSync(linuxConfig(s)), 'must not create a second config file');
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test('GHOSTTY_CONFIG override wins over platform paths', () => {
  const s = sandbox();
  try {
    const explicit = join(s.root, 'custom-ghostty-config');
    assert.equal(runSetup(s, [], { GHOSTTY_CONFIG: explicit }).status, 0);
    assert.ok(existsSync(explicit));
    assert.ok(readFileSync(explicit, 'utf8').includes(KEYBIND));
    assert.ok(!existsSync(linuxConfig(s)));
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

// ---------- check / dry-run ----------

test('--check exits 1 when unconfigured and 0 once configured', () => {
  const s = sandbox();
  try {
    const r1 = runSetup(s, ['--check']);
    assert.equal(r1.status, 1, r1.stdout + r1.stderr);
    assert.ok(!existsSync(linuxConfig(s)), '--check must not write');
    assert.equal(runSetup(s).status, 0);
    const r2 = runSetup(s, ['--check']);
    assert.equal(r2.status, 0, r2.stdout + r2.stderr);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test('--dry-run writes nothing but reports the planned change', () => {
  const s = sandbox();
  try {
    const r = runSetup(s, ['--dry-run']);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!existsSync(linuxConfig(s)), '--dry-run must not create the file');
    assert.match(r.stdout, /dry.run|would/i);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

// ---------- Ghostty absent ----------

test('absent Ghostty is explained and config is still written', () => {
  const s = sandbox();
  try {
    const r = runSetup(s, [], { GHOSTTY_BIN: join(s.bin, 'nope') });
    assert.equal(r.status, 0, r.stderr);
    const out = r.stdout + r.stderr;
    assert.match(out, /ghostty/i);
    assert.match(out, /not found|install/i);
    assert.match(out, /ghostty\.org/);
    assert.ok(existsSync(linuxConfig(s)), 'config still written');
    const c = runSetup(s, ['--check'], { GHOSTTY_BIN: join(s.bin, 'nope') });
    assert.equal(c.status, 1, '--check fails when Ghostty is absent');
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

// ---------- launcher ----------

test('launcher (no TTY, Ghostty present) hands off to Ghostty -e pi', () => {
  const s = sandbox();
  try {
    const argsFile = join(s.root, 'args.txt');
    const fakeGhostty = join(s.bin, 'ghostty');
    writeFileSync(fakeGhostty, '#!/bin/sh\nprintf "%s\\n" "$@" > "$GHOSTTY_ARGS_FILE"\n');
    chmodSync(fakeGhostty, 0o755);
    const r = runLaunch(s, ['--model', 'glm-5.3'], { GHOSTTY_ARGS_FILE: argsFile });
    assert.equal(r.status, 0, r.stderr);
    const args = readFileSync(argsFile, 'utf8').trim().split('\n');
    assert.ok(args.includes('-e'), args.join(' '));
    assert.ok(args.includes('pi'), args.join(' '));
    assert.ok(args.includes('--working-directory=' + process.cwd()), args.join(' '));
    assert.ok(args.includes('--model') && args.includes('glm-5.3'), args.join(' '));
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test('launcher without Ghostty explains and exits 1', () => {
  const s = sandbox();
  try {
    const r = runLaunch(s, [], { GHOSTTY_BIN: join(s.bin, 'nope') });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /ghostty/i);
    assert.match(r.stderr, /not found|install/i);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test('launcher --help works without Ghostty', () => {
  const s = sandbox();
  try {
    const r = runLaunch(s, ['--help'], { GHOSTTY_BIN: join(s.bin, 'nope') });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /usage/i);
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});

test('launcher (TTY attached) runs pi in place, never opens Ghostty', (t) => {
  if (process.platform !== 'linux') return t.skip('PTY assertion uses util-linux script');
  if (spawnSync('script', ['--version']).status !== 0) return t.skip('util-linux script not available');
  const s = sandbox();
  try {
    const piArgs = join(s.root, 'pi-args.txt');
    const ghosttyArgs = join(s.root, 'ghostty-args.txt');
    writeFileSync(join(s.bin, 'pi'), '#!/bin/sh\nprintf "%s\\n" "$@" > "$PI_ARGS_FILE"\n');
    chmodSync(join(s.bin, 'pi'), 0o755);
    writeFileSync(join(s.bin, 'ghostty'), '#!/bin/sh\nprintf "%s\\n" "$@" > "$GHOSTTY_ARGS_FILE"\n');
    chmodSync(join(s.bin, 'ghostty'), 0o755);
    const r = spawnSync('script', ['-qec', `sh "${launchScript}" --model glm-5.3`, '/dev/null'], {
      encoding: 'utf8',
      env: { ...s.env, PI_ARGS_FILE: piArgs, GHOSTTY_ARGS_FILE: ghosttyArgs },
    });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(existsSync(piArgs), 'pi should have run in place');
    assert.match(readFileSync(piArgs, 'utf8'), /glm-5\.3/, 'args forwarded to pi');
    assert.ok(!existsSync(ghosttyArgs), 'must not open a Ghostty window when a TTY is attached');
  } finally { rmSync(s.root, { recursive: true, force: true }); }
});
