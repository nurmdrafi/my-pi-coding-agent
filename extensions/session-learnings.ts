/**
 * Session learnings — Tier 1 of the self-learning loop (learn-claude-code s09
 * pattern, adapted): on every settled agent run that carries reviewable
 * signal, append one deterministic summary line to
 * ~/.pi/agent/learnings/pending.md. The periodic harness-engineer review
 * (Tier 2) promotes recurring items into rules/skills/guards — promotion
 * requires a Measured: line; this file is only the candidate queue.
 *
 * Counters only: no model calls, no prefix bytes, external storage. Errors are
 * counted from tool_result (canonical); guard blocks only surface at
 * tool_execution_end with a permission-gate rule-family prefix, so the two
 * never overlap and no id dedupe is needed.
 * ponytail: a killed process loses the in-flight run — session JSONLs stay the
 * source of truth; this queue is a convenience index, not a ledger.
 */

import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const LEARN_DIR = join(homedir(), ".pi", "agent", "learnings");
const OUT_FILE = join(LEARN_DIR, "pending.md");
const HEADER =
	"# Pending learnings\n\n" +
	"One line per settled run with signal (errors / guard blocks / heavy tool use / cache instability).\n" +
	"Tier 2 review (harness-engineer): promote recurring items into AGENTS.md rules, skills, or\n" +
	"permission-gate guards — each promotion needs a Measured: line in CHANGELOG.md — then delete\n" +
	"the consumed lines here. Never edit AGENTS.md directly from raw queue lines.\n\n";

/** permission-gate blocks carry a stable rule-family prefix; the reason text follows on the same line */
const RULE_FAMILY = /^(Anchor Guard:|Token Economy \([^)]*\):)/;;

interface UsageLike {
	input?: number;
	output?: number;
	cacheRead?: number;
}
interface Run {
	start: number;
	turns: number;
	tools: number;
	errors: Map<string, number>; // toolName -> tool_result isError count
	blocks: Map<string, number>; // rule family -> blocked-call count
	provErrs: number;
	inTok: number;
	outTok: number;
	cacheRead: number;
}

const emptyRun = (): Run => ({
	start: 0,
	turns: 0,
	tools: 0,
	errors: new Map(),
	blocks: new Map(),
	provErrs: 0,
	inTok: 0,
	outTok: 0,
	cacheRead: 0,
});

let run = emptyRun();

const bump = (m: Map<string, number>, k: string): void => {
	m.set(k, (m.get(k) ?? 0) + 1);
};

/** top-3 entries, desc — "bash×2,edit×1" */
const fmt = (m: Map<string, number>): string =>
	[...m.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 3)
		.map(([k, v]) => `${k}×${v}`)
		.join(",") || "-";

const kfmt = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`);

function flush(cwd: string): void {
	const inPlusCache = run.inTok + run.cacheRead;
	const cachePct = inPlusCache > 0 ? Math.round((100 * run.cacheRead) / inPlusCache) : 0;
	const failing = run.errors.size > 0 || run.blocks.size > 0 || run.provErrs > 0;
	const heavy = run.tools >= 10 || run.turns >= 15;
	const unstable = inPlusCache > 100_000 && cachePct < 40; // prefix churning — cache-is-sacred signal
	if (!failing && !heavy && !unstable) return; // zero-signal runs are not learnings

	const dur = run.start ? Math.max(1, Math.round((Date.now() - run.start) / 60_000)) : 0;
	const proj = cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd;
	const flag = unstable ? " ⚠cache" : "";
	const line =
		`- ${new Date().toISOString().slice(0, 16).replace("T", " ")}Z · ${proj}${flag} · ` +
		`turns=${run.turns} tools=${run.tools} errs=[${fmt(run.errors)}] blocks=[${fmt(run.blocks)}] ` +
		`provErrs=${run.provErrs} tok in=${kfmt(run.inTok)}/out=${kfmt(run.outTok)} cache=${cachePct}% dur=${dur}m\n`;

	try {
		mkdirSync(LEARN_DIR, { recursive: true });
		if (!existsSync(OUT_FILE)) appendFileSync(OUT_FILE, HEADER);
		appendFileSync(OUT_FILE, line);
	} catch {
		// telemetry must never break the agent loop
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("agent_start", () => {
		run = emptyRun();
		run.start = Date.now();
	});
	pi.on("turn_end", () => {
		run.turns++;
	});
	pi.on("tool_execution_start", () => {
		run.tools++;
	});
	pi.on("tool_result", (event) => {
		if (event.isError) bump(run.errors, event.toolName);
	});
	pi.on("tool_execution_end", (event) => {
		if (!event.isError) return;
		const content = Array.isArray(event.result?.content)
			? (event.result.content as { type: string; text?: string }[])
			: [];
		const text = content
			.filter((c) => c.type === "text" && typeof c.text === "string")
			.map((c) => c.text)
			.join("\n");
		const first = text.split("\n", 1)[0]?.trim() ?? "";
		const m = RULE_FAMILY.exec(first);
		if (m) bump(run.blocks, m[0].slice(0, -1)); // strip trailing ":" → family name
	});
	pi.on("after_provider_response", (event) => {
		if (event.status >= 400) run.provErrs++;
	});
	pi.on("message_end", (event) => {
		const msg = event.message as { usage?: UsageLike };
		const u = msg?.usage;
		if (!u) return; // assistant + nested-call toolResult messages carry usage
		run.inTok += u.input ?? 0;
		run.outTok += u.output ?? 0;
		run.cacheRead += u.cacheRead ?? 0;
	});
	pi.on("agent_settled", (_event, ctx) => {
		flush(ctx.cwd);
	});
}
