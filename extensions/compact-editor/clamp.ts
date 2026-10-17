/**
 * Compact editor: clamp the prompt editor's rendered height.
 *
 * The pi input box grows with the message. Pasting or writing a long prompt
 * pushes the transcript off screen and leaves almost no room to type. This
 * module holds the pure line-clamping logic so it can be tested without a TUI.
 */

/** Default maximum number of rendered editor lines, borders included. */
export const MAX_EDITOR_LINES = 10;

/**
 * Clamp `lines` to at most `maxLines` entries.
 *
 * Keeps the head of the buffer and the tail (where the cursor usually is) and
 * collapses the dropped middle into a single notice line, so the count stays
 * honest and the total never exceeds `maxLines`.
 *
 * @param lines rendered editor lines, borders included
 * @param maxLines maximum number of lines to return
 * @returns the clamped lines, never longer than `maxLines`
 */
export function clampEditorLines(lines: string[], maxLines: number): string[] {
  if (!Array.isArray(lines) || lines.length === 0) return lines ?? [];
  const cap = Math.max(1, Math.floor(maxLines));
  if (lines.length <= cap) return lines;

  // One line is spent on the notice, so there is no room to advertise the
  // drop: keep the tail, which is what the reader is typing at.
  if (cap === 1) return [lines[lines.length - 1]!];

  const visible = cap - 1;
  // Favour the tail slightly: the cursor and the newest text live there.
  const headCount = Math.ceil(visible / 2);
  const tailCount = visible - headCount;
  const dropped = lines.length - visible;

  return [
    ...lines.slice(0, headCount),
    `[... ${dropped} more lines ...]`,
    ...lines.slice(lines.length - tailCount),
  ];
}
