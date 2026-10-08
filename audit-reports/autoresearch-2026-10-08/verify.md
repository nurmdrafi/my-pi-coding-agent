# Verification V1–V8 — pi docs + source (global install @earendil-works/pi-coding-agent)

D = /home/nurmdrafi/.nvm/versions/node/v24.21.0/lib/node_modules/@earendil-works/pi-coding-agent

## V1: Can `tool_result` handlers rewrite/truncate content? Return value used?

**Yes — via the handler's RETURN value, not mutation.**

- `D/dist/core/extensions/types.d.ts:1086-1096` — `ToolResultEventResult { content?; details?; structuredContent?; isError?; usage? }`: "Changes a `tool_result` handler makes. Omitted fields stay as they are, except that replacing `content` without returning `structuredContent` drops the structured content… Return it along with `content` to keep it."
- `D/dist/core/extensions/runner.js:904-955` (`emitToolResult`): each handler receives `currentEvent`; if the handler returns `{content: ...}` the runner sets `currentEvent.content = handlerResult.content` (and deletes `structuredContent` unless also returned), marks `modified`, and handlers compose ("`tool_result` handlers compose, with each handler seeing prior changes" — `docs/extensions.md:105`). If no handler modified anything, returns `undefined`; otherwise returns the merged result which becomes what the model sees.
- Event shape: `types.d.ts:961-977` — `ToolResultEvent { type: "tool_result"; toolCallId; parentToolCallId?; input; content: (TextContent|ImageContent)[]; structuredContent?; isError; usage? }`.
- `docs/extensions.md:148`: "`tool_result` handlers that redact `content` should also replace `structuredContent`; replacing only `content` drops it."

**Verdict:** a non-blocking output-cap/truncate mechanism is fully supported — return `{ content: [truncated] }` (plus `structuredContent` if the tool had one). No `block` needed; `tool_result` cannot block, only transform.

## V2: `ctx.ui.confirm`, `ctx.hasUI`, handler ctx fields

- `ctx.ui.confirm(title, message, opts?) → Promise<boolean>` exists — `types.d.ts:72-77` (`ExtensionUIContext`). Usage example at `docs/extensions.md:174`: `if (needsApproval && !(await ctx.ui.confirm("Allow tool call?", event.toolName))) { return { block: true, reason: ... } }` — i.e. confirm is usable directly in `tool_call` handlers.
- `ExtensionContext` (`types.d.ts:213-225`): `ui: ExtensionUIContext`, `mode: ExtensionMode ("tui"|"rpc"|"json"|"print")`, `hasUI: boolean` — "Whether dialog-capable UI is available (true in TUI and RPC modes)"; so **`hasUI` is false in print and json modes**. Plus `cwd`, `sessionManager`, `modelRegistry`, `executeTool`, `tools`, `signal`.
- `docs/extensions.md:251`: "JSON and print modes have no UI. Guard terminal-only behavior with `ctx.mode === "tui"` and use `ctx.hasUI` for interactions supported by interactive and RPC clients."
- `tool_call`/`tool_result` handlers receive this same `ExtensionContext` (runner.js:958 `createContext()` for tool_call; same for tool_result).

**Verdict:** in print mode, guard confirms with `ctx.hasUI` (skip / auto-allow / auto-deny); `confirm` exists and returns a boolean promise.

## V3: edit tool `edits[]` — sequential or against original?

**All matched against the original file content.**

- `D/dist/core/tools/edit-diff.js:215-241` (`applyEditsToNormalizedContent`): each edit's `oldText` is fuzzy-matched against `replacementBaseContent` (the original, possibly normalization-adjusted), uniqueness checked via `countOccurrences(replacementBaseContent, ...)` (occurrences > 1 → error), then all matched edits are overlaid onto the original ("overlays those line-level changes onto the original content" — comment at :212-213).
- Tool description confirms: `edit.js:27` — "Each `edits[].oldText` is matched against the original file, not after earlier edits are applied. Do not emit overlapping or nested edits."

**Verdict:** edits are positionally matched on the ORIGINAL content and applied as one overlay; overlapping/nested edits in one call are invalid and rejected, so sequential-anchor assumptions in the gate's Anchor Guard are unnecessary — but a wrong-anchor edit still fails the whole call atomically.

## V4: timestamps on session entries / toolResult messages

Yes, two layers (`docs/session-format.md:47,58,92`):
- Entry-level `timestamp`: ISO 8601 string on every session entry.
- Message-level `timestamp`: Unix ms integer inside the message — present on toolResult messages too: `{"type":"message",...,"message":{"role":"toolResult","toolCallId":"call_123","toolName":"bash",...,"timestamp":1733234403000}}` (session-format.md:92).

**Verdict:** both available; entry `timestamp` (ISO) is the simplest for gap/latency analysis between a toolCall and its toolResult.

## V5: other gate test harnesses in the pi install

- Only mention of permission-gate in the install: `D/examples/extensions/README.md:9,12,21` — it ships `permission-gate.ts` as an example extension ("Prompts for confirmation before dangerous bash commands"), with no test harness.
- Gate test harnesses exist only in the user tree: `~/.pi/agent/tests/permission-gate.test.mjs` and `~/.pi/agent/tests/block-recovery-audit.mjs` (copies in `/tmp/pgate-research/tests/`). Nothing else in the install.

**Verdict:** confirmed — no competing harness; `tests/permission-gate.test.mjs` + `tests/block-recovery-audit.mjs` are the only gate tests.

## V6: audit/violation-memory paths + labeling taxonomies

Paths:
- Violation memory: `~/.pi/agent/logs/violation-memory.ndjson` (currently 7 lines; `PGATE_MEMORY` env overrides) and a cache `~/.pi/agent/logs/violation-memory.json` — `extensions/permission-gate.ts:502-505,443`.
- Audit reports: `~/.pi/agent/audit-reports/` with subdirs `extensions/`, `harness/`, `sessions/`, `skills/` (mirrored at `/tmp/pgate-research/audit-reports/`).

Taxonomies (from `audit-reports/harness/2026-10-07T110500Z-block-impact-permission-gate.md` header, "Feedbacks.md taxonomy (v1)"):
- Rule families: `R1 Re-read`, `R2 Reading` (cat/sed/head/tail for viewing), `R5 git reads`, `R6 Extraction`, `R7 Searching`, `R8 git hooks`, `R9 Commitlint`, `R10 Re-run`, `edit pre-validation Anchor Guard`, `runner caps Command output`.
- Outcome labels per block: `compliant`, `compliant-goal-lost`, `loop`, `cosmetic`, `abandonment`, `semantic-evasion`; each with a net score (−2…+3) and evidence = the next tool call after the block.

**Verdict:** reuse the Feedbacks.md v1 dual taxonomy (rule family × outcome label) for any programmatic classifier so results stay comparable to the 139-block baseline.

## V7: headless run + per-turn token usage

- Non-interactive: `pi -p "prompt"` / `pi --print "prompt"` — "`-p`, `--print` | Run the supplied prompts, write the final assistant text to stdout, then exit" (`docs/cli.md:45`). Also `--mode json` (JSONL events to stdout, one-shot) and `--mode rpc`; piped stdout alone also forces print mode (`cli.md:30-31`). `--tools read,grep,...` can pin the toolset (`cli.md:114`). Sessions are still logged in print/json modes.
- Token usage: recorded per assistant message — `message.usage: Usage` (`docs/message-types.md:69,133`): `{ input, output, cacheRead, cacheWrite, cacheWrite1h?, reasoning?, totalTokens, cost: {input, output, cacheRead, cacheWrite, ...} }`. ToolResult messages can carry optional `usage` (nested model work only, message-types.md:170,177). Standalone `{"type":"usage"}` entries (e.g. `kind: "cache_warm"`) also appear (session-format.md:118).

**Verdict:** headless benchmarking with fixed prompts is directly supported (`pi -p` or `--mode json`); per-turn cost = `usage` block on each assistant message entry in the session .jsonl.

## V8: is the .jsonl format stable/documented enough for programmatic waste classification?

Yes — `docs/session-format.md` documents every entry type with examples (session version 3). Shapes a classifier must handle:
- `{"type":"session", version:3, id, timestamp, cwd, parentSession?}` (header; :69,75)
- `{"type":"message", id, parentId, timestamp(ISO), message:{role:"system"|"user"|"assistant"|"toolResult", ..., timestamp(ms)}}` (:83-92). Assistant messages carry `content` blocks (`text`, `toolCall` with `id/name/arguments`), `usage`, `stopReason`, `model/provider`. toolResult messages carry `toolCallId`, `toolName`, `content[]`, `isError`, optional `nestedCalls`, optional `usage`.
- `{"type":"model_change"}`, `{"type":"thinking_level_change"}` (:102,110)
- `{"type":"usage", kind, usage}` (:118)
- `{"type":"compaction", summary, firstKeptEntryId, tokensBefore, systemMessage?}` (:128) — rebuild context via `buildContextEntries()`; entries before `firstKeptEntryId` are summarized away (:226-248)
- `{"type":"context_edit", targetId, replacement}` (:144), `{"type":"branch_summary"}` (:154), `{"type":"custom"}`/`{"type":"custom_message"}` (:169,181), `{"type":"label"}` (:194), `{"type":"session_info"}` (:204)

**Verdict:** stable, versioned (v3), and rich enough (toolCall args + toolResult content + isError + timestamps + usage) to classify waste (re-reads, dup searches, re-runs, blocked-then-evasion) programmatically. Follow `firstKeptEntryId`/compaction boundaries so summarized-away turns aren't miscounted.

## Summary table

| # | Question | Answer | Confidence |
|---|---|---|---|
| V1 | tool_result rewrite/truncate; return vs mutation | Yes — return `ToolResultEventResult{content,...}`; handlers compose; mutation alone insufficient (runner applies return values) | High (types.d.ts:1086, runner.js:904-955) |
| V2 | ctx.ui.confirm; hasUI; ctx fields | `ctx.ui.confirm(title,msg)→Promise<boolean>` exists; `ctx.hasUI` true only in TUI/RPC, false in print/json; ctx has `ui, mode, cwd, sessionManager, modelRegistry, executeTool, tools, signal` | High (types.d.ts:72-77,213-225) |
| V3 | edits[] sequential vs original | All matched against original content as one overlay; overlapping edits rejected | High (edit-diff.js:215-241, edit.js:27) |
| V4 | timestamps on entries/toolResult | Entry-level ISO `timestamp` + message-level Unix-ms `timestamp` (both on toolResult) | High (session-format.md:47,92) |
| V5 | other gate harnesses in install | None; only example permission-gate.ts; tests live in ~/.pi/agent/tests | High |
| V6 | audit/memory paths, taxonomy | `~/.pi/agent/logs/violation-memory.{ndjson,json}` (PGATE_MEMORY override), `~/.pi/agent/audit-reports/`; Feedbacks.md v1: rule families R1-R10/AnchorGuard/runner-caps × outcomes compliant/compliant-goal-lost/loop/cosmetic/abandonment/semantic-evasion with net score | High |
| V7 | headless mode + token usage | `pi -p "prompt"` (or `--mode json`); usage block (input/output/cacheRead/cacheWrite/totalTokens/cost) on every assistant message; optional usage on toolResult; standalone `usage` entries | High (cli.md:45, message-types.md:69-84) |
| V8 | jsonl stable/documented for classification | Yes — session v3, all entry types documented; handle message roles, toolCall/toolResult blocks, compaction/firstKeptEntryId, context_edit, usage entries | High (session-format.md) |
