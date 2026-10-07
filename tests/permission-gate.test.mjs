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
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkgLink = join(ROOT, 'node_modules', '@earendil-works', 'pi-coding-agent');
if (!existsSync(join(pkgLink, 'package.json'))) {
  rmSync(pkgLink, { recursive: true, force: true }); // stale empty dir / broken link must not pass
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
  return block ? { blocked: true, reason: block.reason } : { blocked: false };
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
const skillFile = join(tmp, 'SKILL.md'); // 2026-10-06 feedback: R1 coverage must close same-session skill re-reads
writeFileSync(skillFile, Array.from({ length: 30 }, (_, i) => `skill line ${i + 1}`).join('\n') + '\n');
const fileC = join(tmp, 'hydrate-c.ts'); // 2026-10-07: resume-hydration fixtures
writeFileSync(fileC, 'l1\nl2\nl3\n');
const fileD = join(tmp, 'hydrate-d.ts');
writeFileSync(fileD, 'l1\nl2\n');
const fileE = join(tmp, 'hydrate-e.ts');
writeFileSync(fileE, 'l1\nl2\nl3\n');
/** build fake previous-session branch entries for the hydration fixtures */
function prevBranch(descs) {
  return descs.map((d) =>
    d.compactionAfter
      ? { type: 'compaction', id: d.id, firstKeptEntryId: d.compactionAfter }
      : d.call
        ? { type: 'message', id: d.id, message: { role: 'assistant', content: [{ type: 'toolCall', id: d.callId, name: d.call, arguments: d.call === 'write' ? { path: d.path, content: 'x' } : { path: d.path } }] } }
        : { type: 'message', id: d.id, message: { role: 'toolResult', toolCallId: d.resultFor, toolName: d.tool ?? 'read', content: [{ type: 'text', text: d.text }], isError: false } },
  );
}
const hydrate = (pi, descs) => pi.handlers.get('session_start')({ type: 'session_start', reason: 'resume' }, { sessionManager: { getBranch: () => prevBranch(descs) } });
const fileB = join(tmp, 'dup.ts'); // duplicate line for the anchor-uniqueness case
writeFileSync(fileB, 'x\nx\n');
// violation-memory isolation: never touch the real ~/.pi/agent/logs telemetry
process.env.PGATE_MEMORY = join(tmp, 'vmem.ndjson');
writeFileSync(process.env.PGATE_MEMORY, '');

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
  // ---- R10 quote-aware base (2026-10-06: a quoted '|' must not truncate the base) ----
  ['quoted pattern pipes do not collide R10 bases', 'pass', async (pi) => bash(pi, "rg -o '(Alpha|Gamma)' data.log | head -5")],
  ['identical quoted-pattern command still blocked', 'blocked', async (pi) => bash(pi, "rg -o '(Alpha|Beta)' data.log | head -5")],
  // ---- unquoted backslash escapes (2026-10-07: 'foo\|bar' / '1p\;5p' split the same as the quoted bugs) ----
  ['escaped-pipe bases do not collide R10', 'pass', async (pi) => bash(pi, 'rg -o foo\\|bar data.log | head -5')],
  ['identical escaped-pipe command still blocked', 'blocked', async (pi) => bash(pi, 'rg -o foo\\|bar data.log | head -5')],
  ['escaped semicolon keeps sed batch intact', 'pass', async (pi) => bash(pi, 'sed -n 1p\\;5p notes.md')],
  // ---- skill re-read (2026-10-06 feedback item — R1 coverage closes it) ----
  ['full SKILL.md re-read same session is blocked', 'blocked', async (pi) => read(pi, skillFile, {}, { outputLines: 30, totalLines: 30 })],
  ['SKILL.md re-read after compaction passes', 'pass', async (pi) => read(pi, skillFile, {}, { outputLines: 30, totalLines: 30 })],
  // ---- violation memory (before_agent_start injection — 2026-10-06) ----
  ['violation memory: block appends ndjson family count', 'blocked', async (pi) => {
    const r = await bash(pi, 'cat package.json');
    const lines = readFileSync(process.env.PGATE_MEMORY, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const n = lines.filter((e) => e.family === 'Token Economy (Reading)').reduce((s, e) => s + (e.n ?? 0), 0);
    if (n !== 1) {
      console.log(`      expected count 1, ndjson has ${JSON.stringify(lines)}`);
      return { blocked: false };
    }
    return r;
  }],
  ['violation memory: before_agent_start injects top-3 lessons at threshold', 'pass', async (pi) => {
    const ev = { type: 'before_agent_start', prompt: '', systemPrompt: '', systemPromptOptions: { appendSystemPrompt: '' } };
    pi.handlers.get('before_agent_start')(ev);
    const s = ev.systemPromptOptions.appendSystemPrompt;
    const want = ['<violation-memory>', 'read tool', 'Never re-run', 'conventional']; // Reading 6, Re-run 7, Commitlint 9
    const ok = want.every((w) => s.includes(w)) && !s.includes('rg -o'); // Extraction (5) is 4th — dropped by top-3
    if (!ok) { console.log(`      injected: ${JSON.stringify(s)}`); return { blocked: true }; }
    return { blocked: false };
  }],
  ['violation memory: injection happens once per session', 'pass', async (pi) => {
    const ev = () => ({ type: 'before_agent_start', prompt: '', systemPrompt: '', systemPromptOptions: { appendSystemPrompt: '' } });
    const a = ev();
    pi.handlers.get('before_agent_start')(a);
    pi.handlers.get('before_agent_start')(a);
    const n = (a.systemPromptOptions.appendSystemPrompt.match(/<violation-memory>/g) ?? []).length;
    return n === 1 ? { blocked: false } : { blocked: true };
  }],
  ['violation memory: injection tolerates undefined appendSystemPrompt', 'pass', async (pi) => {
    const ev = { type: 'before_agent_start', prompt: '', systemPrompt: '', systemPromptOptions: {} };
    pi.handlers.get('before_agent_start')(ev);
    const s = ev.systemPromptOptions.appendSystemPrompt ?? '';
    return typeof s === 'string' && s.startsWith('<violation-memory>') ? { blocked: false } : { blocked: true };
  }],
  // ---- R1 resume hydration (2026-10-07: coverage replays from the previous session file) ----
  ['resume hydration: prior full read blocks re-read window', 'blocked', async (pi) => {
    await hydrate(pi, [
      { id: 'e1', call: 'read', callId: 'c1', path: fileC },
      { id: 'e2', resultFor: 'c1', text: 'l1\nl2\nl3\n' },
    ]);
    return read(pi, fileC, { offset: 1, limit: 2 }, { outputLines: 2 });
  }],
  ['resume hydration: changed-on-disk file re-read passes', 'pass', async (pi) => {
    await hydrate(pi, [
      { id: 'e1', call: 'read', callId: 'c1', path: fileC },
      { id: 'e2', resultFor: 'c1', text: 'l1\nl2\nl3\n' },
    ]);
    writeFileSync(fileC, 'CHANGED\nl2\nl3\nl4\n'); // stat must mismatch the certified snapshot
    return read(pi, fileC, { offset: 1, limit: 2 }, { outputLines: 2 });
  }],
  ['resume hydration: pre-compaction reads stay legitimate', 'pass', async (pi) => {
    await hydrate(pi, [
      { id: 'e1', call: 'read', callId: 'c1', path: fileD },
      { id: 'e2', resultFor: 'c1', text: 'l1\nl2\n' },
      { id: 'e3', compactionAfter: 'e4' },
      { id: 'e4', call: 'read', callId: 'c2', path: fileC },
      { id: 'e5', resultFor: 'c2', text: 'l1\nl2\nl3\n' },
    ]);
    return read(pi, fileD, { offset: 1, limit: 2 }, { outputLines: 2 });
  }],
  ['resume hydration: prior write certifies the whole file', 'blocked', async (pi) => {
    await hydrate(pi, [
      { id: 'e1', call: 'write', callId: 'c1', path: fileE },
      { id: 'e2', resultFor: 'c1', text: 'ok', tool: 'write' },
    ]);
    return read(pi, fileE, { offset: 1, limit: 2 }, { outputLines: 2 });
  }],
  ['resume hydration: re-start with an empty branch drops prior coverage', 'pass', async (pi) => {
    await hydrate(pi, [
      { id: 'e1', call: 'read', callId: 'c1', path: fileC },
      { id: 'e2', resultFor: 'c1', text: 'l1\nl2\nl3\n' },
    ]);
    await pi.handlers.get('session_start')({ type: 'session_start', reason: 'new' }, { sessionManager: { getBranch: () => [] } }); // in-process switch to a fresh session
    return read(pi, fileC, { offset: 1, limit: 2 }, { outputLines: 2 });
  }],
  // ---- Anchor Guard (existence / uniqueness / overlap) ----
  ['anchor not found is blocked', 'blocked', async (pi) => edit(pi, fileA, [{ oldText: 'zzz', newText: 'y' }])],
  ['non-unique anchor is blocked with line numbers', 'blocked', async (pi) => edit(pi, fileB, [{ oldText: 'x', newText: 'y' }])],
  ['intra-call overlapping anchors are blocked', 'blocked', async (pi) => edit(pi, fileA, [{ oldText: 'a\nb', newText: 'q' }, { oldText: 'b\nc', newText: 'r' }])],
  // ---- R2 cat/sed viewing ----
  ['standalone cat viewing is blocked', 'blocked', async (pi) => bash(pi, 'cat package.json')],
  ['sed -n batching 2+ regions passes', 'pass', async (pi) => bash(pi, "sed -n '1p;5p' notes.md")],
  // ---- R5 git log caps ----
  ['uncapped git log is blocked', 'blocked', async (pi) => bash(pi, 'git log')],
  ['git log --oneline -n passes', 'pass', async (pi) => bash(pi, 'git log --oneline -n 5')],
  // ---- R6 rg -o caps ----
  ['uncapped rg -o is blocked', 'blocked', async (pi) => bash(pi, "rg -o 'pattern' src/")],
  ['capped rg -o passes', 'pass', async (pi) => bash(pi, "rg -o 'pattern' src/ | head -20")],
  // ---- R7 recursive walks ----
  ['ls -R is blocked', 'blocked', async (pi) => bash(pi, 'ls -R src')],
  ['plain ls passes', 'pass', async (pi) => bash(pi, 'ls src')],
  // ---- R8 git hook caps ----
  ['uncapped git commit is blocked (hooks)', 'blocked', async (pi) => bash(pi, 'git commit -m "fix: cap output"')],
  ['capped git commit passes', 'pass', async (pi) => bash(pi, 'git commit -m "fix: cap output" 2>&1 | tail -20')],
  // ---- R9 commitlint ----
  ['non-conventional commit message is blocked', 'blocked', async (pi) => bash(pi, 'git commit -m "Fix the thing"')],
  ['conventional capped commit passes', 'pass', async (pi) => bash(pi, 'git commit -m "fix: cap git log output" 2>&1 | tail -20')],
  // ---- runner caps ----
  ['uncapped npm test is blocked', 'blocked', async (pi) => bash(pi, 'npm test')],
  ['capped npm test passes', 'pass', async (pi) => bash(pi, 'npm test 2>&1 | tail -5')],
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
  'quoted pattern pipes do not collide R10 bases': async () => { const pi = freshGate(); await runBash(pi, "rg -o '(Alpha|Beta)' data.log | head -5"); return pi; },
  'identical quoted-pattern command still blocked': async () => { const pi = freshGate(); await runBash(pi, "rg -o '(Alpha|Beta)' data.log | head -5"); return pi; },
  'escaped-pipe bases do not collide R10': async () => { const pi = freshGate(); await runBash(pi, 'rg -o foo\\|qux data.log | head -5'); return pi; },
  'identical escaped-pipe command still blocked': async () => { const pi = freshGate(); await runBash(pi, 'rg -o foo\\|bar data.log | head -5'); return pi; },
  'full SKILL.md re-read same session is blocked': async () => { const pi = freshGate(); await read(pi, skillFile, {}, { outputLines: 30, totalLines: 30 }); return pi; },
  'SKILL.md re-read after compaction passes': async () => { const pi = freshGate(); await read(pi, skillFile, {}, { outputLines: 30, totalLines: 30 }); await compact(pi); return pi; },
  'violation memory: block appends ndjson family count': async () => { writeFileSync(process.env.PGATE_MEMORY, ''); return freshGate(); },
  'violation memory: before_agent_start injects top-3 lessons at threshold': async () => {
    writeFileSync(process.env.PGATE_MEMORY, [
      { family: 'Token Economy (Reading)', n: 6 },
      { family: 'Token Economy (Re-run)', n: 7 },
      { family: 'Token Economy (Extraction)', n: 5 },
      { family: 'Commitlint', n: 9 },
    ].map((e) => JSON.stringify(e)).join('\n') + '\n');
    return freshGate();
  },
  'violation memory: injection happens once per session': async () => {
    writeFileSync(process.env.PGATE_MEMORY, JSON.stringify({ family: 'Token Economy (Reading)', n: 9 }) + '\n');
    return freshGate();
  },
  'violation memory: injection tolerates undefined appendSystemPrompt': async () => {
    writeFileSync(process.env.PGATE_MEMORY, JSON.stringify({ family: 'Token Economy (Reading)', n: 9 }) + '\n');
    return freshGate();
  },
};

let failed = 0;
for (const [name, expect, probe] of cases) {
  const pi = await (preambles[name] ?? (() => freshGate()))();
  const got = await probe(pi);
  const ok = (expect === 'blocked') === got.blocked;
  if (!ok) failed++;
  if (got.blocked && got.reason) {
    // 2026-10-06 diet: prose reasons <= 220c; Anchor Guard may carry a <= 800c snippet
    const cap = got.reason.startsWith('Anchor Guard') ? 800 : 220;
    if (got.reason.length > cap) {
      failed++;
      console.log(`FAIL  ${name}  (block reason ${got.reason.length}c exceeds ${cap}c diet cap)`);
    }
  }
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (expected ${expect}, got ${got.blocked ? 'blocked' : 'pass'})`);
}

console.log(failed === 0 ? `\n${cases.length}/${cases.length} PASS` : `\n${failed}/${cases.length} FAILED`);
process.exit(failed === 0 ? 0 : 1);
