/** H1: non-blocking bash output cap — oversized output is truncated in place
 * (head kept, oversized first line head+tail truncated), the full text spilled
 * to $TMPDIR/pgate-spill (0700/0600), pointer line appended. Zero block turns,
 * zero false positives: the model still gets the head; only the flood is cut. */
import type { ToolResultEventResult } from "@earendil-works/pi-coding-agent";
import { tmpdir } from "os";
import {
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { join } from "path";

/** cap ceiling — whichever is hit first (2026-10-11 user feedback: 40 lines /
 * 2 KB — most terminal output is noise while a task runs; the spill pointer
 * keeps the full output reachable. Was 100 lines / 4 KB (2026-10-08).) */
const CAP_LINES = 40;
const CAP_BYTES = 2_048;

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
export function capBashOutput(event: {
  toolCallId: string;
  content?: unknown[];
  structuredContent?: unknown;
}): ToolResultEventResult | undefined {
  const blocks = event.content ?? [];
  const texts: string[] = [];
  for (const b of blocks)
    if ((b as { type?: unknown })?.type === "text")
      texts.push(String((b as { text?: unknown })?.text ?? ""));
  if (texts.length === 0) return;
  const full = texts.join("\n");
  const lines = full.split("\n");
  // 2026-10-11: count UTF-8 bytes, not UTF-16 code units — multibyte output
  // measured ~2x smaller before, so non-ASCII floods under-capped
  if (lines.length <= CAP_LINES && Buffer.byteLength(full, "utf8") <= CAP_BYTES)
    return;
  const kept: string[] = [];
  let bytes = 0;
  for (const l of lines) {
    if (kept.length >= CAP_LINES) break;
    const b = Buffer.byteLength(l, "utf8") + 1;
    if (bytes + b > CAP_BYTES) {
      // 2026-10-11: a first line larger than the whole budget used to
      // leave kept=[] — the model saw only the note. Truncate that line
      // head+tail so a long failure-summary line still carries its ends.
      if (kept.length === 0 && l) {
        const buf = Buffer.from(l, "utf8");
        const half = Math.max(64, Math.floor((CAP_BYTES - 64) / 2));
        kept.push(
          `${buf.subarray(0, half).toString("utf8")} … [line truncated: ${buf.length} B] … ${buf.subarray(Math.max(half, buf.length - half)).toString("utf8")}`,
        );
      }
      break;
    }
    kept.push(l);
    bytes += b;
  }
  let note = `… [output capped: kept ${kept.length}/${lines.length} lines]`;
  try {
    // 2026-10-11: toolCallId is foreign text — sanitize it for the spill
    // filename (path traversal), and create dir/file 0700/0600 (spills
    // hold command output)
    const safeId = String(event.toolCallId).replace(/[^A-Za-z0-9._-]/g, "_");
    const spillDir = join(tmpdir(), "pgate-spill");
    const spill = join(spillDir, `${safeId}.txt`);
    mkdirSync(spillDir, { recursive: true, mode: 0o700 });
    writeFileSync(spill, full, { mode: 0o600 });
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
  const content: ToolResultEventResult["content"] = blocks.filter(
    (b) => (b as { type?: unknown })?.type !== "text",
  ) as NonNullable<ToolResultEventResult["content"]>;
  content.push({ type: "text", text: `${kept.join("\n")}\n${note}` });
  const out: ToolResultEventResult = { content };
  if (event.structuredContent !== undefined)
    out.structuredContent =
      event.structuredContent as ToolResultEventResult["structuredContent"];
  return out;
}
