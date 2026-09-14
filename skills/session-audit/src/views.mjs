/**
 * Phase 1 landscape renderer.
 *
 * The reasoning layer never queries overview.json / l1_findings.json
 * directly (they are ~100KB+; every hand-rolled one-liner and its output
 * lands in the transcript, which is the audit's real self-cost). This module
 * renders the whole landscape deterministically, in one bounded block, at
 * zero LLM cost.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { basename } from 'node:path';
import { usd } from './pricing.mjs';

const K = (n) => (Math.abs(n) >= 1000 ? `${Math.round(n / 1000)}K` : String(Math.round(n)));
const M = (n) => `${(n / 1e6).toFixed(1)}M`;
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
/** Projects are real cwd paths (from the session header); show the basename. */
const proj = (p) => basename(String(p)).slice(0, 28) || String(p).slice(-28);

const read = (dir, name) => JSON.parse(readFileSync(join(dir, name), 'utf8'));

export function renderViews(workdir) {
  const manifest = read(workdir, 'manifest.json');
  const overview = read(workdir, 'overview.json');
  const findings = read(workdir, 'l1_findings.json');
  const out = [];
  const say = (s = '') => out.push(s);

  const sessions = overview.sessions ?? [];
  const totalRead = sessions.reduce((s, x) => s + (x.cacheRead ?? 0), 0);
  const totalCreation = sessions.reduce((s, x) => s + (x.cacheWrite ?? 0), 0);
  const turns = sessions.reduce((s, x) => s + (x.apiTurns ?? 0), 0);
  const compactions = sessions.reduce((s, x) => s + (x.compactions ?? 0), 0);

  // Dollars are priced per session (src/pricing.mjs), so every rule- and
  // project-level figure joins back through this map rather than applying one
  // directory-wide rate that no individual session actually paid.
  const rateOf = new Map(sessions.map((s) => [s.sessionId, (s.usdPerMTok ?? null) === null ? null : s.usdPerMTok / 1e6]));
  const dollars = (tokens, sessionId) => {
    const r = rateOf.get(sessionId);
    return r === null || r === undefined ? 0 : tokens * r;
  };

  const byRule = {};
  for (const f of findings) {
    const r = (byRule[f.rule] ??= { n: 0, w: 0, usd: 0, sev: {}, sessions: new Set() });
    r.n++; r.w += f.estWasteTokens ?? 0;
    r.usd += dollars(f.estWasteTokens ?? 0, f.sessionId);
    r.sessions.add(f.sessionId);
    r.sev[f.severity] = (r.sev[f.severity] ?? 0) + 1;
  }
  const headline = Object.values(byRule).reduce((s, v) => s + v.w, 0);
  const headlineUsd = Object.values(byRule).reduce((s, v) => s + v.usd, 0);

  say(`## Totals`);
  say(`sessions ${sessions.length} (${(manifest.excludedActive ?? []).length} active excluded) · apiTurns ${turns} · compactions ${compactions}`);
  say(`cacheRead ${M(totalRead)} · cacheWrite ${M(totalCreation)} · hitRatio ${(totalRead / (totalRead + totalCreation)).toFixed(3)}`);
  say(`findings ${findings.length} · headline waste ${K(headline)} = ${usd(headlineUsd)}`);
  say(`waste as share of read volume ${((headline / totalRead) * 100).toFixed(2)}%`);
  // Two disclosures the dollar figure is meaningless without. Both are floors,
  // and a floor the reader can see beats a total they over-trust.
  const pricing = manifest.pricing ?? {};
  if ((pricing.unpricedModels ?? []).length) {
    say(`unpriced models (excluded from $): ${pricing.unpricedModels.join(', ')} — `
      + `${((pricing.pricedWasteShare ?? 1) * 100).toFixed(1)}% of waste carries a price`);
  }
  say(`rates derived from logged usage.cost — reasoning (output-side) tokens are visible but unpriced by the waste model; $ and token totals are floors, not ceilings`);
  say();

  // `sessions` is the column that decides whether a rule is a habit or one bad
  // week: 216 findings across 4 sessions and across 80 are the same count and
  // opposite conclusions. The finding count alone cannot tell them apart.
  say(`## Findings by rule`);
  say(`${pad('rule', 18)} ${lpad('n', 4)} ${lpad('sess', 5)}  ${lpad('tokens', 7)}  ${lpad('usd', 9)}  severity`);
  for (const [rule, v] of Object.entries(byRule).sort((a, b) => b[1].w - a[1].w)) {
    const sev = Object.entries(v.sev).sort().map(([s, n]) => `${n} ${s}`).join(' / ');
    say(`${pad(rule, 18)} ${lpad(v.n, 4)} ${lpad(v.sessions.size, 5)}  ${lpad(K(v.w), 7)}  ${lpad(usd(v.usd), 9)}  ${sev}`);
  }
  say();

  // The distribution the reasoner cannot safely infer from CACHE_MISS_RATE:
  // that rule needs ratio < 0.5 AND >= 5 turns, so low-ratio short sessions
  // are silently absent from the finding list.
  say(`## Cache hit-ratio distribution`);
  // Sessions with no cache activity at all sit at ratio 0 and would swamp the
  // low buckets; they cost nothing, so they are counted apart from the curve.
  const trivial = sessions.filter((s) => (s.cacheRead ?? 0) + (s.cacheWrite ?? 0) === 0);
  const priced = sessions.filter((s) => (s.cacheRead ?? 0) + (s.cacheWrite ?? 0) > 0);
  const buckets = [['<0.50', 0, 0.5], ['0.50-0.90', 0.5, 0.9], ['0.90-0.95', 0.9, 0.95], ['>=0.95', 0.95, Infinity]];
  for (const [label, lo, hi] of buckets) {
    const inB = priced.filter((s) => (s.cacheHitRatio ?? 1) >= lo && (s.cacheHitRatio ?? 1) < hi);
    const cc = inB.reduce((a, x) => a + (x.cacheWrite ?? 0), 0);
    say(`${pad(label, 10)} ${lpad(inB.length, 4)} sessions · cacheWrite ${lpad(K(cc), 7)}`);
  }
  say(`${pad('no cache', 10)} ${lpad(trivial.length, 4)} sessions · zero volume, excluded above`);
  // Ranked by cache-write, not by ratio: a 0.28 ratio on 191K written tokens
  // is actionable, a 0.00 ratio on 400 is not. Full session ids (a prefix
  // cannot be fetched).
  const costly = priced.filter((s) => (s.cacheHitRatio ?? 1) < 0.9)
    .sort((a, b) => (b.cacheWrite ?? 0) - (a.cacheWrite ?? 0)).slice(0, 6);
  say(`costliest low-ratio (<0.90), by cacheWrite:`);
  for (const s of costly) {
    say(`  ${s.sessionId} ${pad(proj(s.project), 22)} ratio ${(s.cacheHitRatio ?? 1).toFixed(3)}  cw ${lpad(K(s.cacheWrite ?? 0), 6)}  turns ${lpad(s.apiTurns, 4)}  ${(s.findingsByRule ?? {}).CACHE_MISS_RATE ? 'flagged' : 'NOT flagged by rule'}`);
  }
  say();

  // Per-project, because that is the unit a dev acts on. The directory total
  // says "you waste $X"; this says which repo to fix first.
  say(`## Projects by waste`);
  for (const [name, p] of Object.entries(overview.projects ?? {}).sort((a, b) => b[1].wasteTokens - a[1].wasteTokens).slice(0, 8)) {
    say(`${pad(proj(name), 28)} ${lpad(p.sessions, 4)} sess ${lpad(p.apiTurns, 6)} turns  read ${lpad(M(p.cacheRead), 7)}  waste ${lpad(K(p.wasteTokens), 7)} ${lpad(usd(p.wasteUsd ?? 0), 9)}  hit ${p.cacheHitRatio}`);
  }
  say();

  // Full session ids, not truncated — the reader must be able to fetch one.
  say(`## Worst sessions by waste`);
  for (const s of [...sessions].sort((a, b) => b.wasteTokens - a.wasteTokens).slice(0, 10)) {
    const rules = Object.entries(s.findingsByRule ?? {}).map(([r, n]) => `${r}×${n}`).join(',');
    say(`${s.sessionId} ${pad(proj(s.project), 22)} ${s.date} turns ${lpad(s.apiTurns, 4)} peak ${lpad(K(s.peakContext), 5)} comp ${s.compactions ?? 0} waste ${lpad(K(s.wasteTokens), 7)} ${lpad(usd(s.wasteUsd ?? 0), 9)}  ${rules}`);
  }
  say(`inspect: node <skill-dir>/bin/audit.mjs fetch <session-id> --kind user_text --limit 3 --max-bytes 500`);
  say();

  // Idle-gap excess, priced against the <1m baseline. Reported in RAW cache
  // tokens — rule waste is cost-equivalent (creation × (write − read)), so the
  // two are NOT directly comparable. Both units are printed to stop that
  // conflation.
  say(`## Idle-gap cost curve  (raw cache-write tokens)`);
  const gb = overview.gapBuckets ?? {};
  const base = gb['lt_1m'] ? gb['lt_1m'].cacheCreation / gb['lt_1m'].turns : 0;
  let excess = 0;
  for (const [label, b] of Object.entries(gb)) {
    if (!b.turns) continue;
    const per = b.cacheCreation / b.turns;
    const ex = label === 'lt_1m' ? 0 : (per - base) * b.turns;
    excess += ex;
    say(`${pad(label, 8)} turns ${lpad(b.turns, 5)}  cw/turn ${lpad(Math.round(per), 6)}  ${lpad(base ? (per / base).toFixed(1) + '×' : '—', 6)}  excess ${lpad(ex > 0 ? K(ex) : '—', 7)}`);
  }
  const wm = manifest.pricing?.multipliers;
  const spread = wm ? wm.write - wm.read : 1.15;
  say(`total excess ${K(Math.max(0, excess))} raw  =  ${K(Math.max(0, excess) * spread)} cost-equivalent (compare THIS to CACHE_TTL_EXPIRY)`);
  say();

  say(`## Tools by bytes into context`);
  for (const [name, t] of Object.entries(overview.tools ?? {}).sort((a, b) => b[1].resultBytes - a[1].resultBytes).slice(0, 8)) {
    say(`${pad(name, 26)} calls ${lpad(t.calls, 5)}  ${lpad((t.resultBytes / 1e6).toFixed(2), 6)}MB  ${lpad(Math.round(t.resultBytes / t.calls), 6)} B/call  err ${t.errors}`);
  }
  say();

  // Batching: round-trips are the dominant per-turn cost driver; a session
  // of 1-call turns re-sends the prefix as many times as it makes calls.
  say(`## Batching (tool calls per assistant turn)`);
  {
    const b = overview.batching ?? {};
    const t = b.turnsWithCalls ?? 0;
    if (t) {
      const pct = (n) => ((n / t) * 100).toFixed(0) + '%';
      say(`turns with calls ${t} · calls ${K(b.calls ?? 0)} · avg ${( (b.calls ?? 0) / t).toFixed(1)}/turn`);
      say(`1-call ${pct(b.one ?? 0)} · 2-call ${pct(b.two ?? 0)} · 3+ ${pct(b.multi ?? 0)}`);
      const worst = sessions.filter((x) => (x.batch?.turnsWithCalls ?? 0) >= 10)
        .sort((x, y) => (y.batch.one / y.batch.turnsWithCalls) - (x.batch.one / x.batch.turnsWithCalls));
      say(`most single-call-heavy sessions (≥10 turns):`);
      for (const s of worst.slice(0, 5)) {
        const bs = s.batch;
        say(`  ${s.sessionId} ${pad(proj(s.project), 22)} ${bs.one}/${bs.turnsWithCalls} one-call (${((bs.one / bs.turnsWithCalls) * 100).toFixed(0)}%)  avg ${(bs.calls / bs.turnsWithCalls).toFixed(1)}`);
      }
    } else { say(`no batching data`); }
  }
  say();

  // ast-grep discipline: ast-grep runs inside bash commands, so the tool
  // table cannot see it. AGENTS.md says construct-shape search runs ast-grep
  // FIRST; rg-only sessions are the violation signal.
  say(`## ast-grep discipline (bash command text)`);
  {
    const a = overview.astgrep ?? {};
    say(`ast-grep/sg calls ${a.calls ?? 0} across ${a.sessions ?? 0} sessions · bash rg calls in ${a.rgSessions ?? 0} sessions`);
    say(`rg-but-never-ast-grep sessions ${a.rgOnlySessions ?? 0} / ${sessions.length} (AGENTS.md: ast-grep first for construct-shape search)`);
  }
  say();

  // Tool detail: calls × sessions × dup findings linkage — the byte table
  // above says what landed in context; this says which tool the waste hangs on.
  say(`## Tool detail (calls · sessions · dup linkage)`);
  {
    const dupByTool = {};
    for (const f of findings) {
      if (f.rule !== 'DUP_TOOL_CALL') continue;
      const d = (dupByTool[f.evidenceStats?.tool ?? '?'] ??= { n: 0, w: 0 });
      d.n++; d.w += f.estWasteTokens ?? 0;
    }
    const rows = Object.entries(overview.tools ?? {}).map(([name, t]) => ({ name, t, d: dupByTool[name] }));
    for (const r of rows) {
      say(`${pad(r.name, 14)} calls ${lpad(r.t.calls, 5)}  err ${lpad(r.t.errors, 4)}  dup ${lpad(r.d?.n ?? 0, 4)}×  dupWaste ${lpad(K(r.d?.w ?? 0), 7)}`);
    }
  }
  say();

  say(`## Peak context & compactions`);
  const pk = [['<50K', 0, 50e3], ['50-150K', 50e3, 150e3], ['150-250K', 150e3, 250e3], ['250-350K', 250e3, 350e3], ['>350K', 350e3, Infinity]];
  say(pk.map(([l, lo, hi]) => `${l}:${sessions.filter((s) => (s.peakContext ?? 0) >= lo && (s.peakContext ?? 0) < hi).length}`).join('  '));
  const compacted = sessions.filter((s) => (s.compactions ?? 0) > 0);
  say(`compacted sessions ${compacted.length}/${sessions.length} · total compaction events ${compactions}`);
  say();

  say(`## Trend by date  (oldest → newest)`);
  const dates = Object.entries(overview.dates ?? {}).filter(([d]) => d !== 'unknown').sort();
  const half = Math.floor(dates.length / 2);
  for (const [label, slice] of [['earlier', dates.slice(0, half)], ['later', dates.slice(half)]]) {
    if (!slice.length) continue;
    const s = slice.reduce((a, [, v]) => ({
      sessions: a.sessions + v.sessions, read: a.read + v.cacheRead, waste: a.waste + v.wasteTokens,
    }), { sessions: 0, read: 0, waste: 0 });
    say(`${pad(label, 8)} ${slice[0][0]}→${slice.at(-1)[0]}  sessions ${lpad(s.sessions, 4)}  read ${lpad(M(s.read), 7)}  waste ${lpad(K(s.waste), 7)}  rate ${((s.waste / s.read) * 100).toFixed(2)}%`);
  }
  say();

  say(`## Skills by use`);
  say(Object.entries(overview.skills ?? {}).sort((a, b) => b[1].uses - a[1].uses).slice(0, 12)
    .map(([n, v]) => `${n}:${v.uses}/${v.sessions}s`).join('  '));

  return out.join('\n');
}
