/**
 * Compact editor — caps the prompt input box height.
 *
 * The pi editor grows with the message, so a long prompt (or a paste) pushes
 * the transcript off screen and leaves no room to type. This extension wraps
 * the stock `CustomEditor` and clamps its rendered height, keeping the head and
 * the tail of the buffer with a dropped-line notice in between.
 *
 * Behaviour is unchanged otherwise: every key is forwarded to the base editor,
 * so application shortcuts, history, and IME positioning still work.
 *
 * Set `PI_COMPACT_EDITOR_LINES` to change the cap (default 10).
 */

import { CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { clampEditorLines, MAX_EDITOR_LINES } from "./clamp.ts";

function resolveMaxLines(): number {
  const raw = process.env.PI_COMPACT_EDITOR_LINES;
  if (!raw) return MAX_EDITOR_LINES;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : MAX_EDITOR_LINES;
}

class CompactEditor extends CustomEditor {
  render(width: number): string[] {
    return clampEditorLines(super.render(width), resolveMaxLines());
  }
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    ctx.ui.setEditorComponent((tui, theme, keybindings) => new CompactEditor(tui, theme, keybindings));
  });
}
