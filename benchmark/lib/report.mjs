/**
 * S2 report rendering (spec §9): markdown + JSON-sibling payloads and the
 * never-overwrite `report-YYYY-MM-DD[-N]` file naming.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const PROTOCOL_NOTE = 'Recommended protocol: ≥3 completed runs per task × arm before comparing; n is shown per cell.';

const COLS = [
  ['arm', 'arm'], ['n', 'n'], ['success', 'success'],
  ['durationMs', 'durationMs'], ['tokIn', 'tokensInput'], ['tokOut', 'tokensOutput'],
  ['tokPeak', 'tokensPeak'], ['costUsd', 'costUsd'], ['cacheHit', 'cacheHitRatio'],
  ['apiTurns', 'apiTurns'], ['worstP95', 'worstToolP95'],
  ['editFail', 'editFailureRate'], ['repeatRead', 'readRepeatRate'],
];

const fmt = (v) => (v === null || v === undefined ? '—' : String(Math.round(v * 10000) / 10000));

/** Cell text for a median entry: value, non-null n when it differs, ¹ marker at n=1. */
function medCell(med, cellN) {
  if (!med) return '—';
  let s = fmt(med.value);
  if (med.n === 1) s += '¹';
  if (med.n < cellN) s += ` (n=${med.n})`;
  return s;
}

export function buildPayload(cells, { date, includePartial }) {
  const arms = [...new Set(cells.map((c) => c.arm))]
    .sort((a, b) => (a === 'baseline' ? -1 : b === 'baseline' ? 1 : a < b ? -1 : 1));
  return {
    schema: 's2-report/1', date, generatedAt: new Date().toISOString(),
    includePartial, arms,
    tasks: [...new Set(cells.map((c) => c.task))].sort(),
    protocol: { minRunsPerCell: 3, note: PROTOCOL_NOTE },
    cells,
  };
}

export function renderMarkdown(payload) {
  const lines = [
    `# S2 benchmark report — ${payload.date}`,
    '',
    `- date: ${payload.date} (UTC)`,
    `- arms compared: ${payload.arms.map((a) => (a === 'baseline' ? 'baseline*' : a)).join(', ')}`,
    `- tasks included: ${payload.tasks.join(', ') || '—'}`,
    `- include-partial: ${payload.includePartial}`,
    `- ${PROTOCOL_NOTE}`,
    '- * = baseline (reference arm); ¹ = median of a single run; † = metrics incomplete in some runs',
    '',
  ];
  for (const task of payload.tasks) {
    lines.push(`## ${task}`, '');
    lines.push(`| ${COLS.map(([h]) => h).join(' | ')} |`);
    lines.push(`| ${COLS.map(() => '---').join(' | ')} |`);
    for (const c of payload.cells.filter((x) => x.task === task)) {
      const passed = c.successRate === null ? 0 : Math.round(c.successRate * c.n);
      const rate = c.successRate === null ? '—' : fmt(c.successRate);
      const arm = c.arm === 'baseline' ? 'baseline*' : c.arm;
      const extra = `${c.metricsIncomplete ? '†' : ''}${c.partialExcluded ? ` (+${c.partialExcluded} partial excluded)` : ''}`;
      lines.push(`| ${arm}${extra} | ${c.n} | ${passed}/${c.n} (${rate}) | ` +
        COLS.slice(3).map(([, k]) => medCell(c.medians[k], c.n)).join(' | ') + ' |');
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** First free `report-<date>` base (no extension) under reportsDir: "", -2, -3, … */
export function nextReportBase(reportsDir, date) {
  for (let n = 1; ; n++) {
    const base = n === 1 ? `report-${date}` : `report-${date}-${n}`;
    if (!existsSync(join(reportsDir, `${base}.md`)) && !existsSync(join(reportsDir, `${base}.json`))) return base;
  }
}
