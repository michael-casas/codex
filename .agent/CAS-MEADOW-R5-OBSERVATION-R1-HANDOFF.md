# CAS-MEADOW-R5-OBSERVATION-R1

Status: READY-FOR-REVIEW / READY-FOR-AUDIT, subject to fresh independent verification.
Base: `99b3cf499d1dec25725deb03c6484388efd8e77f`.
Branch: `CAS/CAS-BASE_meadow-r5-observation`; PR target: `CAS/integration`.
No merge, deployment or R6 authority exercised.

## Evidence and limits

The original R5 exception was not retained and remains unknown. Disposable
PostgreSQL fixtures demonstrate two defects: a duplicate source notification
caused 2,100 repeat ingestions, and an actual SQLSTATE 23514 ingestion failure lost
its underlying classification. The repair reduces those duplicate ingestions to
zero and retains safe primary diagnostics. Connection exhaustion, deadlocks and
historical interruption causation remain hypotheses, not attribution.

Recent source suffixes are verified against a bounded 4,096-entry fingerprint map.
Unseen late commits and evicted entries preserve ordered full replay; changed
identities remain permanent conflicts. Recovery retains its three-attempt budget.
The repository connection model and all database history remain unchanged.

`visibility.observer.failure` retains safe `causeCode`, `errorClass`, failing
`sourceCursor`/UUID when available, committed cursor, stage, timestamp and attempt.
Permanent SQL errors fail closed; selected connection/resource/contention failures
use the existing 1/2/4-second budget. Unknown values become `UNKNOWN`/`UnknownError`.
No exception text, SQL, source body, credential or private path is logged.

The source-persistence path is separate from the derived observer. An append
failure reaches the existing provider stop path; a new
`workflow.observation.failure` log retains the safe primary cause before cleanup or
later database writes fail, then rethrows the original error. No agent restart or
new execution retry was added. Typed interrupted-turn and artifact fixes remain.

## Validation

Frozen contract: `.agent/CAS-MEADOW-R5-OBSERVATION-R1-GC1.json`.
Machine evidence: `.agent/CAS-MEADOW-R5-OBSERVATION-R1-EVIDENCE.json` and
`.agent/r5-observation-evidence/`.

- Meaningful RED: eight new L1 cases; one new real PostgreSQL/HTTP case each at L2
  and L3. Locked tests stayed green.
- Focused GREEN: 21 L1 tests, four L2 tests, four physical L3 scenarios.
- Standing daemon L1: 54 passed. Daemon aggregate: 7 unit, 16 in-process,
  25 real-boundary, 8 end-to-end (including process restart), three L3 scenarios.
- Lint, typecheck, build and test-policy passed (128 selected files, 13 targets).
- Synthetic provider only, zero paid model calls, zero subagents, zero production
  reads/writes. Twelve focused fixture databases and 24 owned login roles were
  created/closed across RED, fixture stabilization and GREEN; cleanup assertions
  verify their removal. HTTP listeners stop; provider child exits with zero pending
  requests. Standing fixtures retain their cleanup assertions.

The long-stream fixture exercises lifecycle source rows through the real scoped
source reader and ingestor. Existing standing visibility tests cover typed item
compatibility. Cache eviction and recovery still cost full retained-history replay.
Prettier-only formatting followed freeze; semantic assertions and values stayed
unchanged. Initial fixture timing/compiler setup failures were corrected and are
not counted as meaningful RED.

## Coordinator rollout

After independent review, deploy rebuilt daemon through the established process.
No migration is required. Run one bounded read-only snapshot/wait probe at R5's
retained cursor, allowing at most the existing three recovery attempts. Verify
terminal failed history and retained-resource continuity. If degraded, retain the
first timestamped safe classification and stop. A separately authorized disposable
synthetic stream can exercise deployed storage pressure; do not rerun the original
workload or authorize R6 from this handoff.

Rollback restores previous binaries without database rollback. Preserve source,
derived history and diagnostic logs. The coordinator owns viewer/monitor links;
none was provided to this worker, and no viewer URL is fabricated.

SQLite checkpoint: `.agent/sqlite/session-01a0849e-3889-74d2-9757-b9705bd08ee6.db`;
checkpoint 2 read back and integrity check `ok` before delivery preparation.
