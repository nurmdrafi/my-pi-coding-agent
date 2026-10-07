// Unit tests must observe a clean top-level session: the spawning extension
// reads PI_SUBAGENT_* at module scope (SPAWN_TOOLS_GATED, spawn allowlist),
// so a suite launched from inside a spawned subagent — which exports those —
// would otherwise flip tool gating, agent discovery, and error paths.
// Import this module FIRST (static-import side effects run in source order).
for (const key of ["PI_SUBAGENT_NAME", "PI_SUBAGENT_AGENT", "PI_SUBAGENTS", "PI_SUBAGENT_ALLOWED"]) {
	delete process.env[key];
}
