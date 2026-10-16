# Parity deviations

Intentional deviations of the native tools from their built-in oracles, with
the token impact and the affected assertions. Any change listed here must be
the *only* reason an otherwise-parity assertion differs; everything else stays
byte-identical (see `tests/*-parity.test.mjs`).

## piread — `details.via`

**What.** Native piread results carry `details.via` with the serving rung:
`"daemon" | "oneshot" | "builtin"`. The built-in read tool has no such field.

**Why.** Previously the rung was advertised by appending a `"\n[piread native]"`
marker to the model-visible `content[].text`. That text was never needed by the
model — the file contents are the same regardless of rung — and it cost ~4
model tokens (16 bytes) on every read call. Moving the signal to `details`
keeps observability (permission-gate coverage, tests) while removing the
model-visible cost. `details` is TUI/structured metadata and does not enter the
model context (working rule 4).

**Token impact.** −16 bytes (−4 est. tokens) per successful read call. On the
`read small (4ln)` fixture this is the entire delta: native and built-in are now
byte-identical (`0.0%`), down from `+69.6%`.

**Affected assertions.** `tests/piread-parity.test.mjs`:
- `parityCase` asserts `details.via` is one of the three rungs, then deletes it
  and collapses an empty `details` back to `undefined` (the built-in's shape)
  before the structural compare.
- The concurrent-dispatch case does the same normalization.
- Both marker-strip sites (previously `MARKER = "\n[piread native]"`) are gone.

**Not a deviation.** The `content[].text` itself is now byte-identical to the
built-in for every text case; the marker removal *restores* parity rather than
breaking it.
