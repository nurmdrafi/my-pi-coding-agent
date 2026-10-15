/**
 * piread — native read pipeline behind the built-in `read` interface (S6).
 *
 * Registers a tool named `read` that shadows the built-in (the session's
 * tool registry is built-in-first; extension `registerTool` overwrites the
 * entry, and `tool_call`/`tool_result` events stay name-based so
 * permission-gate is unaffected). Name/label/description/parameters are
 * copied verbatim from `createReadToolDefinition` so the system prompt —
 * and therefore the prompt-cache prefix — is byte-identical between arms.
 *
 * Dispatch (spec §5.2):
 *   1. image extension on `path`  → built-in instance (image processing
 *      needs the model context — D4)
 *   2. sane integer offset/limit  → spawn `bin/piread`, rebuild the
 *      built-in result shape from its JSON envelope
 *   3. anything else (spawn failure, non-zero exit, unparseable JSON,
 *      binary content, pathological numeric params) → built-in instance
 *      plus one stderr fallback line — fail-open to correctness.
 *
 * Default off (D5): the load guard requires PI_NATIVE_READ=1.
 */
import { execFile } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  createReadTool,
  createReadToolDefinition,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

const execFileAsync = promisify(execFile);

/** Built-in image support (read tool docs: jpg, png, gif, webp, bmp). */
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"];

const extDir = dirname(fileURLToPath(import.meta.url));
/** Machine-local build output (scripts/bootstrap.sh), no absolute user paths. */
const PIREAD_BIN = resolve(extDir, "../../bin/piread");

/** Private built-in instance: fallback executor and image path. Never registered.
 * Cast to the definition's execute signature: the AgentTool wrapper types the
 * ctx parameter as undefined (no ctxFactory), but passes it through at runtime. */
/** Read-tool params (schema: path + optional 1-based offset/limit). */
type ReadParams = { path: string; offset?: number; limit?: number };

/** Structural shape of the built-in read result — the only contract piread rebuilds. */
type ReadResult = {
  content: { type: "text"; text: string }[];
  details?: { truncation?: unknown } | undefined;
  structuredContent?: unknown;
};

/** Definition copied verbatim into the registered shadow tool. */
const definition = createReadToolDefinition(process.cwd());

/** Private built-in executor: fallback + image path. Cast to a structural type —
 * the wrapped AgentTool types ctx as `undefined` (no ctxFactory) and its precise
 * d.ts types live in a second pi-agent-core module identity that does not
 * unify with the extension surface under skipLibCheck. */
const builtinExecute = createReadTool(process.cwd()).execute as (
  toolCallId: string,
  params: ReadParams,
  signal?: AbortSignal,
  onUpdate?: unknown,
  ctx?: unknown,
) => Promise<ReadResult>;

/** piread's stdout contract (crate docs, `native/piread`). */
type PireadEnvelope = {
  ok: boolean;
  content?: string;
  truncation?: unknown;
  binary?: boolean;
  totalBytes?: number;
  error?: { kind: string; message: string };
};

export default function pireadExtension(pi: ExtensionAPI): void {
  // Load guard (D5): default off, zero footprint when unset.
  if (process.env.PI_NATIVE_READ !== "1") return;

  const fallbackToBuiltin = async (
    toolCallId: string,
    params: ReadParams,
    signal: AbortSignal | undefined,
    onUpdate: unknown,
    ctx: unknown,
    reason: string,
  ) => {
    // Observability: one line per fallback (spec §5.2).
    process.stderr.write(`piread: fallback (${reason}) path=${params.path}\n`);
    return builtinExecute(toolCallId, params, signal, onUpdate, ctx);
  };

  const execute = async (
    toolCallId: string,
    params: ReadParams,
    signal: AbortSignal | undefined,
    onUpdate: unknown,
    ctx: unknown,
  ): Promise<ReadResult> => {
    const { path, offset, limit } = params;
    // The CLI contract is offset/limit >= 1; JS's own semantics for 0,
    // negatives, and non-integers are odd-but-defined — keep them on the
    // built-in verbatim instead of approximating.
    const sane = (n: number | undefined) =>
      n === undefined || (Number.isInteger(n) && n >= 1);
    if (!sane(offset) || !sane(limit)) {
      return fallbackToBuiltin(toolCallId, params, signal, onUpdate, ctx, "non-integer offset/limit");
    }
    const lower = path.toLowerCase();
    if (IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
      return builtinExecute(toolCallId, params, signal, onUpdate, ctx);
    }

    const args = ["--path", path];
    if (offset !== undefined) args.push("--offset", String(offset));
    if (limit !== undefined) args.push("--limit", String(limit));

    let stdout: string;
    const spawnCwd = (ctx as { cwd?: string } | undefined)?.cwd || process.cwd();
    try {
      ({ stdout } = await execFileAsync(PIREAD_BIN, args, {
        cwd: spawnCwd,
        signal,
        maxBuffer: 16 * 1024 * 1024,
      }));
    } catch (err) {
      const e = err as NodeJS.ErrnoException & { code?: string | number };
      if (signal?.aborted || e.name === "AbortError") {
        // Same rejection as the built-in's abort path.
        throw new Error("Operation aborted");
      }
      // execFile failures: numeric `code` is the child's exit status (piread
      // usage/I-O errors), anything else (ENOENT, EACCES…) is a spawn failure.
      const reason =
        typeof e.code === "number" ? `exit ${e.code}` : `spawn ${String(e.code ?? e.message)}`;
      return fallbackToBuiltin(toolCallId, params, signal, onUpdate, ctx, reason);
    }

    let envelope: PireadEnvelope;
    try {
      envelope = JSON.parse(stdout) as PireadEnvelope;
    } catch {
      return fallbackToBuiltin(toolCallId, params, signal, onUpdate, ctx, "unparseable stdout");
    }
    if (envelope.ok !== true || typeof envelope.content !== "string") {
      // Non-zero exits land here too: the built-in produces the identical
      // error (messages are replicated), so fall back rather than re-wrap.
      return fallbackToBuiltin(toolCallId, params, signal, onUpdate, ctx, "error envelope");
    }
    if (envelope.binary) {
      // Content-sniffed images without an image extension, and NUL-bearing
      // text: the built-in pipeline is authoritative (and byte-identical for
      // text, so this costs nothing but a spawn).
      return fallbackToBuiltin(toolCallId, params, signal, onUpdate, ctx, "binary");
    }

    return {
      content: [{ type: "text", text: envelope.content }],
      details: envelope.truncation ? { truncation: envelope.truncation } : undefined,
      structuredContent: envelope.content,
    };
  };

  // The envelope pipeline rebuilds `details.truncation` from piread's JSON
  // (shape-identical to the built-in's TruncationResult, pinned byte-exact by
  // the parity suite); the cast bridges the loose structural type to the
  // definition's precise one (its d.ts lives in the nested pi-agent-core
  // identity, which does not unify under skipLibCheck).
  pi.registerTool({ ...definition, execute: execute as typeof definition.execute });
}
