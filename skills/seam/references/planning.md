# Seam Planning and Orchestration

Use after classification when designing work, dependencies, roles, or a seam
DAG.

## Plan one seam

A compact executable seam plan contains:

```text
Stable seam ID and outcome
Problem statement
Source authority/constraints
Interface: inputs, outputs, invariants, errors, ordering, effects, cleanup
Callers and adapters
Deletion/variation result
Entry and re-entry dependencies
Authorized and read-only surfaces
Basic and adversarial RED -> GREEN or refactor characterization
Phase roles, artifacts, and terminal states
Validation/resource checks
Commit/checkpoint policy
Final stop boundary
```

Do not duplicate the full product specification into the work plan. Keep
acceptance authoritative at its source and orchestration focused on sequencing,
ownership, and evidence.

## Three-phase architecture

### Phase 1 — Base Foundation

One owner defines and implements the thinnest complete vertical slice:

1. hydrate authority, current code, callers, graph, and dirty provenance;
2. define the interface and dependency blockers;
3. design basic success/rejection and adversarial disproof;
4. demonstrate meaningful failing behavior for new work, or characterization
   for a pure refactor;
5. freeze observable behavior before implementation;
6. implement the smallest complete solution;
7. run affected checks and cleanup;
8. publish `BASE_READY` or an exact dependency halt;
9. stop without self-auditing or self-accepting.

If commits are available and authorized, the orchestrator creates one scoped
Base commit. Otherwise record an immutable candidate/checkpoint.

### Phase 2 — Code Quality and QA

Use two independent read-only perspectives when the environment supports it:

- **Code Quality:** interface depth, change vector, callers, dependencies,
  correctness, errors, security/privacy, cleanup, unnecessary code, naming and
  locality.
- **QA:** public behavior, negative paths, real boundaries, UI/device/browser
  interaction when relevant, resource cleanup, and false-green resistance.

Join their reports into one candidate-bound packet with stable finding IDs,
evidence, impact, smallest repair, and exact verifier. Auditors do not fix.

If independent agents are unavailable, execute the checks serially and state
that organizational independence remains unproven.

### Phase 3 — Final Polish

Reuse the Base owner when practical, but reset/compact its context and provide
one closed audit envelope. The owner:

1. maps every finding to a reproduction/characterization check;
2. preserves frozen behavior and locked greens;
3. fixes the root cause inside the authorized seam;
4. runs affected checks and cleanup;
5. stops for bounded independent delta verification.

Remaining blockers halt the seam. Do not automatically fan out retries.

If authorized, create one final seam commit and any required version/change
record. Push/publication remains a separate permission.

## Dependency halt and re-entry

Halt before guessing, stubbing, or weakening behavior. Record:

```text
seam/candidate
missing interface/fact/capability
owner
evidence
completed locked work
resume condition
next check/command
resource/no-write state
```

The same owner should re-enter after the dependency is accepted. Supply the new
predecessor interface/checkpoint and resume the locked plan. Do not restart
research or create a replacement worker without a real reason.

A dependency halt is not failure, completion, or retry consumption.

## Build a seam DAG

For each seam record:

- stable ID and outcome;
- entry dependencies;
- re-entry dependencies;
- interface and adapters;
- write/composition ownership;
- blockers/external checkpoints;
- required test/QA surfaces;
- phase terminal states;
- commit/checkpoint and stall policy.

Keep the graph acyclic. Validate that every accepted behavior appears once,
dependencies name real interfaces, and no same-time writer overlaps shared
roots.

## Concurrency

Parallelism is earned, not mandatory:

- run concurrently only with disjoint current write surfaces and composition
  roots;
- allow package-local prefix work before predecessors finish;
- halt integration at the dependency seam;
- assign one writer to each lockfile, migration authority, generated source,
  root config, and application composition root;
- do not create artificial lanes to fill capacity.

One seam commonly has one writer followed by two auditors. Several independent
seams may form a batch while retaining separate candidate and phase identities.

## Context and cost control

- Load only the seam's authority, callers, adapters, and predecessor interfaces.
- Run deterministic checks before model investigation.
- Preserve the Base owner for Final Polish.
- Reuse auditors for finding-specific delta checks.
- Do not repeat broad research on re-entry.
- Expand to whole-repository checks only when a shared-root change expands the
  affected graph.
- Declare checkpoints where orchestration stalls for owner/founder direction.

## Planning stop

A plan is ready when another capable agent can decide completion without
inventing scope, authority, dependencies, validation, or stop conditions. It
does not authorize implementation unless the user/assignment does.
