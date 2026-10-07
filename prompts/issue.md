---
description: Advance GitHub issue N through the gated pipeline (validate > propose > approval > implement > review > ship > close)
argument-hint: "<issue-number>"
---
Drive issue $1 by the `Status` field of `.pi/issues/$1.md` (repo-relative). State lives in that file and `ISSUE_TRACKER.md` (repo root) — never in conversation. If `/tmp/issues/$1.json` is missing: `gh issue view $1 --json number,title,body,labels,state,comments > /tmp/issues/$1.json`; rg the dump, don't page through.

**no record** → create `.pi/issues/$1.md` from the scaffold below, Status `proposed`; append an ISSUE_TRACKER.md row (header `| Issue | Status | Branch | PR | Updated |`, date via `date +%F`). Then:
- Validation: formalize the prose into repro command / expected / observed. Check stale/dupe (rg CHANGELOG, recent commits, ISSUE_TRACKER.md's Possible duplicates). Verdict: valid | invalid | dupe of #X | needs-info.
- Proposal: root cause (rg callers first), approach, files, risks, `Deps:` line (or `none`), `Suggested bump:`, test plan.
- HARD STOP — no code edits.

**proposed** → stop. Decision is human-only.

**approved | partial** → implement within Decision scope only:
1. Dedicated branch `fix/issue-$1`, or stay on a branch holding only this issue's changes; record the actual branch.
2. Repro the failure first, then root-cause fix, minimal change.
3. Verify with the narrowest relevant test.
4. CHANGELOG.md entry under the section named in Decision's `Version:` — create the heading if new, append if it exists; ask if Version is missing or no CHANGELOG.md.
5. Fill `Branch:`, update ISSUE_TRACKER.md, Status `implemented`. STOP — no push.

**implemented** → pre-push review (fresh eyes). Read the record, then `git diff <default-branch>...HEAD` (capped). Verify: diff matches Decision scope; tests actually cover the reported behavior; no dep changes beyond `Deps:`; no unrelated refactors. Write Review section, Status `reviewed`, update tracker, ask to ship.

**reviewed** → on confirmation, ask ship mode:
- **PR** (third-party repos, or merge-gated flow): push branch, `gh pr create` with `Fixes #$1` and body from the record, `gh run watch --exit-status`. Status `shipped`; merge auto-closes.
- **Direct push** (solo): push to the default branch, `gh run watch --exit-status`, then `gh issue close $1` with a comment drafted from the record; put the commit sha in `PR:`. Status `closed`.
Update ISSUE_TRACKER.md either way.

**skipped | closed** → report state, exit.

Rules: no code edits unless Status is approved | partial; never push without asking; never fill or alter Decision; every transition updates record Status and the ISSUE_TRACKER.md row.

Scaffold:
```
# Issue $1: <title>
Status: proposed
Branch: -
PR: -

## Validation
- Repro:
- Expected:
- Observed:
- Verdict:

## Proposal
- Root cause:
- Approach:
- Files:
- Risks:
- Deps: none
- Suggested bump: patch | minor | major
- Test plan:

## Decision
<!-- human only: approved | skip (reason) | partial (scope) | revise (feedback) -->
Version: <!-- new <x.y.z> | <existing version heading> | unreleased -->

## Changelog

## Review
```
