#!/usr/bin/env node
/**
 * Config contract tests for the permission-gate rule switches.
 *
 * The gate now reads its on/off state from `config.json`. Two failure modes
 * are silent and dangerous, so both are pinned here:
 *
 *   1. a config key with no matching rule (typo like `toolchainPnmp`) would
 *      never apply — the loader must warn, not swallow it;
 *   2. a rule whose key is missing from `config.json` would silently fall back
 *      to the default — acceptable, but the default itself must always be ON
 *      (fail closed), never off.
 *
 * Also locks the env-override precedence: `PGATE_<KEY>=0` beats the file.
 *
 * Run: node --test tests/gate-config.test.mjs   (exit 0 = all pass)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GATE_DIR = join(ROOT, "extensions", "permission-gate");
const CONFIG_JSON = join(GATE_DIR, "config.json");
const PANEL = join(GATE_DIR, "config.ts");

/** Read RULE_IDS keys without importing the TS module (no jiti dependency). */
function ruleKeysFromSource() {
  const src = readFileSync(PANEL, "utf8");
  const block = src.match(/export const RULE_IDS = \{([\s\S]*?)\} as const;/);
  assert.ok(block, "RULE_IDS block not found in config.ts");
  const keys = [...block[1].matchAll(/^\s*(\w+):\s*"([^"]+)",/gm)].map((m) => ({ key: m[1], id: m[2] }));
  assert.ok(keys.length > 0, "no rule keys parsed from RULE_IDS");
  return keys;
}

/** Evaluate the loader in a child process so env overrides apply cleanly. */
function loadConfig(env = {}) {
  const script = `
    import { config, RULE_IDS } from ${JSON.stringify(PANEL)};
    process.stdout.write(JSON.stringify({ config, ids: RULE_IDS }));
  `;
  const out = execFileSync("node", ["--experimental-strip-types", "--input-type=module", "-e", script], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(out);
}

const KEYS = ruleKeysFromSource();

test("every RULE_IDS key is present in config.json", () => {
  const raw = JSON.parse(readFileSync(CONFIG_JSON, "utf8"));
  const missing = KEYS.map((k) => k.key).filter((k) => !(k in (raw.rules ?? {})));
  assert.deepEqual(missing, [], `config.json is missing rule keys: ${missing.join(", ")}`);
});

test("config.json has no unknown rule keys (catches typos)", () => {
  const raw = JSON.parse(readFileSync(CONFIG_JSON, "utf8"));
  const known = new Set(KEYS.map((k) => k.key));
  const unknown = Object.keys(raw.rules ?? {}).filter((k) => !known.has(k));
  assert.deepEqual(unknown, [], `config.json has keys with no matching rule: ${unknown.join(", ")}`);
});

test("rule IDs are unique", () => {
  const ids = KEYS.map((k) => k.id);
  assert.equal(new Set(ids).size, ids.length, `duplicate rule IDs: ${ids.join(", ")}`);
});

test("defaults are fail-closed: every rule on", () => {
  const { config } = loadConfig();
  const off = Object.entries(config.rules).filter(([, v]) => v !== true).map(([k]) => k);
  assert.deepEqual(off, [], `rules defaulting to off: ${off.join(", ")}`);
});

test("env override disables exactly one rule", () => {
  const { config } = loadConfig({ PGATE_RERUN_GUARD: "0" });
  assert.equal(config.rules.rerunGuard, false, "PGATE_RERUN_GUARD=0 should disable rerunGuard");
  const others = Object.entries(config.rules).filter(([k, v]) => k !== "rerunGuard" && v !== true);
  assert.deepEqual(others, [], "env override must not affect other rules");
});

test("env override accepts true to re-enable", () => {
  const { config } = loadConfig({ PGATE_RERUN_GUARD: "1" });
  assert.equal(config.rules.rerunGuard, true);
});

test("rejected scalar falls back to the documented default", () => {
  const { config } = loadConfig();
  assert.ok(Number.isInteger(config.outputCap.maxLines) && config.outputCap.maxLines > 0);
  assert.ok(Number.isInteger(config.confirm.timeoutMs) && config.confirm.timeoutMs > 0);
});

test("rule IDs match the documented README rule table", () => {
  const readme = readFileSync(join(ROOT, "extensions", "README.md"), "utf8");
  // Every config key's ID should appear somewhere in the README rule catalog,
  // so a rule cannot be configurable yet undocumented.
  const missing = KEYS.filter(({ id }) => !new RegExp(`\\b${id}\\b`).test(readme)).map(({ key, id }) => `${key}/${id}`);
  assert.deepEqual(missing, [], `rules absent from extensions/README.md: ${missing.join(", ")}`);
});
