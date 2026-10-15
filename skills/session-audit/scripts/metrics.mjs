#!/usr/bin/env node
/**
 * S1 per-session metrics (spec: docs/specs/2026-10-15-s1-metrics-design.md).
 * Pure-compute module over the same data pidx/parser extract — zero changes
 * to pidx, parser.mjs, rules.mjs, audit.mjs.
 *
 * Usage:
 *   node skills/session-audit/scripts/metrics.mjs <session-id | path> [--sessions-dir DIR] [--pretty]
 */
import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';

import { findSession, DEFAULT_SESSIONS_DIR } from './discover.mjs';
import {
  parseSessionFile, apiTurns, toolCalls, toolResults, compactionCount, loadedSkillName,
  isUser, tsMs, paramHash,
} from './parser.mjs';
import { dupToolCall } from './rules.mjs';

// ---------------------------------------------------------------- builders (§5.1)

/** Raw jsonl → normalized session (parser.mjs primitives, ph precomputed per call). */
export function sessionFromPath(path) {
  const entries = parseSessionFile(path);
  const ridOf = new Map();
  for (const e of entries) {
    if (e?.type !== 'message' || e.message?.role !== 'assistant') continue;
    for (const b of e.message.content ?? []) {
      if (b?.type === 'toolCall' && b.id) ridOf.set(b.id, e.message.responseId ?? null);
    }
  }
  const skills = {};
  for (const e of entries) {
    const s = loadedSkillName(e);
    if (s) skills[s] = (skills[s] ?? 0) + 1;
  }
  return {
    sessionId: (basename(path).replace(/\.jsonl$/, '').split('_').slice(1).join('_')
      || basename(path).replace(/\.jsonl$/, '')),
    project: entries.find((e) => e?.type === 'session')?.cwd ?? null,
    turns: apiTurns(entries),
    calls: toolCalls(entries).map((c) => ({
      id: c.id, name: c.name, timestamp: c.timestamp, rid: ridOf.get(c.id) ?? null,
      ph: paramHash(c.name, c.input), path: c.input?.path ?? null, cmd: c.input?.command ?? null,
    })),
    results: toolResults(entries),
    compactions: compactionCount(entries),
    uts: entries.filter(isUser).map((e) => tsMs(e.message?.timestamp)).filter(Number.isFinite),
    skills,
  };
}

/** pidx extract v1 line → the same normalized shape (audit.mjs fast-path mapping). */
export function sessionFromExtract(ex) {
  if (!ex || ex.v !== 1) throw new Error(`unsupported extract version: ${ex?.v ?? 'none'} (want 1)`);
  return {
    sessionId: ex.sessionId,
    project: ex.project ?? null,
    turns: ex.turns.map((t) => ({ requestId: t.rid, timestamp: t.ts, model: t.model, usage: t.usage }))
      .sort((a, b) => (tsMs(a.timestamp) || 0) - (tsMs(b.timestamp) || 0)),
    calls: ex.calls.map((c) => ({ id: c.id, name: c.name, timestamp: c.ts ?? null, rid: c.rid ?? null, ph: c.ph, path: c.path ?? null, cmd: c.cmd ?? null })),
    results: ex.results.map((x) => ({ toolUseId: x.id, isError: x.err, bytes: x.bytes, timestamp: x.ts ?? null })),
    compactions: ex.compactions ?? 0,
    skills: ex.skills ?? {},
    uts: ex.uts ?? [],
  };
}

// ---------------------------------------------------------------- compute (§4)

export function computeMetrics(session, nowMs = Date.now()) {
  const { turns: rawTurns, calls, results } = session;
  // rid-dedupe last-wins (spec §4) — builders normally pre-dedupe; null-rid turns stay distinct
  const byRequest = new Map();
  let anon = 0;
  for (const t of rawTurns) byRequest.set(t.requestId ?? Symbol.for(`anon-${anon++}`), t);
  const turns = [...byRequest.values()].sort((a, b) => (tsMs(a.timestamp) || 0) - (tsMs(b.timestamp) || 0));
  const resultBy = new Map(results.map((r) => [r.toolUseId, r]));

  // ---- tools: counts, errors, bytes, latency (spec §4, §4.1)
  const tools = {};
  let unmatchedCalls = 0;
  for (const c of calls) {
    const t = (tools[c.name] ??= { calls: 0, errors: 0, errorRate: null, resultBytes: 0,
      latencyMs: { n: 0, p50: null, p95: null, max: null, invalid: 0, samples: [] } });
    t.calls++;
    const r = resultBy.get(c.id);
    if (!r) { unmatchedCalls++; continue; }
    t.resultBytes += r.bytes;
    if (r.isError) t.errors++;
    const from = tsMs(c.timestamp), to = tsMs(r.timestamp);
    if (Number.isFinite(from) && Number.isFinite(to) && to - from >= 0) t.latencyMs.samples.push(to - from);
    else t.latencyMs.invalid++;
  }
  for (const t of Object.values(tools)) {
    t.errorRate = t.calls ? t.errors / t.calls : null;
    const s = t.latencyMs.samples.sort((a, b) => a - b);
    const rank = (p) => s[Math.min(s.length, Math.max(1, Math.ceil((p / 100) * s.length))) - 1] ?? null;
    t.latencyMs.n = s.length;
    t.latencyMs.p50 = rank(50);
    t.latencyMs.p95 = rank(95);
    t.latencyMs.max = s.length ? s[s.length - 1] : null;
    delete t.latencyMs.samples;
  }

  // ---- reads: repeated-read rate via rules.mjs dupToolCall, verbatim (spec §4.2)
  const readCalls = calls.filter((c) => c.name === 'read').length;
  let repeats = 0;
  if (readCalls) {
    const { findings } = dupToolCall(session);
    for (const f of findings) if (f.evidenceStats?.tool === 'read') repeats += f.evidenceStats.count - 1;
  }
  const reads = { calls: readCalls, repeats, repeatRate: readCalls ? repeats / readCalls : null };

  // ---- edits: failure + retry structure by paramHash group (spec §4.3)
  let attempts = 0, failures = 0;
  const editGroups = new Map(); // ph → { errored: bool seen, laterSuccess: bool }
  for (const c of calls) {
    if (c.name !== 'edit') continue;
    attempts++;
    const r = resultBy.get(c.id);
    if (!r) continue;
    const g = (editGroups.get(c.ph) ?? { anyError: false, laterNonError: false });
    if (r.isError) { failures++; g.anyError = true; } else if (g.anyError) g.laterNonError = true;
    editGroups.set(c.ph, g);
  }
  let failedThenSucceeded = 0, failedTerminal = 0;
  for (const g of editGroups.values()) {
    if (!g.anyError) continue;
    if (g.laterNonError) failedThenSucceeded++; else failedTerminal++;
  }
  const edits = { attempts, failures, failureRate: attempts ? failures / attempts : null,
    failedThenSucceeded, failedTerminal };

  // ---- core aggregates (spec §4)
  const valid = turns.length > 0 || calls.length > 0;
  const tsAll = [
    ...turns.map((t) => tsMs(t.timestamp)), ...calls.map((c) => tsMs(c.timestamp)),
    ...results.map((r) => tsMs(r.timestamp)), ...(session.uts ?? []),
  ].filter(Number.isFinite);
  const lastTs = tsAll.length ? Math.max(...tsAll) : null;

  let apiTurns = null, tokens = null, cacheHitRatio = null, costUsd = null, batch = null;
  if (valid) {
    apiTurns = turns.length;
    let input = 0, output = 0, cacheRead = 0, cacheWrite = 0, peak = 0, cost = 0, anyCost = false;
    for (const t of turns) {
      const u = t.usage ?? {};
      input += u.input ?? 0;
      output += u.output ?? 0;
      cacheRead += u.cacheRead ?? 0;
      cacheWrite += u.cacheWrite ?? 0;
      peak = Math.max(peak, (u.input ?? 0) + (u.cacheRead ?? 0) + (u.cacheWrite ?? 0));
      if (u.cost && Number.isFinite(u.cost.total)) { cost += u.cost.total; anyCost = true; }
    }
    tokens = { input, output, cacheRead, cacheWrite, peakContext: peak };
    cacheHitRatio = cacheRead + cacheWrite ? cacheRead / (cacheRead + cacheWrite) : 0;
    costUsd = anyCost ? cost : null;
    // batchingFromCalls semantics, reimplemented locally (audit.mjs untouched)
    const groups = new Map();
    for (const c of calls) groups.set(c.rid ?? `#${c.id}`, (groups.get(c.rid ?? `#${c.id}`) ?? 0) + 1);
    batch = { turnsWithCalls: groups.size, calls: calls.length, one: 0, two: 0, multi: 0 };
    for (const n of groups.values()) { if (n === 1) batch.one++; else if (n === 2) batch.two++; else batch.multi++; }
  }
  const durationMs = tsAll.length >= 2 ? Math.max(...tsAll) - Math.min(...tsAll) : null;
  const partial = lastTs !== null && nowMs - lastTs <= 5 * 60 * 1000;

  return {
    schema: 's1-metrics/1',
    sessionId: session.sessionId, project: session.project ?? null,
    generatedAt: new Date(nowMs).toISOString(),
    valid, partial,
    durationMs, apiTurns, tokens, cacheHitRatio, costUsd, batch,
    compactions: session.compactions ?? 0,
    skills: session.skills ?? {},
    tools, reads, edits,
    unmatchedCalls,
  };
}

// ---------------------------------------------------------------- CLI (§5.2)

function parseArgs(argv) {
  const opts = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--sessions-dir') opts.sessionsDir = argv[++i];
    else if (a === '--pretty') opts.pretty = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else positional.push(a);
  }
  return { opts, positional };
}

const HELP = `usage:
  node skills/session-audit/scripts/metrics.mjs <session-id | path> [--sessions-dir DIR] [--pretty]`;

export function main(argv = process.argv.slice(2)) {
  const { opts, positional } = parseArgs(argv);
  if (!positional[0] || opts.help) {
    console.log(HELP);
    process.exit(positional[0] ? 0 : 1);
  }
  const target = positional[0];
  try {
    const path = existsSync(target) ? target
      : findSession(target, opts.sessionsDir ?? process.env.PI_SESSIONS_DIR ?? DEFAULT_SESSIONS_DIR)?.path;
    if (!path) throw new Error(`session not found: ${target}`);
    const m = computeMetrics(sessionFromPath(path));
    console.log(opts.pretty ? JSON.stringify(m, null, 2) : JSON.stringify(m));
  } catch (e) {
    console.error(JSON.stringify({ error: e.message, sessionId: target }));
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
