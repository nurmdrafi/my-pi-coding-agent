// After the daemon's stdin is written, does the daemon process still exist and
// is it still the same pid the extension holds?
import { writeFileSync, chmodSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const [ROOT, REAL_BIN] = process.argv.slice(2);
const m = await import(join(ROOT, "extensions/piread/index.ts"));
const pi = { tools: new Map(), registerTool: (d) => pi.tools.set(d.name, d), on: () => () => {} };
process.env.PI_NATIVE_READ = "1"; m.default(pi);
const t = pi.tools.get("piread"); const reset = m.__resetDaemonForTest;
const dir = mkdtempSync(join(tmpdir(), "prob-"));
mkdirSync(join(dir, "a-directory"));
writeFileSync(join(dir, "mid30"), Array.from({ length: 30 }, (_, i) => "L" + i).join("\n"));
writeFileSync(join(dir, "nul-text"), "ab\u0000cd\u0000ef\n");
writeFileSync(join(dir, "crlf"), "one\r\ntwo\r\nthree\r\n");
const WRAP = join(dir, "wrap");
writeFileSync(WRAP, '#!/bin/sh\ncase "$1" in\n  --serve) exit 1 ;;\nesac\nexec "' + REAL_BIN + '" "$@"\n');
chmodSync(WRAP, 0o755);
const ctx = { cwd: dir };
const log = (...a) => process.stderr.write(a.join(" ") + "\n");

const psAll = () => new Promise((res) => {
  const p = spawn("ps", ["-eo", "pid=,ppid=,stat=,command="], { stdio: ["ignore", "pipe", "ignore"] });
  let o = ""; p.stdout.on("data", (d) => (o += d));
  p.on("exit", () => res(o.split("\n").filter((l) => l.includes("piread --serve"))));
});

async function one(bin, p, tag) {
  reset();
  process.env.PI_READ_BIN = bin;
  const before = await psAll();
  const r = await Promise.race([
    t.execute("x", p, undefined, undefined, ctx).then((v) => ({ ok: true, via: v.details?.via }), (e) => ({ ok: false, m: String(e.message).slice(0, 40) })),
    new Promise((res) => setTimeout(() => res({ ok: "STALL" }), 4000)),
  ]);
  const after = await psAll();
  log(`${tag}: ${JSON.stringify(r)}`);
  log(`   daemons before=${before.length} after=${after.length}`);
  if (r.ok === "STALL") {
    log("   AFTER LIST:"); after.forEach((l) => log("     " + l.trim()));
    process.exit(9);
  }
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
for (const [label, p] of inputs) {
  for (const [tag, bin] of [["daemon", REAL_BIN], ["oneshot", WRAP], ["builtin", join(dir, "no-such-bin")]]) {
    await one(bin, p, label + "/" + tag);
  }
}
process.exit(0);
