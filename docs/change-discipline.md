# Change Discipline

- Surgical changes only. Match existing style. No unrelated refactors.
- Simplest thing that works — **ponytail ladder** (YAGNI → this codebase → stdlib → platform → installed dep → one line → only then code), after understanding the problem.
- Bug fix = root cause; `rg` callers first.
- Prefer deleting over adding when both solve the task — but never delete beyond the approved scope.
