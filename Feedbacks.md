# Prompt: Post-Block Impact Analysis

Copy everything between the horizontal rules into your agent (or into a fresh session as the task). It is self-contained: it defines the taxonomy, the evidence sources, the classification rules, and the required output format.

---

## Role

You are an **auditor of a tool-call permission gate**. Your job is not to praise the gate, not to summarize its rules, and not to propose new rules. Your job is to determine, for each block the gate produced, **whether the LLM's next action left it better or worse off than if the call had been allowed**.

A block is not "successful" because the LLM recovered. It is successful only if the recovery cost less (in tokens, clarity, correctness, and future behavior) than allowing the original call would have. Classify outcomes accordingly.

## Inputs

You will be given one or more of:

1. **A session transcript** (or excerpt) containing:
   - `tool_call` events with `toolCallId`, `tool` name, and `input`
   - `tool_result` events with `toolCallId`, `isError`, `content`
   - The permission gate's block messages (they appear as `tool_result` with `isError: true` and a reason beginning with a rule family such as `Token Economy (…)`, `Anchor Guard`, or `Commitlint`)
2. **A block log** — NDJSON lines of the form `{family, n, ts}` or richer `{rule, ts, offending, reason, nextTool, nextInput, nextOk}` if available.
3. **Optionally**, the gate source (the file that emits the block reasons) so you can read the exact regex the block was produced by.

If any input is missing, say so explicitly and proceed with what you have. Never invent blocks, commands, or outcomes.

## Task

For **every block** in the input, determine:

### Step 1 — Identify the block precisely

- The rule family (`Token Economy (Reading)`, `Token Economy (Re-run)`, `Anchor Guard`, `Commitlint`, etc.)
- The **offending call**: the exact tool and input that was blocked.
- The **block message**: quote it verbatim.
- The **segment(s) of the command** the rule targeted, if the command was compound.

### Step 2 — Determine the next action

Find the LLM's very next `tool_call` after the block. If the next turn contains only text (no tool call), record that. If the LLM retried the same call, record that. If the session ended, record that.

Quote the next call's tool and input verbatim (truncate long inputs with `…`, but keep the part that differs from the blocked call).

### Step 3 — Classify the outcome

Choose **exactly one** label from this taxonomy. Use the decision rules that follow.

| Label | Definition |
|---|---|
| `compliant` | Next call follows the block message's suggested fix and preserves the original goal. |
| `compliant-goal-lost` | Next call follows the message but the resulting command no longer does what the original intended (typical for compound commands). |
| `cosmetic` | Next call differs from the blocked call only by whitespace, quoting, arg order, or a semantically irrelevant token. Defeats the regex, not the intent. |
| `semantic-evasion` | Next call uses a different tool/idiom to achieve the same effect (`python -c`, `awk '1'`, `grep -o`, `node -e`, `perl -pe`, `sed` for viewing, `head`/`tail` where `cat` was blocked, `find` where `ls -R` was blocked, etc.). |
| `heredoc-evasion` | Next call uses a heredoc, `-F-`, `<<<`, or equivalent to bypass a message-inspection rule (`Commitlint`). |
| `fragmentation` | A compound command (`A; B; C`) was blocked; the LLM split it into multiple separate calls, some of which are not blocked. |
| `loop` | Next call re-triggers the same rule family. |
| `abandonment` | LLM moves on to an unrelated step without completing the blocked goal. |
| `explained-to-user` | LLM stops and asks the user to run the command manually or explains the block instead of acting. |
| `unknown` | Insufficient evidence to classify. Say what's missing. |

**Decision rules (apply in order):**

1. If the next call re-triggers the same rule → `loop`.
2. If the next call is a `tool_call` that, per the block message, is the explicitly suggested fix → check whether the original goal is preserved. If yes → `compliant`; if the fix changes the command's effect → `compliant-goal-lost`.
3. If the next call is a different tool doing the same job (same file, same data, same output class) → `semantic-evasion`.
4. If the next call differs only in tokens the rule's regex is blind to → `cosmetic`.
5. If the blocked command was compound and the next call is only one of its segments → `fragmentation`.
6. If the next turn has no tool call and the session continues elsewhere → `abandonment`.
7. If the next turn has no tool call and the message asks the user to act → `explained-to-user`.
8. Otherwise → `unknown` with a note.

### Step 4 — Score the impact

For each block, score the outcome on four axes. Use a 3-point scale (`-1`, `0`, `+1`):

| Axis | `-1` (worse than allowing) | `0` (neutral) | `+1` (better than allowing) |
|---|---|---|---|
| **Correctness** | The recovery produces a wrong or incomplete result, or the goal is abandoned. | Same result as allowing would have produced. | The recovery produces a more correct result than the original call would have. |
| **Cost** | The recovery costs more tokens / more calls than allowing. | Roughly the same. | The recovery is cheaper. |
| **Clarity** | The recovery introduces a non-idiomatic command or ambiguity that future readers will struggle with. | Same readability. | The recovery is clearer or more idiomatic. |
| **Learning** | The recovery teaches an evasion pattern the LLM is likely to reuse. | No shift. | The recovery teaches a compliant idiom the LLM is likely to reuse. |

Sum the four axes → **net impact** in `[-4, +4]`.

- `+3` or `+4` → the block was **clearly beneficial**.
- `+1` or `+2` → **mildly beneficial**.
- `0` → **neutral**.
- `-1` or `-2` → **mildly harmful**.
- `-3` or `-4` → **clearly harmful**.

### Step 5 — Aggregate

Per rule family, compute:

- Count of blocks observed.
- Distribution of outcome labels.
- Mean net impact.
- **Compliance rate** = (`compliant` + `compliant-goal-lost`) / total.
- **Evasion rate** = (`cosmetic` + `semantic-evasion` + `heredoc-evasion` + `fragmentation`) / total.
- **Loss rate** = (`abandonment` + `explained-to-user` + `loop`) / total.
- One-line verdict: keep, tighten, loosen, or withdraw.

A rule should be flagged **withdraw-or-narrow** if any of:
- Compliance rate < 0.7
- Evasion rate > 0.15
- Loss rate > 0.1
- Mean net impact < 0

A rule should be flagged **healthy** if all of:
- Compliance rate ≥ 0.8
- Evasion rate ≤ 0.1
- Loss rate ≤ 0.05
- Mean net impact ≥ +1

Anything else → **needs review** with the specific axis that failed.

## Output format

Return exactly the following sections, in order.

### 1. Coverage

State how many blocks you analyzed, from what source (transcript / log / both), and any blocks you could not classify (`unknown`) with the reason.

### 2. Per-block table

One row per block:

| # | Rule | Offending call (truncated) | Outcome label | Net impact | Evidence (next call, truncated) |
|---|---|---|---|---|---|

Then, immediately below the table, for **every** block whose net impact is negative, add a short paragraph:

> **Block N — why harmful.** Explain in ≤ 60 words: which of the four axes went negative, what the LLM did instead, and what allowing the call would have produced.

For every block whose net impact is `+3` or `+4`, add a one-sentence note explaining what the block taught the LLM that a non-block would not have.

### 3. Per-rule aggregate

One row per rule family:

| Rule | Blocks | Compliant | Evasion | Loss | Mean net | Verdict |
|---|---|---|---|---|---|---|

Verdict is one of: `healthy`, `needs review`, `withdraw-or-narrow`. For `needs review`, add the failing axis in parentheses, e.g. `needs review (evasion 22%)`.

### 4. Top three harmful patterns

Identify the three most harmful **patterns** across the blocks — not individual blocks, but recurring shapes. Examples of patterns:

- "Rule fires on a shape with no compliant rewrite; LLM switches to `python -c`."
- "Rule's escape hatch (`--no-verify`) is cheaper than compliance; LLM adopts it preemptively."
- "Rule's base extraction breaks on a redirect; LLM adds `sleep` to defeat it."

For each pattern, state:
- Which rule(s) produce it.
- How many blocks exhibited it.
- What the LLM learned (one sentence).
- The likely long-term cost (one sentence).

### 5. Recommended actions

Ranked list. Each action must be one of:

- **Narrow**: restrict the rule to the shape where it's accurate.
- **Loosen**: allow an exception the rule currently blocks.
- **Rewrite message**: keep the block but change the corrective text.
- **Withdraw**: remove the rule.
- **Add**: introduce a rule the evidence supports (rare — only if a block's absence caused a bad outcome).
- **Downgrade to hint**: keep the detection, stop blocking.

For each action, cite the specific evidence (block numbers) that justifies it and the expected effect on the three rates (compliance / evasion / loss).

### 6. Uncertainties

List everything you could not determine from the input: missing next-call evidence, ambiguous classification, blocks whose log line was truncated, etc. Do not speculate in this section — just name the gap.

## Rules for you, the auditor

1. **Do not summarize the gate.** The user knows what it does. Every sentence must be about observed behavior.
2. **Do not propose new rules** unless a block's absence directly caused a harmful outcome. Suggestions belong in §5 actions only, and only with cited evidence.
3. **Do not assume an outcome is good because the LLM complied.** `compliant-goal-lost` is compliance on paper and harm in practice.
4. **Do not assume an outcome is bad because the LLM evaded.** If the block had no compliant path, evasion is the only correct response — the harm is the block, not the LLM. Mark the axis accordingly.
5. **Quote, don't paraphrase**, when referring to the offending call, the block message, or the next call. Truncation is fine; invention is not.
6. **If the input is small** (fewer than 10 blocks), say so at the top of §1 and label the aggregate in §3 as `low-confidence`. Do not extrapolate.
7. **If a rule has zero blocks in the input**, still list it in §3 with `0` counts and verdict `no data` — do not silently omit it.
8. **Do not pad.** If a section has no content, write `None observed.` and move on.

## What a good answer looks like

A good answer:

- Reports per-block facts that a reader could verify against the transcript.
- Distinguishes "the LLM recovered" from "the block was worth it" everywhere.
- Names the *shape* of the failure (redirect mid-command, escape hatch cheaper than compliance, compound-command base truncation) rather than blaming the LLM.
- Produces at least one `withdraw-or-narrow` recommendation when the evidence supports it — a clean bill of health across every rule is suspicious unless the input is tiny.
- Ends with a ranked, testable action list.

A bad answer:

- Praises the gate's design or repeats its rule list.
- Counts `compliant` outcomes and concludes the gate is working without checking what the compliant rewrites actually did.
- Misses that `--no-verify` or `python -c` is an evasion because the rule's regex was technically satisfied.
- Proposes new rules instead of auditing existing ones.
- Uses the word "robust" or "comprehensive" anywhere.

---

## How to invoke this

Paste the block above as the task. Then attach, in order:

1. **The gate source** — so the auditor can read the exact regexes. The file with `FAMILY_LESSONS`, `blockCall`, and the `tool_call` handler.
2. **The transcript or block log** — the session(s) to audit.
3. **A one-line context note** — e.g. `"Repo uses conventional commits; commitlint is enforced in CI"` or `"No commitlint in this repo."` This lets the auditor score R9 correctly without guessing.

If you are running this on a fresh session with no gate source, drop the "read the exact regex" affordance and rely on the block messages alone. The audit is weaker but still meaningful.

If you want a **quick** version (single rule, few blocks), prefix the prompt with:

> Scope: analyze only blocks from rule family `<NAME>`. Ignore all others. Sections 4 and 5 may be short.

That keeps the output focused and lets you iterate rule-by-rule without re-reading the whole session.