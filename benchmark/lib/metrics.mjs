/**
 * S1 metrics ingestion (spec §7.3, §12): spawn `metrics.mjs <session>`, parse the JSON,
 * and pin schema `s1-metrics/1` — a mismatch throws loudly rather than mixing records.
 */
import { spawnSync } from 'node:child_process';

export function runMetrics(session, { sessionsDir, metricsScript }) {
  const args = [metricsScript, session];
  if (sessionsDir) args.push('--sessions-dir', sessionsDir);
  const r = spawnSync(process.execPath, args, { encoding: 'utf8' });
  if (r.status !== 0) {
    return { metrics: null,
      metricsError: `metrics CLI failed (exit ${r.status}): ${(r.stderr || r.stdout || '').trim().slice(0, 300)}` };
  }
  let m;
  try { m = JSON.parse(r.stdout); } catch (e) {
    return { metrics: null, metricsError: `metrics CLI emitted unparseable output: ${e.message}` };
  }
  if (m?.schema !== 's1-metrics/1') {
    throw new Error(`metrics schema mismatch: want s1-metrics/1, got ${m?.schema ?? 'none'} — S1 may have versioned up; refusing to write mixed records`);
  }
  return { metrics: m, metricsError: null };
}
