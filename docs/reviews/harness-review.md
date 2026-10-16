# Review: `pi-native`

Scope: README architecture, token efficiency, execution discipline, portability, security, and harness performance. This is a design-level review, not yet a source-code audit.

Repository: [nurmdrafi/pi-native](https://github.com/nurmdrafi/pi-native)

## 1. Overall assessment

The architecture is well thought out. The biggest opportunity is improving the reliability and efficiency of tool execution, not adding more agent features.

Your harness already addresses several important problems: persistent prompt bloat, progressive skill loading, destructive-command protection, edit validation, bounded command output, and optional subagents. It also documents measurable quality gates and a small permanent context budget.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://github.com\&sz=32)

GitHub



Architecture and design

## 8.5/10

Strong separation of persistent instructions, on-demand knowledge, extensions, and helper tools.

Token efficiency

## 8/10

The lean-prefix approach is good, but token consumption during execution still depends on tool schemas, command output, retries, and skill selection.

Execution efficiency

## 7/10

Output caps and edit guards are useful. Actual latency and model-call savings require profiling the tool implementations and real sessions.

Security and recovery

## 7.5/10

The permission gate is a strong foundation, but correctness depends on its implementation, bypass resistance, and failure handling.

These are preliminary engineering judgments based on the README, not benchmark results or verified source-level scores.

## 2. Highest-priority findings

P0 — Measure real tool-call cost

Highest priority

The README emphasizes a roughly 0.5K-token permanent prefix, but that is only one component of total cost. Tool definitions, repeated file reads, command results, retries, and generated patches can dominate real coding sessions.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://raw.githubusercontent.com\&sz=32)

GitHub



Recommendation: Measure actual model input/output tokens, tool-call count, wall-clock latency, retry rate, and cache usage per completed task. Optimize the largest contributor rather than assuming a smaller `AGENTS.md` makes the whole harness faster.

P1 — Improve tool execution, not just tool-call restrictions

Your permission gate already includes output caps, re-read protection, edit-anchor validation, and duplicate-execution protection.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://raw.githubusercontent.com\&sz=32)

GitHub



The next step is to inspect the underlying `read`, `bash`, `edit`, and `write` implementations. If the agent frequently uses shell commands to inspect files, parse output, and then make edits, better native tools could reduce subprocess overhead and unnecessary model turns.

Recommendation: Prioritize structured, bounded outputs and fewer round trips. A Rust implementation is worthwhile only if profiling shows meaningful local execution overhead.

P1 — Make edit validation resistant to stale or ambiguous context

Requiring `oldText` to match a region that was actually read is a useful guard. However, reading a region once does not prove that it remains unchanged before an edit.

Recommendation: Validate the current file contents at execution time, reject ambiguous multi-match replacements, and consider file-version or content-hash checks for stale reads. Preserve the existing permission checks for destructive actions.

P1 — Reconsider making all skills manual

Manual-only skills minimize automatic context loading, but they also shift discovery and selection work to the model. A model can miss a relevant skill or spend extra turns deciding which one to invoke. Your README confirms that all 22 skills are manual.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://raw.githubusercontent.com\&sz=32)

GitHub



Recommendation: Keep expensive, specialized skills manual. Test lightweight task-to-skill routing for a few high-value workflows, such as debugging, frontend implementation, and pre-push review. Compare the extra routing tokens against the cost of missed skills and repeated attempts before enabling it globally.

P1 — Verify fail-closed behavior

The README documents confirmation for destructive commands and a user-owned allowlist.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://raw.githubusercontent.com\&sz=32)

GitHub



Recommendation: Test command parsing, shell chaining, redirections, environment-variable expansion, symlinks, time-of-check/time-of-use races, and missing or failed confirmation handlers. A security gate must not silently allow an operation because it cannot classify it.

## 3. Should you implement native tools in Rust?

Given your goal of making the Pi coding harness faster, I would not rewrite every tool in Rust immediately.

| Tool              | Recommended approach           | Why                                                                                                                   |
| ----------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `read`            | Optimize first                 | Bounded reads, line ranges, binary/image detection, and concise output can reduce both I/O and tokens.                |
| `edit`            | Optimize correctness first     | Exact matching, ambiguity rejection, and stale-file checks matter more than raw speed.                                |
| `write`           | Keep simple                    | File creation is usually inexpensive; atomic writes and clear error handling matter more.                             |
| `bash`            | Keep the shell as the executor | Process startup may cost time, but shell compatibility, environment behavior, and streaming are significant concerns. |
| Search/list tools | Use existing native utilities  | `rg`, `fd`, and similar tools are already optimized for their respective jobs.                                        |

A Rust helper can make sense if you need a single compiled executable with predictable startup, low memory overhead, structured output, and robust file operations. But it won't automatically reduce model inference latency or token usage.

My recommendation: Build a small benchmark first, then implement one Rust tool—most likely `read` or a combined file-inspection operation—and compare it against your current implementation.

## 4. Architecture issues worth fixing

### A. Correct the documentation inconsistencies

The README says there are 22 manual skills, but the token-budget section says “all 20 manual.” It also describes the harness as requiring zero environment variables while documenting `PI_SUBAGENTS=1` as an optional activation mechanism. These are minor, but they weaken the precision of an otherwise carefully maintained project.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://raw.githubusercontent.com\&sz=32)

GitHub



I would add a documentation validation check that verifies skill counts, extension inventories, and stated requirements against the repository.

### B. Separate policy enforcement from optimization

Keep these responsibilities distinct:

- Policy: authorization, destructive-operation confirmation, commit rules.
- Correctness: edit validation, path safety, atomic writes.
- Efficiency: output limits, redundant-read detection, batching.
- Observability: latency, token cost, errors, blocked operations.

This separation makes it easier to test each behavior independently and prevents performance optimizations from weakening safety checks.

### C. Make measurements reproducible

Your README already requires before-and-after measurements for harness changes. Extend that practice into a repeatable benchmark suite.

Track these metrics:

| Metric                       | What it tells you                                 |
| ---------------------------- | ------------------------------------------------- |
| Tool p50/p95 latency         | Typical and worst-case local execution time       |
| Model calls per task         | Whether the harness reduces reasoning round trips |
| Input/output tokens per task | Actual context and generation cost                |
| Repeated-read rate           | Whether read optimization is working              |
| Edit failure/retry rate      | Whether tools improve or disrupt execution        |
| Task success rate            | Whether speed improvements preserve correctness   |
| Cache-hit rate               | Whether changes disrupt prompt caching            |

Use identical tasks, models, repository states, and settings for baseline and candidate runs. Report the median across repeated runs rather than relying on a single successful task.

## 5. Recommended implementation roadmap

### 1

Phase 1 — Establish a baseline

First priority

Instrument tool execution, model calls, token usage, retries, and task outcomes. Select representative tasks: bug fixing, multi-file refactoring, feature implementation, and test repair.

### 2

Phase 2 — Improve existing tools

Optimize bounded file reads, duplicate-read prevention, precise edits, command output truncation, and structured error messages. Prefer changes that remove entire model turns over micro-optimizations to local execution.

### 3

Phase 3 — Prototype Rust selectively

Implement one tool behind a compatible interface. Compare execution time, memory, correctness, output-token count, and installation complexity against the current implementation.

### 4

Phase 4 — Optimize orchestration

Evaluate skill discovery, tool batching, subagent delegation, and verification loops using the benchmark results. Keep subagents opt-in unless their benefit is demonstrated for a specific task class.

## 6. What I would inspect next in the actual source code

The README is enough to evaluate the design, but it cannot establish whether the implementation is correct or performant. These files are the most important for a deeper review:

1. `extensions/permission-gate/` — interception behavior, command classification, bypass resistance, and failure handling.
2. `extensions/subagents/` — delegation overhead, concurrency, context transfer, and failure recovery.
3. `tools/` — Rust implementation, serialization costs, and the actual benefit of the native helper.
4. `skills/session-audit/` — whether token and cost estimates match real session data.
5. `scripts/bootstrap.sh` and `scripts/after-pull.sh` — installation reliability, update behavior, and supply-chain risks.
6. `tests/` and `npm run gate:eval` — whether the tests cover adversarial cases and actual coding-task outcomes.

The repository links are available from the [project README](https://github.com/nurmdrafi/pi-native/blob/main/README.md).

## Final recommendation

Do not start with a full Rust rewrite. First establish which part of the harness is expensive, then optimize that part while preserving the existing safeguards.

Your next major improvement should be a benchmark-driven tool layer that minimizes redundant model interactions, returns compact and useful results, and enforces correctness at execution time. Rust is a possible implementation strategy for selected operations—not the optimization objective itself.

The key distinction is that a faster local tool is not necessarily a faster coding agent. The goal is to complete the same task with less wall-clock time and lower token cost, without reducing correctness or security.