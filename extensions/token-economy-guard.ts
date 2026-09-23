/**
 * Token-economy guard — mechanically enforces AGENTS.md reading/output rules
 * on bash tool calls by blocking violations with the corrective rule text.
 * Sources: 2026-09-16 audit (cat-for-viewing 86, uncapped runners, git log) and
 * 2026-09-23 audit (read-after-edit re-read loops 316K/wk, uncapped rg -o 119K/wk).
 */

import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** true if cmd segment ends in a pipe to a capping/filtered consumer */
function isCapped(seg: string): boolean {
	return /\|\s*(head|tail|rg|grep|cut|jq|sort|uniq|wc)\b/.test(seg);
}

/** read-after-edit freshness: path -> seq of the last confirmed edit/write result */
const lastInContext = new Map<string, number>();
/** edit/write toolCallId -> path, awaiting its tool_result */
const pendingEdits = new Map<string, string>();
let seq = 0;
/** a full re-read within this many tool calls of a confirmed edit is redundant (~3 turns) */
const REREAD_WINDOW = 6;

function normPath(p: unknown): string {
	return String(p ?? "").replace(/\/+$/, "");
}

export default function (pi: ExtensionAPI) {
	pi.on("tool_call", async (event) => {
		seq++;

		// R1 (2026-09-23): no full re-read of a file whose edit result is already in context
		if (isToolCallEventType("read", event)) {
			const path = normPath(event.input.path);
			const editedAt = lastInContext.get(path);
			const windowed = typeof event.input.offset === "number" || typeof event.input.limit === "number";
			if (editedAt !== undefined && seq - editedAt <= REREAD_WINDOW && !windowed) {
				return {
					block: true,
					reason:
						`Token Economy (Re-read): '${path}' was edited in the last few turns — the new content is already in ` +
						`context from the edit result. Don't re-read after a successful edit. If you need a different region, ` +
						`use a windowed read (offset/limit); if the file changed externally, grep it instead.`,
				};
			}
		}

		// track edits/writes; freshness is confirmed only on a successful tool_result
		if (isToolCallEventType("edit", event) || isToolCallEventType("write", event)) {
			pendingEdits.set(event.toolCallId, normPath(event.input.path));
		}

		if (!isToolCallEventType("bash", event)) return;
		const cmd = event.input.command;

		// a bash command naming an edited file may have changed it externally -> drop freshness
		for (const path of lastInContext.keys()) {
			const base = path.split("/").pop() as string;
			if (base && cmd.includes(base)) lastInContext.delete(path);
		}

		// split into segments; each checked independently
		const segs = cmd.split(/(?:\n|&&|;|\|\|)/).map((s) => s.trim()).filter(Boolean);

		for (const seg of segs) {
			// R2: cat/head/tail/sed for file viewing (no pipe consumer)
			if (/^(cat|sed -n)\b/.test(seg) && !seg.includes("|") && !seg.includes(">>") && !seg.includes(">")) {
				return {
					block: true,
					reason:
						`Token Economy (Reading): use the 'read' tool (offset/limit) for file viewing, not bash '${seg.split(" ")[0]}'. ` +
						`sed -n only when batching 2+ regions. cat is fine inside a pipeline, not standalone.`,
				};
			}

			// R6 (2026-09-23): rg -o extraction must be capped before landing in context
			// (quoted spans stripped first so a *pattern* containing "-o" can't false-fire)
			const bare = seg.replace(/"[^"]*"/g, "").replace(/'[^']*'/g, "");
			if (/(^|[ /])rg\b[^\n|]*\s(--only-matching|-[a-zA-Z]*o)\b/.test(bare) && !isCapped(seg)) {
				return {
					block: true,
					reason:
						`Token Economy (Extraction): 'rg -o' results must be capped before they land in context — ` +
						`pipe through '| head -N' or '| cut -c1-200'. Wide -o windows over big/minified files emit whole-file-sized output.`,
				};
			}

			// R5-ish: git log must be capped
			if (/^git log\b/.test(seg) && !/--oneline/.test(seg) && !/-n\s?\d+|--max-count=\d+/.test(seg) && !isCapped(seg)) {
				return {
					block: true,
					reason: `Token Economy (git reads): 'git log' must be 'git log --oneline | head' or '-n <N>'.`,
				};
			}

			// Output cap: verbose build/test runners need a filter pipe
			const verbose =
				(/^(npm (run )?(test|build|typecheck|lint)|npm test)\b/.test(seg) ||
				 /^(npx )?(vitest|jest|playwright test|tsc)\b/.test(seg)) &&
				!/--version/.test(seg);
			if (verbose && !isCapped(seg)) {
				return {
					block: true,
					reason:
						`Token Economy (Command output): cap verbose runners before they land in context — e.g. ` +
						`'${seg.split(/\s+/).slice(0, 3).join(" ")} ... 2>&1 | rg "error TS|FAIL|Error" | sort -u | head -40' ` +
						`(tests: '| rg "Tests|passed|failed" | tail -20'; install: '| tail -5').`,
				};
			}
		}
		return;
	});

	pi.on("tool_result", async (event) => {
		const path = pendingEdits.get(event.toolCallId);
		if (path === undefined) return;
		pendingEdits.delete(event.toolCallId);
		if (!path) return; // malformed pathless call — nothing to track
		if (event.isError) {
			// failed edit: content may have drifted — a re-read is legitimate
			lastInContext.delete(path);
		} else {
			lastInContext.set(path, seq);
		}
	});
}
