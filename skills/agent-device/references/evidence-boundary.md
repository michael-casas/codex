# Evidence and acceptance boundary

- Treat snapshots, screenshots, recordings, logs, traces, network captures, and performance samples as evidence for the exact observed claim.
- Do not infer rendering, visibility, interaction, or accessibility from API/data proxies.
- Do not infer feature completion from one platform when the contract requires Android, iOS, and/or web separately.
- Prefer semantic selectors for durable replay; coordinates are a bounded fallback after structural inspection fails.
- Reject zero-selection, assertion-free replay, stale builds, stale daemons, and unverified cleanup as completion evidence.
- Run repository-owned tests and task targets through the repository's declared runner, including Nx when applicable.
- Keep implementer evidence distinct from independent verification or judgment.
- Report device, app, session, exact command, exit/result, and artifact paths for material claims.
