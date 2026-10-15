# S4 — Implementation Plan

Spec: `2026-10-15-s4-failclosed-design.md`. Cadence: TDD per step (red → implement → green); `node tests/permission-gate.test.mjs` after each step; `npm run gate:eval` delta check after fixture steps; full suite + sabotage smoke at the end only.

## Step 0 — Baseline

Run `node tests/permission-gate.test.mjs` (must be green) and `npm run gate:eval`; record `fixture_total`, `fixture_pass`, `known_bug_fail`, `new_fail`, `fp_rate` for the end-of-work delta report.

## Step 1 — Failure-path family (red → green)

Tests first: `hasUI` + no `ui`/no `confirm` → block; confirm throw → block; confirm hang with `PGATE_CONFIRM_TIMEOUT_MS=50` → block; confirm resolves `"yes"` (non-boolean) → block; confirm resolves `undefined` → block; headless destructive → block; malformed inputs (missing command, non-string path) → block reason, no uncaught throw. Implement: fail-closed wrap around every `pi.on` handler body (tool_call → generic internal block reason; tool_result → pass-through + `console.error`), `ui.confirm === true` strictness, malformed-input guards. Commit: `fix(gate): fail-closed handler wrap and confirm strictness`.

## Step 2 — Transparent prefixes (red → green)

Fixtures: `env|command|exec|nohup|timeout 5|nice rm canary` → Destructive (all currently pass = red); lock-ins `TARGET=canary rm -f $TARGET`, `GIT_TERMINAL_PROMPT=0 git reset --hard` (already green). Implement: `TRANSPARENT_PREFIX` strip loop in `normalizeSegment`. Run `gate:eval` — block family green, no new allow-fail. Commit: `fix(gate): strip transparent command prefixes in destructive classification`.

## Step 3 — Variable command word, pipe-to-shell, persistence redirects (red → green)

Fixtures: `$R canary` / `${R} canary` segments, `echo 'rm -rf canary' | sh`, `printf 'rm canary' | bash`, `… | base64 -d | sh`; `> ~/.bashrc`, `>> ~/.ssh/authorized_keys`, `echo x | tee -a ~/.profile`, `tee ~/.ssh/authorized_keys`; allow-guards `echo rm -rf /`, `grep rm file`, `man rm`, `cat > tmp/out.log`, `npm run build`; quoted-prose "then rm" as an accepted-false-positive block lock-in (comment-marked). Implement: command-word `$VAR` rule, pipe-to-shell alternative and persistence redirect/tee targets in `DESTRUCTIVE_CORE_SRC`. `gate:eval` delta: blocks green, allow-guards green. Commit: `fix(gate): block variable command words, pipe-to-shell, persistence redirects`.

## Step 4 — Write/edit protected-path confirm (red → green)

Test: sandbox symlink `ln -s <fake-home>/.ssh link`; write/edit tool call to `link/authorized_keys` → today passes silently (red) → must hit the H2 confirm flow (headless → block reason). Implement: export `PROTECTED_PREFIX_RE` from `destructive.ts` (rc files, `~/.ssh/`, `~/.config/systemd/`, `~/.gnupg/`, `/etc/`, `/usr/`, `/var/`, `/boot/`, `/root/`); in `index.ts`, `realpath` the write/edit path and run the same approval ladder when it matches. Commit: `fix(gate): confirm write/edit into symlink-resolved protected paths`.

## Step 5 — TOCTOU + symlink/spill lock-ins (mostly green)

Tests: R1 re-read after touch → allowed; R10 re-run after intervening mutation → allowed; `rm a` approved then `rm b` → still confirms; `ln -s canary link && rm link` → blocked; hostile `toolCallId` → spill sanitized inside `pgate-spill`. Any red is a bug → fix under the same policy. Commit: `test(gate): lock in TOCTOU, symlink, and spill-traversal behavior`.

## Step 6 — Live-shell canary suite

Sandbox builder (mkdtemp, fake HOME with `~/.ssh/authorized_keys` + `~/.bashrc` + work file canaries, `PGATE_MEMORY` inside, `chdir`); hard-net regex (system dirs, `sudo`/`su`, network binaries, `git push`) unit-asserted; self-tests (benign approved command executes + produces output; guaranteed-block never executes); then the family: every Step 2–4 destructive shape runs headless — blocked ones never execute, canaries byte-identical throughout. Commit: `test(gate): live-shell canary suite with hard-net guard`.

## Step 7 — Known-bug fixtures

`?`-marked evasion lines (interpreter escapes `perl -e`/`node -e`/`python -c`/awk `system()`, homoglyph command, `eval "$(base64 …)"`, alias indirection) with a header comment naming them the documented tripwire boundary. `gate:eval` must count them `known_bug_fail`, `new_fail: 0`. Commit: `test(gate): encode interpreter-escape evasions as known-bug fixtures`.

## Step 8 — Final verification + registration

Full `node tests/permission-gate.test.mjs`; `gate:eval` delta report vs Step 0 (fixture growth, `new_fail: 0`, `fp_rate` — replay may show new intended blocks; verify each delta family is a §6 fix, not collateral); sabotage smoke: revert fix 6 in a dirty worktree → canary/fixtures red → restore → green. CHANGELOG entry; MASTER §3 Status → `done` + §7 outcome line. Commit: `docs(specs): mark s4 done in master`.
