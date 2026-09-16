/**
 * Token-economy guard — mechanically enforces AGENTS.md reading/output rules
 * on bash tool calls by blocking violations with the corrective rule text.
 * Source: 2026-09-16 audit — 126 violations / 2 sessions (cat-for-viewing 86,
 * uncapped verbose output 7, git-log full 1+).
 */

import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** true if cmd segment ends in a pipe to a capping/filtered consumer */
function isCapped(seg: string): boolean {
	return /\|\s*(head|tail|rg|grep|cut|jq|sort|uniq|wc)\b/.test(seg);
}

export default function (pi: ExtensionAPI) {
	pi.on("tool_call", async (event) => {
		if (!isToolCallEventType("bash", event)) return;
		const cmd = event.input.command;

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
}
