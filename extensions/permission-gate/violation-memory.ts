/** Violation memory (VM): blocks correct within a session, but the model is
 * stateless across sessions and re-attempts the same families in every new
 * one. Persisted per-family DISTINCT-SESSION block counts (NDJSON, append-only)
 * pick the lessons injected into the next session's system prompt. */
export const MEMORY_THRESHOLD = 5; // distinct sessions before a lesson enters the prompt
export const FAMILY_LESSONS: Record<string, string> = {
  "Token Economy (Re-run)":
    "Never re-run a command unchanged within 10 min without an edit/write since — its output is already in context.",
  "Token Economy (Re-read)":
    "Never re-read a file window already in context this session — read only new regions (offset/limit).",
  "Permission Gate (Destructive)":
    "Destructive/mutating commands (rm, git reset --hard/clean/checkout --, package installs, sudo) need explicit user approval first — a yes in chat or in the invoking message (incl. /ship, /issue, /update-changelog) counts and suppresses the confirm; otherwise ask in chat and wait.",
  "Anchor Guard":
    "edit oldText is exact bytes from a read this session, unique in the file, non-overlapping with sibling edits.",
  Commitlint:
    "Commit messages are conventional: 'type(scope?): subject', lowercase subject, no trailing dot.",
};

/** the gate's own synthesized block results carry isError + a family-prefixed text */
const BLOCK_FAMILY_RE =
  /^(Token Economy|Anchor Guard|Commitlint|Permission Gate)[^:]*/;
export function blockFamilyOf(event: {
  isError?: boolean;
  content?: unknown[];
}): string | undefined {
  if (!event.isError) return undefined;
  const txt = (event.content as { text?: unknown }[] | undefined)?.[0]?.text;
  const m = typeof txt === "string" ? BLOCK_FAMILY_RE.exec(txt) : null;
  return m ? m[0] : undefined;
}
