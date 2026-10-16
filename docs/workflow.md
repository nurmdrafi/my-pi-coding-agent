# Workflow

- TDD always: red → green → refactor. Failing test first, watch it fail, minimum code to pass, refactor. No implementation before a failing test. Bug fix starts with a failing repro test. Untestable (config/docs/pure infra) → state why before proceeding.
- Plan → do → verify → repeat.
- Verify at task completion, not after every single-file edit: scoped lint + tsc on changed files (`eslint <files>`, `tsc --noEmit`; prefix with the repo package manager — `pnpm exec`, `npm run`, per project). Scoped test runs inside the TDD loop are part of red→green; otherwise test once (`npm test -- <file>` / `vitest run <file>`). Never the full suite — husky gates commits automatically. Build only if integration is affected.
- Never claim something works without running verification; can't run → say why.
- Two failed attempts at the same fix → stop, report. No loops.
- One issue/concern per session: ~50 turns or ~60K context → finish the issue, fresh session for the next. Every turn re-bills the prefix; long multi-issue sessions dominate cost. Thresholds: [token-economy.md](token-economy.md).
