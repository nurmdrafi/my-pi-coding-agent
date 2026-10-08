<!-- handoff | goal: session summary | source: /home/nurmdrafi/.pi/agent/sessions/--home-nurmdrafi-.pi-agent--/2026-10-08T14-53-01-303Z_01a11c00-ddf5-7110-b095-f111370267fb.jsonl | 2026-10-08T15:06:33.232Z -->

## Context

Working in the pi coding-agent harness repo `~/.pi/agent`. Session findings:

- User's overall goal: **reduce token usage, keep the harness minimal, no performance loss.**
- No `autoresearch` skill exists; closest are `harness-engineer` (manual-only, has measurement scripts) and `session-audit`. Decision pending: A (new thin autoresearch skill) / B (make harness-engineer auto-invocable) / C (B + autoresearch loop section) — assistant recommended C, user never picked.
- Diagnosed token jump 22k→46k from this session's own usage log (`sessions/--home-nurmdrafi-.pi-agent--/2026-10-08T14-53-01-303Z_*.jsonl`, usage is at `.message.usage`): caused by (1) mid-session skill-body injections (web-search, session-audit) busting the provider cache → entire prefix re-sent uncached, (2) injected skill bodies staying in transcript forever, (3) assistant over-exploration. **Not** caused by the AGENTS.md edit (cacheRead stayed high after it).
- Two rules already added to `~/.pi/agent/AGENTS.md`: an "ask-first default" bullet under Clarity First (no tool calls without user OK; explicit instruction approves only the named action), and a cache rule under Token Economy (batch skill loads/prefix edits at session boundaries).
- User is frustrated by unrequested tool calls and token burn — **ask before any non-trivial action; keep replies and tool use minimal.**
- Attempted subagent spawn (`agent: "researcher"`, name "Researcher") failed: pi's subagent feature uses tmux `list-panes -f` (needs tmux ≥ 3.4); machine has **tmux 3.0a**. The subagent's research task (find exact solution for skill-injection cache busts; check pi docs at `/home/nurmdrafi/.nvm/versions/node/v24.21.0/lib/node_modules/@earendil-works/pi-coding-agent/docs`) is still pending.

## Task

User said **"upgrade"** — upgrade tmux to ≥ 3.4 so pi subagents work, then retry the Researcher subagent spawn with the pending research task. Steps:

1. Check distro/package sources (likely Ubuntu; apt may only offer 3.0a — may need building from source or a newer repo). Present plan and cost before installing; system installs need explicit user approval.
2. Verify with `tmux -V` after install.
3. Retry subagent: `agent="researcher"`, `name="Researcher"`, cwd `/home/nurmdrafi/.pi/agent`, task = find the exact solution for skill-injection cache busts (how pi injects skills — system prompt vs user message; cache-friendly alternatives; cheapest mechanism for big rarely-needed instructions; cite docs/source). Research only, no code changes.

## Note

This new session starts at the fresh ~22k floor without the previous session's dead weight (46k context + injected skill bodies).
