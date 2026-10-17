// Isolate: after a "missing path" call (which falls through all three rungs
// and REJECTS), the next call with the wrapper must settle.
import { writeFileSync, chmodSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [ROOT, REAL_BIN] = process.argv.slice(2);
const m = await import(join(ROOT, "extensions/piread/index.ts"));
const pi = { tools: new Map(), registerTool: (d) => pi.tools.set(d.name, d), on: () => () => {} };
process.env.PI_NATIVE_READ = "1"; m.default(pi);
const t = pi.tools.get("piread"); const reset = m.__resetDaemonForTest;
const dir = mkdtempSync(join(tmpdir(), "iso2-"));
mkdirSync(join(dir, "a-directory"));
writeFileSync(join(dir, "mid30"), Array.from({ length: 30 }, (_, i) => "L" + i).join("\n"));
const WRAP = join(dir, "wrap");
writeFileSync(WRAP, '#!/bin/sh\ncase "$1" in\n  --serve) exit 1 ;;\nesac\nexec "' + REAL_BIN + '" "$@"\n');
chmodSync(WRAP, 0o755);
const ctx = { cwd: dir };
const log = (...a) => process.stderr.write(a.join(" ") + "\n");

async function withBin(bin, p, tag) {
  reset();
  process.env.PI_READ_BIN = bin;
  const r = await Promise.race([
    t.execute("x", p, undefined, undefined, ctx).then(
      (v) => ({ ok: true, via: v.details?.via }),
      (e) => ({ ok: false, msg: String(e.message).slice(0, 60) }),
    ),
    new Promise((res) => setTimeout(() => res({ ok: "STALL" }), 4000)),
  ]);
  log(`${tag}: ${JSON.stringify(r)}`);
  return r;
}

await withBin(REAL_BIN, { path: join(dir, "mid30") }, "1 daemon/plain");
await withBin(WRAP, { path: join(dir, "mid30") }, "2 oneshot/plain");
await withBin(join(dir, "no-such"), { path: join(dir, "mid30") }, "3 builtin/plain");
await withBin(REAL_BIN, { path: join(dir, "nope") }, "4 daemon/missing");
await withBin(WRAP, { path: join(dir, "nope") }, "5 oneshot/missing");
await withBin(join(dir, "no-such"), { path: join(dir, "nope") }, "6 builtin/missing");
await withBin(REAL_BIN, { path: join(dir, "mid30") }, "7 daemon/plain again");
process.exit(0);
