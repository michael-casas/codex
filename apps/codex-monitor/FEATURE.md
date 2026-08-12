# App Server timed wake spike

Authority: explicit user request in Codex task
`019f5c8d-41f7-7660-9118-de51a6ed019e` on 2026-08-09 and the research report
`docs/reports/monitor-python-app-server-research-foundation.md`.

## Green Contract

| ID | Form | Layer | Observable GREEN | Meaningful RED | Cleanup |
|---|---|---|---|---|---|
| MON-AS-001 | basic | L1 | State transitions are monotonic and a duplicate terminal dispatch is rejected | transition guard rejects the unimplemented state machine | no process |
| MON-AS-002 | adversarial | L1 | A persisted accepted marker is reconciled before retry and suppresses duplicate submission | reconciliation is unimplemented | no process |
| MON-AS-003 | basic | L2 | A real child JSONL process receives initialize, resume, turn/start, emits terminal completion, and a fresh child read finds the marker | protocol client is unimplemented | both children reaped |
| MON-AS-004 | adversarial | L2 | EOF after possible acceptance is recorded as ambiguous and never blindly retried | ambiguous transport classification is unimplemented | child reaped |
| MON-AS-005 | basic | L3 direct dogfood | A 180-second arm submits exactly one `MONITOR EVENT` marker to the originating task and records accepted, terminal, and persisted milestones | no App Server shim exists | worker and App Server children exit; evidence retained |
| MON-AS-006 | adversarial | L3 human observation | Codex Desktop visibly renders that exact marker in this task after the originating turn has ended | current TypeScript SDK boomerang persisted without reliable Desktop refresh | observation recorded separately; no false success |

Frozen scope: independent stdio App Server only. Attaching to the Desktop-owned
stdio child, installing the managed daemon, production migration, PostgreSQL,
and replacing the canonical monitor are excluded.

