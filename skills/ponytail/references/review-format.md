# Review mode — over-engineering review format

Detail behind the SKILL.md Review mode section. Moved verbatim from the body.

Review diffs (or whole files) for unnecessary complexity. One line per finding:
location, what to cut, what replaces it. The diff's best outcome is getting
shorter. Does not apply the fixes, only lists them.

## Format

`L<line>: <tag> <what>. <replacement>.`, or `<file>:L<line>: ...` for
multi-file diffs.

Tags:

- `delete:` dead code, unused flexibility, speculative feature. Replacement: nothing.
- `stdlib:` hand-rolled thing the standard library ships. Name the function.
- `native:` dependency or code doing what the platform already does. Name the feature.
- `yagni:` abstraction with one implementation, config nobody sets, layer with one caller.
- `shrink:` same logic, fewer lines. Show the shorter form.

## Examples

✓ `L12-38: stdlib: 27-line validator class. "@" in email, 1 line, real validation is the confirmation mail.`

✓ `L4: native: moment.js imported for one format call. Intl.DateTimeFormat, 0 deps.`

✓ `repo.py:L88: yagni: AbstractRepository with one implementation. Inline it until a second one exists.`

✓ `L52-71: delete: retry wrapper around an idempotent local call. Nothing replaces it.`

✓ `L30-44: shrink: manual loop builds dict. dict(zip(keys, values)), 1 line.`

## Scoring

End with the only metric that matters: `net: -<N> lines possible.`

If there is nothing to cut, say `Lean already. Ship.` and stop.

## Review scope

Over-engineering and complexity only. Correctness bugs, security holes, and
performance are out of scope — route them to a normal review pass. A single
smoke test or `assert`-based self-check is the ponytail minimum, not bloat,
never flag it for deletion. "stop ponytail-review" / "normal mode": verbose
review style.
