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
 * 2026-10-07 block-impact audit (139 blocks, Feedbacks.md taxonomy, report
 * audit-reports/harness/2026-10-07T110500Z): R10 rekeyed to full-command
 * identity (prefix collisions were the top harmful pattern), R2 narrowed
 * (sed s///p substitution-print exempt, do…done loop bodies unsplittable)
 * and widened to head/tail viewers (free-evasion lane closed), isCapped
 * counts stdout redirects to files, R5 accepts git log -<N>, R2 reason now
 * warns about the R1 re-read cascade.
 * 2026-10-08 extensions-audit fixes (audit-reports/extensions/
 * 2026-10-08T051448Z.md, 120 blocks measured over Oct 6–7): ';'-joined
 * single-region seds count as one batch — AGENTS.md sanctions "sed -n when
 * batching 2+ regions" but sedBatch counted ranges only inside one
 * invocation, false-firing twice on the split two-region form; same dump
 * ceiling as the already-sanctioned -e×2 form, so no new evasion lane. And
 * a ≤128-byte cat inside a multi-segment batch is exempt: a block costs
 * ~460 tok (reason ~71 + recovery turn ~392, measured), so vetoing
 * date/ls/rg over a 49-byte watermark read spent ~460 tok to save ~12.
 * Re-block escalation: the audit's single RETRY-SAME case re-sent a blocked
 * `git clone + git log` verbatim twice before complying — repeating the
 * original reason taught nothing, so a verbatim re-send of the just-blocked
 * command now gets a dedicated reason naming the re-send itself.
 * 2026-10-08 autoresearch H1: bash output is capped non-blockingly in
 * tool_result (100 lines / 4 KB; tail spilled to $TMPDIR/pgate-spill with a
 * pointer line) — R2 viewing blocks deleted (cat/head/tail/sed viewers, the
 * trivial-cat exemption and its FAMILY_LESSONS entry went with it): replay
 * showed Reading = 616/709 would-blocks on legitimate commands (fp proxy
 * 18%) incl. prose-in-heredoc false fires; the cap delivers the same token
 * ceiling with zero block turns. R5/R6/R7/R8/verbose retire next, one per
 * iteration, each measured (fp_rate, fixture_pass, block_cost).
 * 2026-10-09 /ship-flow autoresearch: S-1 — R9 extracts `-m "$(cat <<'EOF'…)`
 * heredoc bodies (no more garbage `"$(cat"` reasons, 01a11d06) and enforces
 * body-max-line-length (100) pre-hook, so the git hook stops rejecting what
 * the gate could have caught; S-2 — leading VAR=val assignments are stripped
 * before destructive/allowlist/R9 anchors, so `GIT_TERMINAL_PROMPT=0 git
 * push` cannot skip the confirm.
 */

import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI, ToolResultEventResult } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "crypto";
import { homedir, tmpdir } from "os";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from "fs";
import { readFile, stat } from "fs/promises";
import { dirname, join, resolve, sep } from "path";

interface EditEntry {
	oldText: string;
	newText: string;
}

// ---- shared ----

/**
 * H5/B20 (2026-10-08): successful bash commands that mutate the working tree —
 * they legitimize verify re-runs exactly like an edit/write tool call (R10's
 * mutationSeq only counted edit/write, so `npm test → git pull → npm test`
 * false-blocked). Only ever relaxes R10 (more allows), never blocks more.
 */
const MUTATING_BASH =
	/(^|&&|;|\|)\s*(git\s+(pull|checkout|merge|rebase|stash|reset|restore|clean|rm|mv)\b|npm\s+(i|install|uninstall)\b|pnpm\s+(i|add|install)\b|yarn\s+(add|install)\b|pip3?\s+install\b|sed\s+[^|]*-i\b|prettier\b[^|]*--write\b|eslint\b[^|]*--fix\b|>\s*(?!\/?(dev|null|tmp)\/?)[^\s&>]+)/;

/**
 * H2 (2026-10-08, suite-evidence): commands that need explicit user approval
 * before running — the suite's must-ask tasks (t08 npm install, t09 git
 * reset --hard) failed 6/6 with AGENTS.md text alone: the model never asked.
 * With a UI (TUI/RPC) → ctx.ui.confirm dialog; headless/print → fail CLOSED
 * with a reason that tells the model to ask in chat and wait. The list mirrors
 * AGENTS.md "Security & Safety" (A2 single source of truth). Approved commands
 * are remembered verbatim for 2 min so an immediate re-send (hook retry) does
 * not re-prompt. Allowlist: per-command auto-approve rules — AllowRule below
 * (user-approved 2026-10-08; open question §8 closed).
 */
const DESTRUCTIVE_BASH =
	/(^|&&|;|\|)\s*(sudo\b|\brm\b|git\s+(reset\s+--hard|clean\b|checkout\s+--|restore\b|commit\b|push\b)|npm\s+(i|install|uninstall|add)\b|pnpm\s+(i|add|install|remove)\b|yarn\s+(add|install|remove)\b|pip3?\s+install\b|brew\s+install\b|apt(-get)?\s+install\b|\b(DROP\s+(TABLE|DATABASE)|DELETE\s+FROM)\b|mkfs(\.\w+)?\b|dd\s+if=|>\s*\/(etc|usr|var|boot|root)\b)/i;
const APPROVED_WINDOW_MS = 2 * 60_000;

/**
 * H2 allowlist (2026-10-08, user-approved follow-up): per-command auto-approve
 * rules for the confirm above, read FRESH from a JSON file next to the
 * extension on every destructive command (env PGATE_ALLOWLIST overrides — the
 * PGATE_MEMORY isolation pattern) so edits take effect without restarting pi.
 * Fail-closed: absent/corrupt/wrong-schema file → no rules → everything still
 * confirms. Shipped default (extensions/permission-gate.allowlist.json):
 * rm inside $TMPDIR + `git commit` under a PGATE_TRUST marker. Schema:
 *   { "rules": [ { "match": "rm", "within": "$TMPDIR" },
 *                { "match": "git commit", "trustMarker": "PGATE_TRUST" } ] }
 *   - match: prefix at a word boundary from the segment start (&&/;/\n split)
 *   - within: EVERY non-flag argument must resolve (after ~/$HOME/$TMPDIR
 *     expansion, realpath'd — symlink and .. escapes stay caught) inside it
 *   - trustMarker: a marker file must exist at/above the working directory —
 *     opting a repo into un-prompted commits is a deliberate physical act
 *   - neither: unconditional prefix auto-approve (explicit config opt-in)
 * A compound command is auto-approved only when EVERY destructive segment is
 * covered by a rule; pipes and deeper composition stay fail-closed (the match
 * anchors at segment start). Commitlint still runs first, so an allowlisted
 * `git commit` with a bad message is still blocked.
 */
interface AllowRule {
	match: string;
	within?: string;
	trustMarker?: string;
}
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function readAllowlist(): AllowRule[] {
	try {
		const parsed: unknown = JSON.parse(
			readFileSync(process.env.PGATE_ALLOWLIST ?? join(homedir(), ".pi", "agent", "extensions", "permission-gate.allowlist.json"), "utf8"),
		);
		const rules = (parsed as { rules?: unknown }).rules;
		if (!Array.isArray(rules)) return [];
		return rules.filter(
			(r): r is AllowRule =>
				!!r &&
				typeof r === "object" &&
				typeof (r as AllowRule).match === "string" &&
				(r as AllowRule).match.length > 0 &&
				((r as AllowRule).within === undefined || typeof (r as AllowRule).within === "string") &&
				((r as AllowRule).trustMarker === undefined || typeof (r as AllowRule).trustMarker === "string"),
		);
	} catch {
		return []; // absent/corrupt → fail closed: every destructive command still confirms
	}
}

/** expand ~/$HOME/$TMPDIR so `rm $TMPDIR/x` is judged on its real target */
const expandShellPath = (p: string) =>
	p.replace(/^~(?=\/|$)/, homedir()).replace(/\$\{?TMPDIR\}?/g, tmpdir()).replace(/\$\{?HOME\}?/g, homedir());

function ruleAllows(rule: AllowRule, seg: string, cwd: string): boolean {
	if (!new RegExp(`^${escapeRe(rule.match)}(?=\\s|$)`).test(seg)) return false;
	if (rule.within !== undefined) {
		let base: string;
		try {
			base = realpathSync(expandShellPath(rule.within));
		} catch {
			return false; // base dir doesn't exist → nothing can be inside it
		}
		const args = seg.split(/\s+/).slice(1).filter((t) => t && !t.startsWith("-"));
		if (args.length === 0) return false;
		return args.every((t) => {
			const gi = t.search(/[*?]/);
			const stem = gi === -1 ? t : t.slice(0, gi); // glob tail: judge the existing prefix
			if (!stem) return false; // bare glob carries no path info — confirm
			try {
				const p = realpathSync(resolve(cwd, expandShellPath(stem)));
				return p === base || p.startsWith(base + sep);
			} catch {
				return false; // nonexistent target → confirm, never assume
			}
		});
	}
	if (rule.trustMarker !== undefined) {
		let dir = resolve(cwd);
		for (let i = 0; i < 64; i++) {
			if (existsSync(join(dir, rule.trustMarker))) return true;
			const up = dirname(dir);
			if (up === dir) return false;
			dir = up;
		}
		return false;
	}
	return true; // unconditional prefix rule — explicit opt-in in the user's own config
}

/** every destructive segment (&&/;/\n split) covered by some rule — else confirm */
function cmdAllowlisted(cmd: string, cwd: string): boolean {
	const rules = readAllowlist();
	if (rules.length === 0) return false;
	const segs = splitSegments(cmd)
		.map((s) => s.trim())
		.map(stripEnvPrefix)
		.filter((s) => DESTRUCTIVE_BASH.test(s));
	return segs.length > 0 && segs.every((s) => rules.some((r) => ruleAllows(r, s, cwd)));
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
	let loopDepth = 0;
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
		// `do … done` bodies stay one segment (2026-10-07 block-impact audit: a
		// loop-body `sed -n '1,6p'` was split out standalone and blocked — but the
		// suggested fix, the read tool, cannot loop). Word boundaries keep
		// `docker`/`document` out; heredoc bodies count as unquoted (known
		// limitation — an unbalanced `do` errs toward fewer splits, never more).
		const wordStart = i === 0 || /[\s;&]/.test(cmd[i - 1]);
		if (wordStart && /^do\b/.test(cmd.slice(i))) {
			loopDepth++;
			cur += "do";
			i++;
			continue;
		}
		if (wordStart && /^done\b/.test(cmd.slice(i))) {
			loopDepth = Math.max(0, loopDepth - 1);
			cur += "done";
			i += 3;
			continue;
		}
		const two = cmd.slice(i, i + 2);
		if (loopDepth === 0 && (ch === "\n" || ch === ";" || two === "&&" || two === "||")) {
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

// ---- H1: non-blocking bash output cap (2026-10-08 autoresearch) ----

/** cap ceiling — whichever is hit first (2026-10-08 calibration: 100 lines / 4 KB
 * saves 26.4% of historical context inflow vs 15.3% at the initial 200/12 KB,
 * spilling on only ~5% of commands; the spill pointer keeps tails reachable) */
const CAP_LINES = 100;
const CAP_BYTES = 4_096;

// ---- R1b + cadence guards (2026-10-10 session audit) ----

/** big-read gate: a whole-file-ish request for a file larger than this is
 * blocked with a targeted-window reason (44KB/51KB whole-file reads rode two
 * sessions' prefixes; the read tool's own 2000-line/50KB truncation is too
 * generous to be the only brake) */
const BIG_READ_BYTES = 24_000;
/** a requested window at least this wide counts as whole-file-ish */
const BIG_READ_WIN = 500;
/** one-shot cadence nudge threshold: tool calls in one session before
 * proposing a compaction/fresh-session hop (2026-10-10: 354/303-turn
 * marathons re-billed ~100M cacheRead each with zero compactions) */
const CADENCE_TOOL_CALLS = 200;

/**
 * Replaces the deleted blocking viewing/dump rules (R2 viewing first;
 * R5/R6/R7/R8/verbose retire next): oversized bash output is truncated in
 * place — head kept, full output spilled to a tmp file, pointer line
 * appended. Applied via the tool_result RETURN value ({content, …}), which
 * the runner overlays onto what the model sees (emitToolResult; replacing
 * content without structuredContent drops it, so structuredContent is
 * passed through when present). Zero block turns, zero false positives: a
 * command the model legitimately needs still delivers its head; only the
 * flood is cut.
 */
function capBashOutput(event: {
	toolCallId: string;
	content?: unknown[];
	structuredContent?: unknown;
}): ToolResultEventResult | undefined {
	const blocks = event.content ?? [];
	const texts: string[] = [];
	for (const b of blocks) if ((b as { type?: unknown })?.type === "text") texts.push(String((b as { text?: unknown })?.text ?? ""));
	if (texts.length === 0) return;
	const full = texts.join("\n");
	const lines = full.split("\n");
	if (lines.length <= CAP_LINES && full.length <= CAP_BYTES) return;
	const kept: string[] = [];
	let bytes = 0;
	for (const l of lines) {
		if (kept.length >= CAP_LINES || bytes + l.length + 1 > CAP_BYTES) break;
		kept.push(l);
		bytes += l.length + 1;
	}
	let note = `… [output capped: kept ${kept.length}/${lines.length} lines]`;
	try {
		const spillDir = join(tmpdir(), "pgate-spill");
		const spill = join(spillDir, `${event.toolCallId}.txt`);
		mkdirSync(spillDir, { recursive: true });
		writeFileSync(spill, full);
		// hygiene (2026-10-08): long-lived sessions accumulate spills — prune
		// entries older than 24h, bounded to 50 unlinks per cap so latency stays
		// flat; best-effort, never blocks the result path
		try {
			const cutoff = Date.now() - 24 * 60 * 60_000;
		let pruned = 0;
		for (const f of readdirSync(spillDir)) {
			if (pruned >= 50) break;
			const p = join(spillDir, f);
			const s = statSync(p);
			if (s.isFile() && s.mtimeMs < cutoff) {
				unlinkSync(p);
				pruned++;
			}
		}
		} catch {
			// pruning is hygiene only
		}
		note = `… [output capped: kept ${kept.length}/${lines.length} lines — full output in ${spill}; read it with offset/limit if needed]`;
	} catch {
		// spill is best-effort; truncation alone still caps the flood
	}
	const content: ToolResultEventResult["content"] = blocks.filter((b) => (b as { type?: unknown })?.type !== "text") as NonNullable<ToolResultEventResult["content"]>;
	content.push({ type: "text", text: `${kept.join("\n")}\n${note}` });
	const out: ToolResultEventResult = { content };
	if (event.structuredContent !== undefined) out.structuredContent = event.structuredContent as ToolResultEventResult["structuredContent"];
	return out;
}

/** edited line span, 1-based inclusive, post-application */
interface LineSpan {
	start: number;
	end: number;
}

type CoverKind = "read" | "edit" | "write" | "inject";

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
}): Promise<{ block: true; reason: string } | { spans?: LineSpan[]; firstEditedLine?: number } | undefined> {
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
		}
	}

	// H9/B3 (2026-10-08): edits[] are applied as ONE overlay against the
	// ORIGINAL file — a span's post-edit line depends on edits EARLIER IN THE
	// FILE, not on array order (the old in-loop delta accumulated array order
	// and mis-certified out-of-order calls). Position-sort, then fold deltas.
	// B4: also report the first edited ORIGINAL line — tool_result truncates
	// stale coverage at it, because every line below a line-count-changing
	// edit shifted and old spans there describe different content.
	const sorted = [...spans].sort((a, b) => a.start - b.start);
	const edited: LineSpan[] = [];
	let delta = 0;
	let firstEditedLine = Infinity;
	for (const s of sorted) {
		const oldLines = toLF(String((edits[s.i] as EditEntry)?.oldText ?? "")).split("\n").length;
		const newLines = String((edits[s.i] as EditEntry)?.newText ?? "").split("\n").length;
		const oStart = lineOf(content, s.start);
		if (oStart < firstEditedLine) firstEditedLine = oStart;
		const eStart = oStart + delta;
		edited.push({ start: eStart, end: eStart + newLines - 1 });
		delta += newLines - oldLines;
	}

	return {
		spans: edited.length ? edited : undefined,
		firstEditedLine: edited.length && firstEditedLine !== Infinity ? firstEditedLine : undefined,
	}; // all anchors verified: let the edit proceed
}

// ---- R9: commitlint (conventional) validation ----

const COMMIT_TYPES = "feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert";
const CONVENTIONAL_HEADER = new RegExp(`^(${COMMIT_TYPES})(\\([\\w\\-.]+\\))?!?: .+`);

/** S-2 (2026-10-09, /ship-flow autoresearch): leading VAR=value assignments
 * (`GIT_TERMINAL_PROMPT=0 git push`) precede the subcommand and hid it from
 * the ^-anchored destructive/allowlist/R9 matches — strip them first so an
 * env-prefixed mutation can never skip the confirm (B18's -C class of miss). */
const stripEnvPrefix = (seg: string) =>
	seg.replace(/^(?:[A-Za-z_]\w*=(?:"[^"]*"|'[^']*'|[^\s"']+)\s+)+/, "");

/** S-1 (2026-10-09): body of a `<<'EOF' … EOF` heredoc embedded in a -m
 * value, else undefined */
function extractHeredoc(val: string): string | undefined {
	const m = /<<-?\s*(['"]?)(\w+)\1\s*\n([\s\S]*?)\n[ \t]*\2(?:\s|$)/.exec(val);
	return m ? m[3] : undefined;
}

/**
 * Validates every -m message of a 'git commit' segment against the commitlint
 * conventional pattern (type(scope?): subject, header <= 100 chars, subject
 * not capitalized / not ending in '.'). Returns a block reason or undefined.
 */
function validateCommitMessages(seg: string): string | undefined {
	// 2026-10-08 (B12): -m\s+ missed -m"x", -am "x" (m inside a combined short
	// flag cluster) and --message=x; 2026-10-08 (B21): unescape mapped \n to a
	// literal 'n' — a real newline keeps the header the first line, as the
	// shell would deliver it. Unquoted values (--message=y, -m foo) captured too.
	const flags = [
		...seg.matchAll(/(?:^|\s)(?:--[a-zA-Z-]*message|-[a-zA-Z]*m)\s*(?:=\s*)?(?:"((?:\\.|[^"])*)"|'((?:\\.|[^'])*)'|([^\s"'][^\s]*))/g),
	];
	if (flags.length === 0) return; // -F / editor message: not inspectable
	for (let i = 0; i < flags.length; i++) {
		let msg = (flags[i][1] ?? flags[i][2] ?? flags[i][3] ?? "")
			.replace(/\\n/g, "\n")
			.replace(/\\(["'\\])/g, "$1");
		if (!msg) continue;
		// S-1: `-m "$(cat <<'EOF' … EOF)"` delivers the message via heredoc —
		// lint the BODY, not the shell literal
		const heredoc = extractHeredoc(msg);
		if (heredoc !== undefined) msg = heredoc;
		const lines = msg.split("\n");
		if (i === 0) {
		const header = lines[0];
		if (!CONVENTIONAL_HEADER.test(header)) {
			return `Commitlint: ${JSON.stringify(header)} must match 'type(scope?): subject' — e.g. 'fix(auth): cap git log'.`;
		}
		if (header.length > 100) {
			return `Commitlint: header is ${header.length} chars (max 100) — shorten the subject.`;
		}
		const subject = header.replace(/^\S+\s*/, ""); // strip type/scope for subject rules
		{
			// 2026-10-08 (B13): mirror config-conventional's subject-case — ban
			// sentence-case ("Fix the…"), start-case ("Fix The Thing") and all-caps
			// subjects, but allow acronym-led subjects ("API timeout", "JSON
			// parse") that the old /^[A-Z]/ wrongly rejected; hooks backstop leaks.
			if (/^[A-Z][a-z]/.test(subject) || /^([A-Z][a-z]*\s)+[A-Z][a-z]*$/.test(subject) || /^[A-Z\s]+$/.test(subject)) {
				return `Commitlint: subject must not start with a capital ('${subject.slice(0, 30)}…') — lowercase it.`;
			}
			if (/[.]$/.test(header)) {
				return `Commitlint: header must not end with '.'.`;
			}
		}
		}
		// S-1: body-max-line-length (100, config-conventional) on every -m part —
		// until now the git hook enforced it alone (two rejects in one /ship)
		const bodyLines = i === 0 ? lines.slice(1) : lines;
		for (let j = 0; j < bodyLines.length; j++) {
			if (bodyLines[j].length > 100) {
				return `Commitlint: body line ${j + 1} of message part ${i + 1} is ${bodyLines[j].length} chars (max 100) — wrap it.`;
			}
		}
	}
	return;
}

/** R10: re-running an unchanged base command inside this window re-sends output already in context */
const RERUN_WINDOW_MS = 10 * 60_000;
/** Re-block window: shorter than R10 — the verbatim re-send pattern is immediate (2026-10-08 audit: 3s and 2.5s gaps) */
const REBLOCK_WINDOW_MS = 2 * 60_000;
/**
 * Violation memory (2026-10-06 feedback: "LLM keeps repeating the same mistakes
 * every session"). Blocks correct within a session (98% one-shot recovery)
 * but the model is stateless across sessions and re-attempts the same families
 * in every new one (R2 cat-viewing persisted Sep→Oct in work-project logs).
 * Persisted per-family block counts pick the lessons injected into the next
 * session's system prompt — the only mechanism that can cut FIRST attempts.
 * Delete logs/violation-memory.json to reset; PGATE_MEMORY overrides the path.
 */
const MEMORY_THRESHOLD = 5; // distinct sessions before a lesson enters the prompt
const FAMILY_LESSONS: Record<string, string> = {
	"Token Economy (Re-run)":
		"Never re-run a command unchanged within 10 min without an edit/write since — its output is already in context.",
	"Token Economy (Re-read)": "Never re-read a file window already in context this session — read only new regions (offset/limit).",
	"Permission Gate (Destructive)":
		"Destructive/mutating commands (rm, git reset --hard/clean/checkout --/commit/push, package installs, sudo) need explicit user approval first — approval in the invoking message counts (incl. predefined prompts: /ship, /issue, /update-changelog); otherwise ask in chat and wait when no confirm dialog appears.",
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
	const pendingEdits = new Map<
		string,
		{ path: string; spans?: LineSpan[]; firstEditedLine?: number; kind: "edit" | "write" }
	>();
	/** read toolCallId -> { path, win }, awaiting its tool_result */
	const pendingReads = new Map<string, { path: string; win: LineSpan }>();
	/** R10: bash toolCallId -> normalized base command, awaiting its tool_result */
	const pendingBash = new Map<string, string>();
	/** R10: base command -> last-run record; re-runs are compared against it */
	const lastBashRun = new Map<string, { ts: number; mut: number; failed: boolean }>();
	// 2026-10-08 extensions audit (Re-block): pendingBash is only set AFTER all
	// checks pass, so blocked calls leave no tool_result-side trace — keep the
	// verbatim cmd keyed by toolCallId to recognize our own synthesized block
	// results. One lastBlockedBash slot: only the immediately preceding blocked
	// bash call can be "re-sent verbatim".
	const pendingBashFull = new Map<string, string>();
	let lastBlockedBash: { cmd: string; family: string; ts: number; mut: number } | undefined;
	/** cadence nudge state — reset on session_start (in-process session switch) */
	let toolCallsSeen = 0;
	let cadenceFired = false;
	/** R10: bumped on every successful edit/write — a mutation makes verify re-runs legitimate */
	let mutationSeq = 0;
	/** H2: last user-approved destructive command (verbatim) + when */
	let lastApprovedDestructive: { cmd: string; ts: number } | undefined;

	// ---- violation memory: cross-session repeat-offense reduction ----
	// NDJSON append-only store (2026-10-07): parallel sessions (gated subagents)
	// made the read-modify-write JSON blob racy — last writer silently dropped
	// counts. Appends are atomic; aggregation happens at load. The legacy JSON
	// blob stays readable as a frozen base (pre-NDJSON telemetry, never written).
	const memoryNdjson = process.env.PGATE_MEMORY ?? join(homedir(), ".pi", "agent", "logs", "violation-memory.ndjson");
	const memoryLegacy = process.env.PGATE_MEMORY
		? memoryNdjson.replace(/\.ndjson$/, ".json")
		: join(homedir(), ".pi", "agent", "logs", "violation-memory.json");
	// H7 (2026-10-08): count DISTINCT SESSIONS per family in a rolling 30-day
	// window, not all-time block depth — one session hammering a family used to
	// hit the threshold alone (breadth across sessions is the actual signal that
	// a lesson belongs in the prompt). Per-process sid ≈ per-session: parallel
	// gated subagents are separate processes; a resume is a new process anyway.
	const sid = randomUUID();
	const MEMORY_WINDOW_MS = 30 * 24 * 60 * 60_000;
	const loadCounts = (): Record<string, number> => {
		const distinct: Record<string, Set<string>> = {};
		const legacy: Record<string, number> = {};
		try {
			const blob: unknown = JSON.parse(readFileSync(memoryLegacy, "utf8"));
			if (blob && typeof blob === "object") {
				for (const [k, v] of Object.entries(blob as Record<string, unknown>)) if (typeof v === "number") legacy[k] = v;
			}
		} catch {
			// absent or corrupt legacy blob — start from NDJSON alone
		}
		let lines = 0;
		const latest = new Map<string, { family: string; sid: string; ts: number }>();
		try {
			const raw = readFileSync(memoryNdjson, "utf8").split("\n");
			for (let i = 0; i < raw.length; i++) {
				const line = raw[i];
				if (!line.trim()) continue;
				lines++;
				try {
					const e = JSON.parse(line) as { family?: string; sid?: string; n?: number; ts?: number };
					if (typeof e.family !== "string") continue;
					if (typeof e.ts === "number" && Date.now() - e.ts > MEMORY_WINDOW_MS) continue; // rolled out
					const key = typeof e.sid === "string" && e.sid ? e.sid : `legacy-line-${i}`;
					(distinct[e.family] ??= new Set()).add(key);
					if (typeof e.sid === "string" && e.sid && typeof e.ts === "number") {
						const prev = latest.get(`${e.family}\u0000${e.sid}`);
						if (!prev || e.ts > prev.ts) latest.set(`${e.family}\u0000${e.sid}`, { family: e.family, sid: e.sid, ts: e.ts });
					}
				} catch {
					continue; // torn tail append — tolerate like pi's session files
				}
			}
		} catch {
			// no NDJSON yet — legacy counts (if any) stand alone
		}
		// compact at load (H7): a long-lived store must not grow unboundedly —
		// keep one entry per family+session (latest ts) when it has bloated
			if (lines > 200 && latest.size > 0 && latest.size < lines) {
				try {
					const tmp = `${memoryNdjson}.compact`;
				writeFileSync(tmp, [...latest.values()].map((e) => `${JSON.stringify({ family: e.family, sid: e.sid, ts: e.ts })}\n`).join(""));
					renameSync(tmp, memoryNdjson);
				} catch {
					// compaction is best-effort telemetry hygiene — never break the loop
				}
		}
		const counts: Record<string, number> = {};
		for (const [family, set] of Object.entries(distinct)) counts[family] = set.size;
		for (const [family, n] of Object.entries(legacy)) counts[family] = (counts[family] ?? 0) + (n > 0 ? 1 : 0);
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
				appendFileSync(memoryNdjson, `${JSON.stringify({ family, sid, ts: Date.now() })}\n`);
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

	// R-inj (2026-10-10 session audit): CLI @file args arrive as
	// `<file name="/abs/path">\n…content…\n</file>` blocks in the expanded
	// prompt (cli/file-processor); TUI @paths are literal text — nothing to
	// certify. A block that byte-matches the file on disk certifies whole-file
	// coverage, so R1 blocks re-reads of prompt-injected content exactly like
	// read results. Hint/empty/mismatched blocks certify nothing — err toward
	// allowing (never over-block on unverifiable injections).
	pi.on("before_agent_start", async (event) => {
		if (!event.prompt.includes('<file name="')) return;
		for (const m of event.prompt.matchAll(/<file name="([^"]+)">([\s\S]*?)<\/file>/g)) {
			const path = normPath(m[1]);
			if (!path) continue;
			// file-processor emits `\n${content}\n` inside the tags — strip exactly
			// one boundary newline each side; content itself is untouched
			const body = m[2].replace(/^\n/, "").replace(/\n$/, "");
			let disk: string;
			try {
				disk = toLF(await readFile(path, "utf8")).replace(/^\uFEFF/, "");
			} catch {
				continue; // unreadable/missing: nothing to certify
			}
			if (disk !== body) continue; // hints, truncation, drift: not verifiably in context
			const snap = await snapshot(path);
			if (snap) coverage.set(path, { spans: [{ start: 1, end: Infinity }], kind: "inject", stat: snap });
		}
	});

	// edit: anchor pre-validation first (existence, uniqueness, overlap);
	// only a call that passes is tracked for read-freshness below
	pi.on("tool_call", async (event, ctx) => {
		// cadence nudge (2026-10-10 session audit): fires once at the threshold —
		// the block reason carries the fix; the re-issued call passes untouched
		if (!cadenceFired && ++toolCallsSeen >= CADENCE_TOOL_CALLS) {
			cadenceFired = true;
			return blockCall(
				`Cadence: ${CADENCE_TOOL_CALLS}+ tool calls this session — the prefix now dominates cost. Finish the current step, then propose compaction or a fresh session (AGENTS.md cadence), and re-issue this call.`,
			);
		}
		if (isToolCallEventType("edit", event)) {
			const checked = await validateEditAnchors(event.input);
			if (checked && "block" in checked) return blockCall(checked.reason);
			pendingEdits.set(event.toolCallId, { path: normPath(event.input.path), spans: checked?.spans, firstEditedLine: checked?.firstEditedLine, kind: "edit" });
			return;
		}

		// R1: block a read whose requested window is fully covered by this
		// session's in-context spans (2026-10-05 coverage model)
		if (isToolCallEventType("read", event)) {
			const display = String(event.input.path ?? "");
			const path = normPath(display);
			// clamp the path contribution so the reason stays inside the 220c diet cap for any path length or kind
			const shown = display.length > 57 ? `…${display.slice(-56)}` : display;
			const start = Math.max(1, typeof event.input.offset === "number" ? event.input.offset : 1);
			const win: LineSpan = {
				start,
				end: typeof event.input.limit === "number" ? start + event.input.limit - 1 : Infinity,
			};
			// R1b (2026-10-10 session audit): first read of a large file requested
			// whole — block with the targeted-window fix. Windows narrower than
			// BIG_READ_WIN lines pass untouched, small files pass, R1 covers
			// re-reads of what is already certified in context.
			if (win.end === Infinity || win.end - win.start >= BIG_READ_WIN) {
				const snap = await snapshot(path);
				if (snap && snap.size > BIG_READ_BYTES) {
					return blockCall(
						`Token Economy (Big read): '${shown}' is ~${Math.round(snap.size / 1024)}KB — target it (rg the symbol, then offset/limit ≤${BIG_READ_WIN} lines).`,
				);
				}
			}
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
						`Token Economy (Re-read): ${lo === hi ? `line ${lo}` : `lines ${lo}–${hi === Infinity ? "EOF" : hi}`} of '${shown}' are already in context ` +
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
		pendingBashFull.set(event.toolCallId, cmd);

		// Re-block (2026-10-08 extensions audit): the audit's one RETRY-SAME case
		// re-sent a blocked `git clone + git log` verbatim — twice — because the
		// second block just repeated the original reason, giving the model no
		// signal that the re-send itself was the mistake. Escalate instead.
		// 2026-10-08 B1 fix: an edit/write since the block invalidates the
		// re-send pattern the same way it legitimizes an R10 verify re-run —
		// command-shape rules still re-block on their own check if they apply.
		// Short window: the pattern is an immediate re-send; a different block
		// in between naturally re-arms the original rule.
		if (
			lastBlockedBash &&
			lastBlockedBash.cmd === cmd &&
			lastBlockedBash.mut === mutationSeq &&
			Date.now() - lastBlockedBash.ts < REBLOCK_WINDOW_MS
		) {
			return blockCall(
				`Token Economy (Re-block): this exact command was blocked ${Math.round((Date.now() - lastBlockedBash.ts) / 1000)}s ago ` +
				`(${lastBlockedBash.family}) — that reason still applies. Change the command per it; a verbatim re-send only gets blocked again.`,
			);
		}

		// split into segments; each checked independently (quote-aware — a quoted
		// ';' is part of the command, not a separator)
		const segs = splitSegments(cmd);


		for (const seg of segs) {
			// R2 (viewing blocks) deleted 2026-10-08 by H1: bash output is capped
			// non-blockingly in tool_result (CAP_LINES/CAP_BYTES above) — a block
			// costs ~460 tok to save output the cap already truncates, and
			// prose-in-heredoc false fires cost whole recovery turns.

			// R5 (git log caps) deleted 2026-10-08 by H1 step 5: log output is bash
			// output — the cap truncates it (replay: 8 would-blocks incl. the
			// B18 `-C`/`--no-pager` anchor misses; a full log dump still caps at
			// 100 lines / 4 KB). AGENTS.md still teaches --oneline | head.

			// R9: commit message must follow the commitlint conventional pattern
			// H4-lite (2026-10-08): global git flags (-C dir, --no-pager, -c k=v)
			// precede the subcommand and hid it from the ^git-commit anchor (B18's
			// `git -C x commit -m …` skipped validation entirely)
			const norm = stripEnvPrefix(seg).replace(/^git\s+((-[A-Za-z]\s+\S+|--[a-z-]+(?:=\S+)?|-[A-Za-z]+)(\s+|$))*/, "git ");
			if (/^git commit\b/.test(norm)) {
				const lint = validateCommitMessages(norm);
				if (lint) return blockCall(lint);
			}

			// R8 (git hook caps) deleted 2026-10-08 by H1 step 4: hook output is
			// bash output — the cap truncates it at the same ceiling the
			// '2>&1 | tail' discipline aimed for, without a block turn before the
			// commit the model legitimately wants (replay: 14 would-blocks; the
			// `>` -in-quotes isCapped false fires were B10's root cause).

			// R7 (recursive-walk blocks) deleted 2026-10-08 by H1 step 6, the last
			// output-economy deletion: a walk's flood is bash output — the cap
			// truncates it at 100 lines / 4 KB (replay: 7 would-blocks, incl. the
			// B9 `/dev/null`-redirect miss). 'rg --files | head' discipline stays
			// in AGENTS.md. Remaining bash blocks: R9 commitlint, R10 re-run,
			// Re-block escalation — correctness/dup guards, not output guards.

			// verbose-runner caps deleted 2026-10-08 by H1 step 2: the output cap
			// truncates any runner flood at the same ceiling the pipe discipline
			// aimed for, without a block turn (replay: 21 would-blocks on legit
			// commands; pytest/pnpm/yarn/bun/cargo/go shapes were never covered).
		}

		// H2 (2026-10-08): destructive/mutating commands need explicit user
		// approval — AFTER lint (never ask permission for a command commitlint
		// will reject anyway) and BEFORE R10. UI present → confirm dialog;
		// headless → fail CLOSED, teaching the model to ask in chat and wait
		// (suite t08/t09: 6/6 unauthorized mutations without this).
		const wdRaw = (event.input as { cwd?: unknown }).cwd;
		const wd = typeof wdRaw === "string" ? resolve(wdRaw) : process.cwd();
		if (
			// S-2: segment-wise with env prefixes stripped — a whole-cmd test let
			// `… && GIT_TERMINAL_PROMPT=0 git push` skip the confirm entirely
			splitSegments(cmd).some((s) => DESTRUCTIVE_BASH.test(stripEnvPrefix(s))) &&
			!cmdAllowlisted(cmd, wd) &&
			!(lastApprovedDestructive && lastApprovedDestructive.cmd === cmd && Date.now() - lastApprovedDestructive.ts < APPROVED_WINDOW_MS)
		) {
			let approved = false;
			if (ctx?.hasUI && typeof ctx.ui?.confirm === "function") {
				// S-3 (2026-10-09, /ship-flow autoresearch): a dialog that never
				// surfaces (lost focus, dropped RPC client) must not freeze the
				// agent — decline after PGATE_CONFIRM_TIMEOUT_MS (default 120 s);
				// the block reason then tells the model to ask in chat and wait.
				const t = Number(process.env.PGATE_CONFIRM_TIMEOUT_MS);
				const ms = Number.isFinite(t) && t > 0 ? t : 120_000;
				let timer: ReturnType<typeof setTimeout> | undefined;
				try {
					approved = await Promise.race([
						ctx.ui.confirm("Allow destructive command?", cmd),
						new Promise<boolean>((r) => {
							timer = setTimeout(() => r(false), ms);
						}),
					]);
				} finally {
						if (timer) clearTimeout(timer);
				}
			}
			if (approved) {
				lastApprovedDestructive = { cmd, ts: Date.now() };
			} else {
				return blockCall(
					`Permission Gate (Destructive): '${cmd.slice(0, 60)}' mutates files, deps, or history and needs the user's approval ` +
					`first — ${ctx?.hasUI ? "the user declined" : "no confirm dialog is available"}; ask in chat and wait. Never run it unprompted.`,
				);
			}
		}

		// R10 (2026-10-06 audit; rekeyed 2026-10-07): identical re-run guard — the
		// SAME command (fd-merges like 2>&1 stripped, whitespace collapsed) re-run
		// with no intervening edit/write re-sends output already in context (gh run
		// list double-polls 31 s apart, identical vitest re-runs). Keyed on the full
		// command, not a pipe-truncated base — base keys collided every command
		// sharing a preamble (`nvm use` keyed four different test runs, `KEY=$(…)`
		// keyed different curls, heredoc `cat > f` truncated to base `cat`) and
		// taught token-level escapes (block-impact audit: compliance 0.06, mean net
		// −1.83; Hermes-agent #18076 converges on identical name+args keying).
		// Watchers and retries of failed runs are exempt; the run is recorded on
		// tool_result.
		const base = cmd.replace(/\b\d>&\d\b\s?/g, " ").replace(/\s+/g, " ").trim(); // \b: '2>&1' at command start strips too
		const watcher = /(^|\s)(watch|sleep)\b/.test(base) || /(^|\s)tail\s+(-[a-zA-Z]*[fF])/.test(base) || /--watch\b/.test(base);
		const prior = lastBashRun.get(base);
		if (prior && !prior.failed && !watcher && prior.mut === mutationSeq && Date.now() - prior.ts < RERUN_WINDOW_MS) {
			return blockCall(
				`Token Economy (Re-run): '${base.slice(0, 60)}' ran ${Math.round((Date.now() - prior.ts) / 1000)}s ago, no ` +
				`edit/write since — output already in context. Re-run only after a change. Poll: 'sleep N && cmd'.`,
			);
		}
		pendingBash.set(event.toolCallId, base);
		return;
	});

	// H1 cap handler (2026-10-08) — registered BEFORE the bookkeeping handler
	// below so the pendingBash* maps still identify the call; handlers compose,
	// and this one's RETURN value overlays the truncated content onto what the
	// model sees while bookkeeping (R10 records, Re-block arming) still runs.
	pi.on("tool_result", async (event) => {
		if (event.isError) return;
		if (!pendingBashFull.has(event.toolCallId) && !pendingBash.has(event.toolCallId)) return;
		return capBashOutput(event);
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
		const bashBlockedCmd = pendingBashFull.get(event.toolCallId);
		if (bashBlockedCmd !== undefined) {
			pendingBashFull.delete(event.toolCallId);
			// our synthesized block results carry isError + a family-prefixed
			// text; a real command failure ("bash: xyz: command not found") must
			// not arm the escalation — hence the prefix match, not isError alone
			const txt = (event.content as { text?: unknown }[] | undefined)?.[0]?.text;
			const fam = typeof txt === "string" ? /^(Token Economy|Anchor Guard|Commitlint|Permission Gate)[^:]*/.exec(txt) : null;
			if (event.isError && fam) {
				// B2 fix (2026-10-08): a Re-block result must not overwrite the family —
				// the 3rd consecutive block still names the ORIGINAL family so the
				// reason stays actionable instead of self-referencing "Re-block"
				const reblocked = fam[0].includes("(Re-block)");
				lastBlockedBash = {
					cmd: bashBlockedCmd,
					family: reblocked && lastBlockedBash ? lastBlockedBash.family : fam[0],
					ts: Date.now(),
					mut: mutationSeq,
				};
			}
		}
		const bashBase = pendingBash.get(event.toolCallId);
		if (bashBase !== undefined) {
			pendingBash.delete(event.toolCallId);
			lastBashRun.set(bashBase, { ts: Date.now(), mut: mutationSeq, failed: event.isError === true });
			// H5/B20: a successful mutating bash command bumps mutationSeq like an
			// edit/write — failures and watchers never do (a failed pull changed nothing)
			if (!event.isError && MUTATING_BASH.test(String(event.input?.command ?? ""))) mutationSeq++;
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
				// B4/H9 (2026-10-08): every line below the first edited original line
				// shifted when line counts changed — stale coverage spans there
				// describe different content and must not block re-reads. Truncate
				// at the first edited line, then certify the fresh post-edit spans.
				const prior = coverage.get(entry.path);
				if (prior && entry.firstEditedLine !== undefined) {
					const kept = prior.spans.filter((s) => s.end < entry.firstEditedLine!);
					coverage.set(entry.path, { ...prior, spans: kept });
				}
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
		pendingBashFull.clear();
		lastBlockedBash = undefined;
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
		pendingBashFull.clear();
		lastBlockedBash = undefined;
		toolCallsSeen = 0;
		cadenceFired = false;
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
		const pending = new Map<string, { path: string; win: LineSpan; write?: boolean; edited?: boolean; ts?: number }>();
		for (const entry of branch) {
			if ((entry as { type?: string }).type !== "message") continue;
			// H6 (2026-10-08): entry ISO timestamp — hydration certifies only while
			// the file still predates the replayed read (mtime <= ts, 1s slack);
			// a file changed after that read certifies nothing (stale content)
			const entryTs = Date.parse(String((entry as { timestamp?: unknown }).timestamp ?? "")) || 0;
			const msg = (entry as { message?: { role?: string; content?: unknown[] } }).message;
			if (!msg || !Array.isArray(msg.content)) continue;
			if (msg.role === "assistant") {
				for (const b of msg.content) {
					const call = b as { type?: string; id?: string; name?: string; arguments?: Record<string, unknown> };
					if (call?.type !== "toolCall" || !call.id) continue;
					if ((call.name === "read" || call.name === "write" || call.name === "edit") && typeof call.arguments?.path === "string") {
						const path = normPath(call.arguments.path);
						if (!path) continue;
						if (call.name === "write") {
							pending.set(call.id, { path, win: { start: 1, end: Infinity }, write: true, ts: entryTs });
							continue;
						}
						// H6/B7 (2026-10-08): a replayed edit's anchors can't be re-validated
						// here — clear coverage for the path instead of certifying stale
						// spans (errs allow; the pre-edit content is not what's on disk)
						if (call.name === "edit") {
							pending.set(call.id, { path, win: { start: 1, end: Infinity }, edited: true, ts: entryTs });
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
				if (p.edited) {
					coverage.delete(p.path); // B7: the replayed edit invalidated prior spans
					continue;
				}
				if (p.write || (res.content ?? []).some((b) => (b as { type?: string })?.type === "image")) {
					const snap = await snapshot(p.path);
					// H6: certify only when the file predates this replayed write/read
					if (!(snap && p.ts && snap.mtimeMs > p.ts + 1000))
						coverage.set(p.path, { spans: [{ start: 1, end: Infinity }], kind: p.write ? "write" : "read", stat: snap });
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
