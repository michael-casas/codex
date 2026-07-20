# Mercury lifecycle semantics (v0.1)

## Listener (one per job — POP)

- `dispatch` forks ONE detached listener; pid at `.mercury/listeners/<job>/pid`.
- Subscribes `cmux events --name agent.hook.Stop --reconnect --cursor-file <f>`.
- **Terminal rule:** event `payload.tool_name` null/empty → agent COMPLETE. Non-empty (e.g. `"Bash"`) → intermediate, SKIP. This is the entire completion oracle.
- Cursor file advances per processed event (crash-resume safe).
- Listener never reasons: no retry, no re-dispatch, no verdicts. A failing hook does NOT change status (negative scenario asserted in the suite).

## Daemon / fallback

- `--timeout` from processes.json: daemon auto-cancels expired jobs (`timeout-cancelled`).
- Dead-pid check: listener pid gone → job marked LOST. `check` shows `LOST (n/m complete)`.
- Scrollback/pipe-pane is a FLAGGED fallback only — `agent.hook.Stop` is primary. codex/claude-code runtimes (no pi hooks extension) trigger the dispatch-time WARN path.

## State machine (SQLite `.mercury/mercury.db`)

- jobs: `created → running → completed | failed | cancelled | LOST`
- agents: `dispatched | waiting → running → completed | failed | cancelled`
- `waiting` agents (unmet depends_on) hold no surface; unblock on dependency completion.
- Counters: `jobs.completed_agents/failed_agents` stay consistent under partial completion.
- Store is the ONLY writer module; commands consume read-only query helpers.
- Cancel contract: marks CANCELLED even degraded (dead listener → exit 3; never-launched jobs included).

## Callback protocol (read side — CALLBACK-1/2)

- `agent-callback.jsonl` five-kind discriminated union: `artifact_written | validator_ran | scope_check | escalate | self_report`.
- Reader is a pure witness: tail-watch ≤500ms, NEVER mutates, never validates content.
- DISCREPANCY rule: callback claims vs observed state mismatch → `⚠ DISCREPANCY` rendered by check/report/log. Mercury flags; the ORCHESTRATOR judges.

## Known v0.1 gaps

- `surface_number` persisted null → cancel can't auto-close surfaces; sweep `mj_<job>-*` workspaces manually post-cancel.
- L3/BATDD acceptance lives in-repo (`packages/mercury/src/acceptance/`); `FEATURE.md → .feature` extraction is manual (interim `mercury.feature`).
