#!/usr/bin/env node
/**
 * sol-pi-audit.mjs — audit SoL-Pi mechanism activity and realized token savings
 * across pi sessions.
 *
 * Usage:
 *   node scripts/sol-pi-audit.mjs [sessions-root] [--sol-pi-only]
 *
 * Default sessions root: ~/.pi/agent/sessions
 *
 * Per session it reports:
 *   - whether SoL-Pi was active (obs_recall tool injected into the system prompt)
 *   - fused edit/write calls (Action Fusion: each avoids one model round-trip)
 *   - tokens removed by ObservationPack placeholders (sum of ledger removedTokens)
 *   - obs_recall reads (model pulling exact bytes back)
 *   - session token totals and cost
 *
 * Evidence sources:
 *   - session .jsonl logs (usage per assistant message, toolCall blocks)
 *   - SoL-Pi ledgers: <sessions-root>/<project>/sol-pi/<session-id>/observation-pack/ledger.jsonl
 *     (event types: "full" = sent in full, "placeholder" = replaced by handle,
 *      "recall" = exact bytes pulled back via obs_recall)
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

const argRoot = process.argv.slice(2).find((a) => !a.startsWith("-"));
const solPiOnly = process.argv.includes("--sol-pi-only");
const root = argRoot
	? path.resolve(argRoot)
	: path.join(os.homedir(), ".pi", "agent", "sessions");

if (!fs.existsSync(root)) {
	console.error(`sessions root not found: ${root}`);
	process.exit(1);
}

const fmt = (n) => n.toLocaleString("en-US");

async function auditSession(file) {
	const rl = readline.createInterface({
		input: fs.createReadStream(file),
		crlfDelay: Infinity,
	});
	const u = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, cost: 0 };
	let turns = 0;
	let fused = 0;
	let editWrite = 0;
	let solPi = false;
	let sessionId = "";
	let model = "";
	let started = "";
	for await (const line of rl) {
		let o;
		try {
			o = JSON.parse(line);
		} catch {
			continue;
		}
		if (o.type === "session") {
			sessionId = o.id;
			started = (o.timestamp || "").slice(0, 16);
		}
		if (o.type === "model_change" && !model) model = `${o.provider}/${o.modelId}`;
		const m = o.message;
		if (o.type !== "message" || !m) continue;
		if (m.usage) {
			u.input += m.usage.input || 0;
			u.output += m.usage.output || 0;
			u.cacheRead += m.usage.cacheRead || 0;
			u.cacheWrite += m.usage.cacheWrite || 0;
			u.total += m.usage.totalTokens || 0;
			u.cost += m.usage.cost?.total || 0;
			turns++;
		}
		if (m.role === "assistant" && Array.isArray(m.content)) {
			for (const b of m.content) {
				if (b.type === "toolCall" && (b.name === "edit" || b.name === "write")) {
					editWrite++;
					if (JSON.stringify(b).includes("then_run")) fused++;
				}
			}
		}
		if (!solPi && line.includes("obs_recall")) solPi = true;
	}
	rl.close();

	// SoL-Pi ledger (only exists when ObservationPack actually packed something)
	let packSaved = 0;
	let packPlaceholders = 0;
	let recalls = 0;
	if (solPi && sessionId) {
		const ledger = path.join(
			path.dirname(file),
			"sol-pi",
			sessionId,
			"observation-pack",
			"ledger.jsonl",
		);
		if (fs.existsSync(ledger)) {
			for (const line of fs.readFileSync(ledger, "utf8").split("\n")) {
				if (!line.trim()) continue;
				try {
					const e = JSON.parse(line);
					if (e.event === "placeholder") {
						packPlaceholders++;
						packSaved += e.removedTokens || 0;
					} else if (e.event === "recall") {
						recalls++;
					}
				} catch {
					/* skip malformed ledger line */
				}
			}
		}
	}

	// Action Fusion estimate: each fused call avoids one full round-trip.
	// A round-trip re-sends the whole context; approximate with the session's
	// average tokens per request. Upper-bound-ish, so reported as estimate.
	const avgReq = turns > 0 ? u.total / turns : 0;
	const fusionEst = Math.round(fused * avgReq);

	return {
		file,
		started,
		project: path.basename(path.dirname(file)),
		model,
		solPi,
		turns,
		fused,
		editWrite,
		packSaved,
		packPlaceholders,
		recalls,
		fusionEst,
		...u,
	};
}

async function main() {
	const files = [];
	for (const proj of fs.readdirSync(root)) {
		const projDir = path.join(root, proj);
		if (!fs.statSync(projDir).isDirectory()) continue;
		for (const f of fs.readdirSync(projDir)) {
			if (f.endsWith(".jsonl")) files.push(path.join(projDir, f));
		}
	}
	// sessions stored directly in the root (e.g. a custom --session-dir)
	for (const f of fs.readdirSync(root)) {
		if (f.endsWith(".jsonl")) files.push(path.join(root, f));
	}
	const results = [];
	for (const f of files) {
		try {
			results.push(await auditSession(f));
		} catch (e) {
			console.error(`skip ${f}: ${e.message}`);
		}
	}
	results.sort((a, b) => a.started.localeCompare(b.started));

	const rows = solPiOnly ? results.filter((r) => r.solPi) : results;
	const head =
		"started            solpi   project                        turns  fused  packSaved  recalls  totalTok      cost";
	console.log(head);
	console.log("-".repeat(head.length));
	for (const r of rows) {
		console.log(
			`${r.started.padEnd(18)} ${(r.solPi ? "YES" : "-").padEnd(6)} ${r.project.slice(0, 30).padEnd(30)} ${String(r.turns).padStart(5)} ${String(r.fused).padStart(6)} ${String(r.packSaved).padStart(10)} ${String(r.recalls).padStart(7)} ${String(r.total).padStart(10)} $${r.cost.toFixed(4)}`,
		);
	}

	// Summary across SoL-Pi sessions
	const sol = results.filter((r) => r.solPi);
	if (sol.length === 0) {
		console.log("\nNo SoL-Pi sessions found.");
		return;
	}
	const sum = (key) => sol.reduce((a, r) => a + r[key], 0);
	const packSaved = sum("packSaved");
	const fusionEst = sum("fusionEst");
	const totalTok = sum("total");
	const cost = sum("cost");
	console.log("\n=== SoL-Pi summary ===");
	console.log(`sessions with sol-pi active : ${sol.length}`);
	console.log(`fused edit/write calls      : ${sum("fused")} (round-trips avoided)`);
	console.log(`packed replays              : ${sum("packPlaceholders")} (obs_recall reads: ${sum("recalls")})`);
	console.log(`tokens removed by packing   : ${fmt(packSaved)} (exact, from ledger)`);
	console.log(`fusion savings (estimate)   : ${fmt(fusionEst)} (fused x avg tokens/request)`);
	console.log(`total tokens spent          : ${fmt(totalTok)} ($${cost.toFixed(2)})`);
	const saved = packSaved + fusionEst;
	console.log(
		`estimated net savings       : ${fmt(saved)} tokens (~${((saved / Math.max(1, totalTok + saved)) * 100).toFixed(1)}% of traffic)`,
	);
	const inactive = sol.filter((r) => r.fused === 0 && r.packSaved === 0);
	console.log(
		`sessions with ZERO savings  : ${inactive.length}/${sol.length}` +
			(inactive.length > 0 ? "  <-- overhead, no benefit" : ""),
	);
}

main();
