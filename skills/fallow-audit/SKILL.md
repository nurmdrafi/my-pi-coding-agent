---
name: fallow-audit
description: "Dead-code / unused-export / unused-dependency cleanup via static analysis (fallow, knip, ts-prune, depcheck). Verifies tool output before deleting; handles cascades; zero orphans. Use: 'run fallow', 'remove unused files/deps/types'. NOT correctness review (→ ponytail review mode) or bug fixing (→ systematic-debugging)."
disable-model-invocation: true
---

# Audit (dead-code cleanup)

Static analyzers miss non-import refs, over-flag. Report = **lead list, not delete list**.

## fallow command map (prefer over grep when present)

- `npx fallow dead-code` — unused files/exports/types/enum+class members/deps + circular deps
- `npx fallow dead-code --trace src/file.ts:symbol` — **prove symbol unused before deleting**
- `npx fallow fix --dry-run` — preview auto-fixes; don't apply blindly (`fix` broader than task)
- `npx fallow audit` — changed-file gate; legacy findings excluded by design
- `npx fallow recommend` — starter config (generated code false positives → `ignorePatterns`)
- Exit codes: 0 + 1 = success (1 = findings); 2 = real error. Never `|| true`.
- First-run findings usually = missing entry point / framework convention / generated files, not dead code.

## Workflow

1. Run tool, sanity-check BEFORE deleting. Spot-check flagged deps vs config usage (next.config, tailwind, postcss, PM2/compose). Inverse too: imported-but-missing packages get added.
2. Delete in tiers: unreachable files → unused deps (incl. newly-orphaned Radix peers) → duplicate exports (consolidate only verbatim-identical) → unused type/value exports.
3. Non-import ref check (tool can't): `rg -F '<deleted filename>'` repo-wide. Check dynamic `import()`, icon barrels, docker/compose/PM2 configs. Comment/doc hits = acceptable, note. Never delete deploy/CI config.
4. Cascades: delete → re-run tool → handle newly-orphaned consumers (types-only-used-by-deleted-types, barrel entries, single-export files) → repeat until clean.
5. Scripted bulk edits dangerous: after EVERY script run `tsc --noEmit` + lint (no tsc JSX/TS project → `esbuild --loader:.jsx=jsx file --outfile=/dev/null` per touched file), review full diff — scripts eat adjacent declarations, leave orphaned union bodies, JSX `str.replace` nests/duplicates tags. Never declare success from regex count; parse or render. Restore wrong removals from git.
6. Orphan sweep (zero-orphan guarantee): scan touched files for JSDoc `/** */` + section comments describing deleted declarations; cross-check survivors. Read before removing — file-header docs followed by blanks = false positives.
7. Gate:
   - `tsc --noEmit` clean
   - lint 0 new issues
   - production build succeeds
   - deleted-name string scan clean
   - modified-file diffs = deletions/re-sourcing only, no semantic change
