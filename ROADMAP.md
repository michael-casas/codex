# Codex Orchestration Framework — Roadmap

**Status:** Accepted · Layer 4 capability sequencing frozen for PHASE and DAG lowering
**Date:** 2026-07-15
**Input authority:** Accepted distributed `packages/<domain>/src/FEATURES.md`
**Role authority:** Agent Wiki `orchestration/ROLES.md`
**Next lowering:** One goal-run tranche → PHASE briefs → orchestration DAGs with task IDs, write surfaces, assignments, and validators

**Verdict (2026-07-15, Founder):** Deliver V1 through two construction goal runs and one conditional seal goal run. Each goal run is an Orchestrator-led DAG containing waves and at least four active lanes on every work-bearing wave. Build reusable product and acceptance foundations first, pipeline test-contract authorship ahead of implementation and Preflight behind it, make Preflight proof sufficient for deterministic execution evidence, and spend T5 judgment on exhaustive semantic audit. One complete first judgment compiles all wave findings into a single tier-escalated retry DAG. If Judgment Attempt 2 remains blocked, the original Judge and a second T5 agent may perform bounded Purity Recovery; a fresh successor T5 execution alone may issue the final gavel.

## Roadmap Law

- A **goal run** is one orchestrated campaign with its own DAG, waves, lanes, evidence, retry, and closure—not one Worker assignment.
- This roadmap sequences accepted capabilities. It does not compile task IDs, exact write surfaces, source files, table schemas, commands, or agent prompts.
- Ground-0 is a committed foundation and must pass its uncached closure before implementation DAG compilation.
- A work-bearing wave maintains at least four active lanes. Activation, dependency-join, failed-only-repair, and gavel-only waves may be narrower.
- The planner must reject unnecessary serialization. Fewer than four safe lanes requires a dependency-backed parallelism waiver naming the blocking cut, write conflicts, unused ready work, and next unlock.
- Model tier is a portable capability and cost class. Role and assignment—not tier or provider—grant authority.
- A campaign profile maps available runtimes and models to tiers. The roadmap does not prescribe a provider.
- Every construction lane stops at `READY-FOR-AUDIT`; no implementer certifies its own work.

## Current Baseline

Ground-0 implementation was established at revision `1eea780`. The canonical planning baseline is the commit containing this roadmap, the accepted PRD/domain/feature IR, the compiled BATDD profile, and the repository router. The workspace currently registers the testing harness plus generated daemon and daemon-e2e scaffolds. The daemon name is not architecture. The accepted production domains remain documentation-only until deliberately generated as independent Nx projects at `packages/<domain>`.

The accepted feature graph contains 81 core and 3 optional capabilities with no dependency cycles. The atomic graph has a 20-level theoretical critical path, but adjacent dependencies are intentionally bundled into acceptance-sized lanes inside three campaign-scale goal runs.

## Portable Capability Tiers

| Tier | Capability class                | Default work shape                                                                                                          |
| ---- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| T0   | Research and flagging           | Read-only pre-DAG reconnaissance, source mapping, dependency discovery, risk flags, and evidence-grounded research fan-out  |
| T1   | Mechanical execution            | Deterministic transforms, generated projections, formatting, inventory, and other low-ambiguity work under exact validators |
| T2   | Narrow bounded execution        | Package scaffolding, small isolated changes, mechanical repairs, and fresh deterministic Preflight                          |
| T3   | Specialist execution            | Bounded L1/L2/L3 test-contract authorship, harness work, and medium-complexity specialist tasks                             |
| T4   | Senior integration              | Core implementation, reducer/database/runtime seams, cross-package integration, and failed-only remediation                 |
| T5   | Frontier reasoning and judgment | Exhaustive adversarial audit, architecture and security review, final judgment, and exceptional Purity Recovery             |

The versioned campaign profile maps evaluated runtimes, models, reasoning levels, and providers to these tiers. This roadmap deliberately contains no model prescription. T1 remains explicit even when the initial profile leaves it unassigned.

Initial capacity ceilings are one T0 researcher orchestrator with at most ten read-only research subagents, four T2 seats, two T3 seats, three T4 seats, and two T5 seats. The Orchestrator is a role outside Worker-tier occupancy unless a campaign profile explicitly says otherwise.

## Rolling Squad Pipeline

Construction goal runs overlap different acceptance slices without violating RED/GREEN order inside a slice:

```text
T0 research       -> maps and flags future slices
T3 test authors   -> write and freeze RED for slice N+1
T4 implementers   -> drive frozen slice N to GREEN
T2 Preflight      -> proves completed slice N-1 independently
T5 audit/Judge    -> wakes only at declared wave decision boundaries
```

The normal construction floor is two T3 test-contract lanes plus at least two T2/T4 scaffolding or implementation lanes. After the reusable substrate exists, the nominal width is six lanes and the safe ceiling is eight. The eleven-seat Worker pool is a capacity ceiling, not an occupancy requirement.

A T3 assignment must be test-focused, bounded to one coherent acceptance slice, checkpoint proof after each declared layer, and stop at contract freeze. It must not become the serial owner of an entire phase or consume its rolling provider window on broad implementation and integration repair.

## Goal Run A — Durable Foundation

**Goal:** Produce a sealed, independently preflighted control-plane foundation that makes runtime planes safe to implement in parallel.

**Dependencies:** Ground-0 uncached closure and accepted Layer 1–3 documents.

**Capability tranche:**

- `SHR-001` through `SHR-005`;
- `BND-001` through `BND-007`;
- `AUTH-001` through `AUTH-006`;
- `PROC-001` through `PROC-010`;
- `DB-001` through `DB-008`;
- `TST-001` through `TST-004`.

**Indicative capability waves:**

1. **Activation and reusable kernel:** Ratify Ground-0, register independent domain projects, and establish shared, boundary-error, and reusable acceptance foundations.
2. **Authority and identity spine:** Establish role/capability identity, immutable campaign definitions, DAG validation, assignment envelopes, and initial database topology.
3. **Event and state spine:** Establish idempotent events, deterministic reduction, persistence ports, database roles, migration parity, and guarded reset.
4. **Evidence and durability:** Establish admission, evidence, verdict independence, transactional sequencing, pg-boss isolation, reconciliation persistence, failed-only repair, and terminal projections.
5. **Foundation closure when required:** Close integration findings without reopening sealed contracts, then produce fresh proof-carrying Preflight and one foundation verdict.

**Parallelism dividend:** Goal Run B can fan out against stable public contracts, real database fixtures, attributed errors, frozen authority, and deterministic event/state semantics instead of rebuilding them per lane.

**Agent-speed forecast:** Four to six internal waves, normally four to six active lanes, approximately 6–14 continuous elapsed agent-hours when provider and local infrastructure remain available.

**Milestone:** `FOUNDATION-SEALED`—all Goal A capabilities are independently preflighted, source and test surfaces are frozen at the accepted baseline, and Goal B may consume them without implicit amendment.

## Goal Run B — Runtime, Integration, and Dogfood

**Goal:** Build the complete event-driven execution, delivery, wake, recovery, and two-workspace acceptance surface on the sealed foundation.

**Dependencies:** `FOUNDATION-SEALED`.

**Capability tranche:**

- `DEL-001` through `DEL-007`;
- `CDX-001` through `CDX-008`;
- `TX-001` through `TX-011`;
- `MON-001` through `MON-009`;
- `TST-005` through `TST-010`.

**Indicative capability waves:**

1. **Execution-plane contracts:** Fan out pg-boss policy, Codex runtime identity, direct-tmux transport, routing manifests, workflow-neutral fixtures, and monitor condition contracts.
2. **Physical delivery and launch:** Prove delayed delivery, claims, leases, exact Codex launch, scoped pane identity, prompt acknowledgement, hook trust, and real database/runtime fixtures.
3. **Recovery and reconciliation:** Prove delivery reaping, idempotent consumption, hook spooling and quarantine, tmux cancellation and restart reconciliation, durable monitor cursors, and query-arm-requery safety.
4. **Hierarchical control:** Prove logical projections, any/all aggregation, hierarchical waits, active pending-tool continuation, timeouts, cleanup, and delivery-versus-semantic-retry separation.
5. **Composition decision:** Select and compose the narrow CLI, MCP, persistent-host, and local-IPC surfaces required by dogfood without treating the generated daemon scaffold as authority.
6. **Two-workspace dogfood:** Exercise workflow-neutral orchestration, failed-only repair, killed resources, missing hooks, restart, judgment readiness, generated closeout, and zero resource delta across two real repositories.
7. **Release-candidate closure when required:** Resolve dogfood findings through affected-only repair and fresh proof-carrying Preflight.

**Parallelism dividend:** Delivery, Codex, transport, monitor, testing, and composition lanes run concurrently once their explicit provider features clear. Each runtime lane owns applicable RED/GREEN and cleanup evidence rather than depending on one late integration suite.

**Agent-speed forecast:** Five to seven internal waves, normally six active lanes with a safe ceiling of eight, approximately 10–22 continuous elapsed agent-hours when live-boundary retries remain bounded.

**Milestone:** `RELEASE-CANDIDATE`—all 81 core features have implementation evidence, two-workspace dogfood has completed, fresh Preflight proof matches current disk, and the candidate is ready for the T5 Seal Goal.

## Goal Run C — T5 Seal

**Goal:** Convert the release candidate into an independently audited acceptance or a complete, bounded path to purity.

**Dependencies:** `RELEASE-CANDIDATE` and fresh reducer-approved Preflight proof.

**Nominal audit wave:**

- one T5 adversarial systems audit lane;
- one T5 Judge-owned full-wave audit lane;
- one fresh T2 complete deterministic Preflight lane;
- one T4 code-quality, security, authority, and maintainability lane.

### Judgment Attempt 1 — complete purity audit

The Judge consumes immutable Preflight proof rather than reenacting the deterministic standing suite. It uses maximum reasoning to inspect every lane, touched surface, accepted feature, test, assertion, integration seam, and false-green risk. It continues after findings and emits one complete audit manifest containing every lane disposition, cross-lane finding, decisive evidence, additive adversarial RED case, frozen green, permitted repair surface, required validator, dependency edge, and tier escalation.

An adversarial test may expose already accepted behavior; it may not invent new product intent. New intent returns to the Founder rather than entering a retry charter.

### Single pass to purity — retry DAG

A blocked Attempt 1 compiles into one parallel, lane-preserving retry DAG. The lane identity persists while a fresh execution receives the immutable charter and escalates by capability:

- T2 test or harness work → T3;
- T2 scaffolding or product work → T4 because T3 remains test-specialized;
- T3 test-contract work → T4;
- T4 implementation → the available T5 remediation seat;
- invalid Preflight proof → a fresh T2 Preflight execution, not a product retry;
- cross-lane integration → a fresh T4 integration lane or T5 when critical authority boundaries are involved.

After repair, fresh T2 Preflight registers proof over the exact candidate. The Judge dispositions every original finding, audits the semantic delta and adversarial cases, and issues Judgment Attempt 2.

### Conditional T5 Purity Recovery

If Attempt 2 remains blocked, the original Judge transitions irreversibly to Judge-Remediator and joins the second T5 agent in a bounded cleanup wave. They receive disjoint or serialized repair surfaces, preserve every finding, and drive the existing plus Judge-authored RED cases to deterministic GREEN.

Purity Recovery is a closed-world repair boundary. Its immutable scope is the union of the wave's accepted feature IDs, frozen contracts, touched package and integration seams, registered findings, and already authorized write surfaces. T5 remediators may improve those existing seams and add adversarial proof for already accepted behavior, but they MUST NOT introduce a new feature, behavior, package, application, service, transport, domain dependency, DAG edge, infrastructure surface, or previously unauthorized write surface. A finding that cannot be closed inside that boundary stops recovery and escalates to the Founder for a new amendment or future wave.

Both agents lose final judgment authority for those repairs. After they stop and fresh T2 Preflight proof closes, a new T5 execution starts in fresh context as successor Judge. The successor alone may issue the final gavel. A remaining block escalates to the Founder with the complete ledger rather than permitting self-certification.

**Agent-speed forecast:** Two nominal waves when Attempt 1 approves; up to four waves when retry or Purity Recovery activates; approximately 4–12 continuous elapsed agent-hours.

**Milestone:** `V1-ACCEPTED`, `V1-BLOCKED`, or `FOUNDER-ESCALATION` with immutable evidence and exactly one final gavel.

## Proof-Carrying Preflight

Preflight is an independent T2 role, not the lane’s self-report. A T2 that mutated a slice cannot Preflight that slice. The proof bundle must bind exact revisions and current disk to uncached Nx selection, commands, runtimes, exit status, selected test identities, machine-readable L1/L2/L3 artifacts, database and migration results, and before/after inventories for Docker, PostgreSQL, pg-boss, tmux, processes, ports, worktrees, files, and credentials.

Valid proof ends with registered hashes, execution identity, cleanup evidence, and confirmation that the candidate did not change afterward. Missing, stale, cached, zero-collector, inconsistent, or revision-mismatched proof returns `PREFLIGHT-INVALID` to the Orchestrator. The Judge may reproduce a blocker or perform targeted adversarial checks but does not spend T5 context rerunning a valid deterministic suite.

## Anti-Conservative Planner Gate

Before a goal DAG is accepted, the planner must prove:

- at least four active lanes on every work-bearing wave;
- no two same-wave lanes own overlapping write surfaces or uncoordinated migrations;
- no ready independent capability is serialized behind an overloaded lane while an eligible seat is unused;
- T3 test work is bounded and distributed across both available specialist seats;
- T2 Preflight identities remain fresh for their subjects;
- at least one T4 seat remains available for integration or failed-only remediation when the wave risk requires it;
- T5 capacity is preserved for audit, judgment, and conditional recovery rather than routine implementation;
- failed work retries at the smallest affected lane rather than regenerating a wave;
- activation, join, repair, or gavel waves narrower than four carry an explicit parallelism waiver.

The downstream DAG compiler must emit a capacity-allocation projection and dependency-backed reason for every unused eligible tier. Under-utilization without proof is a planning failure.

## Optional Capability Policy

The optional capabilities `DB-101`, `CDX-101`, and `MON-101` remain outside the V1 critical path. They may enter Goal Run B only when they remove a demonstrated dogfood blocker without delaying core closure; otherwise they follow `V1-ACCEPTED` as hardening work.

## Critical Risks and Controls

| Risk                                    | Control                                                                                                                    |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Conservative DAG overloads a few agents | Four-lane floor, capacity-allocation proof, lane-hoarding rejection, and T0 candidate-parallelism research                 |
| T3 rolling-window exhaustion            | Test-only bounded charters, two-seat distribution, contract-freeze stop, and rolling pipeline into T4 GREEN                |
| Shared becomes a god-package            | Every shared addition names multiple consumers and remains free of domain policy                                           |
| Boundary errors become retry policy     | Boundary preserves provenance and hints; process and delivery retain decision authority                                    |
| Preflight remains a prose claim         | Immutable machine artifacts, exact revisions, selected counts, resource deltas, and reducer approval                       |
| Judge repeats deterministic work        | Valid Preflight proof satisfies execution evidence; Judge spends reasoning on semantic completeness and false-green attack |
| Judge drip-feeds defects across retries | Attempt 1 must audit every lane and surface and emit one exhaustive retry DAG                                              |
| Tier escalation violates specialization | Escalate the lane execution through the routing matrix; skip T3 for non-test product repair                                |
| T5 cleanup expands the wave             | Freeze recovery to existing wave seams, findings, contracts, and write surfaces; expansion requires Founder amendment      |
| Judge implements and self-certifies     | Judge-Remediator loses gavel authority; a fresh successor T5 is mandatory                                                  |
| Parallel runtime tests leak resources   | Guaranteed fixture ownership, before/after inventories, and affected cleanup gates                                         |
| Generated daemon becomes architecture   | Composition remains an explicit Goal B decision over domain contracts                                                      |
| Public-product claims outrun evidence   | Plugin distribution remains deferred beyond repeated dogfood and V1 acceptance                                             |

## Overall Agent-Speed Forecast

The planned V1 path is three campaign-scale goal runs, approximately 11–17 construction and seal waves, and 20–48 continuous elapsed agent-hours under the declared squad capacity. The forecast assumes sustained autonomous execution, four-or-more work lanes, bounded provider availability, and task-level rather than wave-level retry. It is an orchestration throughput range, not a human staffing estimate or delivery guarantee.

## Open Decision Gates

**OPEN:** Which two repositories form the first two-workspace dogfood?

**OPEN:** Which narrow CLI, MCP, persistent-host, and local-IPC composition is required for that dogfood?

**OPEN:** Which current runtime, if any, is evaluated and admitted as T1 for the first campaign profile?

## Layer Boundary

This roadmap freezes capability order, campaign-scale goal runs, milestones, parallelism policy, and risk posture. It does not assign task IDs, exact files, branches, worktrees, prompts, database schemas, CLI commands, or concrete DAG edges. Those belong to PHASE briefs and the orchestration-DAG compiler.
