// Run the REAL child source from the parity test, but with a per-call log so a
// stall names its own step.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(ROOT, "tests/piread-parity.test.mjs"), "utf8");
const m = src.match(/const CROSS_RUNG_CHILD_SRC = String\.raw`([\s\S]*?)`;/);
if (!m) throw new Error("could not extract the child source");

// Add a log before each withBin arm so a stall identifies the step.
let child = m[1]
  .replace(
    "async function withBin(bin, p) { reset(); process.env.PI_READ_BIN = bin; return arm(p); }",
    `async function withBin(bin, p) {
  reset(); process.env.PI_READ_BIN = bin;
  const tag = bin === REAL_BIN ? "daemon" : bin === WRAP ? "oneshot" : "builtin";
  process.stderr.write("[child] arm " + tag + " path=" + p.path.split("/").pop() + "\\n");
  const r = await arm(p);
  process.stderr.write("[child] done " + tag + "\\n");
  return r;
}`,
  )
  .replace(
    "for (const [label, p] of inputs) {",
    `process.stderr.write("[child] start, " + inputs.length + " inputs\\n");
for (const [label, p] of inputs) {
  process.stderr.write("[child] === " + label + "\\n");`,
  );

const out = join(ROOT, "tests", ".child.tmp.mjs");
writeFileSync(out, child);
console.log("child written:", out);
