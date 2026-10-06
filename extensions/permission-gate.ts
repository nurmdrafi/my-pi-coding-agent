/**
 * Permission gate — mechanical enforcement of AGENTS.md tool-call rules.
 * Blocks violations with corrective rule text before the tool runs:
 *   - edit calls: oldText anchor pre-validation — existence (exact + fuzzy),
 *     uniqueness with line numbers, intra-call overlap — with actual file
 *     context on a miss, so the model fixes its anchor in one retry
 *   - read calls: no re-read whose requested window is fully covered by
 *     this session's in-context spans — read results (their actual returned
 *     lines), edit results, writes, images (R1; span-union coverage model,
 *     invalidated by mtime+size stat mismatch — external changes are caught
 *     by stat, not by guessing from bash command text; 2026-10-06)
 *     2026-10-05, replacing the 6-call recency window)
 *   - bash calls: reading/output economy — R2 cat/standalone-sed viewing,
 *     R5 git log caps, R6 rg -o caps, R7 recursive walks, verbose runner caps,
 *     R9 commitlint conventional-commit message validation on git commit -m,
 *     R10 identical re-run guard (same base command, no edit/write since
 *     its last run, within 10 min)
 * Sources: 2026-09-16 audit (cat-for-viewing 86, uncapped runners, git log),
 * 2026-09-23 audit (read-after-edit re-read loops 316K/wk, uncapped rg -o
 * 119K/wk), 2026-09-24 (anchor overlap pre-check, R7, sed -n batching fix,
 * anchor-guard merged in — both were tool_call interceptors), 2026-09-27
 * audit (R8 git-hook output caps, read-after-read dups) + 2026-09-27
 * agent-project audit (post-edit windowed re-reads over the edited anchor:
 * sessions 01a0d347 / 01a0d1f6 / 01a0d33a), 2026-10-05 audit (read dup
 * 258× / 3,089K across 95 sessions — windowed reads never registered,
 * REREAD_WINDOW=6 expired late-session dups → coverage model), 2026-10-06
 * audit (gh run list double-poll 31 s apart, identical vitest re-runs → R10)
 * + 2026-10-06 feedback pass (block-reason diet ≤~200c after session audit
 * showed 90% one-shot recovery needs the pointer, not the prose; R10 base
 * split made quote-aware — a quoted '|' no longer truncates it (false
 * positive); skill re-read item closed by R1 coverage, fixture-tested;
 * tests/block-recovery-audit.mjs gates one-shot recovery ≥ 85%).
 */

import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { homedir } from "os";
import { appendFileSync, mkdirSync, readFileSync } from "fs";
import { readFile, stat } from "fs/promises";
import { dirname, join, resolve } from "path";

interface EditEntry {
	oldText: string;
	newText: string;
}

// ---- shared ----

/** true if cmd segment ends in a pipe to a capping/filtered consumer */
function isCapped(seg: string): boolean {
	return /\|\s*(head|tail|rg|grep|cut|jq|sort|uniq|wc)\b/.test(seg);
}

/**
 * first unquoted pipe/redirect — a '|' inside a quoted regex must not split
 * the R10 base (2026-10-06: quote-blind split false-positive-blocked two
 * different rg commands whose patterns both contained '|'); unquoted backslash
 * escapes honored (2026-10-07: 'foo\\|bar' truncated bases the same way).
 * Heredoc bodies count as unquoted — stable across runs, so R10-safe.
 */
function firstUnquotedPipeOrRedirect(cmd: string): number {
	let quote: string | undefined;
	for (let i = 0; i < cmd.length; i++) {
		const ch = cmd[i];
		if (quote) {
			if (ch === "\\") i++;
			else if (ch === quote) quote = undefined;
		} else if (ch === "\\") i++; // unquoted \| \> are literals, not separators
		else if (ch === "'" || ch === '"') quote = ch;
		else if (ch === "|" || ch === ">") return i;
	}
	return -1;
}

/**
 * split at unquoted \n / && / ; / || — a quoted ';' (sed '1p;5p', regex char
 * classes) must not split (2026-10-06: quote-blind split made R2 block the
 * sanctioned sed-batch form by truncating it to "sed -n '1p"); unquoted
 * backslash escapes the next char (2026-10-07: '1p\\;5p' split the same way).
 * Heredoc bodies count as unquoted (known limitation).
 */
function splitSegments(cmd: string): string[] {
	const out: string[] = [];
	let cur = "";
	let quote: string | undefined;
	for (let i = 0; i < cmd.length; i++) {
		const ch = cmd[i];
		if (quote) {
			if (ch === "\\") {
				cur += ch + (cmd[i + 1] ?? "");
				i++;
				continue;
			}
			if (ch === quote) quote = undefined;
			cur += ch;
			continue;
		}
		if (ch === "\\") {
			cur += ch + (cmd[i + 1] ?? ""); // unquoted \; \& \| — literals, not separators
			i++;
			continue;
		}
		if (ch === "'" || ch === '"') {
			quote = ch;
			cur += ch;
			continue;
		}
		const two = cmd.slice(i, i + 2);
		if (ch === "\n" || ch === ";" || two === "&&" || two === "||") {
			out.push(cur);
			cur = "";
			if (two === "&&" || two === "||") i++;
			continue;
		}
		cur += ch;
	}
	out.push(cur);
	return out.map((s) => s.trim()).filter(Boolean);
}

/** edited line span, 1-based inclusive, post-application */
interface LineSpan {
	start: number;
	end: number;
}

type CoverKind = "read" | "edit" | "write";

/** absolute map key — the same file reached by relative and absolute paths tracks once */
function normPath(p: unknown): string {
	const s = String(p ?? "").replace(/\/+$/, "");
	return s ? resolve(s) : "";
}

/** snapshot {mtimeMs,size} for freshness (ChatCLI/Crush-style staleness — 2026-10-06) */
async function snapshot(key: string): Promise<{ mtimeMs: number; size: number } | undefined> {
	try {
		const s = await stat(key);
		return { mtimeMs: s.mtimeMs, size: s.size };
	} catch {
		return undefined;
	}
}

/** add a certified span to a path's union (sorted, overlap/adjacency-merged) */
function certify(
	coverage: Map<string, { spans: LineSpan[]; kind: CoverKind; stat?: { mtimeMs: number; size: number } }>,
	key: string,
	span: LineSpan,
	kind: CoverKind,
	statSnap?: { mtimeMs: number; size: number },
): void {
	const spans = [...(coverage.get(key)?.spans ?? []), span].sort((a, b) => a.start - b.start);
	const merged: LineSpan[] = [];
	for (const s of spans) {
		const last = merged[merged.length - 1];
		if (last && s.start <= last.end + 1) last.end = last.end > s.end ? last.end : s.end;
		else merged.push({ ...s });
	}
	coverage.set(key, { spans: merged, kind, stat: statSnap ?? coverage.get(key)?.stat });
}

/** true when [win.start, win.end] lies entirely inside the span union */
function coversAll(spans: LineSpan[], win: LineSpan): boolean {
	let pos = win.start;
	for (const s of spans) {
		if (s.end < pos) continue;
		if (s.start > pos) return false;
		if (s.end === Infinity || (pos = s.end + 1) > win.end) return true;
	}
	return false;
}

/** fallback line count from text blocks when details.truncation is absent */
function countTextLines(content: unknown[]): { lines: number; truncated: boolean } {
	const text = content
		.filter((b) => (b as { type?: unknown })?.type === "text")
		.map((b) => String((b as { text?: unknown })?.text ?? ""))
		.join("\n");
	if (!text) return { lines: 0, truncated: false };
	const lines = text.split("\n");
	// strip the read tool's trailing truncation note ("[N more lines in file…]"
	// or "[Showing lines A-B of N…]") and the blank separator line before it —
	// the note is separated by "\n\n", so without this every windowed read
	// would over-certify one line past its real content
	const last = lines[lines.length - 1] ?? "";
	if (/^\[\d+ more lines? in file\./.test(last) || /^\[Showing lines /.test(last)) {
		lines.pop();
		if (lines[lines.length - 1] === "") lines.pop();
		return { lines: lines.length, truncated: true };
	}
	return { lines: lines.length, truncated: false };
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

function snippetAround(content: string, line: number, spanLines: number, pad = 2, maxLines = 8): string {
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

/**
 * Validates an edit call's anchors; returns a block (with corrective context)
 * or the call's post-application edited line spans (exact-match anchors only)
 * if ok.
 */
async function validateEditAnchors(input: {
	path?: unknown;
	edits?: unknown;
}): Promise<{ block: true; reason: string } | { spans?: LineSpan[] } | undefined> {
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
	// post-application spans of this call's edits, for the windowed re-read check
	let delta = 0; // cumulative line shift from earlier edits in this call
	const edited: LineSpan[] = [];
	// fuzzy-matched anchors contribute no span (index only exists in
	// normalized space) — windowed re-read checks fall back to allow for them

	for (let i = 0; i < edits.length; i++) {
		const oldText = toLF(String((edits[i] as EditEntry)?.oldText ?? ""));
		if (!oldText) continue; // tool has a dedicated empty-oldText error

		const exact = content.indexOf(oldText);
		const fuzzy = exact === -1 ? normalizeForFuzzyMatch(oldText) : "";

		if (exact === -1 && fuzzyContent.indexOf(fuzzy) === -1) {
			const frag = findClosestFragment(fuzzyContent, oldText);
			const near = frag
				? `Its ${frag.end} lines occur at line ${lineOf(fuzzyContent, frag.index)}; the inferred lines around them are wrong:\n${snippetAround(content, lineOf(fuzzyContent, frag.index), frag.lines)}\nUse these exact lines (incl. whitespace) as oldText.`
				: `No part exists — read the region (offset/limit) and rebuild oldText from actual content.`;
			return {
				block: true,
				reason: `Anchor Guard: edits[${i}].oldText not found in ${String(input.path)} (exact+fuzzy). ${near}`,
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
					`(lines ${occurrences.join(", ")}). Widen the anchor with adjacent lines until unique.`,
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
							`the edit tool rejects overlapping edits. Merge into one edit (or disjoint anchors).`,
					};
				}
			}
			spans.push({ i, start, end });

			// post-application span: earlier edits in this call shift later lines
			const newLines = String((edits[i] as EditEntry)?.newText ?? "").split("\n").length;
			const eStart = lineOf(content, start) + delta;
			const eEnd = eStart + newLines - 1;
			delta += newLines - oldText.split("\n").length;
			edited.push({ start: eStart, end: eEnd });
		}
	}

	return { spans: edited.length ? edited : undefined }; // all anchors verified: let the edit proceed
}

// ---- R9: commitlint (conventional) validation ----

const COMMIT_TYPES = "feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert";
const CONVENTIONAL_HEADER = new RegExp(`^(${COMMIT_TYPES})(\\([\\w\\-.]+\\))?!?: .+`);

/**
 * Validates every -m message of a 'git commit' segment against the commitlint
 * conventional pattern (type(scope?): subject, header <= 100 chars, subject
 * not capitalized / not ending in '.'). Returns a block reason or undefined.
 */
function validateCommitMessages(seg: string): string | undefined {
	const flags = [...seg.matchAll(/-m\s+(?:"((?:\\.|[^"])*)"|'((?:\\.|[^'])*)')/g)];
	if (flags.length === 0) return; // heredoc / -F / editor message: not inspectable
	for (let i = 0; i < flags.length; i++) {
		const msg = (flags[i][1] ?? flags[i][2] ?? "").replace(/\\(["'\\n])/g, "$1");
		if (!msg) continue;
		if (i > 0) continue; // body paragraphs: header rules only (i === 0)
		if (!CONVENTIONAL_HEADER.test(msg)) {
			return `Commitlint: ${JSON.stringify(msg)} must match 'type(scope?): subject' — e.g. 'fix(auth): cap git log'.`;
		}
		if (msg.length > 100) {
			return `Commitlint: header is ${msg.length} chars (max 100) — shorten the subject.`;
		}
		const subject = msg.replace(/^\S+\s*/, ""); // strip type/scope for subject rules
		{
			if (/^[A-Z]/.test(subject)) {
				return `Commitlint: subject must not start with a capital ('${subject.slice(0, 30)}…') — lowercase it.`;
			}
			if (/[.]$/.test(msg)) {
				return `Commitlint: header must not end with '.'.`;
			}
		}
	}
	return;
}

/** R10: re-running an unchanged base command inside this window re-sends output already in context */
const RERUN_WINDOW_MS = 10 * 60_000;

/**
 * Violation memory (2026-10-06 feedback: "LLM keeps repeating the same mistakes
 * every session"). Blocks correct within a session (98% one-shot recovery)
 * but the model is stateless across sessions and re-attempts the same families
 * in every new one (R2 cat-viewing persisted Sep→Oct in work-project logs).
 * Persisted per-family block counts pick the lessons injected into the next
 * session's system prompt — the only mechanism that can cut FIRST attempts.
 * Delete logs/violation-memory.json to reset; PGATE_MEMORY overrides the path.
 */
const MEMORY_THRESHOLD = 5; // all-time blocks before a lesson enters the prompt
const FAMILY_LESSONS: Record<string, string> = {
	"Token Economy (Reading)":
		"File viewing: the read tool (offset/limit) — never start a bash segment with cat or sed -n (sed -n only when batching 2+ regions).",
	"Token Economy (Re-run)":
		"Never re-run a command unchanged within 10 min without an edit/write since — its output is already in context.",
	"Token Economy (Extraction)": "Every 'rg -o' is piped through '| head -N' or '| cut -c1-200'.",
	"Token Economy (git reads)": "'git log' is always '--oneline | head' or '-n <N>'.",
	"Token Economy (git hooks)": "'git commit'/'git push' always ends with '2>&1 | tail -20' or --no-verify.",
	"Token Economy (Searching)": "No recursive walks — 'rg --files <dir> | head -N' or 'rg -l <pattern> <dir>'.",
	"Token Economy (Command output)":
		"Verbose runners (npm test/build, vitest, jest, tsc) always capped: '2>&1 | rg … | head'.",
	"Token Economy (Re-read)": "Never re-read a file window already in context this session — read only new regions (offset/limit).",
	"Anchor Guard": "edit oldText is exact bytes from a read this session, unique in the file, non-overlapping with sibling edits.",
	Commitlint: "Commit messages are conventional: 'type(scope?): subject', lowercase subject, no trailing dot.",
};

export default function (pi: ExtensionAPI) {
	/**
	 * In-context coverage (2026-10-05 audit): per absolute path, the union of
	 * line spans whose content this session has already put in context — read
	 * results (their actual returned lines), edit results (applied text),
	 * writes and images (whole file). A read is blocked only when its requested
	 * window is FULLY covered; partial overlap passes (it brings new lines).
	 * Resets: session_compact (the summary replaced the content), mtime+size
	 * mismatch against the certified snapshot (external change — caught by
	 * stat, not guessed from bash command text), a failed edit (context may
	 * have drifted).
	 *
	 * Not hydrated on session resume — the map starts empty and the
	 * failure mode errs toward allowing. Revisit only if audits show
	 * post-resume dup reads mattering.
	 */
	const coverage = new Map<string, { spans: LineSpan[]; kind: CoverKind; stat?: { mtimeMs: number; size: number } }>();
	/** edit/write toolCallId -> { path, spans?, kind }, awaiting its tool_result */
	const pendingEdits = new Map<string, { path: string; spans?: LineSpan[]; kind: "edit" | "write" }>();
	/** read toolCallId -> { path, win }, awaiting its tool_result */
	const pendingReads = new Map<string, { path: string; win: LineSpan }>();
	/** R10: bash toolCallId -> normalized base command, awaiting its tool_result */
	const pendingBash = new Map<string, string>();
	/** R10: base command -> last-run record; re-runs are compared against it */
	const lastBashRun = new Map<string, { ts: number; mut: number; failed: boolean }>();
	/** R10: bumped on every successful edit/write — a mutation makes verify re-runs legitimate */
	let mutationSeq = 0;

	// ---- violation memory: cross-session repeat-offense reduction ----
	// NDJSON append-only store (2026-10-07): parallel sessions (gated subagents)
	// made the read-modify-write JSON blob racy — last writer silently dropped
	// counts. Appends are atomic; aggregation happens at load. The legacy JSON
	// blob stays readable as a frozen base (pre-NDJSON telemetry, never written).
	const memoryNdjson = process.env.PGATE_MEMORY ?? join(homedir(), ".pi", "agent", "logs", "violation-memory.ndjson");
	const memoryLegacy = process.env.PGATE_MEMORY
		? memoryNdjson.replace(/\.ndjson$/, ".json")
		: join(homedir(), ".pi", "agent", "logs", "violation-memory.json");
	const loadCounts = (): Record<string, number> => {
		const counts: Record<string, number> = {};
		try {
			const legacy: unknown = JSON.parse(readFileSync(memoryLegacy, "utf8"));
			if (legacy && typeof legacy === "object") {
				for (const [k, v] of Object.entries(legacy as Record<string, unknown>)) if (typeof v === "number") counts[k] = v;
			}
		} catch {
			// absent or corrupt legacy blob — start from NDJSON alone
		}
		try {
			for (const line of readFileSync(memoryNdjson, "utf8").split("\n")) {
				if (!line.trim()) continue;
				try {
					const e = JSON.parse(line) as { family?: string; n?: number };
					if (typeof e.family === "string" && typeof e.n === "number" && e.n > 0) {
						counts[e.family] = (counts[e.family] ?? 0) + e.n;
					}
				} catch {
					continue; // torn tail append — tolerate like pi's session files
				}
			}
		} catch {
			// no NDJSON yet — legacy counts (if any) stand alone
		}
		return counts;
	};
	const counts = loadCounts();
	/** record a block's family; persist top-offender telemetry for the next session's prompt */
	const blockCall = (reason: string): { block: true; reason: string } => {
		const colon = reason.indexOf(":");
		const family = colon === -1 ? reason : reason.slice(0, colon); // colon-less reason → whole string, never a truncated key
		if (FAMILY_LESSONS[family]) {
			counts[family] = (counts[family] ?? 0) + 1;
			try {
				mkdirSync(dirname(memoryNdjson), { recursive: true });
				appendFileSync(memoryNdjson, `${JSON.stringify({ family, n: 1, ts: Date.now() })}\n`);
			} catch {
				// telemetry must never break the agent loop
			}
		}
		return { block: true, reason };
	};
	// module scope: one process can host several sessions (ctx.newSession, e.g.
	// /handoff, replaces the session in-process) — injection stays suppressed for
	// the replacement session; accepted for now, name documents the scope
	let memoryInjectedThisProcess = false;
	pi.on("before_agent_start", (event) => {
		if (memoryInjectedThisProcess) return; // once per process — per-run re-entry must not stack copies
		memoryInjectedThisProcess = true;
		const lessons = Object.entries(counts)
			.filter(([family, n]) => n >= MEMORY_THRESHOLD && FAMILY_LESSONS[family])
			.sort((a, b) => b[1] - a[1])
			.slice(0, 3)
			.map(([family]) => `- ${FAMILY_LESSONS[family]}`);
		if (lessons.length === 0) return;
		// pi seeds appendSystemPrompt to "" today; guard anyway — undefined must never
		// leak into the system prompt as the literal "undefined" (2026-10-07 review)
		event.systemPromptOptions.appendSystemPrompt = (event.systemPromptOptions.appendSystemPrompt ?? "") +
			`<violation-memory>\nRecurring tool-call violations from your prior sessions (gate telemetry) — apply before the first call:\n${lessons.join("\n")}\n</violation-memory>\n`;
	});

	// edit: anchor pre-validation first (existence, uniqueness, overlap);
	// only a call that passes is tracked for read-freshness below
	pi.on("tool_call", async (event) => {
		if (isToolCallEventType("edit", event)) {
			const checked = await validateEditAnchors(event.input);
			if (checked && "block" in checked) return blockCall(checked.reason);
			pendingEdits.set(event.toolCallId, { path: normPath(event.input.path), spans: checked?.spans, kind: "edit" });
			return;
		}

		// R1: block a read whose requested window is fully covered by this
		// session's in-context spans (2026-10-05 coverage model)
		if (isToolCallEventType("read", event)) {
			const display = String(event.input.path ?? "");
			const path = normPath(display);
			const start = Math.max(1, typeof event.input.offset === "number" ? event.input.offset : 1);
			const win: LineSpan = {
				start,
				end: typeof event.input.limit === "number" ? start + event.input.limit - 1 : Infinity,
			};
			const prior = coverage.get(path);
			if (path && prior && coversAll(prior.spans, win)) {
				// freshness: only block while mtime+size still match the certified snapshot —
				// any external change (bash, IDE, git) shows up in stat without guessing
				// from command text; missing baseline or stat failure allows the re-read
				const now = path ? await snapshot(path) : undefined;
				if (now && prior.stat && now.mtimeMs === prior.stat.mtimeMs && now.size === prior.stat.size) {
					const lo = prior.spans[0].start;
					const hi = prior.spans[prior.spans.length - 1].end;
					return blockCall(
						`Token Economy (Re-read): ${lo === hi ? `line ${lo}` : `lines ${lo}–${hi === Infinity ? "EOF" : hi}`} of '${display}' are already in context ` +
						`(${prior.kind}, file unchanged). Read a different window (offset/limit) or act on what is there.`,
					);
				}
				coverage.delete(path); // changed on disk (or no baseline) — the read is legitimate
			}
			pendingReads.set(event.toolCallId, { path, win });
		}

		if (isToolCallEventType("write", event)) {
			// whole file content is in context after a write — every window overlaps it
			pendingEdits.set(event.toolCallId, { path: normPath(event.input.path), spans: [{ start: 1, end: Infinity }], kind: "write" });
		}

		if (!isToolCallEventType("bash", event)) return;
		const cmd = event.input.command;

		// split into segments; each checked independently (quote-aware — a quoted
		// ';' is part of the command, not a separator)
		const segs = splitSegments(cmd);

		for (const seg of segs) {
			// R2: cat/head/tail/sed for file viewing (no pipe consumer); sed -n allowed when batching 2+ regions
			const sedBatch =
				/^sed -n\b/.test(seg) &&
				(/;\s*[^\s;]+p\b/.test(seg) || (seg.match(/(?:^|\s)-e\b/g) ?? []).length >= 2);
			if (/^(cat|sed -n)\b/.test(seg) && !sedBatch && !seg.includes("|") && !seg.includes(">>") && !seg.includes(">")) {
				return blockCall(
					`Token Economy (Reading): use 'read' (offset/limit), not bash '${seg.split(" ")[0]}'. ` +
					`sed -n only when batching 2+ regions; cat only inside a pipeline.`,
				);
			}

			// R6 (2026-09-23): rg -o extraction must be capped before landing in context
			// (quoted spans stripped first so a *pattern* containing "-o" can't false-fire)
			const bare = seg.replace(/"[^"]*"/g, "").replace(/'[^']*'/g, "");
			if (/(^|[ /])rg\b[^\n|]*\s(--only-matching|-[a-zA-Z]*o)\b/.test(bare) && !isCapped(seg)) {
				return blockCall(
					`Token Economy (Extraction): cap 'rg -o' with '| head -N' or '| cut -c1-200' — ` +
					`wide -o over big/minified files emits whole-file output.`,
				);
			}

			// R5-ish: git log must be capped
			if (/^git log\b/.test(seg) && !/--oneline/.test(seg) && !/-n\s?\d+|--max-count=\d+/.test(seg) && !isCapped(seg)) {
				return blockCall(`Token Economy (git reads): 'git log' must be 'git log --oneline | head' or '-n <N>'.`);
			}

			// R9: commit message must follow the commitlint conventional pattern
			// (checked before the R8 hook-cap rule so a bad message never reaches git)
			if (/^git commit\b/.test(seg)) {
				const lint = validateCommitMessages(seg);
				if (lint) return blockCall(lint);
			}

			// R8 (2026-09-27): commit/push re-run repo hooks (lint/test/build) whose
			// output floods context (44-48K/call measured). Heredoc messages split
			// across segments put the cap pipe on a later line — a cap anywhere in
			// the full command satisfies the check; --no-verify skips hooks entirely.
			if (/^git (commit|push)\b/.test(seg) && !/--no-verify/.test(seg) && !isCapped(seg) && !isCapped(cmd)) {
				return blockCall(
					`Token Economy (git hooks): '${seg.split(/\s+/).slice(0, 2).join(" ")}' re-runs lint/test hooks that flood context — ` +
					`append '2>&1 | tail -20' or pass --no-verify.`,
				);
			}

			// R7 (2026-09-24): recursive directory walks pollute context (no ls -R, find -exec)
			// (regexes tested against quote-stripped `bare` like R6 — a search pattern
			// containing "ls -R"/"find -exec" inside quotes is not a walk; false-fired 10-05)
			const lsRecursive = /\bls\b[^|]*\s(--recursive|-[a-zA-Z]*R[a-zA-Z]*)\b/.test(bare) && !/>/.test(seg);
			if (lsRecursive || /\bfind\b[^|]*\s-exec(dir)?\b/.test(bare)) {
				return blockCall(
					`Token Economy (Searching): recursive walk ('${seg.split(/\s+/).slice(0, 2).join(" ")} …') floods context — ` +
					`use 'rg --files <dir> | head -N' or 'rg -l <pattern> <dir>'.`,
				);
			}

			// Output cap: verbose build/test runners need a filter pipe
			const verbose =
				(/^(npm (run )?(test|build|typecheck|lint)|npm test)\b/.test(seg) ||
				 /^(npx )?(vitest|jest|playwright test|tsc)\b/.test(seg)) &&
				!/--version/.test(seg);
			if (verbose && !isCapped(seg)) {
				return blockCall(
					`Token Economy (Command output): cap '${seg.split(/\s+/).slice(0, 3).join(" ")} …' — e.g. ` +
					`'2>&1 | rg "FAIL|Error" | sort -u | head -40' (tests: '| rg "Tests|passed|failed" | tail -20').`,
				);
			}
		}

		// R10 (2026-10-06 audit): identical re-run guard — the same base command
		// (command up to the first pipe/redirect, 2>&1 stripped) re-run with no
		// intervening edit/write re-sends output already in context (gh run list
		// double-polls 31 s apart, identical vitest re-runs). Watchers and retries
		// of failed runs are exempt; the run is recorded on tool_result.
		const stripped = cmd.replace(/\b\d>&\d\b\s?/g, " "); // \b: '2>&1' at command start strips too
		const cut = firstUnquotedPipeOrRedirect(stripped);
		const base = (cut === -1 ? stripped : stripped.slice(0, cut)).trim();
		const watcher = /(^|\s)(watch|sleep)\b/.test(base) || /(^|\s)tail\s+(-[a-zA-Z]*[fF])/.test(base) || /--watch\b/.test(base);
		const prior = lastBashRun.get(base);
		if (prior && !prior.failed && !watcher && prior.mut === mutationSeq && Date.now() - prior.ts < RERUN_WINDOW_MS) {
			return blockCall(
				`Token Economy (Re-run): '${base.slice(0, 60)}' ran ${Math.round((Date.now() - prior.ts) / 1000)}s ago, no ` +
				`edit/write since — output already in context. Re-run only after a change.`,
			);
		}
		pendingBash.set(event.toolCallId, base);
		return;
	});

	pi.on("tool_result", async (event) => {
		const read = pendingReads.get(event.toolCallId);
		if (read !== undefined) {
			pendingReads.delete(event.toolCallId);
			if (event.isError || !read.path) return;
			const content: unknown[] = event.content ?? [];
			// image result: whole file in context — no continuation windows exist
			if (content.some((b) => (b as { type?: unknown })?.type === "image")) {
				coverage.set(read.path, { spans: [{ start: 1, end: Infinity }], kind: "read", stat: await snapshot(read.path) });
				return;
			}
			// certify the ACTUAL returned lines — requested offset/limit lie at
			// EOF edges and on 2000-line/50KB truncation
			const snap = await snapshot(read.path);
			const trunc = (event as { details?: { truncation?: { outputLines?: unknown; truncated?: unknown } } }).details
				?.truncation;
			const counted = countTextLines(content);
			const lines = typeof trunc?.outputLines === "number" ? trunc.outputLines : counted.lines;
			const truncated = trunc ? trunc.truncated === true : counted.truncated;
			if (lines > 0) {
				// an untruncated whole-file request certifies everything — nothing
				// exists past EOF, so any later window is already in context
				const wholeFile = read.win.start === 1 && read.win.end === Infinity && !truncated;
				certify(
					coverage,
					read.path,
					wholeFile ? { start: 1, end: Infinity } : { start: read.win.start, end: read.win.start + lines - 1 },
					"read",
					snap,
				);
			}
			return;
		}
		const bashBase = pendingBash.get(event.toolCallId);
		if (bashBase !== undefined) {
			pendingBash.delete(event.toolCallId);
			lastBashRun.set(bashBase, { ts: Date.now(), mut: mutationSeq, failed: event.isError === true });
			return;
		}
		const entry = pendingEdits.get(event.toolCallId);
		if (entry === undefined) return;
		pendingEdits.delete(event.toolCallId);
		if (!entry.path) return; // malformed pathless call — nothing to track
		if (event.isError) {
			// failed edit/write: content may have drifted — a re-read is legitimate
			coverage.delete(entry.path);
		} else {
			// R10: a successful edit/write mutates the tree — verify re-runs become legitimate
			mutationSeq++;
			// fuzzy-matched anchors carry no spans — nothing to certify (errs allow);
			// snapshot AFTER our own edit so mtime reflects the post-edit content
			if (entry.spans) {
				const snap = await snapshot(entry.path);
				for (const s of entry.spans) certify(coverage, entry.path, s, entry.kind, snap);
			}
		}
	});

	pi.on("session_compact", async () => {
		// the compaction summary replaced earlier read/edit content — nothing
		// is in context anymore, so every re-read and re-run is legitimate again
		coverage.clear();
		pendingReads.clear();
		pendingEdits.clear();
		pendingBash.clear();
		lastBashRun.clear();
	});

	// R1 resume hydration (2026-10-07): a resumed/continued session replays its
	// prior branch into context — replay that branch's read/write tool entries
	// through the same certify() path so dup-read coverage survives a process
	// restart (2026-10-05 audit: 258 dup reads / ~3,089K across 95 sessions;
	// post-resume reads were the untracked slice). Source of truth is
	// ctx.sessionManager.getBranch() — pi's own in-context projection — so a
	// fresh session (empty branch) is a natural no-op; `--continue` (reason
	// "startup"), in-process switches ("resume"/"fork") and reloads all work
	// without file-format guessing. Edits are skipped (span derivation needs
	// anchor validation — skipping only loses savings, never adds a false
	// block); R10 is skipped (10-min window makes it moot). Truncation is
	// derived from the replayed text; stale entries are dropped lazily by the
	// stat-mismatch check at the next read attempt.
		pi.on("session_start", async (event, ctx) => {
		void event;
		// in-process switches reuse this module — drop the previous session's
		// coverage/pending state so only the new session's branch is certified
		coverage.clear();
		pendingReads.clear();
		pendingEdits.clear();
		pendingBash.clear();
		lastBashRun.clear();
		const raw = ctx.sessionManager.getBranch();
		if (raw.length === 0) return;
		// only the post-compaction slice is in context (same rule as the
		// session_compact handler and the handoff extension's branch walk)
		let compactIdx = -1;
		let firstKeptId: string | undefined;
		for (let i = raw.length - 1; i >= 0; i--) {
			const e = raw[i] as { type?: string; firstKeptEntryId?: string };
			if (e.type === "compaction") {
				compactIdx = i;
				firstKeptId = e.firstKeptEntryId;
				break;
			}
		}
		const keptIdx = firstKeptId ? raw.findIndex((e) => (e as { id?: string }).id === firstKeptId) : -1;
		const branch =
			compactIdx < 0
				? raw
				: [...(keptIdx >= 0 ? raw.slice(keptIdx, compactIdx) : []), ...raw.slice(compactIdx + 1)];
		const pending = new Map<string, { path: string; win: LineSpan; write?: boolean }>();
		for (const entry of branch) {
			if ((entry as { type?: string }).type !== "message") continue;
			const msg = (entry as { message?: { role?: string; content?: unknown[] } }).message;
			if (!msg || !Array.isArray(msg.content)) continue;
			if (msg.role === "assistant") {
				for (const b of msg.content) {
					const call = b as { type?: string; id?: string; name?: string; arguments?: Record<string, unknown> };
					if (call?.type !== "toolCall" || !call.id) continue;
					if ((call.name === "read" || call.name === "write") && typeof call.arguments?.path === "string") {
						const path = normPath(call.arguments.path);
						if (!path) continue;
						if (call.name === "write") {
							pending.set(call.id, { path, win: { start: 1, end: Infinity }, write: true });
							continue;
						}
						const start = Math.max(1, typeof call.arguments.offset === "number" ? call.arguments.offset : 1);
						pending.set(call.id, {
							path,
							win: { start, end: typeof call.arguments.limit === "number" ? start + call.arguments.limit - 1 : Infinity },
						});
					}
				}
			} else if (msg.role === "toolResult") {
				const res = msg as unknown as { isError?: boolean; content?: unknown[] };
				const id = (msg as unknown as { toolCallId?: string }).toolCallId;
				if (!id) continue;
				const p = pending.get(id);
				if (!p) continue;
				pending.delete(id);
				if (res.isError || !(res.content ?? []).length) continue;
				if (p.write || (res.content ?? []).some((b) => (b as { type?: string })?.type === "image")) {
					coverage.set(p.path, { spans: [{ start: 1, end: Infinity }], kind: p.write ? "write" : "read", stat: await snapshot(p.path) });
					continue;
				}
				const counted = countTextLines(res.content ?? []);
				if (counted.lines <= 0) continue;
				const wholeFile = p.win.start === 1 && p.win.end === Infinity && !counted.truncated;
				certify(
					coverage,
					p.path,
					wholeFile ? { start: 1, end: Infinity } : { start: p.win.start, end: p.win.start + counted.lines - 1 },
					"read",
					await snapshot(p.path),
				);
			}
		}
	});
}
