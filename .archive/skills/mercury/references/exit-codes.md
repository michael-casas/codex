# Mercury exit codes + JSON envelope (v0.1, DIRECTION §5)

## Exit-code map (total, 0–10)

| Code | Name | Typical source |
|------|------|----------------|
| 0 | SUCCESS | |
| 1 | PARTIAL_FAILURE | some agents launched, one failed (dispatch) |
| 2 | USAGE_ERROR | unknown command/flags (also the pre-implementation stub code) |
| 3 | RUNTIME_ERROR | degraded operations (e.g. cancel with dead listener — still marks CANCELLED) |
| 4 | NOT_FOUND | unknown job id |
| 5 | CONFIG_ERROR | processes.json validation rows, 64-cap, malformed runtimes.toml |
| 6 | PERMISSION_ERROR | unwritable dirs (init) |
| 7 | INTERNAL_ERROR | |
| 8 | TIMEOUT | |
| 9 | DEPENDENCY_ERROR | unknown identifier, unresolved role, depends_on cycle, DRO |
| 10 | SIGNAL | |

## Envelope (`--json` on every command)

```json
{
  "ok": true,
  "error": null,
  "command": "check",
  "timestamp": "2026-07-08T04:54:48.718Z",
  "version": 1,
  "data": { }
}
```

Error form: `ok:false`, `error: {code, name, message, details?, suggestion?}`, `data:null`. Error `code` mirrors the process exit code.

## Load-bearing output tokens (assert these, not whole snapshots)

Strict label `MODEL | runtime` · status words (`created/running/completed/failed/cancelled/LOST`) · counts (`N/M complete`) · flags `⚠ DISCREPANCY`, `⚠ missing` · the DRO pointer string `pi --model opencode-go/<model>`.
