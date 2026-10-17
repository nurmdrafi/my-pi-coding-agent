// Prove the refcount bug: after a request settles, `maybeUnrefStreams` unrefs
// the daemon's stdin/stdout. The NEXT request re-refs them — but only after
// awaiting. If the loop has nothing else referenced in between, Node exits.
import { writeFileSync, chmodSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [ROOT, REAL_BIN] = process.argv.slice(2);
const m = await import(join(ROOT, "extensions/piread/index.ts"));
const pi = { tools: new Map(), registerTool: (d) => pi.tools.set(d.name, d), on: () => () => {} };
process.env.PI_NATIVE_READ = "1"; m.default(pi);
const t = pi.tools.get("piread"); const reset = m.__resetDaemonForTest;
const dir = mkdtempSync(join(tmpdir(), "rc-"));
const file = join(dir, "f.txt");
writeFileSync(file, "L0\nL1\nL2\nL3\n");
const WRAP = join(dir, "wrap");
writeFileSync(WRAP, '#!/bin/sh\ncase "$1" in\n  --serve) exit 1 ;;\nesac\nexec "' + REAL_BIN + '" "$@"\n');
chmodSync(WRAP, 0o755);
const ctx = { cwd: dir };
const log = (...a) => process.stderr.write(a.join(" ") + "\n");

// NO watchdog timer anywhere: exactly the parity child's shape.
async function call(bin, tag) {
  reset();
  process.env.PI_READ_BIN = bin;
  log(`[${tag}] start`);
  const v = await t.execute("x", { path: file }, undefined, undefined, ctx);
  log(`[${tag}] done via=${v.details?.via}`);
}

await call(REAL_BIN, "1 daemon");
await call(WRAP, "2 oneshot");
await call(join(dir, "no-such"), "3 builtin");
log("ALL DONE");
