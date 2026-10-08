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

// composing stub: one extension may register several handlers per event
// (H1 cap + bookkeeping both listen on tool_result) — invoke() runs them in
// registration order; a non-undefined return composes forward
function makePi() {
  const lists = new Map();
  return {
    on: (event, handler) => {
      const l = lists.get(event) ?? [];
      l.push(handler);
      lists.set(event, l);
      return () => lists.set(event, (lists.get(event) ?? []).filter((h) => h !== handler));
    },
    invoke: async (event, ev, ctx) => {
      let result;
      for (const h of lists.get(event) ?? []) {
        const r = await h(ev, ctx);
        if (r !== undefined) result = r;
      }
      return result;
    },
  };
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
  const block = await pi.invoke('tool_call', { type: 'tool_call', toolName: 'read', toolCallId, input });
  if (block) return { blocked: true, reason: block.reason };
  const body = lineText(n);
  const tail = result.note ? `${body}\n\n[${result.note}]` : body;
  await pi.invoke('tool_result', {
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
  const block = await pi.invoke('tool_call', { type: 'tool_call', toolName: 'edit', toolCallId, input });
  if (block) return { blocked: true, reason: block.reason };
  await pi.invoke('tool_result', { type: 'tool_result', toolName: 'edit', toolCallId, input, content: textBlocks('ok'), isError: false });
  return { blocked: false };
}

async function bash(pi, command, ctx = { hasUI: true, mode: 'tui', ui: { confirm: async () => true } }) {
  const block = await pi.invoke('tool_call', { type: 'tool_call', toolName: 'bash', toolCallId: `tc${++seqId}`, input: { command } }, ctx);
  return block ? { blocked: true, reason: block.reason } : { blocked: false };
}

/** R10: bash call + result replay — the re-run guard records on tool_result */
async function runBash(pi, command, { error = false } = {}) {
  const toolCallId = `tc${++seqId}`;
  const block = await pi.invoke('tool_call', { type: 'tool_call', toolName: 'bash', toolCallId, input: { command } });
  if (block) return { blocked: true, reason: block.reason };
  await pi.invoke('tool_result', { type: 'tool_result', toolName: 'bash', toolCallId, input: { command }, content: textBlocks('out'), isError: error });
  return { blocked: false };
}

const compact = (pi) => pi.invoke('session_compact', { type: 'session_compact' });

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
const hydrate = (pi, descs) => pi.invoke('session_start', { type: 'session_start', reason: 'resume' }, { sessionManager: { getBranch: () => prevBranch(descs) } });
const fileB = join(tmp, 'dup.ts'); // duplicate line for the anchor-uniqueness case
writeFileSync(fileB, 'x\nx\n');
const tinyFile = join(tmp, 'tiny.json'); // 2026-10-08: R2 trivial-cat batch exemption (audit: 49 B watermark case)
writeFileSync(tinyFile, '{ "auditedThrough": "2026-10-07" }\n'); // 34 B
const bigFile = join(tmp, 'big.json');
writeFileSync(bigFile, `${'x'.repeat(199)}\n`); // 200 B — over the 128 B exemption
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
  // ---- B3/H9 (2026-10-08): true post-edit spans via position-sorted overlay math ----
  ['B3: out-of-order edits certify true post-edit lines', 'pass', async (pi) => {
    const f = join(tmp, 'b3.ts');
    writeFileSync(f, Array.from({ length: 12 }, (_, i) => `L${i + 1}`).join('\n') + '\n');
    // edit[0] touches line 8-9 (2→1 lines); edit[1] touches line 2 (1→3 lines)
    const r = await edit(pi, f, [
      { oldText: 'L8\nL9', newText: 'M8' },
      { oldText: 'L2', newText: 'N2a\nN2b\nN2c' },
    ]);
    if (r.blocked) return { blocked: true, reason: r.reason };
    // true post-edit layout: N2a..N2c = lines 2-4; M8 = line 10
    const re24 = await read(pi, f, { offset: 2, limit: 3 }, { outputLines: 3 });
    if (!re24.blocked) return { blocked: true, reason: 'B3: true post-edit lines 2-4 not certified' };
    const re10 = await read(pi, f, { offset: 10, limit: 1 }, { outputLines: 1 });
    if (!re10.blocked) return { blocked: true, reason: 'B3: shifted M8 line not certified at 10' };
    return { blocked: false };
  }],
  ['B4: re-read below a line-count-changing edit is allowed', 'pass', async (pi) => {
    const f = join(tmp, 'b4.ts');
    writeFileSync(f, Array.from({ length: 30 }, (_, i) => `L${i + 1}`).join('\n') + '\n');
    await read(pi, f, {}, { outputLines: 30, totalLines: 30 }); // certify 1-30
    const r = await edit(pi, f, [{ oldText: 'L5', newText: 'X\nY\nZ' }]); // +2 lines at line 5
    if (r.blocked) return { blocked: true, reason: r.reason };
    return read(pi, f, { offset: 20, limit: 3 }, { outputLines: 3 }); // shifted content: must allow
  }],
  ['full re-read after external on-disk change passes', 'pass', async (pi) => read(pi, fileA)],
  ['any window after an image read is blocked', 'blocked', async (pi) => read(pi, fileA, { offset: 5, limit: 5 }, { outputLines: 5 })],
  ['relative-path re-read of an absolute-read file is blocked', 'blocked', async (pi) => read(pi, relA, { offset: 1, limit: 3 }, { outputLines: 3 })],
  ['no-details fallback certifies exactly the content lines', 'pass', async (pi) => read(pi, fileA, { offset: 6, limit: 1 }, { outputLines: 1, noDetails: true })],
  // ---- R10: identical re-run guard ----
  ['identical bash re-run (no edit since) is blocked', 'blocked', async (pi) => bash(pi, 'gh run list --limit 3')],
  ['bash re-run after an intervening edit passes', 'pass', async (pi) => bash(pi, 'npx vitest run f.test.tsx 2>&1 | rg "Tests" | head -15')],
  ['re-run with a different pipe cap passes', 'pass', async (pi) => bash(pi, 'npx vitest run f.test.tsx 2>&1 | rg "Tests" | head -12')], // 2026-10-07: full-command keying — a changed filter is a legitimate re-view, not a dup
  ['whitespace-only variation still blocked', 'blocked', async (pi) => bash(pi, 'gh  run list --limit 3')],
  ['shared nvm preamble does not collide R10 keys', 'pass', async (pi) => bash(pi, 'source ~/.nvm/nvm.sh && nvm use 22.17.0 >/dev/null 2>&1 && pnpm run check-types 2>&1 | tail -5')],
  ['identical compound with watcher word is exempt', 'pass', async (pi) => bash(pi, 'sleep 1; rm -f /tmp/x')],
  ['re-run of a failed command passes', 'pass', async (pi) => bash(pi, 'gh run list --limit 3')],
  ['gh run watch re-run passes', 'pass', async (pi) => bash(pi, 'gh run watch 123 --exit-status')],
  ['bash re-run after compaction passes', 'pass', async (pi) => bash(pi, 'gh run list --limit 3')],
  // ---- B20/H5 (2026-10-08): mutating bash commands legitimize verify re-runs ----
  ['re-run after git pull is legitimate (B20/H5)', 'pass', async (pi) => {
    await runBash(pi, 'npm test 2>&1 | tail -5');
    await runBash(pi, 'git pull');
    return bash(pi, 'npm test 2>&1 | tail -5');
  }],
  ['re-run after a non-mutating command still blocks', 'blocked', async (pi) => {
    await runBash(pi, 'gh run list --limit 3');
    await runBash(pi, 'git status');
    return bash(pi, 'gh run list --limit 3');
  }],
  ['failed mutating command does not legitimize re-run', 'blocked', async (pi) => {
    await runBash(pi, 'gh run list --limit 3');
    await runBash(pi, 'git pull', { error: true });
    return bash(pi, 'gh run list --limit 3');
  }],
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
  ['violation memory: block appends ndjson family entry', 'blocked', async (pi) => {
    const r = await bash(pi, 'git commit -m "Fix the thing"'); // Commitlint family — git reads retired with R5 (H1 step 5)
    const lines = readFileSync(process.env.PGATE_MEMORY, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const ok = lines.length === 1 && lines[0].family === 'Commitlint' && typeof lines[0].sid === 'string' && lines[0].sid.length > 0;
    if (!ok) {
      console.log(`      expected one {family,sid,ts} entry, ndjson has ${JSON.stringify(lines)}`);
      return { blocked: false };
    }
    return r;
  }],
  ['violation memory: before_agent_start injects top-3 lessons at threshold', 'pass', async (pi) => {
    const ev = { type: 'before_agent_start', prompt: '', systemPrompt: '', systemPromptOptions: { appendSystemPrompt: '' } };
    pi.invoke('before_agent_start', ev);
    const s = ev.systemPromptOptions.appendSystemPrompt;
    const want = ['<violation-memory>', 'Never re-run', 'conventional']; // top lessons = Re-run 7, Commitlint 9 (Reading+Extraction lessons retired with R2/R6)
    const ok = want.every((w) => s.includes(w)) && !s.includes('never start a bash segment') && !s.includes("Every 'rg -o'"); // retired lessons must stay out even when seeded
    if (!ok) { console.log(`      injected: ${JSON.stringify(s)}`); return { blocked: true }; }
    return { blocked: false };
  }],
  ['violation memory: injection happens once per session', 'pass', async (pi) => {
    const ev = () => ({ type: 'before_agent_start', prompt: '', systemPrompt: '', systemPromptOptions: { appendSystemPrompt: '' } });
    const a = ev();
    pi.invoke('before_agent_start', a);
    pi.invoke('before_agent_start', a);
    const n = (a.systemPromptOptions.appendSystemPrompt.match(/<violation-memory>/g) ?? []).length;
    return n === 1 ? { blocked: false } : { blocked: true };
  }],
  ['violation memory: injection tolerates undefined appendSystemPrompt', 'pass', async (pi) => {
    const ev = { type: 'before_agent_start', prompt: '', systemPrompt: '', systemPromptOptions: {} };
    pi.invoke('before_agent_start', ev);
    const s = ev.systemPromptOptions.appendSystemPrompt ?? '';
    return typeof s === 'string' && s.startsWith('<violation-memory>') ? { blocked: false } : { blocked: true };
  }],
  ['violation memory: one session hammering stays under threshold (H7)', 'pass', async (pi) => {
    const ev = { type: 'before_agent_start', prompt: '', systemPrompt: '', systemPromptOptions: { appendSystemPrompt: '' } };
    pi.invoke('before_agent_start', ev);
    return !(ev.systemPromptOptions.appendSystemPrompt ?? '').includes('<violation-memory>') ? { blocked: false } : { blocked: true, reason: 'injected from single-session depth' };
  }],
  ['violation memory: compaction rewrites bloated store per family+session (H7)', 'pass', async () => {
    const now = Date.now();
    const lines = [];
    for (let k = 0; k < 220; k++) lines.push(JSON.stringify({ family: 'Commitlint', sid: `s${k % 4}`, ts: now - (k % 7) }));
    writeFileSync(process.env.PGATE_MEMORY, lines.join('\n') + '\n');
    freshGate(); // load triggers compaction when >200 lines
    const after = readFileSync(process.env.PGATE_MEMORY, 'utf8').trim().split('\n').filter(Boolean);
    return after.length === 4 ? { blocked: false } : { blocked: true, reason: `expected 4 compact lines, got ${after.length}` };
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
  // ---- H6 (2026-10-08): hydration safety — replayed edits clear coverage (B7) ----
  ['resume hydration: replayed edit clears coverage (B7/H6)', 'pass', async (pi) => {
    await hydrate(pi, [
      { id: 'e1', call: 'read', callId: 'c1', path: fileC },
      { id: 'e2', resultFor: 'c1', text: 'l1\nl2\nl3\n' },
      { id: 'e3', call: 'edit', callId: 'c2', path: fileC },
      { id: 'e4', resultFor: 'c2', text: 'ok', tool: 'edit' },
    ]);
    return read(pi, fileC, { offset: 1, limit: 2 }, { outputLines: 2 }); // must be allowed
  }],
  ['resume hydration: re-start with an empty branch drops prior coverage', 'pass', async (pi) => {
    await hydrate(pi, [
      { id: 'e1', call: 'read', callId: 'c1', path: fileC },
      { id: 'e2', resultFor: 'c1', text: 'l1\nl2\nl3\n' },
    ]);
    await pi.invoke('session_start', { type: 'session_start', reason: 'new' }, { sessionManager: { getBranch: () => [] } }); // in-process switch to a fresh session
    return read(pi, fileC, { offset: 1, limit: 2 }, { outputLines: 2 });
  }],
  // ---- Anchor Guard (existence / uniqueness / overlap) ----
  ['anchor not found is blocked', 'blocked', async (pi) => edit(pi, fileA, [{ oldText: 'zzz', newText: 'y' }])],
  ['non-unique anchor is blocked with line numbers', 'blocked', async (pi) => edit(pi, fileB, [{ oldText: 'x', newText: 'y' }])],
  ['intra-call overlapping anchors are blocked', 'blocked', async (pi) => edit(pi, fileA, [{ oldText: 'a\nb', newText: 'q' }, { oldText: 'b\nc', newText: 'r' }])],
  // ---- H1 (2026-10-08): R2 viewing blocks deleted — output capped in tool_result ----
  ['standalone cat viewing is allowed (H1 cap)', 'pass', async (pi) => bash(pi, 'cat package.json')],
  ['standalone head viewing is allowed (H1 cap)', 'pass', async (pi) => bash(pi, 'head -40 config.json.example')],
  ['standalone tail viewing is allowed (H1 cap)', 'pass', async (pi) => bash(pi, 'tail -20 CHANGELOG.md')],
  ['tail -f watcher is not viewing', 'pass', async (pi) => bash(pi, 'tail -f /tmp/server.log')],
  ['sed -n batching 2+ regions passes', 'pass', async (pi) => bash(pi, "sed -n '1p;5p' notes.md")],
  ['sed s///p substitution-print passes', 'pass', async (pi) => bash(pi, 'sed -n "s/^export const APP_VERSION = \'\\(.*\\)\'$/\\1/p" src/version.js')],
  // ---- 2026-10-08 extensions audit: distributed sed batch + trivial batched cat ----
  ['distributed sed batch (;-joined, 2 regions) passes', 'pass', async (pi) => bash(pi, `sed -n '1,2p' ${fileA}; sed -n '3p' ${fileA}`)],
  ['distributed sed batch inside a longer batched command passes', 'pass', async (pi) => bash(pi, `date -u; sed -n '1,2p' ${fileA}; sed -n '2,3p' ${fileA}; rg -n x ${fileA} | head -3`)],
  ['lone sed region inside a batched command is allowed (H1 cap)', 'pass', async (pi) => bash(pi, `date -u; sed -n '1,2p' ${fileA}`)],
  ['tiny cat inside a batched command passes', 'pass', async (pi) => bash(pi, `date -u; cat ${tinyFile}; ls ${tmp}`)],
  ['tiny cat standalone is allowed (H1 cap)', 'pass', async (pi) => bash(pi, `cat ${tinyFile}`)],
  ['big cat inside a batched command is allowed (H1 cap)', 'pass', async (pi) => bash(pi, `date -u; cat ${bigFile}`)],
  // ---- 2026-10-08 extensions audit: Re-block escalation (RETRY-SAME case) ----
  // bash() alone doesn't replay the synthesized block tool_result pi emits —
  // do it by hand so pendingBashFull -> lastBlockedBash arms, like the real loop
  ['verbatim re-send of a just-blocked command escalates to Re-block', 'blocked', async (pi) => {
    const bad = 'git commit -m "Fix the thing" && echo committed'; // Commitlint blocks it (R5 retired by H1 step 5)
    const id1 = `rb${++seqId}`;
    const b1 = await pi.invoke('tool_call', { type: 'tool_call', toolName: 'bash', toolCallId: id1, input: { command: bad } });
    if (!b1) return { blocked: false }; // precondition: commitlint blocks the bad message
    await pi.invoke('tool_result', { type: 'tool_result', toolName: 'bash', toolCallId: id1, input: { command: bad }, content: textBlocks(b1.reason), isError: true });
    const b2 = await pi.invoke('tool_call', { type: 'tool_call', toolName: 'bash', toolCallId: `rb${++seqId}`, input: { command: bad } });
    return b2 && b2.reason.includes('Re-block') ? { blocked: true, reason: b2.reason } : { blocked: false };
  }],
  // ---- B1/B2 fixes (2026-10-08): Re-block yields to mutations, family preserved ----
  ['re-block yields after an intervening edit (B1)', 'pass', async (pi) => {
    const cmd = 'npm test 2>&1 | tail -5';
    await runBash(pi, cmd);
    const id = `b1${++seqId}`;
    const blk = await pi.invoke('tool_call', { type: 'tool_call', toolName: 'bash', toolCallId: id, input: { command: cmd } });
    if (!blk) return { blocked: false }; // precondition: R10 blocks the identical re-run
    await pi.invoke('tool_result', { type: 'tool_result', toolName: 'bash', toolCallId: id, input: { command: cmd }, content: textBlocks(blk.reason), isError: true });
    const e = await edit(pi, fileA, [{ oldText: 'b', newText: 'x' }]);
    if (e.blocked) return { blocked: true, reason: 'edit blocked' };
    return bash(pi, cmd); // R10 allows (mut changed) and Re-block must yield
  }],
  ['third consecutive block still names the original family (B2)', 'blocked', async (pi) => {
    const cmd = 'git commit -m "Bad message here"'; // commitlint blocks
    for (let k = 0; k < 2; k++) {
      const id = `b2${++seqId}`;
      const blk = await pi.invoke('tool_call', { type: 'tool_call', toolName: 'bash', toolCallId: id, input: { command: cmd } });
      if (!blk) return { blocked: false }; // precondition
      await pi.invoke('tool_result', { type: 'tool_result', toolName: 'bash', toolCallId: id, input: { command: cmd }, content: textBlocks(blk.reason), isError: true });
    }
    const r = await bash(pi, cmd);
    return r.blocked && r.reason.includes('Commitlint') ? r : { blocked: false };
  }],
  ['compliant variant after a block does not escalate', 'pass', async (pi) => {
    const bad = 'git commit -m "Fix the thing" && echo committed';
    const id1 = `rb${++seqId}`;
    const b1 = await pi.invoke('tool_call', { type: 'tool_call', toolName: 'bash', toolCallId: id1, input: { command: bad } });
    if (!b1) return { blocked: false }; // precondition: blocked first
    await pi.invoke('tool_result', { type: 'tool_result', toolName: 'bash', toolCallId: id1, input: { command: bad }, content: textBlocks(b1.reason), isError: true });
    return bash(pi, 'git clone -q https://example.com/r /tmp/r2 && cd /tmp/r2 && git log --oneline | head -5');
  }],
  ['real command failure does not arm the escalation', 'pass', async (pi) => {
    const cmd = 'timeout 120 pi -p "ok"';
    const id1 = `rb${++seqId}`;
    const b1 = await pi.invoke('tool_call', { type: 'tool_call', toolName: 'bash', toolCallId: id1, input: { command: cmd } });
    if (!b1) return { blocked: false }; // precondition: passes the gate
    await pi.invoke('tool_result', { type: 'tool_result', toolName: 'bash', toolCallId: id1, input: { command: cmd }, content: textBlocks('/bin/bash: timeout: command not found'), isError: true });
    const b2 = await pi.invoke('tool_call', { type: 'tool_call', toolName: 'bash', toolCallId: `rb${++seqId}`, input: { command: cmd } });
    if (b2) console.log(`      must not re-block after a real (non-gate) failure: ${b2.reason.slice(0, 90)}`);
    return b2 ? { blocked: true, reason: b2.reason } : { blocked: false }; // blocked here = test failure
  }],
  ['loop-body sed viewing is not split out', 'pass', async (pi) => bash(pi, 'for s in research domain; do echo "== $s"; sed -n \'1,6p\' "$s.md"; done')],
  // ---- H1 cap unit checks (composed tool_result return value) ----
  ['H1: >200-line bash output is capped with spill pointer', 'pass', async (pi) => {
    const id = `cap${++seqId}`;
    const b = await pi.invoke('tool_call', { type: 'tool_call', toolName: 'bash', toolCallId: id, input: { command: 'cat big.log' } });
    if (b) return { blocked: true, reason: `precondition: cat blocked: ${b.reason.slice(0, 80)}` };
    const r = await pi.invoke('tool_result', { type: 'tool_result', toolName: 'bash', toolCallId: id, input: { command: 'cat big.log' }, content: textBlocks(Array.from({ length: 500 }, (_, i) => `l${i}`).join('\n')), isError: false });
    const t = r?.content?.[0]?.text ?? '';
    const ok = r && r.content.length === 1 && t.startsWith('l0\n') && t.includes('kept 100/500 lines') && t.includes('pgate-spill');
    return ok ? { blocked: false } : { blocked: true, reason: `cap result wrong: ${JSON.stringify(r).slice(0, 160)}` };
  }],
  ['H1: >12KB bash output is byte-capped even under 200 lines', 'pass', async (pi) => {
    const id = `cap${++seqId}`;
    await pi.invoke('tool_call', { type: 'tool_call', toolName: 'bash', toolCallId: id, input: { command: 'cat oneline.log' } });
    const r = await pi.invoke('tool_result', { type: 'tool_result', toolName: 'bash', toolCallId: id, input: { command: 'cat oneline.log' }, content: textBlocks('x'.repeat(20000)), isError: false });
    const t = r?.content?.[0]?.text ?? '';
    return r && t.length < 20000 && t.includes('[output capped') ? { blocked: false } : { blocked: true, reason: `byte cap wrong: len=${t.length}` };
  }],
  ['H1: small bash output passes through unmodified', 'pass', async (pi) => {
    const id = `cap${++seqId}`;
    await pi.invoke('tool_call', { type: 'tool_call', toolName: 'bash', toolCallId: id, input: { command: 'ls' } });
    const r = await pi.invoke('tool_result', { type: 'tool_result', toolName: 'bash', toolCallId: id, input: { command: 'ls' }, content: textBlocks('ok'), isError: false });
    return r === undefined ? { blocked: false } : { blocked: true, reason: `small output was modified: ${JSON.stringify(r).slice(0, 100)}` };
  }],
  ['H1: structuredContent preserved when capping', 'pass', async (pi) => {
    const id = `cap${++seqId}`;
    await pi.invoke('tool_call', { type: 'tool_call', toolName: 'bash', toolCallId: id, input: { command: 'cat big.log' } });
    const r = await pi.invoke('tool_result', { type: 'tool_result', toolName: 'bash', toolCallId: id, input: { command: 'cat big.log' }, content: textBlocks(Array.from({ length: 300 }, (_, i) => `l${i}`).join('\n')), structuredContent: { exitCode: 0 }, isError: false });
    return r && r.structuredContent && r.structuredContent.exitCode === 0 ? { blocked: false } : { blocked: true, reason: 'structuredContent dropped by cap' };
  }],
  ['H1: error results are never capped', 'pass', async (pi) => {
    const id = `cap${++seqId}`;
    await pi.invoke('tool_call', { type: 'tool_call', toolName: 'bash', toolCallId: id, input: { command: 'cat big.log' } });
    const r = await pi.invoke('tool_result', { type: 'tool_result', toolName: 'bash', toolCallId: id, input: { command: 'cat big.log' }, content: textBlocks(Array.from({ length: 300 }, (_, i) => `l${i}`).join('\n')), isError: true });
    return r === undefined ? { blocked: false } : { blocked: true, reason: 'error result was capped' };
  }],
  // ---- R5 git log caps (deleted 2026-10-08, H1 step 5 — output cap covers) ----
  ['uncapped git log is allowed (H1 step 5 cap)', 'pass', async (pi) => bash(pi, 'git log')],
  ['git log --oneline -n passes', 'pass', async (pi) => bash(pi, 'git log --oneline -n 5')],
  ['git log -<N> short count passes', 'pass', async (pi) => bash(pi, 'git log -1 --format=%ci')],
  // ---- R6 rg -o caps ----
  ['uncapped rg -o is allowed (H1 step 3 cap)', 'pass', async (pi) => bash(pi, "rg -o 'pattern' src/")],
  ['capped rg -o passes', 'pass', async (pi) => bash(pi, "rg -o 'pattern' src/ | head -20")],
  // ---- R7 recursive walks ----
  ['ls -R is allowed (H1 step 6 cap)', 'pass', async (pi) => bash(pi, 'ls -R src')],
  ['plain ls passes', 'pass', async (pi) => bash(pi, 'ls src')],
  // ---- R8 git hook caps ----
  ['uncapped git commit is allowed (H1 step 4 cap)', 'pass', async (pi) => bash(pi, 'git commit -m "fix: cap output"')],
  ['capped git commit passes', 'pass', async (pi) => bash(pi, 'git commit -m "fix: cap output" 2>&1 | tail -20')],
  // ---- R9 commitlint ----
  ['non-conventional commit message is blocked', 'blocked', async (pi) => bash(pi, 'git commit -m "Fix the thing"')],
  // ---- commitlint B12/B13/B21 fixes (2026-10-08) ----
  ['commitlint: -am combined flag is validated', 'blocked', async (pi) => bash(pi, 'git commit -am "Add stuff"')],
  ['commitlint: -m"x" attached form is validated', 'blocked', async (pi) => bash(pi, 'git commit -m"x"')],
  ['commitlint: --message=y form is validated', 'blocked', async (pi) => bash(pi, 'git commit --message=y')],
  ['commitlint: global git flags do not hide the subcommand (H4-lite)', 'blocked', async (pi) => bash(pi, 'git -C x commit -m "Bad msg"')],
  ['commitlint: conventional commit under -C passes (H4-lite)', 'pass', async (pi) => bash(pi, 'git -C x commit -m "fix: cap output"')],
  ['commitlint: acronym subject passes (B13)', 'pass', async (pi) => bash(pi, 'git commit -m "fix: API timeout"')],
  ['commitlint: all-caps subject still blocked', 'blocked', async (pi) => bash(pi, 'git commit -m "fix: API TIMEOUT"')],
  ['commitlint: start-case subject still blocked', 'blocked', async (pi) => bash(pi, 'git commit -m "fix: Fix The Timeout"')],
  ['commitlint: \\n in message is a newline, header = first line (B21)', 'pass', async (pi) => bash(pi, 'git commit -m "fix: a\\nb c"')],
  // ---- H2 (2026-10-08, suite t08/t09 evidence): destructive confirm ----
  ['H2: rm without UI fails closed (asks in chat)', 'blocked', async (pi) => bash(pi, 'rm -f /tmp/x', { hasUI: false, mode: 'print' })],
  ['H2: git reset --hard without UI fails closed', 'blocked', async (pi) => bash(pi, 'git reset --hard HEAD~1', { hasUI: false, mode: 'print' })],
  ['H2: npm install without UI fails closed (t08)', 'blocked', async (pi) => bash(pi, 'npm install lodash', { hasUI: false, mode: 'print' })],
  ['H2: destructive with UI approval passes', 'pass', async (pi) => bash(pi, 'git reset --hard HEAD~1')],
  ['H2: destructive with UI denial is blocked', 'blocked', async (pi) => bash(pi, 'git reset --hard HEAD~1', { hasUI: true, mode: 'tui', ui: { confirm: async () => false } })],
  ['H2: approved destructive re-send skips re-confirm (2 min window)', 'pass', async (pi) => {
    let asks = 0;
    const ctx = { hasUI: true, mode: 'tui', ui: { confirm: async () => { asks++; return true; } } };
    const r1 = await bash(pi, 'git push', ctx);
    if (r1.blocked) return { blocked: true, reason: 'first push blocked' };
    const r2 = await bash(pi, 'git push', ctx);
    return !r2.blocked && asks === 1 ? { blocked: false } : { blocked: true, reason: `asks=${asks} r2=${JSON.stringify(r2).slice(0, 80)}` };
  }],
  ['H2: commitlint runs before the permission ask', 'blocked', async (pi) => {
    const r = await bash(pi, 'git commit -m "Fix the thing"'); // auto-approving UI
    return r.blocked && r.reason.startsWith('Commitlint') ? r : { blocked: false };
  }],
  ['H2: non-destructive commands never confirm', 'pass', async (pi) => {
    let asks = 0;
    const ctx = { hasUI: true, mode: 'tui', ui: { confirm: async () => { asks++; return true; } } };
    await bash(pi, 'npm test 2>&1 | tail -5', ctx);
    await bash(pi, 'git pull', ctx);
    await bash(pi, 'ls -la src', ctx);
    return asks === 0 ? { blocked: false } : { blocked: true, reason: `confirmed ${asks}× on non-destructive` };
  }],
  ['conventional capped commit passes', 'pass', async (pi) => bash(pi, 'git commit -m "fix: cap git log output" 2>&1 | tail -20')],
  // ---- runner caps ----
  ['uncapped npm test is allowed (H1 step 2 cap)', 'pass', async (pi) => bash(pi, 'npm test')],
  ['capped npm test passes', 'pass', async (pi) => bash(pi, 'npm test 2>&1 | tail -5')],
  ['stdout redirect to a file caps runner output', 'pass', async (pi) => bash(pi, 'npx tsc --noEmit > /tmp/tsc.out 2>&1; echo "TSC=$?"')],
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
  're-run with a different pipe cap passes': async () => { const pi = freshGate(); await runBash(pi, 'npx vitest run f.test.tsx 2>&1 | rg "Tests" | head -15'); return pi; },
  'whitespace-only variation still blocked': async () => { const pi = freshGate(); await runBash(pi, 'gh run list --limit 3'); return pi; },
  'shared nvm preamble does not collide R10 keys': async () => { const pi = freshGate(); await runBash(pi, 'source ~/.nvm/nvm.sh && nvm use 22.17.0 >/dev/null 2>&1 && pnpm vitest run x.test.ts 2>&1 | tail -8'); return pi; },
  'identical compound with watcher word is exempt': async () => { const pi = freshGate(); await runBash(pi, 'sleep 1; rm -f /tmp/x'); return pi; },
  're-run of a failed command passes': async () => { const pi = freshGate(); await runBash(pi, 'gh run list --limit 3', { error: true }); return pi; },
  'gh run watch re-run passes': async () => { const pi = freshGate(); await runBash(pi, 'gh run watch 123 --exit-status'); return pi; },
  'bash re-run after compaction passes': async () => { const pi = freshGate(); await runBash(pi, 'gh run list --limit 3'); await compact(pi); return pi; },
  'quoted pattern pipes do not collide R10 bases': async () => { const pi = freshGate(); await runBash(pi, "rg -o '(Alpha|Beta)' data.log | head -5"); return pi; },
  'identical quoted-pattern command still blocked': async () => { const pi = freshGate(); await runBash(pi, "rg -o '(Alpha|Beta)' data.log | head -5"); return pi; },
  'escaped-pipe bases do not collide R10': async () => { const pi = freshGate(); await runBash(pi, 'rg -o foo\\|qux data.log | head -5'); return pi; },
  'identical escaped-pipe command still blocked': async () => { const pi = freshGate(); await runBash(pi, 'rg -o foo\\|bar data.log | head -5'); return pi; },
  'full SKILL.md re-read same session is blocked': async () => { const pi = freshGate(); await read(pi, skillFile, {}, { outputLines: 30, totalLines: 30 }); return pi; },
  'SKILL.md re-read after compaction passes': async () => { const pi = freshGate(); await read(pi, skillFile, {}, { outputLines: 30, totalLines: 30 }); await compact(pi); return pi; },
  'violation memory: block appends ndjson family entry': async () => { writeFileSync(process.env.PGATE_MEMORY, ''); return freshGate(); },
  'violation memory: before_agent_start injects top-3 lessons at threshold': async () => {
    const now = Date.now();
    const sidN = (k) => `seed-${k}`;
    writeFileSync(process.env.PGATE_MEMORY, [
      // H7: distinct sessions per family, rolling window — Re-run 6, Commitlint 6
      // (threshold 5); Reading seeded 6× too but its lesson retired with R2
      ...Array.from({ length: 6 }, (_, k) => ({ family: 'Token Economy (Re-run)', sid: sidN(`r${k}`), ts: now })),
      ...Array.from({ length: 6 }, (_, k) => ({ family: 'Commitlint', sid: sidN(`c${k}`), ts: now })),
      ...Array.from({ length: 6 }, (_, k) => ({ family: 'Token Economy (Reading)', sid: sidN(`d${k}`), ts: now })),
    ].map((e) => JSON.stringify(e)).join('\n') + '\n');
    return freshGate();
  },
  'violation memory: injection happens once per session': async () => {
    const now = Date.now();
    writeFileSync(process.env.PGATE_MEMORY, Array.from({ length: 6 }, (_, k) => JSON.stringify({ family: 'Token Economy (Re-run)', sid: `s${k}`, ts: now })).join('\n') + '\n');
    return freshGate();
  },
  'violation memory: injection tolerates undefined appendSystemPrompt': async () => {
    const now = Date.now();
    writeFileSync(process.env.PGATE_MEMORY, Array.from({ length: 6 }, (_, k) => JSON.stringify({ family: 'Token Economy (Re-run)', sid: `s${k}`, ts: now })).join('\n') + '\n');
    return freshGate();
  },
  'violation memory: one session hammering stays under threshold (H7)': async () => {
    const now = Date.now();
    writeFileSync(process.env.PGATE_MEMORY, Array.from({ length: 9 }, () => JSON.stringify({ family: 'Token Economy (Re-run)', sid: 'same-session', ts: now })).join('\n') + '\n');
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
