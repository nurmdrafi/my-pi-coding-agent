/**
 * Edit anchor guard — pre-validates edit-tool oldText anchors against the file
 * and, on a miss, blocks with the actual content around the closest matching
 * fragment so the model can fix its anchor in one retry.
 * Root cause addressed (2026-09-24, dropx-merchant session): oldText anchors
 * fabricated beyond a read-window edge ("LANGUAGE: 'language',\n} as const")
 * that never existed in the file; fuzzy match can't recover nonexistent text.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFile } from "fs/promises";
import { resolve } from "path";

interface EditEntry {
	oldText: string;
	newText: string;
}

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

export default function (pi: ExtensionAPI) {
	pi.on("tool_call", async (event) => {
		if (event.toolName !== "edit") return;
		const edits = (event.input as { edits?: unknown }).edits;
		if (!Array.isArray(edits)) return; // let the tool's own validation respond

		let content: string;
		try {
			const raw = await readFile(resolve(process.cwd(), String(event.input.path ?? "")), "utf8");
			content = toLF(raw).replace(/^\uFEFF/, "");
		} catch {
			return; // unreadable/missing file: the edit tool reports it
		}

		const fuzzyContent = normalizeForFuzzyMatch(content);

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
						`Edit Anchor Guard: edits[${i}].oldText not found in ${String(event.input.path)} — checked exact match and fuzzy ` +
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
						`Edit Anchor Guard: edits[${i}].oldText occurs ${occurrences.length}× in ${String(event.input.path)} ` +
						`(lines ${occurrences.join(", ")}). Extend the anchor with surrounding lines until it is unique.`,
				};
			}
		}

		return undefined; // all anchors verified: let the edit proceed
	});
}
