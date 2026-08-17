# Preflight and lifecycle

Read once per session before the first Argent operation or `argent` CLI command. Do not repeat a healthy preflight before every call.

## Availability and version

1. Confirm Executor is available through its stdio MCP registration and discover the required operation under `argent_canonical`.
2. Reject duplicate or degraded legacy Argent integrations as non-canonical; do not route calls through them.
3. Resolve the pinned `argent` CLI only when CLI work is required.
4. For version-sensitive behavior, capture `argent --version`. Use `argent --help` or command-specific help before guessing an unfamiliar CLI form.
5. Treat absent integration or CLI as an expected environment state. Report the missing boundary once and stop any workflow whose required evidence depends on it. Do not install, initialize, enable flags, or change configuration without user authority.

Do not use the quarantined raw installer commands as current installation guidance; version and package-manager policy may have changed.

## Device selection

List devices before booting, running, or interacting.

1. Honor an explicitly named platform or device.
2. Otherwise prefer an already-running compatible target.
3. If none is running, inspect the project to determine supported platforms before booting. Do not depend on the removed `argent-environment-inspector`; read repository instructions, resolved workspace configuration, app folders, and declared targets.
4. Inspect `platform`, state, and `runtimeKind`. Route TV targets to the TV reference and Chromium targets to the Chromium-capable interaction surface.

## Shared-service cleanup

Track every device and logical debugger identity used during the session. At an authorized session end, scope simulator-server teardown to those exact identifiers. Never issue an unscoped machine-wide teardown as routine cleanup because the server may be shared with other agents.

If Metro was started outside this workflow, ask before stopping it and specify the resolved port. Do not stop user-owned running targets merely because the current task is complete.

Provenance: curated from the quarantined Argent developer instructions. Direct `mcp__argent__*` detection and the missing environment-inspector/subagent contract were replaced by Executor discovery and repository inspection.
