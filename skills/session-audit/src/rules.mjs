import {
  apiTurns, toolCalls, toolResults, totalContext, paramHash, BYTES_PER_TOKEN, tsMs,
} from './parser.mjs';
import { DEFAULT_MULTIPLIERS } from './pricing.mjs';

/**
 * L1 deterministic rule pack, ported to pi's session schema.
 * Findings carry metadata only — never content (invariant 1).
 * Waste math anchors on cacheRead/cacheWrite + content bytes (invariant 3):
 * raw `input` sums are streaming-era placeholders and never trusted.
 *
 * Rules: CACHE_TTL_EXPIRY, DUP_TOOL_CALL, BIG_TOOL_OUTPUT, RETRY_STORM,
 * CACHE_MISS_RATE, CONTEXT_GROWTH. (The upstream NO_SUBAGENT rule is dropped:
 * pi is single-agent — there is no delegation counterfactual to price.)
 */

export const THRESHOLDS = {
  ttlGapSeconds: 300,
  ttlMinCreation: 10_000,
  bigOutputBytes: 30_000,
  cacheMissRatio: 0.5,
  minTurnsForMissRate: 5,
  contextCeiling: 200_000,
  ceilingShare: 0.8,
  retryErrorCount: 3,
  bytesPerToken: BYTES_PER_TOKEN,
};

function finding(rule, severity, sessionId, turnPointers, evidenceStats, estWasteTokens) {
  return { rule, severity, sessionId, turnPointers, evidenceStats, estWasteTokens: Math.round(estWasteTokens) };
}

const secs = (a, b) => (tsMs(b) - tsMs(a)) / 1000;
const toTokens = (bytes, t) => bytes / t.bytesPerToken;

/**
 * Prefix-persistence weight: a payload landing at time ts is
 * cache-written once, then cache-read on every later API turn. Returns the
 * multiplier to apply to the payload's token count.
 */
function persistenceWeight(ts, turns, price) {
  if (!ts) return price.write;
  const t = tsMs(ts);
  let remaining = 0;
  for (const turn of turns) if ((tsMs(turn.timestamp) || 0) > t) remaining++;
  return price.write + price.read * remaining;
}

/**
 * Classify the dominant time gap between two api-turn timestamps by walking
 * the raw entries: if the largest inter-entry delta ends at a toolResult
 * message, the wait was tool runtime, not user idle.
 */
function classifyGap(entries, fromTs, toTs) {
  const from = tsMs(fromTs), to = tsMs(toTs);
  const within = entries
    .map((e) => ({ role: e?.message?.role, t: tsMs(e?.message?.timestamp ?? e?.timestamp) }))
    .filter((x) => Number.isFinite(x.t) && x.t >= from && x.t <= to)
    .sort((a, b) => a.t - b.t);
  let best = 0, kind = 'user_idle';
  for (let i = 1; i < within.length; i++) {
    const d = within[i].t - within[i - 1].t;
    if (d <= best) continue;
    best = d;
    kind = within[i].role === 'toolResult' ? 'tool_runtime' : 'user_idle';
  }
  return kind;
}

/** gap > TTL followed by a cacheWrite spike = full prefix rewrite (CACHE_TTL_EXPIRY). */
export function cacheTtlExpiry(session, t = THRESHOLDS, price = DEFAULT_MULTIPLIERS) {
  const turns = apiTurns(session.entries).filter((x) => x.timestamp);
  const out = [];
  for (let i = 1; i < turns.length; i++) {
    const gap = secs(turns[i - 1].timestamp, turns[i].timestamp);
    const u = turns[i].usage;
    const creation = u.cacheWrite ?? 0;
    const read = u.cacheRead ?? 0;
    if (!(gap > t.ttlGapSeconds && creation >= t.ttlMinCreation && creation > read)) continue;
    const gapKind = classifyGap(session.entries, turns[i - 1].timestamp, turns[i].timestamp);
    // counterfactual: unexpired prefix would have been read cheaply instead
    // of rewritten expensively → waste = creation × (write − read).
    // Tool-runtime gaps are not a habit issue: report at low severity, zero waste.
    const waste = gapKind === 'user_idle' ? creation * (price.write - price.read) : 0;
    out.push(finding('CACHE_TTL_EXPIRY', gapKind === 'user_idle' ? 'medium' : 'low',
      session.sessionId, [turns[i].requestId],
      { gapSeconds: Math.round(gap), gapKind, cacheWrite: creation, cacheRead: read }, waste));
  }
  return out;
}

const MUTATORS = new Set(['write', 'edit']);

/**
 * Same tool + same normalized input called more than once (DUP_TOOL_CALL),
 * with generation tracking: a write/edit (or a bash command mentioning the
 * path) between two reads of the same file resets the group, so re-reads
 * after mutations are not flagged.
 * Returns { findings, claimedIds } — claimedIds are the repeat toolCall ids,
 * used by bigToolOutput to avoid double-counting.
 */
export function dupToolCall(session, t = THRESHOLDS, price = DEFAULT_MULTIPLIERS) {
  const calls = toolCalls(session.entries); // file order ≈ chronological
  const results = new Map(toolResults(session.entries).map((r) => [r.toolUseId, r]));
  const turns = apiTurns(session.entries);
  const generation = new Map(); // path → generation counter
  const groups = new Map();

  const bump = (path) => generation.set(path, (generation.get(path) ?? 0) + 1);

  for (const c of calls) {
    if (MUTATORS.has(c.name) && c.input?.path) bump(c.input.path);
    if (c.name === 'bash') {
      const cmd = c.input?.command ?? '';
      for (const path of generation.keys()) if (cmd.includes(path)) bump(path);
      // also invalidate any previously-read path mentioned in the command
      for (const key of groups.keys()) {
        const p = key.split('\u0000')[2];
        if (p && cmd.includes(p)) bump(p);
      }
    }
    const path = c.name === 'read' ? (c.input?.path ?? '') : '';
    const gen = path ? (generation.get(path) ?? 0) : 0;
    const key = `${paramHash(c.name, c.input)}\u0000${gen}\u0000${path}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }

  const findings = [];
  const claimedIds = new Set();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    let waste = 0, bytes = 0;
    for (const c of group.slice(1)) {
      claimedIds.add(c.id);
      const r = results.get(c.id);
      if (!r) continue;
      bytes += r.bytes;
      waste += toTokens(r.bytes, t) * persistenceWeight(r.timestamp, turns, price);
    }
    findings.push(finding('DUP_TOOL_CALL', group.length > 2 ? 'high' : 'medium', session.sessionId,
      group.map((c) => c.id),
      { tool: group[0].name, count: group.length, repeatBytes: bytes }, waste));
  }
  return { findings, claimedIds };
}

/**
 * toolResult larger than threshold (BIG_TOOL_OUTPUT). Prices only the
 * excess over threshold (the avoidable part), persistence-weighted.
 * Results already claimed by DUP_TOOL_CALL are skipped.
 */
export function bigToolOutput(session, t = THRESHOLDS, price = DEFAULT_MULTIPLIERS, claimedIds = new Set()) {
  const names = new Map(toolCalls(session.entries).map((c) => [c.id, c.name]));
  const turns = apiTurns(session.entries);
  return toolResults(session.entries)
    .filter((r) => r.bytes > t.bigOutputBytes && !claimedIds.has(r.toolUseId))
    .map((r) => {
      const excess = r.bytes - t.bigOutputBytes;
      const waste = toTokens(excess, t) * persistenceWeight(r.timestamp, turns, price);
      return finding('BIG_TOOL_OUTPUT', r.bytes > 4 * t.bigOutputBytes ? 'high' : 'medium',
        session.sessionId, [r.toolUseId],
        { tool: names.get(r.toolUseId) ?? '?', bytes: r.bytes, excessBytes: excess }, waste);
    });
}

/** ≥N errored calls of the same normalized invocation (RETRY_STORM). */
export function retryStorm(session, t = THRESHOLDS, price = DEFAULT_MULTIPLIERS) {
  const results = new Map(toolResults(session.entries).map((r) => [r.toolUseId, r]));
  const turns = apiTurns(session.entries);
  const errorGroups = new Map();
  for (const c of toolCalls(session.entries)) {
    if (!results.get(c.id)?.isError) continue;
    const key = paramHash(c.name, c.input);
    if (!errorGroups.has(key)) errorGroups.set(key, []);
    errorGroups.get(key).push(c);
  }
  const out = [];
  for (const group of errorGroups.values()) {
    if (group.length < t.retryErrorCount) continue;
    let waste = 0;
    for (const c of group) {
      const r = results.get(c.id);
      if (r) waste += toTokens(r.bytes, t) * persistenceWeight(r.timestamp, turns, price);
    }
    out.push(finding('RETRY_STORM', 'high', session.sessionId, group.map((c) => c.id),
      { tool: group[0].name, errorCount: group.length }, waste));
  }
  return out;
}

/**
 * Session-level cache hit ratio below threshold (CACHE_MISS_RATE).
 * Denominator uses only trusted cache fields (invariant 3).
 */
export function cacheMissRate(session, t = THRESHOLDS, price = DEFAULT_MULTIPLIERS) {
  const turns = apiTurns(session.entries);
  if (turns.length < t.minTurnsForMissRate) return [];
  let read = 0, creation = 0;
  for (const { usage } of turns) {
    read += usage.cacheRead ?? 0;
    creation += usage.cacheWrite ?? 0;
  }
  const total = read + creation;
  if (total === 0) return [];
  const ratio = read / total;
  if (ratio >= t.cacheMissRatio) return [];
  // counterfactual: written tokens read cheaply instead of written expensively
  return [finding('CACHE_MISS_RATE', ratio < t.cacheMissRatio / 2 ? 'high' : 'medium',
    session.sessionId, [],
    { ratio: Number(ratio.toFixed(3)), turns: turns.length, cacheRead: read, cacheWrite: creation },
    creation * (price.write - price.read))];
}

/** Max context near the ceiling (CONTEXT_GROWTH). Amplifier — no direct waste. */
export function contextGrowth(session, t = THRESHOLDS) {
  const turns = apiTurns(session.entries);
  let peak = 0, peakId = null;
  for (const turn of turns) {
    const total = totalContext(turn.usage);
    if (total > peak) { peak = total; peakId = turn.requestId; }
  }
  if (peak < t.contextCeiling * t.ceilingShare) return [];
  return [finding('CONTEXT_GROWTH', peak > t.contextCeiling * 0.95 ? 'high' : 'medium',
    session.sessionId, [peakId],
    { peakContext: peak, ceilingShare: Number((peak / t.contextCeiling).toFixed(2)), turns: turns.length }, 0)];
}

/**
 * Run all rules with double-count prevention: DUP_TOOL_CALL claims its
 * repeat results first; BIG_TOOL_OUTPUT skips them.
 */
export function runRules(session, thresholds = THRESHOLDS, price = DEFAULT_MULTIPLIERS) {
  const dup = dupToolCall(session, thresholds, price);
  const findings = [
    ...dup.findings,
    ...bigToolOutput(session, thresholds, price, dup.claimedIds),
    ...cacheTtlExpiry(session, thresholds, price),
    ...retryStorm(session, thresholds, price),
    ...cacheMissRate(session, thresholds, price),
    ...contextGrowth(session, thresholds),
  ];
  return findings.sort((a, b) => b.estWasteTokens - a.estWasteTokens);
}
