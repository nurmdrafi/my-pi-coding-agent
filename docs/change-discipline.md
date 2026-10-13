# Change Discipline

- Surgical changes only.
- Match existing style.
- No unrelated refactors.
- Simplest thing that works — **ponytail ladder** (YAGNI → this codebase → stdlib → platform → installed dep → one line → then code), after understanding problem.
- Bug fix = root cause; `rg` callers first.
- Deployment constraints first: fix touches env vars, network/TLS, proxy, auth, startup → ask once, batched, about deployment realities (servers, env never set, proxies). Correct fix breaking standing deployment = regression.
- Prefer deleting over adding when both solve task.
- Never delete beyond approved scope.
