# S3 — Doc-Consistency Validator: Design Spec

> Path note (2026-10-16): `native/` was later renamed to `custom-tools/`. `native/` in the text below (including the `tools/` → `native/` migration it describes) is historical; the current crate root is `custom-tools/`.

Status: **spec'd** (implementation plan → `2026-10-15-s3-doc-check-plan.md`)
Created: 2026-10-15
Parent: `docs/specs/MASTER.md` §3 (S3). Feedback basis: MASTER §1.4A.
Decisions locked with user: entrypoint = new `npm run doc:check` wired into release CI (Q1=A); reuse `mdcmdcheck.mjs` as the base, promoted to `scripts/doc-check.mjs` (approach 1 — merge, not wrapper); scope = skills inventory, extension inventory, env-var claims, with command/path checking carried over from mdcmdcheck rather than duplicated (Q2 trimmed — "already has mdcheck"); env-var allowlist inline in the script (Q3=A); **no hardcoded expectations** — everything derived from the repo, volatile counts removed from docs in a one-time pass ("always updating metrics is not manageable"; "removing matrix which are not fixed is a good idea").

## 1. Problem

MASTER §1.4A: README claims drifted from reality — "22 manual skills" vs "all 20" in the token-budget section, "zero environment variables" vs documented optional `PI_SUBAGENTS=1`. Hand-fixed once (commit `844a65e`), but nothing prevents recurrence; more drift exists today (README tree documents `tools/`, actual dir is `native/`). `mdcmdcheck.mjs` validates shell commands in markdown but nothing compares counts, inventories, or env-var claims against the repository.

Maintenance constraint (user): a validator with hardcoded expected numbers is a third artifact to update on every change. Solution: the validator derives reality from the repo (filesystem + code grep) and compares against claims extracted from the docs themselves. It contains no expected counts or inventories. Adding a skill = one README table row; adding an env var = document it or allowlist it. The validator itself never changes for either.

## 2. Scope

**In scope:** `scripts/doc-check.mjs` (mdcmdcheck promoted + merged); npm script `doc:check`; release CI step; four check families (§5); one-time doc pass (§6); tests.

**Out of scope (non-goals):**
- Prose/NLP claim checking — no runtime policing of sentences; wording is fixed once in the doc pass.
- General link checking; scanning `CHANGELOG.md`, `handoff/`, `audit-reports/` (same exclusions as mdcmdcheck).
- Validating `docs/specs/` or benchmark docs.
- Any doc fixes beyond the §6 pass.

## 3. Approach (of three considered)

**Chosen — promote & merge.** Move `skills/harness-engineer/scripts/mdcmdcheck.mjs` → `scripts/doc-check.mjs`, keep its command checking as one family, add inventory/env-var families, wire `npm run doc:check` + release CI, update references (README skill-layout section, harness-engineer SKILL.md). Matches repo convention (`agents-lint.mjs`, `gate-eval.mjs` live in `scripts/`); one entrypoint for all doc consistency.

Rejected: wrapper script spawning in-place mdcmdcheck (two homes, duplicated output/exit plumbing, CI infra split across skill-owned and repo-owned code). Rejected: rename in place inside the skill (CI-facing checks living inside an invocable skill inverts ownership — skills are tools, not repo infrastructure).

## 4. Repository layout

```
scripts/doc-check.mjs            # moved from skills/harness-engineer/scripts/mdcmdcheck.mjs + new families
tests/doc-check.test.mjs         # node:test, repo pattern
tests/fixtures/doc-check/        # fixture README variants + fixture tree builder data
package.json                     # scripts += "doc:check": "node scripts/doc-check.mjs"
.github/workflows/release.yml    # += doc-check step
```

Old `mdcmdcheck.mjs` path removed in the same commit; every reference updated. Zero dependencies. ROOT resolution changes from three `..` to one.

## 5. Check families

### 5.1 md-commands (carried over, logic unchanged)

Walks repo `.md` (excl. `CHANGELOG.md`, `HANDOFF-*.md`, `handoff/`, `audit-reports/`), validates shell commands in fenced blocks: syntax, binary exists (builtin/mac-only/optional-toolchain info-only classes preserved), script paths resolve, flags appear in help. Exit-relevant: `syntaxFail`, `binFail`, `scriptMissing`, `flagFail`.

### 5.2 skills-inventory

Derived: directories under `skills/` containing `SKILL.md` → set of names. Claims: rows of README's skills table (`| Skill | … | Invocation |`), with invocation column `/skill:<name>`. Fail on: dir without table row, row without dir, invocation ≠ row name, duplicate row names. Prose stays count-free ("All skills are manual") — enforced only by the §6 doc pass, no runtime prose check.

### 5.3 extensions-inventory

Derived: directories under `extensions/` containing at least one `.ts` file. Claims: extension names in README's Extensions section. Bidirectional mismatch fails. Top-level files (`handoff.ts`) are not extension units — excluded by the dir-only rule.

### 5.4 env-vars

Derived: occurrences of `PI_[A-Z0-9_]+` in `extensions/**/*.ts`, `scripts/*.mjs`, `skills/*/scripts/**`. Inline allowlist at top of script = internal-only runtime plumbing written/read by the extension itself (e.g. `PI_SUBAGENT_ID`, `PI_SUBAGENT_NAME`); seed set determined at implementation by auditing each found var. User-facing vars (`PI_SUBAGENTS`, `PI_SUBAGENT_EXTRA_EXTENSIONS`) are not allowlisted. Rule (bidirectional): every non-allowlisted var must appear in `README.md` or `extensions/README.md`; every `PI_*` documented there must exist in code.

### 5.5 No hardcoded expectations

The script contains no expected counts or name lists. The only enumerated data is the env-var allowlist, which classifies code-side findings — it never encodes what docs must say.

## 6. One-time doc pass (separate commit — it is what makes the new families green on the real repo)

- Badges `skills-22` / `extensions-2` → count-free text; "All 22 skills" → "All skills".
- Repo tree: `tools/` → `native/`; tree annotations refreshed against actual root dirs.
- "Zero environment variables" (README §quick-start, §portability) → "zero env vars required for setup", with optional knobs named as optional.
- All `mdcmdcheck.mjs` references (README skill-layout section, harness-engineer SKILL.md) → `npm run doc:check`.
- CHANGELOG entry; MASTER §3 Status flip on spec commit, §7 outcome line on completion.

## 7. Output / exit behavior

Default: grouped human-readable sections per family (`SKILLS INVENTORY (FAIL)` …), one line per finding, final summary, `exit 1` if any family fails; `exit 0` = docs consistent. `--json` emits one object `{ families: [{ name, status, findings: [] }] }` (agents-lint pattern). Missing/unparseable README section → that family fails with an explicit finding; the script never crashes on doc structure.

## 8. Testing

`tests/doc-check.test.mjs` (node:test, runnable via `node --test` and directly), fixtures under `tests/fixtures/doc-check/` — fixture trees built in temp dirs (skills/, extensions/, code files) + fixture README variants:

- **Per family, green path**: consistent fixture → exit 0, no findings.
- **skills-inventory**: dir without row; row without dir; invocation mismatch; duplicate rows.
- **extensions-inventory**: both-direction mismatch; `handoff.ts`-style top-level file ignored.
- **env-vars**: allowlisted var passes undocumented; non-allowlisted undocumented fails; documented-but-nonexistent fails; var in `scripts/*.mjs` is scanned.
- **Aggregation**: multi-family failure → all findings listed, single exit 1; `--json` shape; missing table → explicit finding, no crash.
- **md-commands smoke**: one pre/post-move fixture (previously untested code) asserting exit parity — full adversarial coverage stays out of scope.

## 9. Risks / notes

- Table/section extraction is regex-fragile → anchor on the stable table header format; missing section fails loudly with an explicit finding; tests pin extraction against fixture copies of the real table shape.
- Allowlist classification drifts as code evolves → allowlist sits at top of script with a one-line comment per entry; audit is part of adding any new `PI_*` var.
- Carried-over mdcmdcheck has no test history → move is verbatim (ROOT-only change) + smoke fixture; behavior change during the move would be a bug.

## 10. Acceptance criteria

1. `npm run doc:check` runs all four families: exit 1 with readable findings on drift, exit 0 on consistent docs; `--json` machine output available.
2. Release CI runs it; deliberate one-line README drift fails it (implementation smoke).
3. Volatile counts gone from README; tree shows `native/`; env-var wording conflict resolved; all mdcmdcheck references point at `npm run doc:check`; old path removed.
4. Zero new dependencies; changes confined to `scripts/`, `tests/`, `README.md`, `skills/harness-engineer/` (reference updates), `package.json`, `.github/workflows/release.yml`, `CHANGELOG.md`, and MASTER registration.
