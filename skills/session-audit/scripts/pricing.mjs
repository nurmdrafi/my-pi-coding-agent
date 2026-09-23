/**
 * Token → dollar conversion for the waste model.
 *
 * pi logs real USD per assistant message (`usage.cost`), so rates are
 * **derived from the audited sessions themselves** rather than read from a
 * static price table. That means the audit prices exactly what the user
 * actually paid, on models no published table lists.
 *
 * `estWasteTokens` is denominated in 1× input-token-cost equivalents (every
 * rule prices actual − counterfactual against the base input rate, with the
 * cache-write and cache-read multipliers already folded in). The conversion
 * is a single multiply:
 *
 *     usd = estWasteTokens × inputRatePerToken(model)
 *
 * Models whose turns carry no usable cost data are excluded from the dollar
 * figure (never approximated) and reported, so the gap is visible rather
 * than silently deflating the total.
 */

/** Default relative cost per input token when the logs can't derive it. */
export const DEFAULT_MULTIPLIERS = { write: 1.25, read: 0.1 };

/**
 * Derive per-model rates from parsed turns.
 * `turns`: [{ model, usage }] — the output of parser.apiTurns across sessions.
 * Returns { models: { [model]: {inputRatePerTok, writeMult, readMult, turns} },
 *           price: { write, read } (global turn-weighted blend) }.
 */
export function deriveRates(turnLists) {
  const acc = {}; // model → accumulators
  for (const turns of turnLists) {
    for (const t of turns) {
      if (!t.model) continue;
      const a = (acc[t.model] ??= {
        turns: 0, tokIn: 0, costIn: 0, cw: 0, costCw: 0, cr: 0, costCr: 0,
      });
      const u = t.usage ?? {};
      const c = u.cost ?? {};
      a.turns++;
      a.tokIn += u.input ?? 0;
      a.costIn += c.input ?? 0;
      a.cw += u.cacheWrite ?? 0;
      a.costCw += c.cacheWrite ?? 0;
      a.cr += u.cacheRead ?? 0;
      a.costCr += c.cacheRead ?? 0;
    }
  }

  const models = {};
  let blendWrite = 0, blendRead = 0, blendTurns = 0;
  for (const [model, a] of Object.entries(acc)) {
    // base input rate: prefer full-price input; fall back through the cache
    // legs using the default multipliers; last resort total/totalTokens.
    let rate = a.tokIn > 0 && a.costIn > 0 ? a.costIn / a.tokIn
      : a.cr > 0 && a.costCr > 0 ? (a.costCr / a.cr) / DEFAULT_MULTIPLIERS.read
      : null;
    if (rate === null) {
      const uTok = a.tokIn + a.cw + a.cr;
      const tot = a.costIn + a.costCw + a.costCr;
      if (uTok > 0 && tot > 0) rate = tot / uTok;
    }
    const writeMult = rate && a.cw > 0 && a.costCw > 0 ? (a.costCw / a.cw) / rate : null;
    const readMult = rate && a.cr > 0 && a.costCr > 0 ? (a.costCr / a.cr) / rate : null;
    models[model] = {
      inputRatePerTok: rate,
      writeMult: writeMult ?? DEFAULT_MULTIPLIERS.write,
      readMult: readMult ?? DEFAULT_MULTIPLIERS.read,
      turns: a.turns,
      // diagnostics for manifest.pricing
      derived: {
        writeMult, readMult,
        inputCostPerMTok: rate === null ? null : Number((rate * 1e6).toFixed(4)),
      },
    };
    if (rate !== null) {
      blendWrite += (writeMult ?? DEFAULT_MULTIPLIERS.write) * a.turns;
      blendRead += (readMult ?? DEFAULT_MULTIPLIERS.read) * a.turns;
      blendTurns += a.turns;
    }
  }
  const price = blendTurns
    ? { write: blendWrite / blendTurns, read: blendRead / blendTurns }
    : { ...DEFAULT_MULTIPLIERS };
  return { models, price };
}

/**
 * Turn-weighted blended input rate for a session that mixed models.
 * Turns are the weight because waste is a prefix cost: every turn re-sends
 * the accumulated prefix, so a model that served more turns carried more of it.
 *
 * Returns { rate, pricedShare, unpriced }:
 *   rate        — USD per token, blended over the PRICED turns only, or null
 *   pricedShare — fraction of the session's turns that had a usable rate
 *   unpriced    — the model ids that had none, for disclosure
 */
export function sessionRate(models = {}, rates) {
  let pricedTurns = 0, totalTurns = 0, usd = 0;
  const unpriced = [];
  for (const [model, turns] of Object.entries(models)) {
    totalTurns += turns;
    const r = rates?.models?.[model]?.inputRatePerTok ?? null;
    if (r === null) { unpriced.push(model); continue; }
    pricedTurns += turns;
    usd += r * turns;
  }
  return {
    rate: pricedTurns ? usd / pricedTurns : null,
    pricedShare: totalTurns ? pricedTurns / totalTurns : 0,
    unpriced,
  };
}

/**
 * `$1,234` / `$12.34` / `<$0.01` / `$0` — a fixed-width-friendly money column.
 * Sub-cent figures collapse to `<$0.01`: the extra digits widen every row to
 * express an amount nobody will act on.
 */
export function usd(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return 'n/a';
  if (n === 0) return '$0';
  const abs = Math.abs(n);
  if (abs >= 1000) return `$${Math.round(n).toLocaleString('en-US')}`;
  if (abs >= 0.01) return `$${n.toFixed(2)}`;
  return `<$0.01`;
}
