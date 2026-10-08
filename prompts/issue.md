---
description: Fetch GitHub issue N, validate and propose in context, implement on approval — no state files, no branch, no changelog
argument-hint: "<issue-number>"
---

**Fetch once**: `gh issue view $1 --json number,title,body,labels,state,comments` — rg the output, don't page through. The issue and its state live in this conversation — never write them to any file.

**Validate.** Repro command / expected / observed; run the repro. Stale/dupe: rg CHANGELOG.md, recent commits, issue body/labels. Verdict `valid | invalid | dupe of #X | needs-info`, one line why. Not valid → report, stop.

**Propose** (same reply): root cause (rg callers first), approach, files, risks (security impact + blast radius on existing business logic), `Deps:`, test plan. Approach feels risky or touches business-logic behavior → say so explicitly, present alternatives, let the human pick. **HARD STOP** — the human verifies: continue or skip. Skip → done.

**Continue → implement on the current branch** (never create one): repro first, root-cause fix, minimal change, narrowest relevant verification. Report changes + verification.

**Close on request** — `gh issue close $1 -c "<concise comment: what was wrong, what changed, verification>"`. Never close unprompted.

Rules: no code edits before continue; never push; never write issue state to files; DO NOT break existing business logic — if the fix risks changing behavior or anything seems risky, stop and discuss with the human.
