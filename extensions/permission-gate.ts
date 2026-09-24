/**
 * Permission gate — mechanical enforcement of AGENTS.md tool-call rules.
 * Blocks violations with corrective rule text before the tool runs:
 *   - edit calls: oldText anchor pre-validation — existence (exact + fuzzy),
 *     uniqueness with line numbers, intra-call overlap — with actual file
 *     context on a miss, so the model fixes its anchor in one retry
 *   - read calls: no full re-read of a file whose edit result is already in
 *     context (R1)
 *   - bash calls: reading/output economy — R2 cat/standalone-sed viewing,
 *     R5 git log caps, R6 rg -o caps, R7 recursive walks, verbose runner caps
 * Sources: 2026-09-16 audit (cat-for-viewing 86, uncapped runners, git log),
 * 2026-09-23 audit (read-after-edit re-read loops 316K/wk, uncapped rg -o
 * 119K/wk), 2026-09-24 (anchor overlap pre-check, R7, sed -n batching fix,
 * anchor-guard merged in — both were tool_call interceptors).
 */

import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFile } from "fs/promises";
import { resolve } from "path";

interface EditEntry {
	oldText: string;
	newText: string;
}

// ---- shared ----

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

// ---- edit-anchor validation ----

/** Mirror of edit-diff.js normalizeForFuzzyMatch: trailing ws, NFKC, smart quotes/dashes/spaces */
function normalizeForFuzzyMatch(text: string): string {
	return text
		.normalize("NFKC")
		.split("\n")
		.map((line) => line.trimEnd())
		.join("\n")
		.replace(/[\u2018\u2019\u201A\u201B]/g, "'")
		.replace(/[\u201C\u201D\u201E\u201F]/g, '"')
		.replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, "-")
		.replace(/[\u00A0\u2002-\u200A\u202F\u205F\u3000]/g, " ");
}

const toLF = (text: string): string => text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

/** 1-based line number of a character index (line boundaries survive normalization) */
function lineOf(content: string, index: number): number {
	let line = 1;
	for (let i = 0; i < index && i < content.length; i++) if (content[i] === "\n") line++;
	return line;
}

function snippetAround(content: string, line: number, spanLines: number, pad = 4, maxLines = 18): string {
	const lines = content.split("\n");
	const start = Math.max(1, line - pad);
	const end = Math.min(lines.length, line + spanLines + pad - 1);
	const shown = Math.min(end, start + maxLines - 1);
	const width = String(shown).length;
	const parts: string[] = [];
	for (let n = start; n <= shown; n++) parts.push(`${String(n).padStart(width)} | ${lines[n - 1]}`);
	if (shown < end) parts.push("…");
	return parts.join("\n");
}

/** Longest run of anchor lines (from the tail, else the head) that exists in fuzzyContent */
function findClosestFragment(
	fuzzyContent: string,
	oldText: string,
): { index: number; lines: number; end: "tail" | "head" } | undefined {
	const lines = oldText.split("\n");
	for (let take = lines.length; take >= 1; take--) {
		const tail = normalizeForFuzzyMatch(lines.slice(lines.length - take).join("\n"));
		if (tail.trim()) {
			const index = fuzzyContent.indexOf(tail);
			if (index !== -1) return { index, lines: take, end: "tail" };
		}
		const head = normalizeForFuzzyMatch(lines.slice(0, take).join("\n"));
		if (head.trim()) {
			const index = fuzzyContent.indexOf(head);
			if (index !== -1) return { index, lines: take, end: "head" };
		}
	}
	return undefined;
}

/** Validates an edit call's anchors; returns a block (with corrective context) or undefined if ok */
async function validateEditAnchors(input: {
	path?: unknown;
	edits?: unknown;
}): Promise<{ block: true; reason: string } | undefined> {
	const edits = input.edits;
	if (!Array.isArray(edits)) return; // let the tool's own validation respond

	let content: string;
	try {
		const raw = await readFile(resolve(process.cwd(), String(input.path ?? "")), "utf8");
		content = toLF(raw).replace(/^\uFEFF/, "");
	} catch {
		return; // unreadable/missing file: the edit tool reports it
	}

	const fuzzyContent = normalizeForFuzzyMatch(content);
	// verified exact-match spans, for the intra-call overlap check
	const spans: { i: number; start: number; end: number }[] = [];

	for (let i = 0; i < edits.length; i++) {
		const oldText = toLF(String((edits[i] as EditEntry)?.oldText ?? ""));
		if (!oldText) continue; // tool has a dedicated empty-oldText error

		const exact = content.indexOf(oldText);
		const fuzzy = exact === -1 ? normalizeForFuzzyMatch(oldText) : "";

		if (exact === -1 && fuzzyContent.indexOf(fuzzy) === -1) {
			const frag = findClosestFragment(fuzzyContent, oldText);
			const near = frag
				? `The anchor's ${frag.end} lines DO occur at line ${lineOf(fuzzyContent, frag.index)} — the inferred lines around them are wrong. Actual file content:\n${snippetAround(content, lineOf(fuzzyContent, frag.index), frag.lines)}\nUse these exact lines (incl. whitespace) as oldText.`
				: `No part of this anchor exists in the file. Read the target region (offset/limit) and rebuild oldText from what is actually there.`;
			return {
				block: true,
				reason:
					`Anchor Guard: edits[${i}].oldText not found in ${String(input.path)} — checked exact match and fuzzy ` +
					`(trailing-whitespace/quote/dash/space) normalization. The anchor contains lines that are not in the file; ` +
					`most likely context was inferred beyond a read-window edge or is stale. ${near}`,
			};
		}

		// uniqueness (mirror of the tool's duplicate check) with line numbers
		const probe = exact !== -1 ? oldText : fuzzy;
		const haystack = exact !== -1 ? content : fuzzyContent;
		const occurrences: number[] = [];
		let at = haystack.indexOf(probe);
		while (at !== -1) {
			occurrences.push(lineOf(haystack, at));
			at = haystack.indexOf(probe, at + 1);
		}
		if (occurrences.length > 1) {
			return {
				block: true,
				reason:
					`Anchor Guard: edits[${i}].oldText occurs ${occurrences.length}× in ${String(input.path)} ` +
					`(lines ${occurrences.join(", ")}). Extend the anchor with surrounding lines until it is unique.`,
			};
		}

		// overlap (exact matches only — fuzzy indices live in normalized space)
		if (exact !== -1) {
			const start = exact;
			const end = exact + oldText.length;
			for (const s of spans) {
				if (start < s.end && s.start < end) {
					return {
						block: true,
						reason:
							`Anchor Guard: edits[${s.i}] and edits[${i}] overlap in ${String(input.path)} — ` +
							`the edit tool rejects overlapping edits. Merge them into one edit (or disjoint anchors) covering both regions.`,
					};
				}
			}
			spans.push({ i, start, end });
		}
	}

	return; // all anchors verified: let the edit proceed
}

export default function (pi: ExtensionAPI) {
	pi.on("tool_call", async (event) => {
		seq++;

		// edit: anchor pre-validation first (existence, uniqueness, overlap);
		// only a call that passes is tracked for read-freshness below
		if (isToolCallEventType("edit", event)) {
			const blocked = await validateEditAnchors(event.input);
			if (blocked) return blocked;
			pendingEdits.set(event.toolCallId, normPath(event.input.path));
			return;
		}

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

		if (isToolCallEventType("write", event)) {
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
			// R2: cat/head/tail/sed for file viewing (no pipe consumer); sed -n allowed when batching 2+ regions
			const sedBatch =
				/^sed -n\b/.test(seg) &&
				(/;\s*[^\s;]+p\b/.test(seg) || (seg.match(/(?:^|\s)-e\b/g) ?? []).length >= 2);
			if (/^(cat|sed -n)\b/.test(seg) && !sedBatch && !seg.includes("|") && !seg.includes(">>") && !seg.includes(">")) {
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

			// R7 (2026-09-24): recursive directory walks pollute context (no ls -R, find -exec)
			const lsRecursive = /\bls\b[^|]*\s(--recursive|-[a-zA-Z]*R[a-zA-Z]*)\b/.test(seg) && !/>/.test(seg);
			if (lsRecursive || /\bfind\b[^|]*\s-exec(dir)?\b/.test(seg)) {
				return {
					block: true,
					reason:
						`Token Economy (Searching): recursive directory walks ('${seg.split(/\s+/).slice(0, 2).join(" ")} …') ` +
						`pollute context. List with 'rg --files <dir> | head -N'; find matching files with 'rg -l <pattern> <dir>'.`,
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
