/**
 * Error telemetry — captures every runtime error while the LLM works, appending to
 * machine-local, gitignored ~/.pi/agent/logs/errors-<YYYY-MM-DD>.jsonl:
 *   - tool failures     (tool_result isError: bash exit≠0, edit anchor misses,
 *                        blocked guard calls, fs errors)
 *   - provider errors   (after_provider_response HTTP status >= 400: rate
 *                        limits, auth, 5xx — the LLM call itself failing)
 *   - compaction failures (session_compact_failed, non-abort)
 * `/errors [n]` reviews the last n (default 10).
 * External storage only — zero model-context cost, no prefix change.
 */

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const LOG_DIR = join(homedir(), ".pi", "agent", "logs");
const MAX_CHARS = 2000; // per-field cap; the session transcript holds full output

const loggedIds = new Set<string>();
const loggedQueue: string[] = [];

/** returns false when id was already logged (dedupe tool_result vs tool_execution_end) */
function markLogged(id: string): boolean {
	if (loggedIds.has(id)) return false;
	loggedIds.add(id);
	loggedQueue.push(id);
	if (loggedQueue.length > 256) loggedIds.delete(loggedQueue.shift() as string);
	return true;
}

function textOf(content: { type: string; text?: string }[]): string {
	return content
		.filter((c) => c.type === "text" && typeof c.text === "string")
		.map((c) => c.text)
		.join("\n");
}

function append(kind: string, cwd: string, rec: Record<string, unknown>): void {
	try {
		const now = new Date();
		const line = JSON.stringify({ ts: now.toISOString(), cwd, kind, ...rec });
		mkdirSync(LOG_DIR, { recursive: true });
		appendFileSync(join(LOG_DIR, `errors-${now.toISOString().slice(0, 10)}.jsonl`), line + "\n");
	} catch {
		// logging must never break the agent loop
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("tool_result", (event, ctx) => {
		if (!event.isError || !markLogged(event.toolCallId)) return;
		append("tool", ctx.cwd, {
			tool: event.toolName,
			input: JSON.stringify(event.input).slice(0, MAX_CHARS),
			output: textOf(event.content).slice(0, MAX_CHARS),
		});
	});

	// blocked tool calls (guard blocks, unknown tools) never reach tool_result —
	// they surface only here, with isError and the block reason in result.content
	pi.on("tool_execution_end", (event, ctx) => {
		if (!event.isError || !markLogged(event.toolCallId)) return;
		const content = Array.isArray(event.result?.content) ? event.result.content : [];
		append("blocked", ctx.cwd, {
			tool: event.toolName,
			output: textOf(content).slice(0, MAX_CHARS),
		});
	});

	pi.on("after_provider_response", (event, ctx) => {
		if (event.status < 400) return;
		const retryAfter = event.headers?.["retry-after"] ?? event.headers?.["Retry-After"];
		append("provider", ctx.cwd, {
			status: event.status,
			output: `HTTP ${event.status}${retryAfter ? ` (retry-after ${retryAfter})` : ""}`,
		});
	});

	pi.on("session_compact_failed", (event, ctx) => {
		if (event.aborted || !event.errorMessage) return; // user cancels are not errors
		append("compaction", ctx.cwd, {
			reason: event.reason,
			output: event.errorMessage.slice(0, MAX_CHARS),
		});
	});

	pi.registerCommand("errors", {
		description: "Show the last N logged runtime errors (default 10)",
		handler: async (args, ctx) => {
			const n = Math.max(1, Math.min(100, parseInt(args, 10) || 10));
			if (!existsSync(LOG_DIR)) {
				ctx.ui.notify("error-telemetry: nothing logged yet", "info");
				return;
			}
			const days = readdirSync(LOG_DIR)
				.filter((f) => /^errors-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
				.sort()
				.reverse();
			const rows: string[] = [];
			for (const day of days) {
				if (rows.length >= n) break;
				const file = join(LOG_DIR, day);
				if (!existsSync(file)) continue;
				const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
				for (let i = lines.length - 1; i >= 0 && rows.length < n; i--) {
					try {
						const r = JSON.parse(lines[i]) as {
							ts: string;
							kind: string;
							tool?: string;
							status?: number;
							input?: unknown;
							reason?: string;
							output: string;
						};
						let input: { command?: string; path?: string } = {};
						try {
							input = JSON.parse(String(r.input)) as { command?: string; path?: string };
						} catch {
							/* truncated input JSON — display without it */
						}
						const what =
							r.kind === "provider"
								? `HTTP ${r.status ?? "?"}`
								: String((input.command ?? input.path ?? r.reason ?? "")).split("\n")[0];
						const who = r.tool ?? r.kind;
						const why =
							r.output.match(/Command exited with code \d+/)?.[0]
							?? r.output.split("\n").find((l) => l.trim())
							?? "";
						rows.push(`${r.ts.slice(11, 19)} ${who} ${what.slice(0, 80)} — ${why.slice(0, 90)}`);
					} catch {
						/* skip malformed line */
					}
				}
			}
			ctx.ui.notify(
				rows.length ? rows.join("\n") : "error-telemetry: nothing logged yet",
				rows.length ? "warning" : "info",
			);
		},
	});
}
