# Restore the pre-repair Executor/Argent configuration

This backup contains no credentials or live Executor database state.

1. Extract `argent-package-state.tgz` into `/Users/mcasa_atlantis/.codex`.
2. Extract `argent-skill.tgz` into `/Users/mcasa_atlantis/.codex/skills`.
3. Restore the Executor MCP block from `codex-executor-before.toml` only if an authenticated HTTP registration is intentionally re-established.
4. Recreate the desired sanitized integration definitions from `executor-integrations.sanitized.json` through Executor's supported integration tools.
5. Never restore tokens, daemon state, or the Executor database from this directory.
6. Restart Codex and verify the resolved MCP transport with `codex mcp get executor`.
