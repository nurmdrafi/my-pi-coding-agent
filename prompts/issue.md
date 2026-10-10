---
description: Fetch GitHub issue N, solve solo in one session — follow the issue's suggested fix, implement on approval
argument-hint: "<issue-number>"
---

Priorities: (1) correctly resolve the issue without breaking existing behavior, (2) follow the suggested fix as written.

## 1. Fetch (once, read in full)
`gh issue view $1 --json number,title,body,labels,state,comments`
Also record `git rev-parse HEAD`, `git status --porcelain`, current branch. Warn if the tree is dirty or the branch is main/master.

## 2. Quick check
Stop only if: CLOSED, invalid, duplicate (`gh issue list -S "<key terms>"`), or needs-info (no repro, no anchors, no locatable defect). Report verdict + missing info. Stop.
Otherwise announce: risk flag yes/no — the fix *semantically* touches auth, tokens, roles, routing, exported API, security, or changes existing business-logic or live-data behavior (judge meaning, not keywords; re-check against the actual file list after root cause).

## 3. Investigate
- Drift check on anchors: `git log --oneline <sha>..HEAD -- <files>` empty = no drift; otherwise read the cited symbol in full.

## 4. Propose — HARD STOP
- **Risk flag** (yes/no + one line why)
- **Root cause** (callers checked)
- **Approach** — the issue's suggested fix, applied as written, covering **every acceptance criterion** (skipping any part risks the issue being re-opened). When the suggestion itself offers alternatives, pre-pick the library-standard, least-invasive one and state which you picked and why in one line. Deviation only when technically wrong (breaks behavior or types), with a stated reason and explicit approval.
- **Files** · **Risks** · **Test plan**

Wait for Continue or Skip. Skip → done.

## 5. Implement (on Continue)
Current branch only. Repro first → root-cause fix → implement the suggested approach faithfully and completely — pattern migration the suggestion calls for is wanted, not avoided. No subagents — ever. If a worker or verifier feels needed, say so and let the human decide.

## 6. Report (per acceptance criterion)
`[x]/[ ] <criterion> — <evidence file:line>` · files changed · verification run · open risks. Then STOP.

## Rules
No code edits before Continue. Never commit or push. No state files. Never fabricate tool results; if a required tool is missing, report and stop. Run `gh issue close $1 -c "<concise comment>"` only on an explicit "close issue #N"; any other follow-up never triggers it.
