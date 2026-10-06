#!/usr/bin/env node
/**
 * Black-box fixture test for permission-gate.ts R1 (read coverage).
 *
 * Runs the real extension through a stubbed ExtensionAPI: replays synthetic
 * tool_call / tool_result / session_compact events and asserts block/pass.
 * Each case gets a fresh extension instance (gate state lives inside the
 * factory), so cases cannot leak coverage into each other.
 *
 * Preflight: the gate's bare import `@earendil-works/pi-coding-agent` is not
 * in this repo's node_modules (root package.json holds repo tooling only) —
 * symlink it to the global install under the gitignored root node_modules.
 * Resolves via `npm root -g`; no absolute paths committed.
 *
 * Run: node tests/permission-gate.test.mjs   (exit 0 = all pass)
 */
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkgLink = join(ROOT, 'node_modules', '@earendil-works', 'pi-coding-agent');
if (!existsSync(pkgLink)) {
  const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
  mkdirSync(dirname(pkgLink), { recursive: true });
  symlinkSync(join(globalRoot, '@earendil-works', 'pi-coding-agent'), pkgLink, 'dir');
}

const gate = await import('../extensions/permission-gate.ts');

// ---- stubbed ExtensionAPI + event replay ----

function makePi() {
  const handlers = new Map();
  return { handlers, on: (event, handler) => (handlers.set(event, handler), () => handlers.delete(event)) };
}
const freshGate = () => {
  const pi = makePi();
  gate.default(pi);
  return pi;
};

let seqId = 0;
const textBlocks = (s) => [{ type: 'text', text: s }];
const lineText = (n) => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n');

/** read via the gate; default result = untruncated full read of `n` lines */
async function read(pi, path, opts = {}, result = {}) {
  const n = result.outputLines ?? 100;
  const input = { path, ...opts };
  const toolCallId = `tc${++seqId}`;
  const block = await pi.handlers.get('tool_call')({ type: 'tool_call', toolName: 'read', toolCallId, input });
  if (block) return { blocked: true, reason: block.reason };
  const body = lineText(n);
  const tail = result.note ? `${body}\n\n[${result.note}]` : body;
  await pi.handlers.get('tool_result')({
    type: 'tool_result', toolName: 'read', toolCallId, input,
    content: result.image ? [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'x' } }] : textBlocks(tail),
    details: result.image || result.noDetails ? undefined : { truncation: { truncated: result.truncated ?? false, outputLines: n, totalLines: result.totalLines ?? n } },
    isError: false,
  });
  return { blocked: false };
}

async function edit(pi, path, edits) {
  const toolCallId = `tc${++seqId}`;
  const input = { path, edits };
  const block = await pi.handlers.get('tool_call')({ type: 'tool_call', toolName: 'edit', toolCallId, input });
  if (block) return { blocked: true, reason: block.reason };
  await pi.handlers.get('tool_result')({ type: 'tool_result', toolName: 'edit', toolCallId, input, content: textBlocks('ok'), isError: false });
  return { blocked: false };
}

async function bash(pi, command) {
  const block = await pi.handlers.get('tool_call')({ type: 'tool_call', toolName: 'bash', toolCallId: `tc${++seqId}`, input: { command } });
  return block ? { blocked: true } : { blocked: false };
}

/** R10: bash call + result replay — the re-run guard records on tool_result */
async function runBash(pi, command, { error = false } = {}) {
  const toolCallId = `tc${++seqId}`;
  const block = await pi.handlers.get('tool_call')({ type: 'tool_call', toolName: 'bash', toolCallId, input: { command } });
  if (block) return { blocked: true, reason: block.reason };
  await pi.handlers.get('tool_result')({ type: 'tool_result', toolName: 'bash', toolCallId, input: { command }, content: textBlocks('out'), isError: error });
  return { blocked: false };
}

const compact = (pi) => pi.handlers.get('session_compact')({ type: 'session_compact' });

// ---- fixtures ----

const tmp = mkdtempSync(join(tmpdir(), 'pgate-'));
const fileA = join(tmp, 'a.ts');
writeFileSync(fileA, 'a\nb\nc\n');
const relA = relative(process.cwd(), fileA); // same file via the other key form (Q3)

// ---- cases: [name, expectation, async fn -> {blocked}] ----

const cases = [
  ['identical window re-read is blocked', 'blocked', async (pi) => read(pi, fileA, { offset: 1, limit: 50 }, { outputLines: 50 })],
  ['continuation window (1-50 then 51-100) passes', 'pass', async (pi) => read(pi, fileA, { offset: 51, limit: 50 }, { outputLines: 50 })],
  ['windowed re-read inside a full read is blocked', 'blocked', async (pi) => read(pi, fileA, { offset: 10, limit: 20 })],
  ['full re-read after a full read is blocked', 'blocked', async (pi) => read(pi, fileA)],
  ['window past a truncated full read passes', 'pass', async (pi) => read(pi, fileA, { offset: 3000, limit: 100 }, { outputLines: 100 })],
  ['partial-overlap window passes (brings new lines)', 'pass', async (pi) => read(pi, fileA, { offset: 25, limit: 50 }, { outputLines: 50 })],
  ['full re-read after compaction passes', 'pass', async (pi) => { await compact(pi); return read(pi, fileA); }],
  ['window over just-edited span is blocked', 'blocked', async (pi) => read(pi, fileA, { offset: 2, limit: 1 }, { outputLines: 1 })],
  ['window outside just-edited span passes', 'pass', async (pi) => read(pi, fileA, { offset: 3, limit: 1 }, { outputLines: 1 })],
  ['full re-read after external on-disk change passes', 'pass', async (pi) => read(pi, fileA)],
  ['any window after an image read is blocked', 'blocked', async (pi) => read(pi, fileA, { offset: 5, limit: 5 }, { outputLines: 5 })],
  ['relative-path re-read of an absolute-read file is blocked', 'blocked', async (pi) => read(pi, relA, { offset: 1, limit: 3 }, { outputLines: 3 })],
  ['no-details fallback certifies exactly the content lines', 'pass', async (pi) => read(pi, fileA, { offset: 6, limit: 1 }, { outputLines: 1, noDetails: true })],
  // ---- R10: identical re-run guard ----
  ['identical bash re-run (no edit since) is blocked', 'blocked', async (pi) => bash(pi, 'gh run list --limit 3')],
  ['bash re-run after an intervening edit passes', 'pass', async (pi) => bash(pi, 'npx vitest run f.test.tsx 2>&1 | rg "Tests" | head -15')],
  ['re-run differing only in pipe cap is blocked', 'blocked', async (pi) => bash(pi, 'npx vitest run f.test.tsx 2>&1 | rg "Tests" | head -12')],
  ['re-run of a failed command passes', 'pass', async (pi) => bash(pi, 'gh run list --limit 3')],
  ['gh run watch re-run passes', 'pass', async (pi) => bash(pi, 'gh run watch 123 --exit-status')],
  ['bash re-run after compaction passes', 'pass', async (pi) => bash(pi, 'gh run list --limit 3')],
];

// ---- runner: each case replays its preamble on a fresh gate, then the probe ----

const preambles = {
  'identical window re-read is blocked': async () => { const pi = freshGate(); await read(pi, fileA, { offset: 1, limit: 50 }, { outputLines: 50 }); return pi; },
  'continuation window (1-50 then 51-100) passes': async () => { const pi = freshGate(); await read(pi, fileA, { offset: 1, limit: 50 }, { outputLines: 50 }); return pi; },
  'windowed re-read inside a full read is blocked': async () => { const pi = freshGate(); await read(pi, fileA, {}, { outputLines: 100, totalLines: 100 }); return pi; },
  'full re-read after a full read is blocked': async () => { const pi = freshGate(); await read(pi, fileA, {}, { outputLines: 100, totalLines: 100 }); return pi; },
  'window past a truncated full read passes': async () => { const pi = freshGate(); await read(pi, fileA, {}, { outputLines: 2000, totalLines: 5000, truncated: true }); return pi; },
  'partial-overlap window passes (brings new lines)': async () => { const pi = freshGate(); await read(pi, fileA, { offset: 1, limit: 50 }, { outputLines: 50 }); return pi; },
  'full re-read after compaction passes': async () => { const pi = freshGate(); await read(pi, fileA, {}, { outputLines: 100, totalLines: 100 }); await compact(pi); return pi; },
  'window over just-edited span is blocked': async () => {
    const pi = freshGate();
    const r = await edit(pi, fileA, [{ oldText: 'b', newText: 'x' }]);
    if (r.blocked) throw new Error(`preamble edit unexpectedly blocked: ${r.reason}`);
    return pi;
  },
  'window outside just-edited span passes': async () => {
    const pi = freshGate();
    const r = await edit(pi, fileA, [{ oldText: 'b', newText: 'x' }]);
    if (r.blocked) throw new Error(`preamble edit unexpectedly blocked: ${r.reason}`);
    return pi;
  },
  'full re-read after external on-disk change passes': async () => {
    // stat model (2026-10-06): a bash command's TEXT no longer resets coverage — an
    // actual on-disk change (mtime+size mismatch) does; appendFileSync stands in for
    // any external writer (codegen, another terminal, sed -i)
    const pi = freshGate();
    await read(pi, fileA, {}, { outputLines: 100, totalLines: 100 });
    appendFileSync(fileA, 'd\n');
    return pi;
  },
  'any window after an image read is blocked': async () => { const pi = freshGate(); await read(pi, fileA, {}, { image: true }); return pi; },
  'relative-path re-read of an absolute-read file is blocked': async () => { const pi = freshGate(); await read(pi, fileA, {}, { outputLines: 3, totalLines: 3 }); return pi; },
  // live tool_result events carry no details.truncation — the fallback must
  // count 5 content lines, not 6 (content + blank + note), so line 6 stays uncovered
  'no-details fallback certifies exactly the content lines': async () => {
    const pi = freshGate();
    await read(pi, fileA, { offset: 1, limit: 5 }, { outputLines: 5, noDetails: true, note: '1409 more lines in file. Use offset=6 to continue.' });
    return pi;
  },
  // ---- R10 preambles ----
  'identical bash re-run (no edit since) is blocked': async () => { const pi = freshGate(); await runBash(pi, 'gh run list --limit 3'); return pi; },
  'bash re-run after an intervening edit passes': async () => {
    const pi = freshGate();
    await runBash(pi, 'npx vitest run f.test.tsx 2>&1 | rg "Tests" | head -15');
    const r = await edit(pi, fileA, [{ oldText: 'b', newText: 'x' }]);
    if (r.blocked) throw new Error(`preamble edit unexpectedly blocked: ${r.reason}`);
    return pi;
  },
  're-run differing only in pipe cap is blocked': async () => { const pi = freshGate(); await runBash(pi, 'npx vitest run f.test.tsx 2>&1 | rg "Tests" | head -15'); return pi; },
  're-run of a failed command passes': async () => { const pi = freshGate(); await runBash(pi, 'gh run list --limit 3', { error: true }); return pi; },
  'gh run watch re-run passes': async () => { const pi = freshGate(); await runBash(pi, 'gh run watch 123 --exit-status'); return pi; },
  'bash re-run after compaction passes': async () => { const pi = freshGate(); await runBash(pi, 'gh run list --limit 3'); await compact(pi); return pi; },
};

let failed = 0;
for (const [name, expect, probe] of cases) {
  const pi = await preambles[name]();
  const got = await probe(pi);
  const ok = (expect === 'blocked') === got.blocked;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (expected ${expect}, got ${got.blocked ? 'blocked' : 'pass'})`);
}

console.log(failed === 0 ? `\n${cases.length}/${cases.length} PASS` : `\n${failed}/${cases.length} FAILED`);
process.exit(failed === 0 ? 0 : 1);
