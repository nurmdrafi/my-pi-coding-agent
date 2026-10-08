#!/usr/bin/env node
/**
 * A8 (brief §6): AGENTS.md lint — flags duplicated rules and contradictory
 * directives so shrinks/dedupes are evidence-driven, not vibes.
 * Heuristic, no deps. Output: one JSON line.
 *   { bullets, dup_pairs, contradictions, details: [...] }
 * Contradiction checks (extensible):
 *   - ask-polarity: one bullet pre-approves an action class another demands an ask for
 *   - spawn-rule count: >1 bullet governing subagents
 *   - style-rule count: >1 bullet governing reply style (concise/caveman/etc.)
 * Duplication: word-set Jaccard > 0.55 between bullet pairs.
 */
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const md = readFileSync(join(ROOT, 'AGENTS.md'), 'utf8');

const bullets = md.split('\n').filter((l) => /^[-*] /.test(l)).map((l) => l.replace(/^[-*] /, '').trim());
const norm = (s) => s.toLowerCase().replace(/[*_`]/g, '').replace(/[^\w\s/]/g, ' ').replace(/\s+/g, ' ').trim();
const words = (s) => new Set(norm(s).split(' ').filter((w) => w.length > 2));
const jac = (a, b) => {
  const A = words(a), B = words(b);
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter || 1);
};

const details = [];
let dupPairs = 0;
for (let i = 0; i < bullets.length; i++) {
  for (let j = i + 1; j < bullets.length; j++) {
    const s = jac(bullets[i], bullets[j]);
    if (s > 0.55) {
      dupPairs++;
      details.push({ kind: 'dup', sim: Number(s.toFixed(2)), a: bullets[i].slice(0, 70), b: bullets[j].slice(0, 70) });
    }
  }
}

// contradiction heuristics
const preapproved = bullets.filter((b) => /pre-approved|need no ask|without asking|no ask needed/i.test(b));
const askFirst = bullets.filter((b) => /ask[- ]first|ask (first|before|and wait)|→ ask|→\s*ask/i.test(b));
let contradictions = 0;
for (const pre of preapproved) {
  for (const ask of askFirst) {
    if (pre === ask) continue; // one bullet stating both tiers is the FIX, not a conflict
    // same action domain on both sides?
    const domain = (s) => /\b(read|rg|ls|find|git status|git diff|git log)\b/i.test(s) ? 'read' : /\bcommit|push|install|destructive|mutat/i.test(s) ? 'mutate' : 'other';
    if (domain(pre) === domain(ask) && domain(pre) !== 'other') {
      contradictions++;
      details.push({ kind: 'ask-polarity', a: pre.slice(0, 70), b: ask.slice(0, 70) });
    }
  }
}
const spawnRules = bullets.filter((b) => /subagent/i.test(b));
if (spawnRules.length > 1) { contradictions++; details.push({ kind: 'multi-rule', topic: 'subagents', n: spawnRules.length }); }
const styleRules = bullets.filter((b) => /concise|caveman|filler|pleasantr|no emojis|fragments/i.test(b));
if (styleRules.length > 1) { contradictions++; details.push({ kind: 'multi-rule', topic: 'style', n: styleRules.length }); }

console.log(JSON.stringify({ bullets: bullets.length, dup_pairs: dupPairs, contradictions, details }));
