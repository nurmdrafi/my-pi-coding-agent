# S4 — Fail-Closed Security Tests: Design Spec

Status: **spec'd** (implementation plan → `2026-10-15-s4-failclosed-plan.md`)
Created: 2026-10-15
Parent: `docs/specs/MASTER.md` §3 (S4). Feedback basis: MASTER §1.2 P1 (fail-closed verification), §1.4B (policy/correctness separation), §1.6 items 1+6.
Decisions locked with user: hybrid execution model (unit fixtures for classification breadth + live-shell canary suite for fail-closed proof — Q1=C); holes found are **fixed and** fixture-encoded (Q2=both); cheapest architecture — everything folds into existing infra, no new files beyond fixture lines, no new npm scripts, no CI wiring (Q3=A).

## 1. Problem

MASTER §1.2 P1: "A security gate must not silently allow an operation because it cannot classify it." Today that property is unverified. The existing 2630-line `tests/permission-gate.test.mjs` and the `gate:eval` fixture files cover the gate's intended rules, but not adversarial behavior: no test provokes a handler exception (an uncaught throw in a rule or in `ctx.ui.confirm` rejects the handler — the harness then proceeds, i.e. fail-open), no test covers `ui.confirm` returning a non-boolean, `env rm`-style transparent prefixes and pipe-to-shell evade classification, persistence redirects (`> ~/.bashrc`, `tee -a ~/.ssh/authorized_keys`) are not blocked, and the `write`/`edit` tools have **zero path policy** (a symlink inside cwd lets a write land on any protected target without a confirm). TOCTOU-shaped behavior (fresh stat at decision time, verbatim approve-window key) is designed but not locked in by tests.

## 2. Scope

**In scope:** adversarial fixtures in `tests/fixtures/bash-{allow,block}.txt`; new test sections in `tests/permission-gate.test.mjs` (failure-path, TOCTOU, symlink/spill, live-shell canary suite); the §6 fix set inside `extensions/permission-gate/`.

**Out of scope (non-goals):**
- Edit content validation — stale-read/anchor/multi-match correctness is S5.
- Arbitrary-interpreter escapes (`perl -e`, `node -e`, `python -c`, awk `system()`, homoglyphs, `eval` of encoded payloads) — encoded as `?` known-bug fixtures, no fix (the gate's documented tripwire philosophy: AGENTS.md discipline and the user's eyes are the boundary).
- Fuzz/property-based generation; CI wiring (no new entrypoint exists to wire; local gate, S3 precedent).
- Approve-window *time expiry* (`APPROVED_WINDOW_MS` wall-clock const, not cheaply fakeable) — documented, untested.

## 3. Approach (of three considered)

**Chosen — fold into existing infra.** Adversarial classification cases land as fixture lines in `bash-block/allow.txt` (auto-counted by `gate:eval`, `?` known-bug convention reused); behavioral families (failure-path, TOCTOU, symlink, canaries) land as new sections in `tests/permission-gate.test.mjs`, reusing `tests/lib/gate-stub.mjs` (`freshGate`, `runBash` with `{hasUI:false}` for headless). Cheapest: zero new files, one strict exit path, measurement and enforcement stay where they already live.

Rejected: new `tests/gate-adversarial.test.mjs` + `npm run gate:security` (cleaner separation, more surface than needed). Rejected: standalone fuzz harness (YAGNI; a curated evasion set covers the feedback's families).

## 4. Repository layout

```
extensions/permission-gate/destructive.ts   # TRANSPARENT_PREFIX strip, command-word variable rule,
                                            # pipe-to-shell + persistence redirect/tee patterns,
                                            # exported PROTECTED_PREFIX_RE (single source, shared with index.ts)
extensions/permission-gate/index.ts         # fail-closed handler wrap, ui.confirm === true,
                                            # malformed-input guard, write/edit realpath protected-prefix confirm
tests/permission-gate.test.mjs              # + §5.2–5.5 sections (same cases-array + exit pattern)
tests/fixtures/bash-block.txt, bash-allow.txt  # + S4 families, section-marked `# S4 (2026-10-15)`
CHANGELOG.md, docs/specs/MASTER.md          # registration (§3 row on spec commit; §7 line on completion)
```

## 5. Test families

### 5.1 Classification fixtures (bash-block / bash-allow)

- **Transparent prefixes** (block): `env rm canary`, `command rm canary`, `exec rm canary`, `nohup rm canary`, `timeout 5 rm canary`, `nice rm canary` — today all evade `CMD_POS_SRC` anchoring.
- **Env assignment prefixes** (block, lock-in of existing `stripEnvPrefix`): `TARGET=canary rm -f $TARGET`, `GIT_TERMINAL_PROMPT=0 git reset --hard`.
- **Command-word variables** (block): segment starting with `$VAR`/`${VAR}` as the command — unclassifiable → confirm, not silent allow.
- **Wrapping** (block, lock-in of `SHELL_WRAPPED`): `bash -c 'rm -rf canary'`, `sh -c "$(echo rm -rf canary)"`, `$(rm -rf canary)`.
- **Pipe-to-shell** (block): `echo 'rm -rf canary' | sh`, `printf 'rm canary' | bash`, `… | base64 -d | sh` (curl|sh already covered by SIDE_EFFECT — lock-in).
- **Redirects** (block): existing `/etc` etc. lock-ins plus persistence targets `> ~/.bashrc`, `>> ~/.ssh/authorized_keys`, `echo x | tee -a ~/.profile`, `tee ~/.ssh/authorized_keys`.
- **Allow-side guards** (allow): `echo rm -rf /`, `grep rm file`, `man rm`, `cat > tmp/out.log`, `npm run build`. Quoted prose containing "then rm" is an **accepted false-positive lock-in** (block fixture with comment) — the documented tolerance, not an allow case.

### 5.2 Failure-path (stub-level, strict tests)

Every `pi.on` handler body wrapped: unexpected exception in a `tool_call` handler → `blockCall` with a generic internal reason (fail-closed); in a `tool_result` handler → pass-through + `console.error` (nothing left to prevent post-execution; corruption of the result path is the worse evil). `ui.confirm` strict `=== true` (a truthy non-boolean must not approve). Locked-in existing fail-closed behavior: `hasUI` with no `ui`/no `confirm` → block; headless destructive → block; confirm hang → `PGATE_CONFIRM_TIMEOUT_MS=50` → block; confirm throw → caught by the wrap → block. Malformed input (missing/non-string command, missing path) → explicit block reason, never an uncaught throw.

### 5.3 Live-shell canary suite (in the same test file)

Sandbox = `mkdtemp` + fake `HOME` (canaries: `~/.ssh/authorized_keys`, `~/.bashrc`, a work file) + `PGATE_MEMORY` inside it, `process.chdir(sandbox)`. Commands run through the gate headless (`{hasUI:false}`); **only gate-approved commands execute** (`spawnSync('/bin/bash', ['-c', cmd])`, 10 s timeout). After each execution the canaries must be byte-identical — a wrongly-approved destructive command destroys a canary and fails the test. A runner-side **hard net**, independent of the gate, refuses to execute anything touching real system paths (`/etc /usr /var /boot /root /bin /sbin /lib`), `sudo`/`su`, network binaries (`curl wget ssh scp`), or `git push` — a gate evasion caught by the net fails the test *without executing*, so a gate bug can never damage the machine during testing. Self-tests: a benign approved command executes and produces its expected output (proves the runner); a guaranteed-block command never executes (proves the block path); the net regex itself is unit-asserted.

### 5.4 TOCTOU (stub-level, deterministic)

Decisions must re-read state at decision time: R1 re-read exemption re-stats (touch the file between reads → re-read allowed); R10 mutation between identical runs → re-run allowed; approve-window keyed verbatim (`rm a` approved → `rm b` still confirms). These lock in existing design; any red is a bug to fix under the §6 policy.

### 5.5 Symlink / spill

Destructive-through-symlink (`ln -s canary link && rm link`) → blocked (lock-in). Write/edit symlink escape: symlink inside cwd pointing at `~/.ssh/` → write tool call must hit the destructive confirm (fix §6.8). Spill filename traversal: hostile `toolCallId` (`../../evil`) → spill lands inside `pgate-spill` with sanitized name (regression for the existing sanitizer).

## 6. Fix set (each red → green, regression fixture included)

1. Handler fail-closed wrap (§5.2).
2. `ui.confirm === true` (§5.2).
3. Malformed-input guards (§5.2).
4. `TRANSPARENT_PREFIX` strip in `normalizeSegment` (`env`, `command`, `exec`, `nohup`, `timeout N`, `nice [-n N]`), same env/git-flag loop.
5. Command-word variable rule: segment whose command word is `$VAR`/`${VAR}` → destructive-confirm.
6. Pipe-to-shell (`| sh|bash|zsh|dash|ksh`) into `DESTRUCTIVE_CORE_SRC`.
7. Persistence redirect/tee targets (rc files, `~/.ssh/`, `~/.config/systemd/`, `~/.gnupg/`) into the destructive redirect alternative.
8. Write/edit realpath check against exported `PROTECTED_PREFIX_RE` → H2 confirm flow (chat approval / UI dialog / fail closed headless).

Known-bug `?` fixtures, no fix (§2): interpreter escapes, homoglyphs, `eval "$(base64 …)"`, alias indirection.

## 7. Output / exit behavior

No new entrypoints. `node tests/permission-gate.test.mjs` gains the sections; existing pattern (cases + `failed` counter + `process.exit(failed === 0 ? 0 : 1)`) unchanged — one strict gate. `npm run gate:eval` picks up the new fixture lines automatically (`fixture_total` grows; `?`-marked evasions count as `known_bug_fail`, never `new_fail`).

## 8. Policy trade-offs

Fixes 5–7 knowingly add confirm prompts for shapes that are sometimes legitimate (`"$NODE" script`, `cat deploy.sh | sh`). That is the intended trade: fail-closed asks; it does not silently allow. False-block cost stays visible through `gate:eval`'s `fp_rate`/`tokens_per_task` replay metrics.

## 9. Risks / notes

- Pipe-to-shell and tee patterns can false-positive in scripts → each lands with an allow-side guard fixture; replay (`tests/replay.mjs`) re-run at the end to confirm no `fp_rate` regression beyond documented blocks.
- `PROTECTED_PREFIX_RE` must stay the single source for bash-redirect and write/edit realpath checks → exported from `destructive.ts`, imported by `index.ts`.
- Sandbox isolation relies on fake `HOME` + tmpdir; commands are executed only after passing both gate and hard net. `PATH` stays the ambient one (canary asserts cover effect, not isolation).
- The canary suite executes real shell commands → 10 s timeout per command, suite stays under ~5 s with the curated set.

## 10. Acceptance criteria

1. All S4 fixtures counted by `gate:eval`; `new_fail: 0`; evasions from the known-bug set appear only as `known_bug_fail`.
2. `node tests/permission-gate.test.mjs` exit 0 with all new sections; sabotage smoke (temporarily revert one §6 fix) → exit 1.
3. Fixes 1–8 implemented with red→green fixtures; canaries byte-identical after the full run; hard net unit-asserted.
4. Zero new files, zero new dependencies; changes confined to `extensions/permission-gate/`, `tests/permission-gate.test.mjs`, `tests/fixtures/`, `CHANGELOG.md`, MASTER registration.
