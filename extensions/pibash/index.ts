/**
 * pibash — native shell tool registered as its own tool.
 *
 * Registers a distinct tool named `pibash` alongside the built-in `bash`.
 * Parameters are copied verbatim from `createBashToolDefinition` so the
 * schema matches; name/label/description/promptGuidelines are pibash-specific
 * and steer the model to pibash for shell work. permission-gate treats
 * `pibash` calls as bash-kind (H1 output cap, R10 re-run guard, destructive
 * analysis, mutation tracking), so gate protection is retained.
 *
 * Dispatch (daemon ladder, same shape as piread/piedit):
 *   1. `bin/pibash --serve` daemon — persistent, id-matched NDJSON over stdio,
 *      lazily started, restarted on death. This rung is what makes the native
 *      path beat the built-in: one spawn per session, not one per call.
 *   2. one-shot `bin/pibash` spawn per call when the daemon transport fails.
 *   3. built-in bash implementation — fail-open to correctness — plus ONE
 *      stderr fallback line (the terminal reason) per call.
 *
 * Default on: the load guard registers unless PI_NATIVE_BASH=0 (explicit
 * opt-out — the ladder still guarantees the built-in path when the native
 * binary is missing).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { appendFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createBashTool,
  createBashToolDefinition,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

/** Transport-level daemon failure — the call moves to the one-shot rung. */
class DaemonUnavailableError extends Error {
  constructor(reason: string) {
    super(`daemon unavailable (${reason})`);
    this.name = "DaemonUnavailableError";
  }
}

/** Wraps an error that must reach the caller unchanged (built-in parity for the
 * spawn/timeout failure shapes), distinguishing it from a transport failure that
 * should fall open to the built-in executor. */
class ParityError extends Error {
  readonly cause: Error;
  constructor(cause: Error) {
    super(cause.message);
    this.name = "ParityError";
    this.cause = cause;
  }
}

const extDir = dirname(fileURLToPath(import.meta.url));

/** Machine-local build output (scripts/bootstrap.sh), no absolute user paths. */
const PIBASH_BIN = resolve(extDir, "../../bin/pibash");

/** Fallback lines land in the existing gate log, reusing its schema. */
const PGATE_NDJSON = resolve(extDir, "../../logs/violation-memory.ndjson");
const SESSION_ID = randomUUID();

function logFallback(reason: string, command: string): void {
  try {
    appendFileSync(
      PGATE_NDJSON,
      `${JSON.stringify({ family: "Pibash (fallback)", sid: SESSION_ID, ts: Date.now(), reason, command: command.slice(0, 200) })}\n`,
    );
  } catch {
    // Logging must never break a command.
  }
}

/** pibash's stdout contract (crate docs, `custom-tools/pibash`). */
type PibashEnvelope = {
  ok: boolean;
  text?: string;
  truncated?: boolean;
  /** Rust serializes this camelCase, matching the built-in's details field. */
  fullOutputPath?: string;
  exit_code?: number;
  wall_time_seconds?: number;
  structured_output?: string;
  structured_truncated?: boolean;
  truncation?: unknown;
  error?: { kind: string; message: string };
};

type BashParams = { command: string; timeout?: number };

/** Structural result shape — the only contract pibash rebuilds. */
type BashResult = {
  content: { type: "text"; text: string }[];
  details?: unknown;
  structuredContent?: unknown;
  isError?: boolean;
};

/** Schema/prompt source: the built-in bash definition. Copied verbatim; the
 * registration below overrides name/label/description/promptGuidelines. */
const definition = createBashToolDefinition(process.cwd());

/** Private built-in executor — the final fail-open rung. Never registered. */
const builtinExecute = createBashTool(process.cwd()).execute as (
  toolCallId: string,
  params: BashParams,
  signal?: AbortSignal,
  onUpdate?: unknown,
  ctx?: unknown,
) => Promise<BashResult>;

// ---- daemon client (`pibash --serve`, NDJSON over stdio) ----

type DaemonPending = {
  resolve: (envelope: PibashEnvelope) => void;
  reject: (err: Error) => void;
};

type DaemonState = {
  proc: ChildProcess;
  stdin: PipeStdin;
  stdout: PipeStdout;
  pending: Map<number, DaemonPending>;
  nextId: number;
  buffer: string;
};

/** Child stdio pipes expose libuv refcounting at runtime; @types/node models
 * them as plain streams — structural bridge. */
interface Refable {
  ref(): void;
  unref(): void;
}
interface PipeStdin extends Refable {
  write(chunk: string): boolean;
  end(): void;
  on(event: "error", listener: (err: Error) => void): void;
}
interface PipeStdout extends Refable {
  on(event: "data", listener: (chunk: Buffer) => void): void;
}

let daemon: DaemonState | undefined;

function killDaemon(state: DaemonState, reason: string): void {
  if (daemon === state) daemon = undefined;
  for (const [, pending] of state.pending) {
    pending.reject(new DaemonUnavailableError(reason));
  }
  state.pending.clear();
  try {
    state.stdin.end();
    state.proc.kill();
  } catch {
    // Best effort: a dead daemon needs no cleanup.
  }
}

function startDaemon(): DaemonState {
  const proc = spawn(PIBASH_BIN, ["--serve"], { stdio: ["pipe", "pipe", "ignore"] });
  const state: DaemonState = {
    proc,
    stdin: proc.stdin as unknown as PipeStdin,
    stdout: proc.stdout as unknown as PipeStdout,
    pending: new Map(),
    nextId: 1,
    buffer: "",
  };
  state.stdout.on("data", (chunk: Buffer) => {
    state.buffer += chunk.toString("utf8");
    for (;;) {
      const newline = state.buffer.indexOf("\n");
      if (newline === -1) break;
      const line = state.buffer.slice(0, newline);
      state.buffer = state.buffer.slice(newline + 1);
      if (!line.trim()) continue;
      let parsed: (PibashEnvelope & { id?: number }) | undefined;
      try {
        parsed = JSON.parse(line) as PibashEnvelope & { id?: number };
      } catch {
        killDaemon(state, "unparseable response line");
        return;
      }
      const id = parsed.id;
      if (id === undefined) continue;
      const pending = state.pending.get(id);
      if (!pending) continue;
      state.pending.delete(id);
      pending.resolve(parsed);
    }
  });
  proc.on("error", (err: Error) => killDaemon(state, err.message));
  proc.on("exit", () => killDaemon(state, "daemon exited"));
  state.stdin.on("error", () => killDaemon(state, "daemon stdin closed"));
  // Idle daemon must not hold the process open.
  (state.stdin as unknown as Refable).unref();
  (state.stdout as unknown as Refable).unref();
  state.proc.unref();
  return state;
}

function ensureDaemon(): DaemonState {
  daemon ??= startDaemon();
  return daemon;
}

function request(
  state: DaemonState,
  command: string,
  cwd: string,
  timeout: number | undefined,
): Promise<PibashEnvelope> {
  const id = state.nextId++;
  const payload = JSON.stringify({ id, command, cwd, timeout });
  return new Promise<PibashEnvelope>((resolve, reject) => {
    (state.stdin as unknown as Refable).ref();
    (state.stdout as unknown as Refable).ref();
    state.proc.ref();
    const settle = (): void => {
      if (state.pending.size > 0) return;
      (state.stdin as unknown as Refable).unref();
      (state.stdout as unknown as Refable).unref();
      state.proc.unref();
    };
    state.pending.set(id, {
      resolve: (envelope) => {
        settle();
        resolve(envelope);
      },
      reject: (err) => {
        settle();
        reject(err);
      },
    });
    try {
      state.stdin.write(`${payload}\n`);
    } catch (err) {
      state.pending.delete(id);
      reject(new DaemonUnavailableError(err instanceof Error ? err.message : String(err)));
    }
  });
}

/** One-shot rung: a single `pibash` spawn per call. */
function oneShot(command: string, cwd: string, timeout: number | undefined): Promise<PibashEnvelope> {
  const args = ["--command", command, "--cwd", cwd];
  if (timeout !== undefined) args.push("--timeout", String(timeout));
  return new Promise<PibashEnvelope>((resolve, reject) => {
    const proc = spawn(PIBASH_BIN, args, { stdio: ["ignore", "pipe", "ignore"] });
    let stdout = "";
    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    proc.on("error", (err: Error) => reject(new DaemonUnavailableError(err.message)));
    proc.on("exit", () => {
      const line = stdout.trim().split("\n").filter(Boolean).pop();
      if (!line) {
        reject(new DaemonUnavailableError("empty one-shot output"));
        return;
      }
      try {
        resolve(JSON.parse(line) as PibashEnvelope);
      } catch (err) {
        reject(new DaemonUnavailableError(err instanceof Error ? err.message : String(err)));
      }
    });
  });
}

/** Rebuild the built-in's result envelope from a pibash response. */
function toResult(envelope: PibashEnvelope): BashResult {
  const exitCode = envelope.exit_code ?? 0;
  const truncated = envelope.truncated === true;
  // The oracle only emits `details` when the output was truncated; an
  // unconditional object would add `{truncation: undefined}` and break parity.
  let details;
  if (truncated) {
    // The daemon omits `truncation.content` (it is always an exact prefix of
    // the display text and would double the envelope bytes); restore it here so
    // `details.truncation` is byte-identical to the built-in's.
    const truncation = envelope.truncation as { content?: string } | undefined;
    if (truncation && truncation.content === undefined) {
      // The note is appended after a blank line; everything before it is content.
      const displayText = envelope.text ?? "";
      const noteAt = displayText.indexOf("\n\n[");
      truncation.content = noteAt === -1 ? displayText : displayText.slice(0, noteAt);
    }
    details = { truncation, fullOutputPath: envelope.fullOutputPath };
  }
  const structuredContent = {
    output: envelope.structured_output ?? "",
    truncated: envelope.structured_truncated === true,
    ...(envelope.structured_truncated === true && envelope.fullOutputPath
      ? { full_output_path: envelope.fullOutputPath }
      : {}),
    exit_code: exitCode,
    wall_time_seconds: envelope.wall_time_seconds ?? 0,
  };
  const text = envelope.text ?? "";
  if (exitCode !== 0) {
    return {
      content: [{ type: "text", text: `${text ? `${text}\n\n` : ""}Command exited with code ${exitCode}` }],
      details,
      structuredContent,
      isError: true,
    };
  }
  return { content: [{ type: "text", text }], details, structuredContent };
}

export default function pibashExtension(pi: ExtensionAPI): void {
  if (process.env.PI_NATIVE_BASH === "0") return;

  async function execute(
    toolCallId: string,
    params: BashParams,
    signal?: AbortSignal,
    onUpdate?: unknown,
    ctx?: { cwd?: string },
  ): Promise<BashResult> {
    const command = typeof params?.command === "string" ? params.command : "";
    if (!command.trim()) return builtinExecute(toolCallId, params, signal, onUpdate, ctx);
    const cwd = ctx?.cwd ?? process.cwd();
    const timeout = typeof params.timeout === "number" ? params.timeout : undefined;
    let reason = "unknown";
    try {
      let envelope: PibashEnvelope;
      try {
        envelope = await request(ensureDaemon(), command, cwd, timeout);
      } catch (err) {
        if (!(err instanceof DaemonUnavailableError)) throw err;
        reason = `daemon: ${err.message}`;
        envelope = await oneShot(command, cwd, timeout);
      }
      if (!envelope.ok) {
        // The built-in THROWS for a missing cwd and for a timeout (it does not
        // return an error result). Rethrow those two so callers observe the same
        // failure shape; anything else falls open to the built-in executor.
        const kind = envelope.error?.kind;
        if (kind === "spawn" || kind === "timeout") {
          throw new ParityError(new Error(envelope.error?.message ?? kind));
        }
        reason = `native error: ${envelope.error?.message ?? "unknown"}`;
        return builtinExecute(toolCallId, params, signal, onUpdate, ctx);
      }
      return toResult(envelope);
    } catch (err) {
      // A deliberate parity rethrow (spawn/timeout) must propagate untouched —
      // only transport failures fall through to the built-in.
      if (err instanceof ParityError) throw err.cause;
      reason = err instanceof Error ? err.message : String(err);
      logFallback(reason, command);
      process.stderr.write(`pibash: falling back to built-in bash (${reason})\n`);
      return builtinExecute(toolCallId, params, signal, onUpdate, ctx);
    }
  }

  pi.registerTool({
    ...definition,
    name: "pibash",
    label: "pibash",
    description:
      "Execute a bash command via the native pibash pipeline — prefer this over the bash tool for shell work. Returns stdout and stderr. Output is truncated to the last 2000 lines or 50KB (whichever is hit first); when truncated the full output is saved to a temp file. Optionally provide a timeout in seconds. Any pipeline failure falls back to the built-in bash tool automatically.",
    promptGuidelines: definition.promptGuidelines,
    execute: execute as typeof definition.execute,
    renderCall(args, theme) {
      let text = theme.fg("success", theme.bold("pibash ")) + theme.fg("text", args.command);
      if (args.timeout) text += theme.fg("dim", ` (timeout ${args.timeout}s)`);
      return new Text(text, 0, 0);
    },
  });
}

/** Test affordance: kill the daemon so suites can exercise the cold-start
 * paths (missing binary, one-shot rung) mid-process. */
export function __resetDaemonForTest(): void {
  if (daemon) killDaemon(daemon, "test reset");
}
