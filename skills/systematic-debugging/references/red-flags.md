# Red flags, partner signals, rationalizations

Calibration for four-phase process — read when caught yourself or human partner sees guessing.

## Red Flags — STOP and Follow Process

Catch yourself thinking:
- "Quick fix for now, investigate later"
- "Just try changing X and see if it works"
- "Add multiple changes, run tests"
- "Skip the test, I'll manually verify"
- "It's probably X, let me fix that"
- "I don't fully understand but this might work"
- "Pattern says X but I'll adapt it differently"
- "Here are the main problems: [fixes without investigation]"
- Proposing solutions before tracing data flow
- "One more fix attempt" (already tried 2+)
- Each fix reveals new problem in different place

**ALL = STOP. Return to Phase 1.**

**3+ fixes failed:** question architecture (SKILL.md Phase 4, step 5)

## Human partner's signals you're doing it wrong

- "Is that not happening?" — assumed without verifying
- "Will it show us...?" — should've added evidence gathering
- "Stop guessing" — proposing fixes without understanding
- "Ultra-think this" — question fundamentals, not just symptoms
- "We're stuck?" (frustrated) — approach not working

**See these → STOP. Phase 1.**

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "Issue is simple, don't need process" | Simple issues have root causes too. Process is fast for simple bugs. |
| "Emergency, no time for process" | Systematic debugging is FASTER than guess-and-check thrashing. |
| "Just try this first, then investigate" | First fix sets the pattern. Do it right from the start. |
| "I'll write test after confirming fix works" | Untested fixes don't stick. Test first proves it. |
| "Multiple fixes at once saves time" | Can't isolate what worked. Causes new bugs. |
| "Reference too long, I'll adapt the pattern" | Partial understanding guarantees bugs. Read it completely. |
| "I see the problem, let me fix it" | Seeing symptoms ≠ understanding root cause. |
| "One more fix attempt" (after 2+ failures) | 3+ failures = architectural problem. Question pattern, don't fix again. |
