// Capture a stack when the child stalls: run the real parity child under
// SIGUSR1-driven inspector so we see the actual pending libuv handles.
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const childSrc = `
import inspector from "node:inspector";
import { spawn } from "node:child_process";
const ROOT = process.argv[2], REAL_BIN = process.argv[3];
process.env.NODE_OPTIONS = "";
// Watchdog: after 6s without completion, dump handle state.
const t0 = Date.now();
setInterval(() => {
  const r = process.getActiveResourcesInfo();
  process.stderr.write("[wd] " + (Date.now() - t0) + "ms resources=" + JSON.stringify(r) + "\\n");
}, 1000).unref();
await import(${JSON.stringify(join(ROOT, "tests", ".child.tmp.mjs"))});
`;
writeFileSync(join(ROOT, "tests", ".childwd.tmp.mjs"), childSrc);
console.log("ok");
