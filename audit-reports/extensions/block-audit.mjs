#!/usr/bin/env node
// Aggregate block audit over session files given as args.
// For every permission-gate block: blocked call, reason family/size,
// next-action classification, recovery-result size, and for Re-run blocks
// the size of the prior identical run's output (tokens saved).
import { readFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';

const PREFIXES = ['Anchor Guard', 'Token Economy', 'Commitlint'];
const norm = (s) => JSON.stringify(s).replace(/\s+/g, ' ');

const blocks = [];
const sessTotals = [];

for (const file of process.argv.slice(2)) {
	const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
	const calls = new Map(); // id -> {name, args, ts}
	const results = new Map(); // id -> {chars, blocked}
	let msgCount = 0;
	const rows = [];
	let pending = null;

	for (const line of lines) {
		let j; try { j = JSON.parse(line); } catch { continue; }
		if (j.type !== 'message') continue;
		const m = j.message;
		msgCount++;
		if (m.role === 'assistant') {
			for (const c of m.content || []) {
				if (c.type === 'toolCall') calls.set(c.id, { name: c.name, args: c.arguments, ts: Date.parse(j.timestamp) });
			}
			if (pending) {
				pending.recoveryActs = (m.content || [])
					.filter((c) => c.type === 'toolCall' || (c.type === 'text' && c.text?.trim()))
					.map((c) => c.type === 'toolCall'
						? { tool: c.name, args: c.arguments }
						: { tool: '(text)', args: (c.text || '').slice(0, 100) });
				pending.recoveryTurnChars = JSON.stringify(m.content || []).length;
				pending = null;
			}
		}
		if (m.role === 'toolResult') {
			for (const c of m.content || []) {
				const txt = c.text || '';
				const id = m.toolCallId;
				const isBlock = PREFIXES.some((p) => txt.startsWith(p));
				results.set(id, { chars: txt.length, blocked: isBlock });
				if (isBlock) {
					const call = calls.get(id) || { name: m.toolName, args: {} };
					const family = txt.slice(0, txt.indexOf(':'));
					const r = {
						file: basename(file), dir: basename(dirname(file)), ts: Date.parse(j.timestamp),
						tool: call.name, args: norm(call.args).slice(0, 180), fullArgs: norm(call.args),
						family, reasonChars: txt.length, reason0: txt,
						recoveryActs: null, recoveryTurnChars: 0,
						savedChars: 0, recoveryResultChars: 0,
					};
					rows.push(r); pending = r;
				}
			}
		}
	}
	if (pending) pending.recoveryActs = [];

	// post-pass: classify + measure
	for (const r of rows) {
		// find prior identical run (same tool+args) before block ts
		let prior = null;
		for (const [id, c] of calls) {
			if (c.ts < r.ts && c.name === r.tool && norm(c.args) === r.fullArgs) {
				const res = results.get(id);
				if (res && !res.blocked && (!prior || c.ts > prior.ts)) prior = { ...c, res };
			}
		}
		if (r.family.startsWith('Token Economy (Re-run')) {
			const q = (r.reason0 || '').match(/'([^']{4,})'/);
			if (q) {
				for (const [id, c] of calls) {
					if (c.ts < r.ts && c.name === 'bash' && String(c.args?.command || '').includes(q[1])) {
						const res = results.get(id);
						if (res && !res.blocked && res.chars > (r.savedChars || 0)) r.savedChars = res.chars; // most recent wins below
					}
				}
			}
		}
		// recovery result size + classification
		if (r.recoveryActs?.length) {
			const first = r.recoveryActs.find((a) => a.tool !== '(text)');
			if (!first) r.cls = 'text-only (explain/ask)';
			else {
				const same = first.tool === r.tool && norm(first.args) === r.fullArgs;
				if (same) r.cls = 'RETRY-SAME (bad)';
				else if (first.tool === r.tool) r.cls = 'corrected retry (same tool, new args)';
				else r.cls = 'switched tool (compliant)';
				// size of recovery call results
				for (const [id, c] of calls) {
					if (c.ts > r.ts && c.name === first.tool && norm(c.args) === norm(first.args)) {
						const res = results.get(id);
						if (res && !res.blocked) r.recoveryResultChars = res.chars;
					}
				}
			}
		} else r.cls = 'none';
		blocks.push(r);
	}
	sessTotals.push({ file: basename(file), dir: basename(dirname(file)), msgs: msgCount, blocks: rows.length });
}

// summary
const fam = {};
for (const b of blocks) fam[b.family] = (fam[b.family] || 0) + 1;
const cls = {};
for (const b of blocks) cls[b.cls] = (cls[b.cls] || 0) + 1;
const realBlocks = blocks.filter((b) => !b.dir.includes('pi-integ'));
const integBlocks = blocks.filter((b) => b.dir.includes('pi-integ'));

console.log('SESSIONS WITH BLOCKS:');
for (const s of sessTotals.filter((s) => s.blocks)) console.log(`  ${s.dir}/${s.file}: ${s.blocks} blocks, ${s.msgs} msgs`);
console.log(`\nTOTAL: ${blocks.length} blocks (${realBlocks.length} real sessions, ${integBlocks.length} integ-test)`);
console.log('FAMILIES:', JSON.stringify(fam, null, 0));
console.log('RECOVERY:', JSON.stringify(cls, null, 0));
const reasonChars = blocks.reduce((a, b) => a + b.reasonChars, 0);
const savedChars = blocks.reduce((a, b) => a + b.savedChars, 0);
const recovChars = blocks.reduce((a, b) => a + b.recoveryResultChars, 0);
const turnChars = blocks.reduce((a, b) => a + b.recoveryTurnChars, 0);
console.log(`recoveryTurnChars=${turnChars} (~${Math.round(turnChars / 4)} tok)`);
console.log(`reasonChars=${reasonChars} (~${Math.round(reasonChars / 4)} tok) | savedChars(measured dup-avoided)=${savedChars} (~${Math.round(savedChars / 4)} tok) | recoveryResultChars=${recovChars} (~${Math.round(recovChars / 4)} tok)`);

// per-family aggregates
const byFam = {};
for (const b of blocks.filter((b) => !b.dir.includes('pi-integ'))) {
	const f = byFam[b.family] ||= { n: 0, reason: 0, turn: 0, saved: 0, recres: 0, worst: null };
	f.n++; f.reason += b.reasonChars; f.turn += b.recoveryTurnChars; f.saved += b.savedChars; f.recres += b.recoveryResultChars;
	if (!f.worst || b.recoveryResultChars > f.worst.recoveryResultChars) f.worst = b;
}
console.log('\nFAMILY AGGREGATES (chars; ~tok = /4):');
for (const [fam, f] of Object.entries(byFam)) {
	console.log(`  ${fam}: n=${f.n} reason=${f.reason} turn=${f.turn} recovRes=${f.recres} saved=${f.saved} net=${f.saved - f.reason - f.recres}`);
}
console.log('\n--- DETAIL (real sessions) ---');
let i = 0;
const want = process.env.ONLY ? process.env.ONLY.split(',') : null;
for (const b of realBlocks.filter((b) => !want || want.includes(b.family))) {
	i++;
	console.log(`\n#${i} ${b.dir}/${b.file} @${new Date(b.ts).toISOString()}`);
	console.log(`  BLOCKED: ${b.tool} ${b.args}`);
	console.log(`  FAMILY : ${b.family} (${b.reasonChars}c)`);
	console.log(`  NEXT   : [${b.cls}] ${b.recoveryActs?.slice(0, 2).map((a) => a.tool + ' ' + norm(a.args).slice(0, 90)).join(' || ')}`);
	if (b.savedChars) console.log(`  SAVED  : dup output avoided = ${b.savedChars}c (~${Math.round(b.savedChars / 4)} tok)`);
	if (b.recoveryResultChars) console.log(`  RECRES : ${b.recoveryResultChars}c (~${Math.round(b.recoveryResultChars / 4)} tok)`);
}
