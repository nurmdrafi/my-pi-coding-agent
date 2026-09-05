import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

/**
 * L0 parsing for pi session transcripts (~/.pi/agent/sessions/<project>/<file>.jsonl).
 *
 * Line types: `session` (header: id, cwd), `message` (message.role is
 * `user` | `assistant` | `toolResult`), `model_change`,
 * `thinking_level_change`, `compaction`, `custom`. The format is
 * version-dependent: parse tolerantly, treat every field as optional,
 * never throw on a bad line.
 *
 * Assistant messages carry `usage` in pi-native fields:
 *   { input, output, cacheRead, cacheWrite, reasoning,
 *     cost: { input, output, cacheRead, cacheWrite, total } }
 * and a `responseId` unique per API call.
 */

export function parseLines(text) {
  const entries = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const e = JSON.parse(trimmed);
      if (e && typeof e === 'object') entries.push(e);
    } catch {
      // malformed line — skip
    }
  }
  return entries;
}

export function parseSessionFile(path) {
  return parseLines(readFileSync(path, 'utf8'));
}

export const isAssistant = (e) => e?.type === 'message' && e?.message?.role === 'assistant';
export const isUser = (e) => e?.type === 'message' && e?.message?.role === 'user';
export const isToolResult = (e) => e?.type === 'message' && e?.message?.role === 'toolResult';

/**
 * Timestamps are ISO strings in newer transcripts and epoch-ms numbers in
 * older ones; normalize to epoch ms (NaN when absent/unparseable).
 */
export function tsMs(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? (v > 1e12 ? v : v * 1000) : NaN;
  if (typeof v === 'string' && v) {
    if (/^\d+$/.test(v)) { const n = Number(v); return n > 1e12 ? n : n * 1000; }
    const p = Date.parse(v);
    if (Number.isFinite(p)) return p;
  }
  return NaN;
}

/** Canonical ISO string (or null) for any timestamp field. */
export function isoTs(v) {
  const ms = tsMs(v);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function usageOf(entry) {
  return entry?.message?.usage ?? null;
}

/** Total context processed by one API call (all three input components). */
export function totalContext(usage) {
  return (
    (usage?.input ?? 0) +
    (usage?.cacheRead ?? 0) +
    (usage?.cacheWrite ?? 0)
  );
}

/**
 * One record per API request, deduped by responseId (invariant 4).
 * Last occurrence wins. Sorted by timestamp so turn ordinals are usable
 * for prefix-persistence weighting.
 */
export function apiTurns(entries) {
  const byRequest = new Map();
  for (const e of entries) {
    if (!isAssistant(e)) continue;
    const usage = usageOf(e);
    if (!usage) continue;
    byRequest.set(e.message.responseId ?? Symbol.for(String(byRequest.size)), e);
  }
  return [...byRequest.values()]
    .map((e) => ({
      requestId: e.message.responseId ?? null,
      timestamp: isoTs(e.message.timestamp),
      model: e.message.model ?? null,
      usage: usageOf(e),
    }))
    .sort((a, b) => (tsMs(a.timestamp) || 0) - (tsMs(b.timestamp) || 0));
}

/** All toolCall blocks, deduped by block id, in file order. */
export function toolCalls(entries) {
  const seen = new Set();
  const calls = [];
  for (const e of entries) {
    if (!isAssistant(e)) continue;
    const content = e.message.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block?.type !== 'toolCall' || !block.id || seen.has(block.id)) continue;
      seen.add(block.id);
      calls.push({
        id: block.id,
        name: block.name ?? '?',
        input: block.arguments ?? {},
        timestamp: isoTs(e.message.timestamp),
      });
    }
  }
  return calls;
}

/** All toolResult messages, deduped by toolCallId. */
export function toolResults(entries) {
  const seen = new Set();
  const results = [];
  for (const e of entries) {
    if (!isToolResult(e)) continue;
    const m = e.message;
    if (!m.toolCallId || seen.has(m.toolCallId)) continue;
    seen.add(m.toolCallId);
    results.push({
      toolUseId: m.toolCallId,
      isError: m.isError === true,
      bytes: contentBytes(m.content),
      timestamp: isoTs(m.timestamp),
    });
  }
  return results;
}

/** Compaction events re-write the whole prefix; counted per session (amplifier). */
export function compactionCount(entries) {
  return entries.reduce((n, e) => n + (e?.type === 'compaction' ? 1 : 0), 0);
}

export const BYTES_PER_TOKEN = 4;
const IMAGE_BYTES_ESTIMATE = 4_000; // ~1000 tokens flat estimate per image block

/**
 * Content size in text-byte equivalents so downstream bytes→tokens math stays
 * uniform. pi tool results are text blocks; image blocks get a flat estimate.
 */
export function contentBytes(content) {
  if (typeof content === 'string') return Buffer.byteLength(content);
  if (!Array.isArray(content)) return 0;
  let n = 0;
  for (const b of content) {
    if (typeof b?.text === 'string') n += Buffer.byteLength(b.text);
    else if (b?.type === 'image') n += IMAGE_BYTES_ESTIMATE;
  }
  return n;
}

/**
 * Skill loads in pi appear as user messages beginning with
 * `<skill name="..." location="...">` — the injected skill body.
 */
export function loadedSkillName(entry) {
  if (!isUser(entry)) return null;
  const c = entry.message.content;
  const text = typeof c === 'string' ? c
    : Array.isArray(c) ? c.map((b) => (typeof b?.text === 'string' ? b.text : '')).join('') : '';
  const m = text.match(/^<skill\s+name="([^"]+)"/);
  return m ? m[1] : null;
}

/**
 * Normalized hash of a tool invocation (param_hash): identical
 * hash = mechanically duplicate call. Normalization keeps only the
 * cost-relevant parts of the input, using pi's tool names.
 */
const NORMALIZERS = {
  read: (i) => i.path ?? '',
  bash: (i) => (i.command ?? '').trim(),
  edit: (i) => i.path ?? '',
  write: (i) => i.path ?? '',
};

export function paramHash(name, input) {
  const normalize = NORMALIZERS[name];
  let norm;
  try {
    norm = normalize ? normalize(input ?? {}) : JSON.stringify(input ?? {});
  } catch {
    norm = '';
  }
  return createHash('sha1').update(`${name}${norm}`).digest('hex').slice(0, 12);
}
