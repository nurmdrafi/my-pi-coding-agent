# Updated review: `my-pi-coding-agent`

Reviewed against the current README retrieved on October 16, 2026. This is a README-level architecture review; I have not independently run the repository's tests or reproduced its benchmarks.

My assessment: the harness has made a meaningful improvement since the earlier review. It has moved beyond optimizing instructions and skills into replacing actual Pi tool execution paths with persistent Rust daemons.

The key change is the introduction of `piread` and `piedit` as separate, first-class tools, while retaining the built-in tools as fallback implementations. The README documents benchmarks for both and describes how the permission gate continues to protect native edits.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://raw.githubusercontent.com\&sz=32)

GitHub

+1



## Current engineering assessment

Native tool architecture

Strong

Performance evidence

Promising

Security integration

Needs implementation audit

Cross-platform validation

Not established by Linux benchmarks

## 1. The strongest improvement: persistent native tools

The README now documents three Rust tools:

- `piread` — native text-file reads.
- `piedit` — native text-file edits.
- `pidx` — session-log indexing.

They use different execution paths, but share a sensible design principle: keep the existing Pi orchestration and move expensive local operations into specialized native code. The read and edit tools use persistent daemons to avoid repeated process startup.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://raw.githubusercontent.com\&sz=32)

GitHub



This is a better direction than replacing the entire coding agent with a Rust implementation. It preserves Pi's model integration, tool orchestration, and extension ecosystem while targeting specific bottlenecks.

## 2. Native tool benchmarks: what the numbers establish

The README reports the following Linux x64 results using Node.js 24.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://raw.githubusercontent.com\&sz=32)

GitHub



### Reported execution speedups

p50 latency; lower is better. These are local tool microbenchmarks, not whole-agent speedups.

ReadEditIndex

Unicode

#### 4.6×

CRLF

#### 4.1×

Long lines

#### 3.0×

2,500 lines

#### 2.8×

One-line

#### 2.7×

60 KB slice

#### 1.7×

60 KB blob

#### 1.0×

My interpretation:

- `piread`: A convincing improvement for small and medium text reads, where dispatch and processing overhead are a significant portion of total latency.
- `piedit`: A particularly useful improvement for large edits, where the TypeScript path previously incurred repeated normalization, string processing, and diff-rendering costs.
- `pidx`: Strong evidence for optimizing repeated session audits through incremental indexing, provided cache invalidation remains correct.

The edit benchmark also reports parity and fuzz testing, which is a positive sign. However, benchmark results do not independently prove full behavioral equivalence across all inputs or operating systems.

## 3. The most important remaining issues

P1 — Tool selection and token overhead

The README says `piread` and `piedit` are registered under their own names rather than shadowing the built-ins. This is safer for explicit fallback behavior, but it introduces a trade-off: the model now has additional tools to choose between.

Recommendation: Measure actual prompt-token overhead and tool selection frequency. Confirm that normal sessions and subagents actually use `piread` and `piedit` where intended, rather than continuing to call `read` and `edit`.

P1 — Bash remains a major optimization opportunity

Your native read and edit tools target file operations, but they do not accelerate arbitrary shell commands. The README already places `rg` and `fd` on the preferred search paths.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://raw.githubusercontent.com\&sz=32)

GitHub



Recommendation: Profile Bash latency separately. Measure the shell-process startup floor, command execution time, and output serialization. Test a Rust shell such as Brush against Bash on your actual command corpus before switching. Do not assume shell replacement will improve commands dominated by external processes.

P1 — Failure handling and mutation safety

The documented edit path retains the mutation queue and permission gate, with fallback to the built-in executor if the native transport fails.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://raw.githubusercontent.com\&sz=32)

GitHub



Recommendation: Verify daemon crashes during writes, malformed responses, concurrent requests, stale file contents, and partial failures. A fallback after an uncertain write must not repeat an operation that may already have succeeded.

P1 — Cross-platform performance evidence

The README targets macOS and Linux, but the detailed read/edit benchmark tables are Linux x64 results.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://raw.githubusercontent.com\&sz=32)

GitHub



Recommendation: Add CI coverage for macOS ARM64 and Linux x64/ARM64 where available. Test the daemon lifecycle, executable discovery, signal handling, newline behavior, file permissions, and fallback behavior on each supported platform.

## 4. Documentation issues to fix

I found several specific inconsistencies in the current README that should be corrected.

| Issue                       | Why it matters                                                                                                                                                                              | Suggested fix                                                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Future-dated verification   | The README references verification and a redesign dated October 18, 2026, although the current date is October 16, 2026.                                                                    | Confirm the intended dates and publish only completed results.                                     |
| Edit parity case count      | One section reports 40 parity cases; the performance section reports 51 passing cases.                                                                                                      | Distinguish Rust crate tests from integration tests, or synchronize the counts.                    |
| `pidx` cold-run figures     | The README reports 450 ms versus 220 ms on one host, but 800 ms on a slower host.                                                                                                           | Label each host and run explicitly rather than presenting the figures as one comparable benchmark. |
| Read latency interpretation | The 60 KB blob result is described as parity and attributes a residual delta to a noise floor, while the reported analysis also identifies JSON parsing and validation as structural costs. | Separate measured variance from the identified downstream costs.                                   |
| Portability claims          | The design promises macOS and Linux portability, but detailed native-tool results are Linux-specific.                                                                                       | Label platform coverage separately from performance coverage.                                      |

These are documentation and evidence-quality issues, not proof of implementation defects. The README's test and benchmark descriptions provide a useful basis for auditing them.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://raw.githubusercontent.com\&sz=32)

GitHub

+1



## 5. What I would prioritize next

Given your goal of making the harness faster, this is the order I recommend:

1. Finish validating `piread` and `piedit`. Confirm correct tool selection, daemon recovery, and behavioral parity. Keep the built-ins as fallbacks.
2. Benchmark the Bash tool. Collect per-command latency for common workflows such as `git status`, `rg`, `fd`, test commands, and multi-command scripts. Separate shell startup from the time spent running external programs.
3. Test Brush as an alternative shell runtime. Compare it with Bash using your actual harness workload, including compatibility tests. Adopt it only if it improves end-to-end execution.
4. Measure full agent tasks. Compare the baseline and optimized harness using the same tasks and model. Track task completion time, correctness, model calls, tokens, and failures—not just microbenchmark speedups.
5. Add cross-platform native-tool CI. Ensure macOS and Linux builds remain correct as the Rust implementations evolve.

## Final verdict

Your harness is now moving in the right direction: it has targeted native implementations, persistent execution, explicit fallbacks, and benchmark-driven optimization.

The next bottleneck to investigate is Bash execution, because your current Rust replacements mainly accelerate file operations and session analysis. I would not replace the shell until you have measured its actual cost, but I would make that benchmark the next engineering task.

The other priority is to verify that the model uses the new tools consistently. A faster tool that the model rarely selects will have little impact on overall task duration.





# Task: Make Ghostty the default terminal for the Pi coding-agent harness

Update `my-pi-coding-agent` to recommend and configure Ghostty as the default terminal for interactive Pi sessions on macOS and Linux.

## Requirements

1. **Default terminal policy**
   - Document Ghostty as the preferred terminal for running Pi.
   - Do not make Ghostty a mandatory runtime dependency.
   - Preserve compatibility with existing terminals and headless/SSH environments.

2. **Platform-aware setup**
   - Document Ghostty installation options for macOS and supported Linux distributions.
   - Use the official Ghostty installation documentation; do not hardcode outdated package names or assume every Linux distribution provides the same package.
   - Provide a setup script that detects the OS, locates Ghostty, and explains missing dependencies.
   - Never silently install a GUI application or overwrite an existing user configuration.

3. **Configuration**
   - Configure `keybind = alt+backspace=text:\x1b\x7f` for Pi compatibility.
   - Warn about the legacy `shift+enter=text:\n` mapping and explain why it should normally be removed.
   - Use the correct platform configuration paths, supporting both `config.ghostty` and existing legacy `config` files.
   - Back up files before modifying them, preserve unrelated user settings, and make repeated setup runs idempotent.
   - Keep Ghostty shell integration enabled by default.

4. **Pi launcher**
   - Provide a documented command or launcher for starting Pi from Ghostty.
   - Do not launch a new Ghostty window automatically when Pi is already running in a terminal.
   - Do not force `TERM`, keyboard-protocol, image, or color environment variables without evidence that automatic detection is failing.
   - Preserve the existing shell environment and working directory.

5. **Testing**
   - Test setup-script idempotency and configuration preservation.
   - Test Linux and macOS path resolution.
   - Test behavior when Ghostty is absent.
   - Verify Pi's `Shift+Enter`, `Alt+Backspace`, multiline input, scrolling, and terminal capability detection.
   - Keep existing harness safety checks and tool implementations unchanged.

6. **Documentation**
   - Update the README with a concise Ghostty quick-start section.
   - Add a dedicated terminal setup document for installation, configuration, troubleshooting, and fallback behavior.
   - Clearly distinguish terminal configuration from the Rust tool-daemon performance optimizations.
   - Include validation commands and expected outcomes.

## Constraints

- Inspect the existing repository and follow its conventions before changing files.
- Do not rewrite the harness architecture or introduce an unnecessary dependency.
- Do not claim that Ghostty makes Bash execution faster; measure shell execution separately.
- Run relevant tests and report the exact files changed, commands executed, and any unverified platform-specific behavior.