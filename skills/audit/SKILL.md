---
name: audit
description: "Dead-code / unused-export / unused-dependency cleanup via static analysis (fallow, knip, ts-prune, depcheck). Verifies tool output before deleting; handles cascades; zero orphans. Use: 'run fallow', 'remove unused files/deps/types'. NOT correctness review (→ ponytail-review) or bug fixing (→ systematic-debugging)."
disable-model-invocation: true
---

# Audit (dead-code cleanup)

Static analyzers miss non-import references and over-flag. The tool's report is a **lead list, not a delete list**.

## fallow command map (prefer these over grep when present)

- `npx fallow dead-code` — unused files/exports/types/enum+class members/deps + circular deps
- `npx fallow dead-code --trace src/file.ts:symbol` — **prove a symbol unused before deleting it**
- `npx fallow fix --dry-run` — preview auto-fixes (don't apply blindly; `fix` is broader than the task)
- `npx fallow audit` — changed-file gate; legacy findings excluded by design
- `npx fallow recommend` — generate starter config (generated code causing false positives? add `ignorePatterns`)
- Exit codes: 0 and 1 both = success (1 = findings); 2 = real error. Never `|| true`.
- First-run findings usually = missing entry point / framework convention / generated files, not dead code.

## Workflow

1. **Run tool, sanity-check BEFORE deleting.** Spot-check flagged deps against config usage (next.config, tailwind, postcss, PM2/compose). Inverse case too: imported-but-missing packages get added.
2. **Delete in tiers:** unreachable files → unused deps (incl. newly-orphaned Radix peers) → duplicate exports (consolidate only if verbatim-identical) → unused type/value exports.
3. **Non-import reference check** (tool can't do this): `rg -F '<deleted filename>'` across repo. Check dynamic `import()`, icon barrels, docker/compose/PM2 configs. Hits in comments/docs = acceptable, note them. Never delete deploy/CI config.
4. **Cascades:** delete → re-run tool → handle newly-orphaned consumers (types-only-used-by-deleted-types, barrel entries, single-export files) → repeat until clean.
5. **Scripted bulk edits are dangerous:** after EVERY script run `tsc --noEmit` + lint (for JSX/TS projects without tsc, run `esbuild --loader:.jsx=jsx file --outfile=/dev/null` on each touched file), review the full diff — scripts eat adjacent declarations, leave orphaned union bodies, and on JSX, `str.replace` silently nests or duplicates tags. Never declare success from a regex count; parse or render. Restore wrong removals from git.
6. **Orphan sweep (zero-orphan guarantee):** scan touched files for JSDoc `/** */` blocks and section comments describing deleted declarations; cross-check each survivor. Read before removing — file-header docs followed by blanks are false positives.
7. **Gate:** `tsc --noEmit` clean, lint 0 new issues, production build succeeds, deleted-name string scan clean, modified-file diffs are deletions/re-sourcing only — no semantic change.
