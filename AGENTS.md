# Global Pi Instructions

## Behavioral Core
- Think before coding. State assumptions. If unclear, ask once then move.
- Surgical changes only. Match existing style. Do not refactor unrelated code.
- Goal-driven: define the failing case, make it pass, verify with the minimal relevant check.
- Plan/design requests = plan only. Ambiguous “continue / proceed / go ahead” → ask scope before implementing.
- Unknown contracts (API paths, payloads, fields) → ask. Never invent placeholders.
- Solve with the least that works: Is it needed at all? (YAGNI) → existing code → stdlib/platform → installed dep → minimal change. Bug fix = root cause; rg callers first. No unrequested abstractions or “for later” boilerplate.

## Communication
- Be concise and direct. Technical prose only.
- No fluff, no cheerful filler, no emojis in commits, comments, or replies.

## Token Economy
- Search only with `rg` (-l / -n / -q). Never `grep` a file path. Filtering command output through a pipe is fine — cap verbose output (`cmd | tail -40`, `npm view x | head -30`) before it lands in context.
- View files only with `read` (offset for >100 lines: just the region around the `rg` hit). Never `cat` / `head` / `tail` whole file paths; inside pipes they are fine. Windowed `sed -n 'A,Bp'` is acceptable when batching several windows/files in one call (`read` is one file per call).
- Unfamiliar code: symbol outline first, never whole-file reads:
  `rg -n "^(export )?(async )?(function|class|interface|type)" <dir> | head -80`
- `sg` (ast-grep) is installed. For structural code search in TS/TSX/JS, run `sg run -p '<pattern>'` FIRST; fall back to `rg -n` only when sg returns nothing or the target is non-code. Keyword rg over code files without a prior sg attempt is a miss. Framework entry points (`export default` components, `forwardRef`, `layout.tsx`/`_app.tsx` conventions): wide keywords (`main`/`setup`/`initialize`) miss convention-named entries and hit doc/test noise.
- Keyword search returning >10 files of doc/test/config noise: switch to `sg` structural patterns, not narrower keywords. Cap output (`| head`) — `sg` matches return whole AST nodes, not lines.
- Never full-read a file >100 lines to find one block; `read` a window at the anchor (the `sg` match text often is the answer).
- `git` reads: `diff` / `show` / `log --oneline | head`.
- Batch independent commands into one call (`a && b`); each round-trip re-sends and re-processes the whole conversation.
- One call per question: pick the command that fully answers it (continuation `read`s of the same file are fine); no speculative preview commands (`git status`, `--stat`).
- Never re-run a command whose result is already in context — reuse it.
- Never read task-unrelated files. Never `ls -R`, `find -exec`, full `git log`.

## Safety
- Ask before: commit, push, install packages, or any destructive command (rm, git reset, force-push, etc.).

## Cadence
- Plan → do → verify (only the touched test/build) → repeat. Prefer the 80% solution that ships.
- Narrowest relevant check: targeted test for behavior, typecheck for types, lint for lint-sensitive changes, build only when integration/config/production compile is affected.
- Never claim a change works without running its verification; if it can't run, say why.