# Review mode — over-engineering review format

Detail behind SKILL.md Review mode.

Review diffs (or whole files) for unnecessary complexity. One line per finding: location, what to cut, what replaces it. Diff's best outcome = getting shorter. Does not apply fixes, only lists.

## Format

`L<line>: <tag> <what>. <replacement>.` or `<file>:L<line>: ...` multi-file diffs.

Tags:

- `delete:` dead code, unused flexibility, speculative feature. Replacement: nothing.
- `stdlib:` hand-rolled thing stdlib ships. Name function.
- `native:` dep/code doing what platform already does. Name feature.
- `yagni:` abstraction with one implementation, config nobody sets, layer with one caller.
- `shrink:` same logic, fewer lines. Show shorter form.

## Examples

✓ `L12-38: stdlib: 27-line validator class. "@" in email, 1 line, real validation is the confirmation mail.`

✓ `L4: native: moment.js imported for one format call. Intl.DateTimeFormat, 0 deps.`

✓ `repo.py:L88: yagni: AbstractRepository with one implementation. Inline it until a second one exists.`

✓ `L52-71: delete: retry wrapper around an idempotent local call. Nothing replaces it.`

✓ `L30-44: shrink: manual loop builds dict. dict(zip(keys, values)), 1 line.`

## Scoring

End with only metric that matters: `net: -<N> lines possible.`

Nothing to cut → `Lean already. Ship.` + stop.

## Scope

Over-engineering/complexity only. Correctness bugs, security holes, performance = out of scope → normal review pass. Single smoke test / `assert`-based self-check = ponytail minimum, never bloat, never flag for deletion. "stop ponytail-review"/"normal mode" = verbose review style.
