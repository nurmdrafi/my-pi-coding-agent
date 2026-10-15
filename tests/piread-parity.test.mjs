#!/usr/bin/env node
/**
 * Parity oracle suite for the piread extension (S6 Step 3, spec §5.3).
 *
 * The built-in read tool (createReadTool) is the oracle: for a deterministic
 * fixture corpus and an offset/limit matrix, the piread-shadowed `read` tool
 * and the oracle must produce identical results — content arrays, details,
 * structuredContent — or identical rejection messages.
 *
 * Also locks in: env-off = zero registration; env-on = exactly one `read`
 * tool whose schema/description is byte-equal to createReadToolDefinition's
 * (prompt-cache + name-shadow stability); fail-open fallback (missing binary,
 * error envelope, garbage stdout) equals the oracle plus one stderr line.
 *
 * Preflight: symlink the global pi package into the gitignored root
 * node_modules (same trick as tests/permission-gate.test.mjs).
 *
 * Run: node tests/piread-parity.test.mjs   (exit 0 = all pass)
 */
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync, chmodSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkgLink = join(ROOT, "node_modules", "@earendil-works", "pi-coding-agent");
if (!existsSync(join(pkgLink, "package.json"))) {
  rmSync(pkgLink, { recursive: true, force: true });
  const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
  mkdirSync(dirname(pkgLink), { recursive: true });
  symlinkSync(join(globalRoot, "@earendil-works", "pi-coding-agent"), pkgLink, "dir");
}

const { createReadTool, createReadToolDefinition } = await import(
  join(ROOT, "node_modules", "@earendil-works", "pi-coding-agent", "dist", "index.js")
);
const piread = (await import("../extensions/piread/index.ts")).default;

const BIN = join(ROOT, "bin", "piread");

// ---- stubbed ExtensionAPI capturing registered tools ----

function makePi() {
  const tools = new Map();
  return {
    tools,
    registerTool: (def) => tools.set(def.name, def),
    on: () => () => {},
  };
}

function loadExtension(envValue) {
  const before = process.env.PI_NATIVE_READ;
  if (envValue === undefined) delete process.env.PI_NATIVE_READ;
  else process.env.PI_NATIVE_READ = envValue;
  try {
    const pi = makePi();
    piread(pi);
    return pi;
  } finally {
    if (before === undefined) delete process.env.PI_NATIVE_READ;
    else process.env.PI_NATIVE_READ = before;
  }
}

// ---- oracle + wrapped tool ----

const oracle = createReadTool(process.cwd());
const sdkDefinition = createReadToolDefinition(process.cwd());
const activePi = loadExtension("1");
if (activePi.tools.size !== 1 || !activePi.tools.has("read")) {
  console.error("FATAL  env-on extension must register exactly one tool named 'read'");
  process.exit(1);
}
const wrapped = activePi.tools.get("read");

// ---- deterministic corpus (spec §5.3) ----

const dir = mkdtempSync(join(tmpdir(), "piread-parity-"));
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const JPG_1X1 = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//9k=",
  "base64",
);

const textFixtures = [
  ["empty", ""],
  ["one-line", "solo\n"],
  ["crlf", "one\r\ntwo\r\nthree\r\n"],
  ["no-eol", "alpha\nbeta\ngamma"],
  ["unicode", "héllo\n🎉emoji\n日本語のテキスト\n"],
  ["long-lines", Array.from({ length: 20 }, (_, i) => `${String(i).padStart(3, "0")}:${"x".repeat(296)}`).join("\n") + "\n"],
  ["t2500", Array.from({ length: 2500 }, (_, i) => `line${String(i).padStart(4, "0")}`).join("\n") + "\n"],
  ["b600", Array.from({ length: 600 }, () => "x".repeat(100)).join("\n")],
  ["big1st", "y".repeat(60000) + "\nsmall\n"],
  ["bad-utf8", Buffer.from([0x61, 0xff, 0x62, 0x0a, 0x63, 0xfe, 0x0a])],
  ["nul-text", "ab\0cd\0ef\n"],
  ["mid30", Array.from({ length: 30 }, (_, i) => `L${i}`).join("\n")],
];

for (const [name, body] of textFixtures) {
  writeFileSync(join(dir, name), body);
}
writeFileSync(join(dir, "img.png"), PNG_1X1);
writeFileSync(join(dir, "img.jpg"), JPG_1X1);
mkdirSync(join(dir, "a-directory"));
const missingPath = join(dir, "does-not-exist");

// ---- comparison helpers ----

let seq = 0;
async function armResult(tool, params, ctx) {
  try {
    return { rejected: false, value: await tool.execute(`t${++seq}`, params, undefined, undefined, ctx) };
  } catch (e) {
    return { rejected: true, error: String(e?.message ?? e) };
  }
}

async function parityCase(params, ctx) {
  const a = await armResult(wrapped, params, ctx);
  const b = await armResult(oracle, params, ctx);
  try {
    assert.deepStrictEqual(a, b);
    return { ok: true };
  } catch (e) {
    const norm = (s) => s.replaceAll(dir, "<dir>").slice(0, 300);
    return { ok: false, diff: `${norm(e.message)}\n  piread: ${JSON.stringify(a).slice(0, 260)}\n  oracle: ${JSON.stringify(b).slice(0, 260)}` };
  }
}

function captureStderr(fn) {
  const chunks = [];
  const orig = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk) => {
    chunks.push(String(chunk));
    return true;
  };
  return { run: async () => fn(), done: () => { process.stderr.write = orig; return chunks; } };
}

// ---- cases ----

const cases = [];
const add = (name, fn) => cases.push([name, fn]);

// env gating + shadow lock-in (R2)
add("env gate: unset registers nothing", () => {
  assert.equal(loadExtension(undefined).tools.size, 0);
  assert.equal(loadExtension("0").tools.size, 0);
});
add("env gate: PI_NATIVE_READ=1 registers exactly one shadowing 'read'", () => {
  const pi = loadExtension("1");
  assert.equal(pi.tools.size, 1);
  assert.ok(pi.tools.has("read"), "registered tool must be named 'read'");
});
add("shadow lock-in: definition fields byte-equal to createReadToolDefinition", () => {
  assert.equal(wrapped.name, sdkDefinition.name);
  assert.equal(wrapped.label, sdkDefinition.label);
  assert.equal(wrapped.description, sdkDefinition.description);
  assert.equal(wrapped.promptSnippet, sdkDefinition.promptSnippet);
  assert.deepStrictEqual(wrapped.promptGuidelines, sdkDefinition.promptGuidelines);
  assert.deepStrictEqual(wrapped.parameters, sdkDefinition.parameters);
  assert.deepStrictEqual(wrapped.outputSchema, sdkDefinition.outputSchema);
  assert.deepStrictEqual(wrapped.constrainedSampling, sdkDefinition.constrainedSampling);
});

// corpus × offset/limit matrix (pathological params delegate → trivially equal)
const variants = [
  {}, { offset: 1 }, { offset: 2, limit: 3 }, { offset: 5, limit: 2 },
  { offset: 29, limit: 5 }, { offset: 2001 }, { offset: 999999 },
  { limit: 1 }, { offset: 1, limit: 0 }, { offset: 0 }, { offset: 2.5, limit: 1 },
];
for (const [name] of textFixtures) {
  for (const v of variants) {
    add(`parity: ${name} ${JSON.stringify(v)}`, () => parityCase({ path: join(dir, name), ...v }));
  }
}

// images (delegated to the built-in instance on both arms)
add("parity: png image delegates to built-in", () => parityCase({ path: join(dir, "img.png") }));
add("parity: jpg image delegates to built-in", () => parityCase({ path: join(dir, "img.jpg") }));

// errors
add("parity: missing file rejects identically", () => parityCase({ path: missingPath }));
add("parity: missing file with offset rejects identically", () => parityCase({ path: missingPath, offset: 3 }));
add("parity: directory rejects identically", () => parityCase({ path: join(dir, "a-directory") }));

// relative path resolves against ctx.cwd on both arms
add("parity: relative path via ctx.cwd", () => {
  const ctx = { cwd: dir };
  return parityCase({ path: "mid30", offset: 10, limit: 5 }, ctx);
});

// fallback: fail-open to the oracle plus one stderr line
add("fallback: missing binary → oracle result + one stderr line", async () => {
  const bak = `${BIN}.parity-bak`;
  renameSync(BIN, bak);
  try {
    const cap = captureStderr(() => parityCase({ path: join(dir, "no-eol") }));
    const r = await cap.run();
    const lines = cap.done();
    if (!r.ok) return r;
    const fb = lines.filter((l) => l.startsWith("piread: fallback"));
    assert.equal(fb.length, 1, `expected exactly one fallback line, got: ${JSON.stringify(lines)}`);
  } finally {
    renameSync(bak, BIN);
  }
});
add("fallback: error envelope (exit 3) → oracle rejection + stderr line", async () => {
  const cap = captureStderr(() => parityCase({ path: missingPath }));
  const r = await cap.run();
  const lines = cap.done();
  if (!r.ok) return r;
  assert.ok(lines.some((l) => l.startsWith("piread: fallback (exit 3)")), JSON.stringify(lines));
});
add("fallback: garbage stdout → oracle result + stderr line", async () => {
  const bak = `${BIN}.parity-bak`;
  renameSync(BIN, bak);
  writeFileSync(BIN, "#!/bin/sh\necho 'not-json at all'\n");
  chmodSync(BIN, 0o755);
  try {
    const cap = captureStderr(() => parityCase({ path: join(dir, "no-eol") }));
    const r = await cap.run();
    const lines = cap.done();
    if (!r.ok) return r;
    assert.ok(lines.some((l) => l.startsWith("piread: fallback (unparseable stdout)")), JSON.stringify(lines));
  } finally {
    unlinkSync(BIN);
    renameSync(bak, BIN);
  }
});

// ---- gate compatibility (Step 4): real permission-gate through stubbed events ----
// The gate intercepts by tool NAME (read/edit) and event type — it must stay
// agnostic to who executes. Lock-ins: R1 coverage certification from a
// piread-wrapped result, S5 M2 region-read requirement satisfied by piread
// output, and a protected-path (node_modules) read blocked at tool_call
// before any execution.

const { freshGate } = await import("./lib/gate-stub.mjs");
const GATE_CTX = { hasUI: true, mode: "tui", ui: { confirm: async () => true } };

let gateSeq = 0;
/** tool_call → wrapped execute → tool_result, feeding the wrapped result's
 * content/details to the gate exactly as the harness would. */
async function gateReadFlow(pi, tool, path, offset, limit) {
  const toolCallId = `g${++gateSeq}`;
  const input = offset === undefined ? { path } : { path, offset, limit };
  const block = await pi.invoke("tool_call", { type: "tool_call", toolName: "read", toolCallId, input }, GATE_CTX);
  if (block) return { blocked: true, reason: block.reason };
  const result = await tool.execute(toolCallId, input);
  await pi.invoke("tool_result", { type: "tool_result", toolName: "read", toolCallId, input, content: result.content, isError: false, details: result.details }, GATE_CTX);
  return { blocked: false };
}
async function gateReadProbe(pi, path, offset, limit) {
  const input = offset === undefined ? { path } : { path, offset, limit };
  const block = await pi.invoke("tool_call", { type: "tool_call", toolName: "read", toolCallId: `g${++gateSeq}`, input }, GATE_CTX);
  return block ? { blocked: true, reason: block.reason } : { blocked: false };
}
async function gateEditProbe(pi, path, edits) {
  const block = await pi.invoke("tool_call", { type: "tool_call", toolName: "edit", toolCallId: `g${++gateSeq}`, input: { path, edits } }, GATE_CTX);
  return block ? { blocked: true, reason: block.reason } : { blocked: false };
}

add("gate R1: piread-wrapped read result certifies coverage (dup read blocked)", async () => {
  const pi = freshGate();
  const path = join(dir, "mid30");
  const first = await gateReadFlow(pi, wrapped, path, 10, 5);
  assert.ok(!first.blocked, first.reason ?? "first read must not block");
  const dup = await gateReadProbe(pi, path, 12, 2); // sub-window of certified lines 10–14
  assert.ok(dup.blocked, "re-read of a piread-certified window must block");
  assert.match(dup.reason, /^Token Economy \(Re-read\)/, `reason was: ${dup.reason}`);
});
add("gate S5 M2: edit-after-piread-read passes region requirement", async () => {
  const path = join(dir, "mid30");
  // negative control: the same edit with no prior read must block (proves the
  // gate is armed — the pass below is not vacuous)
  const control = freshGate();
  const unread = await gateEditProbe(control, path, [{ oldText: "L11", newText: "L11-edited" }]);
  assert.ok(unread.blocked, "negative control: unread edit must block");
  assert.match(unread.reason, /^Anchor Guard \(Unread\)/, `reason was: ${unread.reason}`);
  const pi = freshGate();
  const first = await gateReadFlow(pi, wrapped, path, 10, 5);
  assert.ok(!first.blocked, first.reason ?? "read must not block");
  const edit = await gateEditProbe(pi, path, [{ oldText: "L11", newText: "L11-edited" }]);
  assert.ok(!edit.blocked, edit.reason ?? "edit within the piread-certified region must pass");
});
add("gate: protected-path read (node_modules) blocks at tool_call before execution", async () => {
  const nmDir = join(dir, "node_modules", "left-pad");
  mkdirSync(nmDir, { recursive: true });
  const nmPath = join(nmDir, "index.js");
  writeFileSync(nmPath, "module.exports = 42;\n");
  const pi = freshGate();
  const shadowPi = loadExtension("1");
  const tool = shadowPi.tools.get("read");
  let executions = 0;
  const orig = tool.execute;
  tool.execute = (...a) => { executions++; return orig(...a); };
  const block = await pi.invoke("tool_call", { type: "tool_call", toolName: "read", toolCallId: "g-nm", input: { path: nmPath } }, GATE_CTX);
  assert.ok(block, "node_modules read must block at tool_call");
  assert.match(block.reason, /^Search \(node_modules\)/, `reason was: ${block.reason}`);
  assert.equal(executions, 0, "blocked read must never reach execute");
});

// ---- runner ----

let failed = 0;
for (const [name, fn] of cases) {
  let r;
  try {
    r = await fn();
  } catch (e) {
    r = { ok: false, diff: String(e?.message ?? e).slice(0, 400) };
  }
  const bad = r && r.ok === false;
  if (bad) failed++;
  console.log(`${bad ? "FAIL" : "PASS"}  ${name}`);
  if (bad) console.log(`      ${r.diff.replaceAll("\n", "\n      ")}`);
}

console.log(failed === 0 ? `\n${cases.length}/${cases.length} PASS` : `\n${failed}/${cases.length} FAILED`);
rmSync(dir, { recursive: true, force: true });
process.exit(failed === 0 ? 0 : 1);
