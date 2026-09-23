#!/usr/bin/env node
/**
 * session-audit runner (L0/L1 digest + fetch interface) — the CLI SKILL.md
 * documents. Phase 0 (`run`) digests raw session logs into metadata-only
 * artifacts in $AUDIT_WORKDIR; Phase 1 (`views`) renders the landscape via
 * scripts/views.mjs; Phase 2 (`fetch`) is the budget-capped content-escalation
 * interface. The reasoning layer never calls anything else (invariants 1, 4, 5).
 *
 * Usage:
 *   node scripts/audit.mjs run [--max N]
 *   node scripts/audit.mjs views
 *   node scripts/audit.mjs fetch <session-id> --kind <kind> \
 *        [--limit N] [--max-bytes B] [--uuid U] [--radius K]
 */
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { discoverSessions, findSession } from './discover.mjs';
import {
  parseSessionFile, apiTurns, toolCalls, toolResults, totalContext,
  compactionCount, loadedSkillName, isAssistant, isUser, isToolResult, isoTs,
} from './parser.mjs';
import { deriveRates, sessionRate } from './pricing.mjs';
import { THRESHOLDS, runRules } from './rules.mjs';
import { renderViews } from './views.mjs';

const workdir = process.env.AUDIT_WORKDIR;
const die = (msg) => { console.error(`audit: ${msg}`); process.exit(1); };
if (!workdir) die('AUDIT_WORKDIR is not set — export AUDIT_WORKDIR=<scratchpad>/audit_workdir first');

const GAP_BUCKETS = [
  ['lt_1m', 0, 60], ['1m-5m', 60, 300], ['5m-30m', 300, 1800],
  ['30m-4h', 1800, 14400], ['gt_4h', 14400, Infinity],
];

/** Tool-call batching per assistant turn (responseId-deduped, invariant 4). */
function batchingOf(entries) {
  const seen = new Set();
  const t = { turnsWithCalls: 0, calls: 0, one: 0, two: 0, multi: 0 };
  for (const e of entries) {
    if (!isAssistant(e)) continue;
    const rid = e.message.responseId;
    if (rid && seen.has(rid)) continue;
    if (rid) seen.add(rid);
    const n = (e.message.content ?? []).filter((b) => b?.type === 'toolCall').length;
    if (!n) continue;
    t.turnsWithCalls++;
    t.calls += n;
    if (n === 1) t.one++; else if (n === 2) t.two++; else t.multi++;
  }
  return t;
}

// ---------------------------------------------------------------- run (L0/L1)

function cmdRun(opts) {
  mkdirSync(workdir, { recursive: true });
  const { sessions: discovered, excludedActive } = discoverSessions({ maxSessions: opts.max ?? Infinity });

  // parse once; rates derive over ALL sessions before per-session pricing
  const parsed = [];
  for (const d of discovered) {
    let entries;
    try { entries = parseSessionFile(d.path); } catch { continue; }
    parsed.push({ d, entries, turns: apiTurns(entries) });
  }
  const rates = deriveRates(parsed.map((p) => p.turns));

  const sessions = [];
  const skills = {};
  const astgrep = { calls: 0, sessions: 0, rgSessions: 0, rgOnlySessions: 0 };
  const tools = {};
  const gapBuckets = {};
  const findings = [];

  for (const { d, entries, turns } of parsed) {
    const sessionFindings = runRules({ sessionId: d.sessionId, entries }, THRESHOLDS);
    for (const f of sessionFindings) findings.push({ ...f, project: d.project });

    let cacheRead = 0, cacheWrite = 0, peak = 0;
    const models = {};
    for (const t of turns) {
      const u = t.usage ?? {};
      cacheRead += u.cacheRead ?? 0;
      cacheWrite += u.cacheWrite ?? 0;
      peak = Math.max(peak, totalContext(u));
      if (t.model) models[t.model] = (models[t.model] ?? 0) + 1;
    }
    const { rate, pricedShare, unpriced } = sessionRate(models, rates);
    const wasteTokens = sessionFindings.reduce((s, f) => s + f.estWasteTokens, 0);
    const findingsByRule = {};
    for (const f of sessionFindings) findingsByRule[f.rule] = (findingsByRule[f.rule] ?? 0) + 1;

    // tools: calls / errors / bytes per name (result joined by toolCall id)
    const calls = toolCalls(entries);
    const results = new Map(toolResults(entries).map((r) => [r.toolUseId, r]));
    let hasAg = false, hasRg = false;
    for (const c of calls) {
      const t = (tools[c.name] ??= { calls: 0, errors: 0, resultBytes: 0 });
      t.calls++;
      const r = results.get(c.id);
      if (r) { t.resultBytes += r.bytes; if (r.isError) t.errors++; }
      if (c.name !== 'bash') continue;
      const cmd = String(c.input?.command ?? '');
      if (/\bast-grep\b/.test(cmd)) { hasAg = true; astgrep.calls++; }
      if (/\brg\b/.test(cmd)) hasRg = true;
    }
    if (hasAg) astgrep.sessions++;
    if (hasRg) { astgrep.rgSessions++; if (!hasAg) astgrep.rgOnlySessions++; }

    for (const e of entries) {
      const s = loadedSkillName(e);
      if (s) { skills[s] ??= { uses: 0, sessions: new Set() }; skills[s].uses++; skills[s].sessions.add(d.sessionId); }
    }

    // idle-gap curve: gap between consecutive api turns, attributed to the
    // later turn's cacheWrite (raw tokens — the view prices the excess)
    const withTs = turns.filter((t) => t.timestamp);
    for (let i = 1; i < withTs.length; i++) {
      const gap = (Date.parse(withTs[i].timestamp) - Date.parse(withTs[i - 1].timestamp)) / 1000;
      const b = GAP_BUCKETS.find(([, lo, hi]) => gap >= lo && gap < hi);
      if (!b) continue;
      const g = (gapBuckets[b[0]] ??= { turns: 0, cacheCreation: 0 });
      g.turns++;
      g.cacheCreation += withTs[i].usage?.cacheWrite ?? 0;
    }

    sessions.push({
      sessionId: d.sessionId,
      project: d.project,
      date: turns[0]?.timestamp?.slice(0, 10) ?? 'unknown',
      apiTurns: turns.length,
      compactions: compactionCount(entries),
      cacheRead, cacheWrite,
      cacheHitRatio: cacheRead + cacheWrite ? cacheRead / (cacheRead + cacheWrite) : 0,
      peakContext: peak,
      wasteTokens,
      usdPerMTok: rate === null ? null : rate * 1e6,
      wasteUsd: rate === null ? 0 : wasteTokens * rate,
      pricedShare, unpricedModels: unpriced, models,
      findingsByRule,
      batch: batchingOf(entries),
    });
  }

  // ---- projects rollup
  const projects = {};
  for (const s of sessions) {
    const p = (projects[s.project] ??= {
      sessions: 0, apiTurns: 0, cacheRead: 0, cacheWrite: 0, wasteTokens: 0, wasteUsd: 0,
      models: {}, pricedTurns: 0, totalTurns: 0, usdWeighted: 0,
    });
    p.sessions++; p.apiTurns += s.apiTurns;
    p.cacheRead += s.cacheRead; p.cacheWrite += s.cacheWrite;
    p.wasteTokens += s.wasteTokens; p.wasteUsd += s.wasteUsd;
    const { rate } = sessionRate(s.models, rates);
    const totalTurns = Object.values(s.models).reduce((a, b) => a + b, 0);
    for (const [m, n] of Object.entries(s.models)) p.models[m] = (p.models[m] ?? 0) + n;
    p.totalTurns += totalTurns;
    if (rate !== null) { p.pricedTurns += totalTurns; p.usdWeighted += rate * totalTurns; }
    p.pricedShare = p.totalTurns ? p.pricedTurns / p.totalTurns : 0;
    p.usdPerMTok = p.pricedTurns ? (p.usdWeighted / p.pricedTurns) * 1e6 : null;
    p.cacheHitRatio = p.cacheRead + p.cacheWrite ? p.cacheRead / (p.cacheRead + p.cacheWrite) : 0;
  }

  // ---- dates rollup
  const dates = {};
  for (const s of sessions) {
    const d = (dates[s.date] ??= { sessions: 0, cacheRead: 0, wasteTokens: 0 });
    d.sessions++; d.cacheRead += s.cacheRead; d.wasteTokens += s.wasteTokens;
  }

  const batching = sessions.reduce((a, s) => ({
    turnsWithCalls: a.turnsWithCalls + s.batch.turnsWithCalls,
    calls: a.calls + s.batch.calls,
    one: a.one + s.batch.one, two: a.two + s.batch.two, multi: a.multi + s.batch.multi,
  }), { turnsWithCalls: 0, calls: 0, one: 0, two: 0, multi: 0 });

  const skillsOut = {};
  for (const [name, v] of Object.entries(skills)) skillsOut[name] = { uses: v.uses, sessions: v.sessions.size };

  const pricedWaste = sessions.filter((s) => s.usdPerMTok !== null).reduce((a, s) => a + s.wasteTokens, 0);
  const totalWaste = sessions.reduce((a, s) => a + s.wasteTokens, 0);
  const manifest = {
    generatedAt: new Date().toISOString(),
    thresholds: THRESHOLDS,
    pricing: {
      multipliers: rates.price,
      models: Object.fromEntries(Object.entries(rates.models).map(([m, v]) => [m, {
        inputRatePerTok: v.inputRatePerTok, turns: v.turns,
        inputCostPerMTok: v.derived.inputCostPerMTok,
      }])),
      unpricedModels: [...new Set(sessions.flatMap((s) => s.unpricedModels ?? []))].sort(),
      pricedWasteShare: totalWaste ? pricedWaste / totalWaste : 1,
    },
    excludedActive,
    sessionsAudited: sessions.length,
  };

  write('manifest.json', manifest);
  write('l1_findings.json', findings);
  write('overview.json', {
    sessions: sessions.sort((a, b) => b.wasteTokens - a.wasteTokens),
    projects, tools, gapBuckets, dates, skills: skillsOut, batching, astgrep,
  });

  const ds = [...new Set(sessions.map((s) => s.date))].sort();
  console.log(`audit: ${sessions.length} sessions (${ds[0] ?? '?'} → ${ds.at(-1) ?? '?'}), `
    + `${findings.length} findings → ${workdir}`);
}

// ---------------------------------------------------------------- fetch (L2)

const FETCH_KINDS = new Set(['user_text', 'error_head', 'tool_input', 'assistant_head', 'turn_window']);
const cap = (s, n) => (s.length > n ? s.slice(0, n) + '…[truncated]' : s);

function cmdFetch(opts, sessionId) {
  const found = findSession(sessionId);
  if (!found) die(`session not found: ${sessionId}`);
  if (!FETCH_KINDS.has(opts.kind)) die(`unknown --kind ${opts.kind} (one of ${[...FETCH_KINDS].join(', ')})`);
  const limit = opts.limit ?? 5;
  const maxBytes = opts.maxBytes ?? 2000;
  const entries = parseSessionFile(found.path);
  const out = [];
  const add = (rec) => out.push(rec);

  const textOf = (e) => {
    const c = e.message.content;
    if (typeof c === 'string') return c;
    return Array.isArray(c) ? c.filter((b) => b?.type === 'text').map((b) => b.text).join('\n') : '';
  };
  const resultText = (toolUseId) => {
    for (const e of entries) {
      if (!isToolResult(e) || e.message.toolCallId !== toolUseId) continue;
      const c = e.message.content;
      if (typeof c === 'string') return c;
      return Array.isArray(c) ? c.map((b) => b?.text ?? '').join('') : '';
    }
    return '';
  };

  if (opts.kind === 'user_text') {
    for (const e of entries.filter((e) => isUser(e) && !loadedSkillName(e)).slice(-limit).reverse())
      add({ ts: isoTs(e.message.timestamp), text: cap(textOf(e), maxBytes) });
  } else if (opts.kind === 'assistant_head') {
    for (const e of entries.filter(isAssistant).slice(-limit).reverse())
      add({ ts: isoTs(e.message.timestamp), model: e.message.model, text: cap(textOf(e), maxBytes) });
  } else if (opts.kind === 'error_head') {
    const names = new Map(toolCalls(entries).map((c) => [c.id, c.name]));
    for (const r of toolResults(entries).filter((r) => r.isError).slice(-limit).reverse())
      add({ tool: names.get(r.toolUseId) ?? '?', ts: r.timestamp, head: cap(resultText(r.toolUseId), maxBytes) });
  } else if (opts.kind === 'tool_input') {
    for (const c of toolCalls(entries).slice(-limit).reverse())
      add({ ts: c.timestamp, tool: c.name, input: cap(JSON.stringify(c.input ?? {}), maxBytes) });
  } else if (opts.kind === 'turn_window') {
    if (!opts.uuid) die('turn_window requires --uuid <responseId>');
    const radius = opts.radius ?? 2;
    const turns = apiTurns(entries);
    let idx = turns.findIndex((t) => t.requestId === opts.uuid);
    // findings' turnPointers mix responseIds (CACHE_TTL, CONTEXT_GROWTH) and
    // toolCall ids (DUP, BIG, RETRY) — resolve a toolCall id to its turn.
    if (idx === -1) {
      const entry = entries.find((e) => isAssistant(e)
        && (e.message.content ?? []).some((b) => b?.type === 'toolCall' && b.id === opts.uuid));
      if (entry?.message?.responseId) idx = turns.findIndex((t) => t.requestId === entry.message.responseId);
    }
    if (idx === -1) die(`responseId not found: ${opts.uuid}`);
    for (let i = Math.max(0, idx - radius); i <= Math.min(turns.length - 1, idx + radius); i++) {
      const t = turns[i];
      add({
        i, requestId: t.requestId, ts: t.timestamp, model: t.model,
        usage: { input: t.usage?.input ?? null, cacheRead: t.usage?.cacheRead ?? null, cacheWrite: t.usage?.cacheWrite ?? null },
      });
    }
  }

  const bytes = out.reduce((a, r) => a + JSON.stringify(r).length, 0);
  for (const line of out) console.log(JSON.stringify(line));
  mkdirSync(workdir, { recursive: true });
  appendFileSync(join(workdir, 'fetch_log.jsonl'), JSON.stringify({
    ts: new Date().toISOString(), sessionId: found.sessionId, kind: opts.kind,
    limit, maxBytes, uuid: opts.uuid ?? null, returnedBytes: bytes,
  }) + '\n');
}

// ---------------------------------------------------------------- plumbing

function write(name, data) {
  writeFileSync(join(workdir, name), JSON.stringify(data, null, 1));
}

function parseArgs(argv) {
  const opts = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--max') opts.max = Number(argv[++i]);
    else if (a === '--kind') opts.kind = argv[++i];
    else if (a === '--limit') opts.limit = Number(argv[++i]);
    else if (a === '--max-bytes') opts.maxBytes = Number(argv[++i]);
    else if (a === '--uuid') opts.uuid = argv[++i];
    else if (a === '--radius') opts.radius = Number(argv[++i]);
    else if (a === '--help' || a === '-h') opts.help = true;
    else positional.push(a);
  }
  return { opts, positional };
}

const HELP = `usage:
  node scripts/audit.mjs run [--max N]        phase 0: digest → $AUDIT_WORKDIR artifacts
  node scripts/audit.mjs views                phase 1: bounded landscape block
  node scripts/audit.mjs fetch <session-id> --kind <user_text|error_head|tool_input|assistant_head|turn_window>
        [--limit N] [--max-bytes B] [--uuid U] [--radius K]`;

const [, , cmd, ...rest] = process.argv;
const { opts, positional } = parseArgs(rest);
if (!cmd || opts.help) { console.log(HELP); process.exit(cmd ? 0 : 1); }
if (cmd === 'run') cmdRun(opts);
else if (cmd === 'views') {
  try { console.log(renderViews(workdir)); }
  catch (e) { die(`cannot render views (${e.message}) — run \`audit.mjs run\` first`); }
} else if (cmd === 'fetch') {
  if (!positional[0]) die('fetch requires a <session-id>');
  cmdFetch(opts, positional[0]);
} else die(`unknown command: ${cmd}\n${HELP}`);
