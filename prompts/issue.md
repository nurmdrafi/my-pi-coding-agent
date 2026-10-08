---
description: Fetch GitHub issue N, validate and propose in context, implement on approval — no state files, no branch, no changelog
argument-hint: "<issue-number>"
---

**Fetch once**: `gh issue view $1 --json number,title,body,labels,state,comments` — rg the output, don't page through. The issue and its state live in this conversation — never write them to any file.

**Validate.** Repro command / expected / observed; run the repro. Stale/dupe: rg CHANGELOG.md, recent commits, issue body/labels. Verdict `valid | invalid | dupe of #X | needs-info`, one line why. Not valid → report, stop.

**Root-cause work runs on the systematic-debugging skill** — read `~/.pi/agent/skills/systematic-debugging/SKILL.md` and follow its phases before analyzing cause or proposing any fix.

**Propose** (same reply): root cause (rg callers first), approach, files, risks (security impact + blast radius on existing business logic), `Deps:`, test plan. Approach feels risky or touches business-logic behavior → say so explicitly, present alternatives, let the human pick. **HARD STOP** — the human verifies: continue or skip. Skip → done.

**Continue → implement on the current branch** (never create one): repro first, root-cause fix, minimal change, narrowest relevant verification. Report changes + verification.

**Close on request** — `gh issue close $1 -c "<concise comment: what was wrong, what changed, verification>"`. Never close unprompted.

**Rules:** no code edits before continue; never push; never write issue state to files; DO NOT break existing business logic — if the fix risks changing behavior or anything seems risky, stop and discuss with the human.

---

**One GitHub issue per session** — never batch issues (context bloat).

**Flow:** /issue N exactly as written: fetch once → validate (RUN the repro; stale/dupe → report, stop) → propose root cause + files + risks → HARD STOP for my approval → implement → run tests → report → STOP. I do manual testing. After MY go-ahead only I do: changelog, commit+push, close issue. Never commit, push, or close on your own.

**Delegation** (subagent tool ONLY — never run tmux commands yourself; if spawning fails or tmux is missing, stop and ask me to run the command):
- Small/clear fix (≤2 files, no behavior change beyond the bug): implement yourself.
- Fix touches business logic (auth, roles, routing, exported API) or you're unsure: implement yourself, then spawn ONE gh-issue-verifier (task: read issue #N, confirm fix present in checkout, verdict + file:line) and include its verdict in your report.
- Large/unfamiliar area or >2 files: spawn scout (recon: root-cause candidates + file:line + blast radius) → propose from its summary → after my approval spawn worker (full brief: repro, root cause, files, approach, test plan; minimal change, no commits) → verify yourself → gh-issue-verifier verdict.

**Risk:** at the propose step, if the fix changes existing behavior or touches business logic, say so explicitly, list blast radius + one alternative, and let me pick. When in doubt, stop and ask.

**Hard rule:** after your final report, STOP completely. A follow-up message from me that is not an explicit "close issue #N" request must never trigger `gh issue close` — close/commit/push happen only when I say those exact words.
