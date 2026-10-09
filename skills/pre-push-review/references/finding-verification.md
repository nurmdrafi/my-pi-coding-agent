# Proving a finding before you publish it

Detail behind SKILL.md §4 Output. Moved verbatim from the body.

**Prove a finding before you publish it.** A finding is a claim about a bug —
verify it the same way you would verify a fix, then report it. Reasoning that
"this looks wrong" is a hypothesis, not a finding. Real false positives from
this exact failure: a `Form.List` handler `(name, checked)` compared against a
numeric index looked like a string/number bug, but `field.name` *is* the numeric
index (the sibling file used it as an array path `['rows', field.name, 'id']`) —
correct code; a `moment(x, 'YYYY/MM/DD')` parse looked like it would fail on an
ISO date, but the installed moment parses `'2000-05-15'`, `'2000/05/15'` and an
ISO timestamp identically. Both were published to the user before being checked.

Cheap verification, in order of preference:
- **Run it** — a node one-liner, a 3-case input table, a unit test. Two seconds
  of execution beats a paragraph of inference.
- **Read the installed source** (`node_modules/<pkg>/...`) for the actual
  semantics, not the API you remember.
- **Read the call site** — what is actually passed at the site (`field.name`,
  the id source, the payload consumer), not what the parameter name suggests.

If it cannot be verified, label it `[UNVERIFIED]` and say what would prove it.
Never assign a severity to an unproven claim — severity implies confidence you
do not have, and a wrong medium+ wastes the user's review time. A finding you
retract after checking costs far less than one you publish.
