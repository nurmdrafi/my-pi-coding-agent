#!/usr/bin/env node
// mdcmdcheck v2 — validate shell commands declared in markdown fenced code blocks.
// v2: quote-aware segmenting, backslash-continuation joining, flag-check keyed on
// bin+subcommand, interpreters exempt from flag checks, relative scripts checked
// for existence against the md file's dir + repo root.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// repo root = 3 levels up from skills/harness-engineer/scripts/mdcmdcheck.mjs — portable, no absolute paths
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SHELL_LANGS = new Set(['sh', 'bash', 'shell', 'console', 'zsh']);
const BUILTINS = new Set(['echo','cd','printf','export','set','unset','source','alias','local','return','exit','read','test','[','eval','true','false','pwd','shift','command','type','wait','trap','umask','pushd','popd','dirs','hash','let','declare','readonly','getopts','shopt','ulimit','jobs','fg','bg','kill','times','break','continue','then','else','fi','do','done','if','while','for','until','case','esac','function','in','select','time','coproc','exec']);
const INTERPRETERS = new Set(['node','npm','npx','python','python3','bash','sh','env','deno','bun']); // flags belong to scripts/subcommands we can't introspect
const MAC_ONLY = new Set(['pbcopy','pbpaste','osascript','launchctl','security','codesign','mdfind','open','defaults','brew','say','caffeinate','networksetup','screencapture','textutil','pluid','xcodebuild','swift','sw_vers','softwareupdate','pmset','system_profiler','diskutil','hdiutil','installer','port']);
// bare script name → resolve against skills/*/scripts/ (sibling-skill references)
const harnessScript = (tok) => readdirSync(join(ROOT, 'skills')).some(s => existsSync(join(ROOT, 'skills', s, 'scripts', tok)));

const mds = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    if (e === 'node_modules' || e === '.git') continue;
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (e.endsWith('.md')) mds.push(p);
  }
})(ROOT);

const syntaxFail = [], binFail = [], macOnlyRefs = [], scriptMissing = [], flagFail = [];
const helpCache = new Map();
const helpFlags = (key) => {
  if (helpCache.has(key)) return helpCache.get(key);
  const [bin, sub] = key.split(' ');
  const args = sub ? [sub, '--help'] : ['--help'];
  let out = '';
  try { out = execFileSync(bin, args, { encoding: 'utf8', timeout: 15000 }) + ''; } catch (e) { out = (e.stdout || '') + ''; }
  const flags = new Set();
  for (const m of out.matchAll(/--?[a-zA-Z][a-zA-Z0-9-]*/g)) flags.add(m[0]);
  helpCache.set(key, flags);
  return flags;
};

// quote-aware split on |, ||, &&, ; — never inside ' or "
const segSplit = (line) => {
  const segs = ['']; let q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { segs[segs.length-1] += c; if (c === q) q = null; continue; }
    if (c === "'" || c === '"') { q = c; segs[segs.length-1] += c; continue; }
    if (c === '|' && line[i+1] === '|') { segs.push(''); i++; continue; }
    if (c === '&' && line[i+1] === '&') { segs.push(''); i++; continue; }
    if (c === '|' || c === ';') { segs.push(''); continue; }
    segs[segs.length-1] += c;
  }
  return segs;
};
const headTok = (seg) => {
  let t = seg.trim().replace(/^[$#>]\s+/, '');
  if (!t || t.startsWith('#')) return null;
  t = t.replace(/^([A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/, '');
  t = t.replace(/^(sudo|command|nohup)\s+/, '');
  const tok = t.split(/\s+/)[0];
  if (!tok) return null;
  if (/^[-{(<> "#`$%&*]/.test(tok) || /^[a-z_]+=\S*$/.test(tok)) return null;
  if (BUILTINS.has(tok)) return null;
  return tok.replace(/[;'"]+$/,'');
};
const subCmd = (seg, tok) => {
  const t = seg.trim().replace(/^[$#>]\s+/, '').replace(/^([A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/, '');
  const parts = t.split(/\s+/);
  if (parts[0] !== tok) return null;
  const s = parts[1] || '';
  return /^[a-z][a-z0-9-]*$/.test(s) && !s.startsWith('-') ? s : null;
};

const blockRe = /```([a-zA-Z0-9]*)\n([\s\S]*?)```/g;
const binSeen = new Set(), flagByKey = new Map();
for (const md of mds) {
  const text = readFileSync(md, 'utf8');
  let m;
  while ((m = blockRe.exec(text)) !== null) {
    const [, lang, body] = m;
    if (!SHELL_LANGS.has(lang)) continue;
    // <placeholder> tokens (e.g. `<skill-dir>`) are doc convention, not redirects — quote them for bash -n (documented waiver)
    const syntaxInput = body.replace(/<([a-zA-Z][^<>\n]*)>/g, '"<$1>"');
    try { execFileSync('bash', ['-n'], { input: syntaxInput, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch { syntaxFail.push(`${md.replace(ROOT+'/','')} :: ${body.split('\n').find(l=>l.trim())?.slice(0,60)}`); }
    // join backslash continuations, drop comments
    const joined = body.split('\n').reduce((a, l) => {
      const clean = l.replace(/(^|\s)#.*$/, '$1').trimEnd();
      if (!clean.trim()) return a;
      if (clean.endsWith('\\')) { a.carried += clean.slice(0,-1) + ' '; return a; }
      a.lines.push(a.carried + clean); a.carried = ''; return a;
    }, { lines: [], carried: '' });
    if (joined.carried) joined.lines.push(joined.carried);
    for (const line of joined.lines) {
      for (const seg of segSplit(line)) {
        const tok = headTok(seg);
        if (!tok) continue;
        const rel = `${md.replace(ROOT+'/','')}: ${tok}`;
        if (/^(\.\/|\.\.\/|scripts\/|bin\/)/.test(tok) || tok.endsWith('.sh')) {
          // candidates: md's dir, repo root, and skill root (nearest dir with SKILL.md —
          // references/ docs legitimately point at skill-root scripts/)
          let skillRoot = dirname(md); let c2 = skillRoot;
          while (c2 !== ROOT && !existsSync(join(c2, 'SKILL.md'))) { c2 = dirname(c2); }
          if (existsSync(join(c2, 'SKILL.md'))) skillRoot = c2;
          const cands = [resolve(dirname(md), tok), resolve(ROOT, tok), resolve(skillRoot, tok)];
          if (!cands.some(c => existsSync(c)) && !harnessScript(tok)) scriptMissing.push(`${rel}  <<< ${line.slice(0,70)}`);
          continue;
        }
        if (MAC_ONLY.has(tok)) { macOnlyRefs.push(`${rel}  <<< ${line.slice(0,70)}`); continue; }
        try { execFileSync('bash', ['-c', 'command -v "$1" >/dev/null 2>&1', '_', tok]); binSeen.add(tok); }
        catch { binFail.push(`${rel}  <<< ${line.slice(0,70)}`); continue; }
        if (INTERPRETERS.has(tok)) continue;
        const sub = subCmd(seg, tok);
        const key = sub ? `${tok} ${sub}` : tok;
        const flags = (seg.match(/--[a-zA-Z][a-zA-Z0-9-]*/g) || []);
        if (!flags.length) continue;
        if (!flagByKey.has(key)) flagByKey.set(key, new Set());
        flags.forEach(f => flagByKey.get(key).add(f));
      }
    }
  }
}
const KNOWN = /^(rg|grep|egrep|fgrep|find|xargs|jq|sed|cut|sort|uniq|wc|head|tail|ast-grep|git|npm|npx|node|tvly|pi|fd|awk|tr|chmod|ls|cat|curl|sh|bash|command|skillcheck\.sh)\s/;
const inlineRe = /`([^`\n]+)`/g;
for (const md of mds) {
  const text = readFileSync(md, 'utf8');
  let im;
  while ((im = inlineRe.exec(text)) !== null) {
    let line = im[1].trim();
    if (!KNOWN.test(line + ' ')) continue;
    if (line.includes('…') || line.includes('...')) line = line.split(/…|\.\.\./)[0];
    for (const seg of segSplit(line)) {
      const tok = headTok(seg);
      if (!tok) continue;
      try { execFileSync('bash', ['-c', 'command -v "$1" >/dev/null 2>&1', '_', tok]); binSeen.add(tok); }
      catch {
        if (harnessScript(tok)) { binSeen.add(tok); continue; }
        binFail.push(`${md.replace(ROOT+'/','')}: INLINE: ${tok}  <<< ${line.slice(0,70)}`); continue;
      }
      if (INTERPRETERS.has(tok) || MAC_ONLY.has(tok)) continue;
      const sub = subCmd(seg, tok);
      const key = sub ? `${tok} ${sub}` : tok;
      const flags = (seg.match(/--[a-zA-Z][a-zA-Z0-9-]*/g) || []);
      if (!flags.length) continue;
      if (!flagByKey.has(key)) flagByKey.set(key, new Set());
      flags.forEach(f => flagByKey.get(key).add(f));
    }
  }
}
for (const [key, flags] of flagByKey) {
  const help = helpFlags(key);
  for (const f of flags) if (!help.has(f)) flagFail.push(`${key} ${f}`);
}

console.log(`md files scanned: ${mds.length}`);
console.log(`binaries OK: ${[...binSeen].sort().join(' ') || '(none)'}`);
console.log(`\nSYNTAX FAIL (${syntaxFail.length}):`); syntaxFail.forEach(x => console.log('  ' + x));
console.log(`\nBINARY NOT FOUND (${binFail.length}):`); binFail.forEach(x => console.log('  ' + x));
console.log(`\nRELATIVE SCRIPT MISSING (${scriptMissing.length}):`); scriptMissing.forEach(x => console.log('  ' + x));
console.log(`\nMAC-ONLY REFS (info, ${macOnlyRefs.length}):`); macOnlyRefs.forEach(x => console.log('  ' + x));
console.log(`\nFLAG NOT IN HELP (${flagFail.length}):`); flagFail.forEach(x => console.log('  ' + x));

// macOnly is info-only; everything else fails the gate
process.exit([syntaxFail, binFail, scriptMissing, flagFail].some((a) => a.length) ? 1 : 0);
