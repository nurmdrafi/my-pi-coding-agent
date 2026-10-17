// Portability/robustness: each native daemon must run in its OWN process
// group. Today `--serve` inherits the client's group, so any group-wide
// signal — pibash's kill_tree on timeout, a job-control kill, a CI timeout —
// takes the daemon down with the client and the next request has to rebuild
// the connection. This is the "daemon connection issue": the daemon is not
// insulated from the client's process group.
import { spawn } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dir = mkdtempSync(join(tmpdir(), "daemon-pgid-"));
const file = join(dir, "f.txt");
writeFileSync(file, "one\ntwo\n");
chmodSync(file, 0o644);

const pgidOf = (pid) =>
  new Promise((res) => {
    const p = spawn("ps", ["-o", "pgid=", "-p", String(pid)], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("exit", () => res(out.trim()));
  });

const myPgid = await pgidOf(process.pid);

let failures = 0;
const check = (name, cond, detail) => {
  if (cond) console.log(`PASS  ${name}`);
  else { failures++; console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`); }
};

for (const tool of ["piread", "piedit", "pibash"]) {
  const bin = join(ROOT, "bin", tool);
  const proc = spawn(bin, ["--serve"], { stdio: ["pipe", "pipe", "ignore"] });
  proc.stdin.on("error", () => {});
  await new Promise((r) => setTimeout(r, 250));
  const pgid = await pgidOf(proc.pid);
  check(
    `${tool} --serve runs in its own process group (pgid ${pgid} != client ${myPgid})`,
    pgid !== "" && pgid !== myPgid,
    "daemon shares the client's process group: a group-wide kill takes the daemon down with it",
  );
  proc.stdin.end();
  proc.kill();
}

rmSync(dir, { recursive: true, force: true });
process.exit(failures === 0 ? 0 : 1);
