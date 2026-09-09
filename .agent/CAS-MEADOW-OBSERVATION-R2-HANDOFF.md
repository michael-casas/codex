# CAS-MEADOW-OBSERVATION-R2

Status: READY-FOR-REVIEW (worker stop boundary: READY-FOR-AUDIT).
The worker does not certify acceptance. Coordinator owns independent review,
merge, deployment, viewer and any origin continuation.

PR: https://github.com/michael-casas/codex/pull/8 into `CAS/integration`.
Product/test head: `2bfde8e07ed913b8b8d89dbf84340fff3fa1963f`.
The closeout commit changes evidence/handoff only; its exact delivery head is
recorded in the final SQLite checkpoint and worker response. GitHub CI is running
and is not claimed green. No merge or deployment was performed.

## Demonstrated causes and scope

The observer permanently latched source/listener errors and stopped scheduling.
Its stateful projector also advanced before ingestion completed, so a naive retry
could skip the failed observation; sequence rewind suppressed identity conflicts.
Recovery now rebuilds projection context in source order and preserves immutable
conflict rejection. Known connection failures receive three observation-only
recovery attempts at 1/2/4 seconds. Permanent invalid/conflicting/unknown failures
stay visible and fail closed. Reads check health both before and after I/O.
Timestamped, redacted failure metadata is retained in diagnostics and daemon logs.

HTTP committed headers before serialization, producing an invalid/dropped response
for an unencodable result. It now serializes first. HTTP and MCP restrict public
error-code text. Bound interrupted/failed/missing-output reconciliation previously
threw generic errors or borrowed another turn's output. It now emits terminal,
non-ambiguous, non-retryable codes without starting a replacement agent. The
existing pg-boss execution retry and terminal guards remain unchanged.

Historical observer cause remains UNKNOWN. No timing attribution is claimed for
old conflict log lines. Coordinator-supplied architecture metadata identifies an
interrupted turn without completion; the synthetic protocol fixture proves the
adapter path, not who interrupted it. No original rollout/transcript/body was read.

Owned changes are in daemon visibility/tests/docs, the Codex workflow adapter,
database source listener, and control-gateway error handling. There is no migration.
The build-generated plugin bundle was returned to its original content; the
coordinator must rebuild packaging from source during deployment.

## Evidence

GC1: `.agent/CAS-MEADOW-OBSERVATION-R2-GC1.json`, frozen SHA-256
`ac6c9f7d716e7365b68a2c5374267e8ad8f8b7052e782d92c981fb71bc4b2fdf`.
Native logs/reports and hashes: `.agent/CAS-MEADOW-OBSERVATION-R2-EVIDENCE.json`
and the retained `.agent/observation-evidence/` directory in this lease.
Formatting and fixture-import/cleanup plumbing preserve frozen semantics.

- RED: six observer rows, three adapter rows, three L2 tests and three L3 assertion
  failures. One observer replay characterization was already green.
- GREEN: observer L1 7, adapter L1 25, L2 3, physical-Gherkin L3 3 scenarios.
- Standing: daemon L1 32 before integrating new rows, legacy visibility L2 3,
  database L2 13. The affected L1 closure executes 244 tests over its selected suites.
- Nx selected 12 affected projects for lint, typecheck, build and L1. All except
  initial fixture-import lint passed; the import was corrected and lint rerun green.
- The commit hook's staged affected validation task completed successfully. Its
  artifact-restaging step warned about newly force-added ignored `.agent` evidence;
  Git exited zero and the committed evidence was verified. No hook was bypassed.
- Real L2/L3 boundaries: disposable PostgreSQL listener termination/reconnection,
  public HTTP errors/recovery, immutable source history and projection replay,
  controlled stdio interrupted turn, no replacement start, provider-child cleanup.
- Resource checks cover removed fixture databases/roles, matching listener close
  counts, exited provider child, zero pending requests and HTTP shutdown. One
  database left by an early L3 working-directory setup failure was explicitly
  removed by its exact owned test PID/name. No production resources were changed.

Bun 1.4.2 was used. Standing CLI gates use the charter's Codex 0.151.0 PATH prefix.
No paid test, original workflow replay, subagent, live restart or deployment occurred.
The existing untracked `.codex-workspace-lease.json` is preserved and unstaged.

SQLite checkpoint (ignored and uncommitted):
`.agent/sqlite/session-01a08428-aae8-7071-b8f3-18b69ab301a8.db`.
The global absolute initializer was used; checkpoints were committed, read back,
and passed `PRAGMA integrity_check`.

## Review, rollout and retry boundary

Review the source and frozen assertions independently. Full replay is O(retained
source history); genuine replay conflicts intentionally keep observation offline.
Legacy output-only provider snapshots retain their existing compatibility behavior.
Unknown errors are not treated as transient provider outages.

After review, coordinator builds/deploys daemon and Control plugin from the exact
reviewed head. No database migration or history rewrite is required. Run one bounded
read-only snapshot/wait probe at the retained cursor; allow the three observer
recovery attempts to finish. Expect R3 terminal failed, or capture the explicit
fail-closed code and timestamped diagnostic and stop. Never clear conflicts blindly.
Rollback redeploys prior binaries, preserving logs and data; previous observer
latching behavior may return. See `apps/daemon/src/visibility/OBSERVATION-RECOVERY.md`.

No R4 authorization exists. R1/R2/R3 remain used terminal keys. Any new intentional
run requires separate coordinator authorization after deployment, independent
review and retained-resource reconciliation, and must use a new idempotency key.
Do not replay the original workflow or restart its old interrupted binding here.

The coordinator owns the existing degraded Codex Control viewer. No viewer URL was
supplied or independently verified by this worker; no new handoff/agent was launched.
