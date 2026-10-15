/**
 * pidx — native session-log indexer registered as its own tool.
 *
 * Wraps bin/pidx (Rust crate, native/pidx): parses pi session transcripts
 * into compact per-session extracts (turns, tool calls with param hashes,
 * tool results, compactions, skill loads). Incremental via (size, mtime_ns)
 * cache in the state file, so warm runs are O(changes).
 *
 * Dispatch: one-shot execFile per call (indexing is infrequent; no daemon
 * needed). Failures throw — the model sees a failed tool result and can
 * fall back to the Node parser (session-audit slow path).
 *
 * Load guard: default on; PI_NATIVE_PIDX=0 opts out.
 */
import { execFile } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
// pi-ai ships nested under pi-coding-agent (not a top-level dependency here);
// deep import avoids adding a dependency entry for one TypeBox schema builder.
import { Type } from "../../node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/index.js";
import {
  defineTool,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

const execFileAsync = promisify(execFile);

const extDir = dirname(fileURLToPath(import.meta.url));

/** Machine-local build output (scripts/bootstrap.sh), no absolute user paths. */
const PIDX_BIN = resolve(extDir, "../../bin/pidx");

type PidxParams = {
  sessionsDir?: string;
  state?: string;
  out?: string;
  max?: number;
  force?: boolean;
};

const pidxTool = defineTool({
  name: "pidx",
  label: "pidx",
  description:
    "Index pi session logs into compact per-session extracts (turns, tool calls with param hashes, tool results, compactions, skill loads) via the native Rust indexer. Incremental: unchanged files reuse the cached extract, so warm runs only process changes. Returns one JSON line per session (newest first) plus a summary line. Use this as the fast path for session-audit and session-history analysis.",
  parameters: Type.Object({
    sessionsDir: Type.Optional(
      Type.String({ description: "Sessions directory to scan (default: pi default sessions dir)" }),
    ),
    state: Type.Optional(
      Type.String({ description: "Cache/state file path (default: repo .pidx-state.bin)" }),
    ),
    out: Type.Optional(
      Type.String({ description: "Write extracts to this path instead of returning them (default: stdout)" }),
    ),
    max: Type.Optional(Type.Number({ description: "Limit number of sessions in output" })),
    force: Type.Optional(Type.Boolean({ description: "Re-index everything, ignoring the cache" })),
  }),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },

  async execute(_toolCallId, params: PidxParams, signal) {
    const args: string[] = [];
    if (params.sessionsDir) args.push("--sessions-dir", params.sessionsDir);
    if (params.state) args.push("--state", params.state);
    if (params.out) args.push("--out", params.out);
    if (params.max !== undefined) args.push("--max", String(params.max));
    if (params.force) args.push("--force");

    const { stdout, stderr } = await execFileAsync(PIDX_BIN, args, {
      maxBuffer: 64 * 1024 * 1024,
      signal,
    });

    // stdout: one JSON per session (or empty when --out was given).
    // stderr: single summary JSON line — surface it in details either way.
    let summary: unknown;
    try {
      summary = stderr.trim() ? JSON.parse(stderr.trim().split("\n").pop()!) : undefined;
    } catch {
      summary = stderr.trim();
    }

    const content = stdout.trim() || (params.out ? `Extracts written to ${params.out}` : "No sessions found.");

    return {
      content: [{ type: "text", text: content }],
      details: { summary, bin: PIDX_BIN },
    };
  },

  renderCall(args, theme) {
    let text = theme.fg("toolTitle", theme.bold("pidx "));
    const bits: string[] = [];
    if (args.sessionsDir) bits.push(args.sessionsDir);
    if (args.max !== undefined) bits.push(`max=${args.max}`);
    if (args.force) bits.push("--force");
    text += theme.fg("accent", bits.join(" ") || "sessions");
    return new Text(text, 0, 0);
  },
});

export default function pidxExtension(pi: ExtensionAPI): void {
  // Load guard: default on; PI_NATIVE_PIDX=0 opts out.
  if (process.env.PI_NATIVE_PIDX === "0") return;
  pi.registerTool(pidxTool);
}
