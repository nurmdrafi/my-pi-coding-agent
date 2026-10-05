# Global Pi Instructions

## Behavioral Core
- Think before coding. State assumptions. Do not assume: if anything is unclear or a named target/reference is not found, **ask and wait for the answer** — never substitute a closest match or proceed on a guess. Ask once, then act on the reply.
- Surgical changes only. Match existing style. Do not refactor unrelated code.
- Goal-driven: define the failing case, make it pass, verify with the minimal relevant check.
- Plan/design requests = plan only. Ambiguous “continue / proceed / go ahead” → ask scope before implementing.
- Unknown contracts (API paths, payloads, fields) → ask. Never invent placeholders.
- Security is build-time, not review-time: mutating routes/actions carry auth/permission checks when first written, secrets stay server-side, and guard/effect fixes re-check the adjacent paths they silenced or unblocked.
- Solve with the least that works. **Ponytail ladder** (always active; default full, `/ponytail lite|full|ultra`): stop at the first rung that holds — need it at all? (YAGNI) → already in this codebase? → stdlib? → native platform feature? → installed dep? → one line? → only then minimal code. Ladder runs after understanding the problem, never instead of it. Bug fix = root cause; rg callers first. No unrequested abstractions or “for later” boilerplate. Deletion over addition; mark deliberate corner-cuts with a `ponytail:` comment naming the ceiling.
- Cross-platform (macOS + Linux): everything written or run — commands, scripts, configs, paths — must work on both. Stay in the BSD∩GNU intersection; where they genuinely differ, branch explicitly rather than pick a side.
- No absolute user paths in anything written (`/home/...`, `/Users/...` — breaks on every other machine): use `~`/`$HOME` or relative paths; a script needing its repo root derives it from its own location (`$(dirname "$0")`, `import.meta.url`), never a hardcoded path.

## Communication
- Be concise and direct. Technical prose only.
- No fluff, no cheerful filler, no emojis in commits, comments, or replies.

## Token Economy

**Searching**
- Text presence, configs/JSON/CSS/MD, dist/node_modules → `rg` (-l / -n / -q). Every printing `rg` gets a cap (`-m <n>`, `| head -N`, `-l`/`-q`/`-c`); `jq` for JSON fields.
- Construct shape in first-party TS/TSX/JS (call sites, JSX): `ast-grep run -p 'foo($$$)'` — patterns must be complete valid code; bodyless fragments (`function $F($$$)`) silently match nothing — use `function $F($$$) { $$$ }` (typed returns need `: $RET`) (install: `npm i -g @ast-grep/cli`; never the `sg` alias — Linux shadow-utils). `rg` stays correct for keywords/minified and is the better definitions route (symbol outline below). Cap either.
- Unfamiliar code: symbol outline first — `rg -n "^(export )?(async )?(function|class|interface|type)" <dir> | head -80`.

**Reading**
- `read` only, windowed (`offset`/`limit`) at the anchor; lines read/edited this session are already in context — re-read only uncovered regions.
- Minified/dist: prefer `rg -o` / `| cut -c1-200` — `head -N` bounds lines, not bytes.
- Never full-read >100 lines to find one block.

**Editing**
- `oldText` anchors: bytes actually seen in a read this session — never inferred past a read-window edge; widen the read instead.
- Never read task-unrelated files.

**Command output**
- Cap verbose output before it lands in context (`| tail -40`; `head -c 4000` for long lines); never re-run a command whose result is already in context.
- `npm install` → `--no-fund --no-audit | tail -5`. `git` reads: cap `diff`/`show` (`head -c 4000`, never tens-of-KB caps).
- Commands work on macOS and Linux: stick to BSD∩GNU flags (`head -c`, `tail -N`, `sed -n 'A,Bp'`); no `sed -i` (macOS needs `-i ''` — prefer the `edit` tool), no `stat -c/-f`, no `grep -P`.

**Enforced by permission-gate** (extension blocks the call, reason carries the fix): `cat`/`sed -n` viewing, re-reads fully covered by earlier reads/edits/writes this session (resets on compaction), `oldText` anchor validity, `rg -o`/`git log` caps, recursive walks, runner output caps, `git commit`/`push` tails, commit-message format.

**Turns** (each round-trip re-sends and re-processes the whole prefix)
- Batch independent commands (`a && b`) **and independent tool calls into one turn** — most calling turns were measured single-call.
- One call per question; no speculative previews (`git status`, `--stat`). At ~80% identified, batch search-then-act instead of spending a turn to confirm.
- Past ~150K context at a milestone, suggest a fresh session to the user.
- Hard stop at ~200 assistant turns in one session: propose a fresh session (compaction or handoff summary). Long sessions are the top cost-tail driver.
- Never paste a skill's full body into a prompt/message — skills load on demand via their description only. Injected bodies ride every subsequent turn's context (~2.6× first-turn prefix vs baseline).

## Safety
- Ask before: commit, push, install packages, or any destructive command (rm, git reset, force-push, etc.).

## Cadence
- Plan → do → verify (only the touched test/build) → repeat. Prefer the 80% solution that ships.
- Narrowest relevant check: targeted test for behavior, typecheck for types, lint for lint-sensitive changes, build only when integration/config/production compile is affected.
- Never claim a change works without running its verification; if it can't run, say why.