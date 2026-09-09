# CAS-MEADOW-ARTIFACT-R1 — READY-FOR-REVIEW

Worker stop: READY-FOR-AUDIT. This is implementation evidence, not independent acceptance.

- PR: https://github.com/michael-casas/codex/pull/9
- Branch: `CAS/CAS-BASE_meadow-artifacts` → `CAS/integration`; GitHub delivery remote `github`.
- Product/test candidate: `92364df4a95df37a6c7d74cd88be298e53ce0855` (`fix(daemon): separate artifact names from storage kind`). The subsequent handoff commit changes only evidence and this report; the delivery revision is the PR head.
- Base: `eb28fb541ec24494aa2660f400a301ba327e3cb5`, verified against GitHub before branch creation and publication.

## Repair

The shared durable daemon writer uses the generic `artifact` storage kind while preserving the exact author name. Names remain case-sensitive, with unchanged serialization, MIME, name/content-derived IDs, digests, archive URIs and replay. All durable writer callers converge here; the database store, authoring adapter and local CLI journal are unchanged. No migration, backfill or relaxed constraint is needed.

Artifact publication failures now retain `artifact-failed` and an allowlisted `storageCode` or `UNKNOWN` in the terminal event, without raw SQL, payload, filename or publisher text. The preceding `phase.failed` event retains the phase name; its existing generic diagnostic is unchanged.

## Evidence

Frozen contract: [CAS-MEADOW-ARTIFACT-R1-GC1.json](CAS-MEADOW-ARTIFACT-R1-GC1.json), SHA-256 `10df2560973fd9584018ced3394fd63f64e84142cd672a271901a66d2bcf5baf`. All frozen file hashes remained intact through implementation and commit hooks.

Machine evidence: [CAS-MEADOW-ARTIFACT-R1-EVIDENCE.json](CAS-MEADOW-ARTIFACT-R1-EVIDENCE.json). It records exact commands, native report/log paths and hashes, identities/counts, durations and exit codes.

- Real disposable migration002 reproduction: both `firstHalf.md` and `README.md` kinds rejected with SQLSTATE `23514`, `control_artifact_kind_check`; transaction rollback verified. This does not establish that the historical SQL exception was logged.
- Meaningful RED: 5 L1 failures; 3 L2 failures plus the passing constraint reproduction; 1 L3 scenario failed on completed-state behavior. A separate initial L3 cwd/setup failure was defective RED, repaired and rerun before freeze.
- Focused GREEN: 5 L1 tests, 4 L2 tests, 1 L3 scenario/4 steps. Includes mixed-case/path/label/long names, case-distinct IDs, explicit markdown and default JSON MIME, same-name replay/conflict, historical metadata/bytes, real storage rejection, safe diagnostics and PostgreSQL/pg-boss delivery without model turns.
- Standing daemon: 44 L1 tests; 38 L2 executions including process boot/restart; 8 L3 scenarios. Final daemon aggregate also passed with new regressions registered in its manifest.
- Affected scope: daemon, daemon-e2e, testing. Lint/typecheck/build where exposed, testing aggregate, package-manager policy, test-policy (128 selected), scratchpad lifecycle and commit hooks passed. Bun 1.4.2; standing Codex compatibility tests used the pinned 0.151.0 PATH prefix.
- Lint has no errors and 7 non-null-assertion warnings (3 existing, 4 new test-plumbing warnings). The commit hook emitted an ignored `.agent` restaging warning but completed; no hooks were bypassed and committed files were checked.
- Scoped cleanup query over 87 observed test process IDs found zero remaining fixture databases/roles. One database left by the defective initial L3 setup was explicitly removed; successful tests close their resources. No global before/after inventory was captured, so the cleanup claim is scoped to owned fixtures.

## SQLite checkpoint

`/Users/mcasa_atlantis/.codex/.agent/workspaces/35033329351f57d5bba9191783907ffef8759f829b8021a88632ef554b425545/.agent/sqlite/session-01a0846a-233e-7181-88cf-d6b90ec3480a.db`

Checkpoints 1 and 2 were committed/read back; `PRAGMA integrity_check` returned `ok`. The final delivery checkpoint is appended after publication. The SQLite database and native runtime reports remain outside Git.

## Compatibility, rollout and recovery

See [ARTIFACTS.md](../apps/daemon/src/workflow-execution/ARTIFACTS.md). Historical filename-valued kinds remain readable and are not rewritten. Normal rebuilt-daemon rollout is still required; rollback restores the original mixed-case writing bug while retaining readability.

Safe implementation readers are `readWorkflow(runId, afterCursor)` for state/completed artifacts and the authorized control event reader over `workflow:<runId>` for runtime bindings, phases and registered metadata in incomplete runs. Admission uses its separate submission stream. Provider `thread/read` with `includeTurns: false` can inspect metadata. There is no scoped `control://` byte reader; disposable owner-SQL assertions are not a recovery API.

The coordinator owns recovery of already-completed research through verified node/thread/turn provenance. Unregistered research cannot be recovered from artifact metadata alone. No original outputs were read; no original workflow, extraction or paid model turn was run; no live daemon, database, runtime configuration or project files were changed; no merge occurred. Terminal history remains intact.

Independent verification/judgment, CI disposition and live rollout remain coordinator responsibilities. The coordinator owns the existing Codex Control viewer/monitor; this worker made no additional agent handoff or viewer launch.
