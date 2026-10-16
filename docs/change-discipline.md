# Change Discipline

- Simplest thing that works — ponytail ladder: YAGNI → this codebase → stdlib → platform → installed dep → one line → code. Understand the problem first.
- Bug fix = root cause; `rg` the callers first.
- Deployment constraints first: fix touches env vars, network/TLS, proxy, auth or startup → ask once, batched, about deployment realities (servers, env never set, proxies). A correct fix that breaks a standing deployment is a regression.
- Addition and deletion both solve the task → prefer deletion.
- Never delete beyond approved scope.
