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
  "Token Economy (Piread-first)":
    "Read text files with the piread tool, never the built-in read tool — read is only for images. piread already falls back to the built-in reader on its own.",
  "Token Economy (Pibash-first)":
    "Run shell commands with the pibash tool, never the built-in bash tool — pibash already falls back to the built-in executor on its own.",
  "Permission Gate (Destructive)":
    "Destructive/mutating commands (rm, git reset --hard/clean/checkout --, package installs, sudo) need explicit user approval first — a yes in chat or in the invoking message (incl. /ship, /issue, /update-changelog) counts and suppresses the confirm; otherwise ask in chat and wait.",
  "Anchor Guard":
    "edit oldText is exact bytes from a read this session, unique in the file, non-overlapping with sibling edits.",
  Commitlint:
    "Commit messages are conventional: 'type(scope?): subject', lowercase subject, no trailing dot.",
  "Toolchain (pnpm)":
    "In a pnpm repo use pnpm run/exec/dlx — never npm/npx/yarn against its tree.",
  "Toolchain (Node)":
    "Match the repo's exact Node pin (.nvmrc/engines): prefix node binaries with 'nvm use <pin> &&'.",
  "Search (Scope)":
    "Never run a recursive grep without a path/glob scope — scope it (path, --include) or use rg.",
  "Portability (grep -P)":
    "No grep -P on macOS (BSD grep) — use rg or grep -E.",
  "Search (node_modules)":
    "Don't crawl node_modules without asking the user — pi docs under node_modules/@earendil-works/ are pre-approved.",
};

/** the gate's own synthesized block results carry isError + a family-prefixed text */
const BLOCK_FAMILY_RE =
  /^(Token Economy|Anchor Guard|Commitlint|Permission Gate|Toolchain|Search|Portability)[^:]*/;
export function blockFamilyOf(event: {
  isError?: boolean;
  content?: unknown[];
}): string | undefined {
  if (!event.isError) return undefined;
  const txt = (event.content as { text?: unknown }[] | undefined)?.[0]?.text;
  const m = typeof txt === "string" ? BLOCK_FAMILY_RE.exec(txt) : null;
  return m ? m[0] : undefined;
}
