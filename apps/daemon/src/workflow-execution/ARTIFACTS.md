# Durable workflow artifacts

The shared daemon `writeArtifact` callback stores a fixed `artifact` kind. The
author's name is public metadata, not a database classification: `firstHalf.md`,
`README.md`, `readme.md`, and supported path/label names remain unchanged. Names
are case-sensitive. Existing admission, payload, and content limits still apply.
Path-like names are labels; they do not write local files.

The name and content digest still determine the artifact ID and its opaque
`control://<runId>/artifacts/<artifactId>` archive reference. This reference is
neither a local path nor a download endpoint. Serialization, MIME defaults and
explicit MIME values are unchanged. Repeating the same name and bytes returns
the known artifact; different bytes under that name fail without overwriting it.

All durable callers converge on this callback: direct daemon composition and
production PostgreSQL/pg-boss composition, including admitted workflow sources.
The authoring adapter and the separate local CLI journal writer are unchanged.
Other `PostgresControlStore` callers retain their own storage classifications.

Replay reconstructs known artifacts from `workflow.artifact.registered` event
metadata, never from the storage kind. Historical filename-valued kinds remain
readable and are not rewritten. This repair needs no database migration or
backfill and does not weaken the SQL constraints. Deploy the rebuilt daemon
through the normal release process; the worker does not restart the live daemon.
Rolling back leaves both kinds readable, but restores the mixed-case publication
bug for subsequent writes.

An artifact publisher failure now records `workflow.failed` with
`diagnostic: artifact-failed` and an allowlisted `storageCode` (otherwise
`UNKNOWN`). Correlate it with the preceding `phase.failed` event for the phase
name. The existing phase diagnostic itself remains generic. No exception text,
SQL, content, filename, or arbitrary publisher code is added to that failure
payload. Failure to persist the diagnostic itself still follows the existing
delivery error path.

## Observation and recovery boundary

`createDurableWorkflowClient().readWorkflow(runId, afterCursor)` (also exposed by
the daemon) reads state and completed-run artifact metadata.
`PostgresControlStore.events('workflow:' + runId, cursor)` through the authorized
reader returns runtime bindings, phase events and registered artifact metadata,
including artifacts from incomplete runs. Admission metadata uses the distinct
submission stream. These readers do not change execution state.

There is no scoped artifact-byte reader for `control://` in this implementation.
The regression's owner-role row inspection is restricted to its disposable
database and is not an operator recovery API. Existing provider `thread/read`
with `includeTurns: false` can inspect thread metadata; content recovery needs
separate coordinator authority and provenance checks.

For Meadow, the coordinator must preserve the terminal run and use registered
node/thread/turn identity to assess recovery of the already-completed research.
This repair does not inspect original outputs, rerun extraction, retry the
original workflow, or claim its completion. Unregistered research content cannot
be recovered from artifact metadata alone.

## Regression evidence

`@codex/daemon:test-artifact-l1`, `test-artifact-l2`, and `test-artifact-l3` cover
the frozen `CAS-MEADOW-ARTIFACT-R1-GC1` contract. L2 reproduces the original
filename/kind mismatch against migration 002 in a disposable store, proves
rollback and byte/metadata compatibility, and distinguishes differently cased
names. [The physical scenario](artifact-publication.feature) exercises public
workflow submission, real PostgreSQL/pg-boss delivery, service recreation and
replay without model turns. This reproduction does not establish that the
historical SQL exception was logged.
