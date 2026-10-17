
import inspector from "node:inspector";
import { spawn } from "node:child_process";
const ROOT = process.argv[2], REAL_BIN = process.argv[3];
process.env.NODE_OPTIONS = "";
// Watchdog: after 6s without completion, dump handle state.
const t0 = Date.now();
setInterval(() => {
  const r = process.getActiveResourcesInfo();
  process.stderr.write("[wd] " + (Date.now() - t0) + "ms resources=" + JSON.stringify(r) + "\n");
}, 1000).unref();
await import("/Users/nur/.pi/agent/tests/.child.tmp.mjs");
