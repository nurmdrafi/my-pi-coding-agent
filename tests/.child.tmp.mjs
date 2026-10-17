
import { writeFileSync, chmodSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const [ROOT, REAL_BIN] = process.argv.slice(2);
const m = await import(join(ROOT, "extensions/piread/index.ts"));
const pi = { tools: new Map(), registerTool: (d) => pi.tools.set(d.name, d), on: () => () => {} };
process.env.PI_NATIVE_READ = "1"; m.default(pi);
const t = pi.tools.get("piread"); const reset = m.__resetDaemonForTest;
const dir = mkdtempSync(join(tmpdir(), "cr-"));
mkdirSync(join(dir, "a-directory"));
writeFileSync(join(dir, "mid30"), Array.from({ length: 30 }, (_, i) => "L" + i).join("\n"));
writeFileSync(join(dir, "nul-text"), "ab\u0000cd\u0000ef\n");
writeFileSync(join(dir, "crlf"), "one\r\ntwo\r\nthree\r\n");
const WRAP = join(dir, "wrap");
writeFileSync(WRAP, "#!/bin/sh\ncase \"$1\" in\n  --serve) exit 1 ;;\nesac\nexec \"" + REAL_BIN + "\" \"$@\"\n");
chmodSync(WRAP, 0o755);
const MISSING = join(dir, "no-such-bin");
const ctx = { cwd: dir };
async function arm(p) {
  try {
    const v = await t.execute("x", p, undefined, undefined, ctx);
    return { rej: false, text: (v.content ?? []).map((c) => c.text ?? "").join(""), via: v.details?.via, fr: v.details?.fallbackReason };
  } catch (e) {
    return { rej: true, text: "REJECT: " + String(e.message), via: undefined, fr: undefined };
  }
}
async function withBin(bin, p) {
  reset(); process.env.PI_READ_BIN = bin;
  const tag = bin === REAL_BIN ? "daemon" : bin === WRAP ? "oneshot" : "builtin";
  process.stderr.write("[child] arm " + tag + " path=" + p.path.split("/").pop() + "\n");
  const r = await arm(p);
  process.stderr.write("[child] done " + tag + "\n");
  return r;
}
const inputs = [
  ["plain", { path: join(dir, "mid30") }],
  ["offset/limit", { path: join(dir, "mid30"), offset: 5, limit: 4 }],
  ["crlf", { path: join(dir, "crlf") }],
  ["missing", { path: join(dir, "nope") }],
  ["directory", { path: join(dir, "a-directory") }],
  ["binary", { path: join(dir, "nul-text") }],
  ["offset beyond EOF", { path: join(dir, "mid30"), offset: 10000 }],
];
const out = [];
process.stderr.write("[child] start, " + inputs.length + " inputs\n");
for (const [label, p] of inputs) {
  process.stderr.write("[child] === " + label + "\n");
  const d = await withBin(REAL_BIN, p);
  const o = await withBin(WRAP, p);
  const b = await withBin(MISSING, p);
  out.push({ label, d, o, b });
}
console.log(JSON.stringify(out));
