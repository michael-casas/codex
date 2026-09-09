# Observer recovery and interrupted bindings

Coordinator review amendment: an older compatibility case accepted another
explicitly identified turn's output when the bound turn was missing. That is now
rejected with WORKFLOW_OUTPUT_MISSING; only ID-less legacy snapshots retain the
fallback. OBS-REVIEW-MISSING-TURN reproduced the false success before correction.
The existing wrong-turn case now asserts rejection rather than unverified success;
other legacy cases retain their assertions. This is an intentional correctness
contract amendment under the Founder-approved Level 1 repair authority.

The observer fails reads while its source is unavailable. It retries only known
connection failures, at 1, 2, and 4 seconds, for at most three recovery attempts.
Listener recovery reconnects before replay. Recovery and late-sequence rewind
rebuild projector context from source sequence zero so a partially ingested event
is not lost behind the projector's sequence guard. Existing event identities and
payload hashes remain immutable. Invalid events, unknown defects, and conflicts
fail closed; no cursor is advanced past a failed write to fabricate health.

Snapshot and wait check observer health before and after repository reads. A fault
that occurs during a read invalidates that result even if recovery finishes before
the read returns. Public errors are JSON with bounded code tokens. HTTP serializes
before writing headers, so an unencodable result can still return an error envelope.

`visibility.diagnostics()` retains the last safe failure after recovery. Structured
`visibility.observer.failure` daemon log records retain its timestamp, stage,
cursor, classification and recovery attempt. They exclude original exceptions,
provider text, credentials and source payloads. Exhaustion leaves reads unavailable
until an operator repairs the cause and restarts/reconstructs the observer. Full
replay costs O(retained source history); it is intentionally conservative.

Bound provider turns reported interrupted or failed produce respectively
`WORKFLOW_TURN_INTERRUPTED` or `WORKFLOW_TURN_FAILED`. Inactive bindings without
output produce `WORKFLOW_OUTPUT_MISSING`. These errors are non-retryable and
non-ambiguous. When the bound turn is present, another turn's output cannot satisfy
it. Legacy output-only snapshots retain their existing compatibility behavior.
The execution daemon's existing terminal handling remains authoritative; this
change creates no new execution retry loop and starts no replacement agent.

## Regression evidence

`@codex/daemon:test-observation-l1`, `test-observation-l2`, and
`test-observation-l3` cover the repair. The physical
[observation-recovery.feature](./observation-recovery.feature) owns L3 behavior.
The L2/L3 driver terminates only its disposable PostgreSQL listener, queries public
HTTP, preserves terminal source history through replay, and verifies database,
role, listener and provider-child cleanup. A credential-free stdio provider fixture
reports an interrupted turn. Adapter permutations are in
`@codex/codex:test-l1-integration`. Normal daemon L1/L2/L3 targets include these
regressions. No paid provider invocation or original workflow replay is required.

## Meadow rollout boundary

The original R3 observer exception was not retained. Its historical cause remains
unknown; synthetic reproductions establish the repaired defects, not attribution
of the old untimed log lines. Supplied metadata establishes that the architecture
turn was interrupted without completion, but does not establish who interrupted it.
R1/R2/R3 workflow histories, identities and retained resources stay unchanged.

After independent review, the coordinator builds/deploys the daemon and Control
plugin from the reviewed revision using the established delivery process. No schema
migration is needed. Rebuild the plugin bundle from gateway source at deployment.
Before any new execution, perform one bounded read-only probe: snapshot and wait
at the retained cursor, allowing the three observer recovery attempts to finish;
verify R3 is terminal failed, or record the explicit fail-closed code and stop.
Inspect timestamped observer failure metadata if degraded. Do not clear conflicts,
change source history, or repeat probes indefinitely.

Rollback redeploys the prior binaries without database rollback. Preserve the new
safe diagnostic logs; the previous observer may again remain latched unavailable.
No R4 or other retry is authorized here. Any future intentional run requires a
separate coordinator authorization after review, deployment, terminal-history and
retained-resource reconciliation. A new authorized run needs a new idempotency key;
old keys remain used terminal identities.
