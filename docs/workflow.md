# Workflow

- **TDD always**: red → green → refactor. Failing test first, watch it fail, minimum code to pass, refactor. No implementation before failing test. Bug fix starts with failing repro test. Untestable (config/docs/pure infra) → state why before proceeding.
- Plan → do → verify → repeat.
- Verify = narrowest relevant check: targeted test / typecheck / lint / build if integration affected.
- **Never claim works without running verification**; can't run → say why.
- Empty output ≠ success.
- Non-zero exit → show tail of full output.
- Filter matching nothing ≠ pass.
- Two failed attempts at same fix → stop, report. No loops.
- One issue/concern per session: ~50 turns or ~60K context → finish issue, fresh session for next. Every turn re-bills prefix; long multi-issue sessions dominate cost.
- Never paste skill body into message; skills load via description.
