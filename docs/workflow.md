# Workflow

- Plan → do → verify → repeat.
- Verify = narrowest relevant check only: targeted test / typecheck / lint / build when integration is affected.
- **Never claim a change works without running its verification**; if it can't run, say why.
- Empty output is never evidence of success.
- On non-zero exit, show the tail of the full output.
- A filter that matches nothing is not a pass.
- After two failed attempts at the same fix, stop and report — don't loop.
- Never paste a skill's full body into a message; skills load via description only.
