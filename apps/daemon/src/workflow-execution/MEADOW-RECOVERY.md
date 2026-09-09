# Workflow delivery and coordinator ownership

New Control admissions persist the authenticated daemon actor as the owner. The
coordinator is a principal, with no fabricated runtime/thread/session. Delegation
bindings register provider-returned runtime identities; workflow bindings register
the actual host and thread. A session absent from the provider binding remains
absent. The HTTP configuration's shared actor/token identifies one daemon
principal, not distinct authenticated Desktop tasks.

`control:message` is translated only after sender equality and a persisted
coordinator-to-recipient ownership check. The store checks again inside the
message/outbox transaction; a database trigger also protects the legacy submission
function. Historical agents without authoritative ownership fail closed. There is
no automatic adoption or owner backfill. Existing runtime-to-runtime messages
retain their previous contract.

Apply additive `008_coordinator_ownership.sql` after migrations 001–007 before
starting the repaired daemon. It preserves historical rows, adds principal/owner
metadata, and changes the sender foreign key to include coordinator principals.
It is repeatable; compatibility and rollback tests cover retained legacy runtime
messages, reader denial, historical adoption denial and outbox rollback. No live
migration is performed by the worker.

Runtime history is read from `workflow:<runId>`, while admission metadata remains
in its original submission stream. Terminal events are immutable and prevent a
new execution. A new intentional run receives a new idempotency key; a delivery
retry keeps its original run identity. Execution-scoped leases distinguish runs
from the same admitted assignment. Retained leases are recovered only after
checking their exact marker, directories, Git metadata identity and revision.
Foreign or incomplete paths are preserved and rejected. pg-boss remains the only
retry authority. A bound ambiguous runtime retains its workspace for reconciliation;
exhaustion leaves that resource for the operator rather than deleting evidence.

`workflow.execution.attempted` precedes workspace acquisition. Safe setup and
cleanup diagnostic events identify the attempt, stage and allowlisted code.
Cleanup failures are recorded separately and cannot mask an earlier setup error
or change a cancelled/completed result. The visibility projector displays these
codes and operator guidance without raw exception text or private paths.

## Meadow resume

The permitted origin status file reports R2
`workflow_4a092851858c07c3c59dceb226ac04e39d2a2524c3a4838d8617b4bb438b19c5`
terminal failed with `delivery-exhausted`, with no documents exported. The
coordinator reported live terminal verification at cursor 12992; the worker has
not independently refreshed live state.

After independent verification, migration/deployment and reconciliation of retained
resources, submit corrected source intentionally with
`multi-brand-guide-20260908-quiet-meadow-r3`, host `local-demo`, repository
`michael-casas-quiet-meadow-96158642`, and the original authorized selection.
Do not reuse R1/R2 to obtain a new run. Their histories remain terminal, and old
agents do not acquire ownership retroactively. Post-fix R3 admission establishes
ownership for its new agents. No additional Meadow source correction is required
for the already-recorded artifact-input fix. No R1/R2/R3 launch is part of this repair.

## Focused evidence

`test-meadow-l1`, `test-meadow-l2` and `test-meadow-l3` on `@codex/daemon`
exercise frozen regressions and credential-free provider fixtures. L2 uses real
PostgreSQL, pg-boss and disposable Git/filesystem boundaries. L3 uses
[meadow-recovery.feature](./meadow-recovery.feature) directly, with independent
step bindings sharing only the framework-neutral driver. Supplemental compatibility
checks prove workflow admission ownership across delivery and role/outbox guards.
Paid provider dogfood requires separate coordinator admission.
