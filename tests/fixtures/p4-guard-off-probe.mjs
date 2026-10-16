// P4 probe: load the permission gate with the codemode parse guard disabled
// (env override) and assert a non-parsing script is NOT blocked. Runs in a
// subprocess because rule switches are baked at module import.
//
// argv[2] = repo root (so the extension import resolves).
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const root = process.argv[2];
const gate = await import(
  pathToFileURL(join(root, "extensions/permission-gate/index.ts")).href
);

const handlers = {};
const pi = {
  on(event, handler) {
    (handlers[event] ??= []).push(handler);
  },
  async invoke(event, payload) {
    for (const h of handlers[event] ?? []) {
      const r = await h(payload, {});
      if (r) return r;
    }
    return undefined;
  },
};
gate.default(pi);

// a deliberately non-parsing script (unterminated template literal)
const code = "const x = `abc; return x;";
const r = await pi.invoke("tool_call", {
  type: "tool_call",
  toolName: "codemode",
  toolCallId: "p4-probe",
  input: { code },
});

if (r) {
  process.stderr.write("guard still blocked with the rule off\n");
  process.exit(1);
}
process.exit(0);
