# Agent Feedback & Guardrails

**Intended audience:** AI coding agent.  
**Purpose:** This file summarizes reviewer feedback and community-reported failure modes for AI coding agents. Read it before acting. The mechanical permission gate in `Pasted text.txt` enforces several rules; this file covers the rest and explains how to cooperate with the gate instead of fighting it.

---

## 1. What the mechanical gate already enforces

Do not try to bypass these. If blocked, fix the root cause using the corrective text provided.

- **Edit anchor validation (Anchor Guard):** `oldText` must exist exactly or via fuzzy normalization, be unique, and not overlap other edits in the same call. If blocked, use the snippet and line numbers provided to rebuild the anchor.
- **Read economy (R1):** Do not re-read a window fully covered by this session’s in-context spans. Use `offset`/`limit` to read only new regions.
- **Bash reading economy (R2):** Do not use standalone `cat` or `sed -n` for file viewing. Use the `read` tool. `sed -n` is allowed only when batching 2+ regions. `cat` is fine inside a pipeline.
- **Output caps:**
  - `git log` must be capped (`--oneline | head` or `-n N`).
  - `rg -o` must be capped (`| head -N` or `| cut -c1-200`).
  - Recursive walks (`ls -R`, `find -exec`) are blocked. Use `rg --files` or `rg -l`.
  - `git commit`/`git push` hooks must be capped (`2>&1 | tail -20`) unless `--no-verify`.
  - Verbose runners (`npm test`, `vitest`, `tsc`, etc.) must have a filter pipe.
- **Commitlint (R9):** `git commit -m` messages must match conventional commits (`type(scope?): subject`). Header ≤ 100 chars, subject not capitalized, no trailing period.
- **Identical re-run guard (R10):** Do not re-run the same base command within 10 minutes if no successful edit/write occurred. Watchers and retries of failed runs are exempt.
- **Coverage resets:** In-context coverage is cleared on `session_compact`, failed edits/writes, and external file changes detected by `mtime`+`size`. After a compact or resume, assume nothing is in context.

---

## 2. Community-reported common mistakes

These are the most frequent, costly, and frustrating behaviors reported by developers using AI coding agents.

### 2.1 Cognitive and behavioral pitfalls

- **Acting without verification:** Making confident assertions or fixes based on training data instead of checking current code, docs, or tests.
- **Thrashing / death loops:** Repeatedly modifying, testing, failing, and reverting without understanding the root cause. Applying band-aid fixes around an unfound bug.
- **Ignoring explicit instructions:** Skipping “search first” or “rewrite from scratch” directives, especially under pressure to act quickly.
- **Planning amnesia:** Forgetting earlier plans or decisions in long sessions.
- **Over-asking / under-acting:** Requesting user direction at every step when instructions are clear, or doing out-of-scope work beyond the prompt.
- **No in-session learning:** Acknowledging a correction, then repeating the same underlying mistake in a new context.
- **No cross-session memory:** Re-reading plans, re-implementing committed code, and re-discovering issues from previous sessions. Users become the continuity layer.

### 2.2 Token and context economy failures

- **Redundant reads:** Re-reading files or re-running searches already in the conversation history. Reports show **80–99% of tokens** can be spent on re-reading already-processed files.
- **Context pollution:** Reading a large file when only a few lines are relevant, pushing useful context out of the window.
- **Output explosion:** Running verbose commands (`npm test`, build tools, git hooks) without filtering, flooding context with tens of thousands of tokens of noise.
- **Uncapped extraction:** `rg -o` over large/minified files emitting whole-file-sized output.

### 2.3 Code quality and safety issues

- **Inconsistent code:** Different names for the same concept across files (`phone` vs `phone_number`), type mismatches, subtle race conditions.
- **Band-aid fixes:** `setTimeout`, casting to `any`, silencing errors instead of solving them.
- **Test subversion:** Hard-coding validation results, mocking hallucinated services, or changing tests to make broken code pass.
- **Destructive actions:** Unintended deletions or rewrites. Community reports include an agent deleting **48,000 files** and another removing **28,745 lines of code** during a small task.
- **Unnecessary file rewrites:** Regenerating an entire file for a small change, making review impossible.
- **Ignoring review feedback:** Repeating the same incorrect suggestions on every review round even after the author explains why they don’t apply.

### 2.4 Workflow and outcome issues

- **Wasted cycles from rejected PRs:** A large-scale study found **46.41%** of agent-proposed fixes were rejected due to incorrect implementations, failing CI, or lack of meaningful reviewer engagement.
- **False verification:** Claiming tests pass without running them, or running them in a way that doesn’t actually validate the change.
- **Scope creep:** Performing database migrations, dependency upgrades, or refactors when only asked to write a model or fix a bug.

---

## 3. Reviewer feedback on the current extension

The `Pasted text.txt` extension is strong for high-cost, objective failures. It directly addresses redundant reads, edit anchor failures, output flooding, and commit hygiene.

**Gaps and limitations to be aware of:**

- **No hydration on session resume:** The coverage map starts empty. After resume, you may re-read content that was in the previous session. The failure mode errs toward allowing, but you should still avoid unnecessary re-reads.
- **Fuzzy anchors don’t certify spans:** If an edit uses fuzzy matching, no line span is recorded. A subsequent read may be allowed even if the content is already in context. Do not exploit this.
- **R10 can be bypassed by varying the command:** Do not slightly change a command just to defeat the re-run guard. If you need fresh output, explain why.
- **Commitlint only checks quoted `-m` messages:** Unquoted messages may not be validated. Always use conventional commit format voluntarily.
- **No enforcement for test quality or destructive commands:** The gate does not stop you from deleting files, rewriting large sections, or faking test results. You must self-enforce.
- **No cross-session memory:** The extension cannot remember previous sessions. You must summarize state and avoid redoing work.
- **CWD sensitivity:** `normPath` resolves relative to current working directory. If the working directory changes, coverage may not match. Be explicit with paths when possible.

**How to cooperate with the gate:**

- When blocked, read the corrective message carefully. It usually contains the exact lines or rule you violated.
- Prefer fixing the anchor, capping the output, or using a new window over retrying the same call.
- If you believe a block is a false positive, explain why in your next action rather than trying to trick the regex.

---

## 4. Self-check before acting

Run this checklist mentally before every tool call:

1. **Have I read the relevant region, or am I guessing?** If guessing, read first with a narrow window.
2. **Will this command flood context?** If yes, add a cap (`| head`, `| tail`, `| rg`, `| sort -u`).
3. **Am I re-running the same command?** Has anything changed since the last run? If not, don’t re-run.
4. **Is my edit anchor exact and unique?** Will it overlap another edit?
5. **Will this change break tests?** Did I actually run them, or am I assuming?
6. **Am I about to do something destructive?** Stop and confirm with the user unless explicitly authorized.
7. **After a compact or resume, have I lost context?** Re-establish minimal state before acting.
8. **Am I following the user’s explicit instructions, or going beyond scope?**
9. **Am I repeating a mistake I was already corrected on?** If so, stop and change approach.
10. **Is my commit message conventional?** `type(scope): subject`, lowercase subject, no trailing period.

---

## 5. Recommended agent behavior

- **Use the `read` tool** for file viewing. Do not use `cat` or standalone `sed -n`.
- **Cap all outputs** that could be large. Prefer `rg` with `| head`, `| sort -u`, or `| cut`.
- **Use `rg --files` and `rg -l`** instead of recursive `ls` or `find`.
- **Use `git log --oneline -n N`** or pipe through `head`.
- **Write conventional commits** even if the linter doesn’t catch it.
- **After an edit, trust the certified spans.** Do not re-read the edited region unless you need a different window or the file changed externally.
- **After a compact or resume, assume no context.** Re-read only what you need, narrowly.
- **Verify with tests, but never subvert them.** Do not hard-code results, mock hallucinated services, or alter tests to pass.
- **Avoid destructive commands** without explicit user confirmation. Prefer reversible operations.
- **Keep context clean:** summarize, don’t dump. If you must show output, filter it first.
- **If blocked by the gate, fix the cause.** Do not vary a command just to bypass R10, and do not rephrase an anchor to trick fuzzy matching.
- **When corrected, generalize the lesson.** Apply the principle to future actions, not just the immediate case.

---

## 6. Quick reference: mistake → gate → self-enforcement

| Mistake | Mechanical gate? | What you must do |
|---|---|---|
| Re-reading covered lines | R1 blocks if stat matches | Use `offset`/`limit` for new regions |
| Standalone `cat`/`sed -n` viewing | R2 blocks | Use `read` tool; batch `sed -n` for 2+ regions |
| Uncapped `git log` | R5 blocks | `--oneline | head` or `-n N` |
| Uncapped `rg -o` | R6 blocks | Pipe to `head` or `cut` |
| Recursive walks | R7 blocks | `rg --files`, `rg -l` |
| Uncapped git hooks | R8 blocks | `2>&1 | tail -20` or `--no-verify` |
| Bad commit message | R9 blocks | Conventional commits |
| Identical re-run | R10 blocks | Wait, vary command, or edit first |
| Test subversion | No gate | Never fake verification |
| Destructive actions | No gate | Stop and confirm |
| Cross-session amnesia | No gate | Summarize state; avoid redoing work |
| Ignoring instructions | No gate | Re-read the prompt before acting |

---

## Personal feedback — resolved 2026-10-06
- DO NOT invoke the same skill multiple times in one session — after the first load its context already exists. → **Enforced mechanically:** R1 coverage certifies a full SKILL.md read as 1–EOF, so same-session re-reads are blocked (fixture-tested in `tests/permission-gate.test.mjs`); post-compact re-reads stay allowed because the content left context. Audit of all logged sessions found zero same-session skill re-reads since the 2026-10-05 coverage model.
- Messages from permission-gate were too large. → **Fixed by measurement, not opinion:** a recovery audit (`tests/block-recovery-audit.mjs`) over logged sessions found 90%+ one-shot recovery after a block — the corrective pointer does the work, not the prose. All block reasons are now capped ≈200 chars (Anchor Guard keeps a trimmed ≤8-line snippet on anchor-miss). Re-run the audit after any gate change; it exits 1 below 85% recovery.
- The LLM repeats the same gate mistakes every session. → **Experiment, honestly framed:** violation memory (`extensions/permission-gate.ts`) persists per-family block counts to `~/.pi/agent/logs/violation-memory.json` (`PGATE_MEMORY` override; delete to reset) and, once a family reaches 5 all-time blocks, injects a one-line lesson into the next session's system prompt (top 3, once per session, ~45 tok). Prompt rules alone never prevented first attempts — the judge is the `tests/block-recovery-audit.mjs` blocks/1k-calls trend, not the mechanism's existence.

**Final reminder:** The gate is a safety net, not a substitute for judgment. When in doubt, choose the smallest, most verifiable action that advances the task without polluting context or risking destructive changes.