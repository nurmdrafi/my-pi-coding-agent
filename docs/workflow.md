# Workflow

- Plan → do → verify (narrowest relevant check only: targeted test / typecheck / lint / build when integration is affected) → repeat.
- Never claim a change works without running its verification; if it can't run, say why.
- Empty output is never evidence of success: on non-zero exit, show the tail of the full output; a filter that matches nothing is not a pass.
- After two failed attempts at the same fix, stop and report — don't loop.
- Never paste a skill's full body into a message; skills load via description only.
