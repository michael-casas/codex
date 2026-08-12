# processes.json — Mercury dispatch manifest (v0.1)

```json
{
  "workflow": "phase-2-auth-feature",
  "goal": "One-line human goal",
  "agents": [
    {
      "id": "researcher-schema",
      "runtime": "pi/opencode-go/deepseek-v4-flash",
      "prompt": "read /abs/path/charter.md and execute exactly as written. Append your final report to /abs/path/report.md as evidence."
    },
    {
      "id": "implementer-api",
      "runtime": "codex/gpt-5.4",
      "prompt": "…",
      "depends_on": ["researcher-schema"]
    }
  ],
  "timeout": 7200,
  "version": 1
}
```

## Fields

- `workflow` — kebab-case job name; becomes part of workspace naming (`mj_<id>-<agent-id>`).
- `goal` — display-only.
- `agents[]` — 1..64 entries (65+ → exit 5, POP cap).
  - `id` — unique per file; used in workspace names and status tables.
  - `runtime` — identifier per the registry (`codex/<model>`, `claude-code/<alias>`, `pi/<provider>/<model>`). Any `opencode/*` → DRO rejection with the pi pointer.
  - `prompt` — the exact text sent to the agent surface. Best practice: path-reference a charter on disk, ≤1 KB prompt.
  - `depends_on` — array of agent ids. Agents with unmet deps are recorded `waiting` (no surface until deps complete). Cycles → validation rejection.
- `timeout` — seconds; the daemon auto-cancels on expiry (`timeout-cancelled` outcome).
- `version` — manifest schema version (1).

## Validation (dispatch step order, load-bearing)

1–3. shape/uniqueness/prompt checks → exit 5 rows
4. identifier resolution against runtimes.toml (unknown → DependencyError 9)
   — EXCEPT `opencode/*`, which DRO-rejects with pointer BEFORE this step
5. depends_on referential + cycle check (toposort) → exit 9
6. charter-path existence (MISSING_CHARTER warning, non-fatal)
7. role bindings
8. 64-cap → exit 5
9. DRO (registry-status deferred entries)

## Canonical fixture

`packages/mercury/src/cli/commands/fixtures/sample-processes.json` (gate-8 fixture, 4 agents incl. a depends_on chain).
