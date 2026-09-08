# Seam Implementation

Use when the work seam and authority are known and behavior may be changed.

## Understand before editing

Trace the real flow end to end:

- public entry/caller;
- interface and owned behavior;
- every direct caller;
- composition and concrete adapters;
- state/persistence/external boundaries;
- current tests and runtime behavior;
- cleanup/resource ownership;
- dirty/unrelated work.

Do not choose a small diff before locating the highest shared owner. A one-line
patch in the wrong caller is not lean when the root cause remains elsewhere.

## Choose the smallest faithful solution

Stop at the first rung that satisfies every accepted invariant:

1. omit behavior or abstraction that is not required now;
2. reuse an existing module/owner;
3. use standard language/runtime capability;
4. use native platform/framework behavior;
5. use an already-admitted dependency;
6. write the minimum explicit code.

Avoid:

- speculative interfaces/adapters/providers;
- factories or registries with one implementation;
- configuration for values that do not vary;
- wrappers forwarding the same complexity;
- provider SDK/types in owned public contracts;
- hidden globals/service location;
- parallel compatibility paths without current consumers;
- dead exports and placeholder behavior.

Never omit input validation, authorization, error handling, cleanup, data
integrity, accessibility, or security because a shorter path exists.

## Contract before implementation

For new behavior, define:

- basic success and ordinary rejection;
- state created/changed/preserved/forbidden;
- actor and observable response;
- adversarial counterexamples;
- lowest faithful checks;
- cleanup and resource delta.

Demonstrate a meaningful failure before implementation when the environment has
a test/acceptance workflow. A syntax error, missing unrelated dependency, wrong
target, zero selection, broken fixture, or assertion-free test is not useful
failure evidence.

For refactoring, preserve characterization instead of manufacturing failure.

Freeze observable behavior before the first implementation write. Do not alter
assertions or semantics merely to make implementation pass.

## Implementation laws

### Interface and dependencies

- Domain/high-level behavior owns the narrow capability it needs.
- Outer composition selects concrete adapters.
- Inputs and collaborators are explicit.
- Provider errors map into stable owned failures.
- Tests and callers use the same public interface.
- Internal seams stay private unless callers genuinely need them.

### Control flow and failures

- One coherent operation per function/module.
- Guard invalid states first; keep success flat.
- Use exhaustive owned states and fail closed on unknowns.
- Return values for calculation; isolate mutation and I/O.
- Await every operation whose completion matters.
- Propagate bounded timeout/cancellation where a boundary can hang.
- Make retries explicit, observable, bounded, and idempotency-safe.

### State and resources

- One source of truth per state.
- Derive rather than synchronize duplicates.
- Transactions/constraints own faithful persistence invariants.
- Acquire/release in one visible scope and guarantee cleanup.
- Do not rely on process exit.
- No shared mutable module state for requests/tests.

### UI

- Presentational shells receive typed props and report callbacks.
- Workflow/data/provider behavior lives at an explicit outer seam.
- Accessibility, keyboard, focus, motion preference, loading, error, and empty
  states are behavior.
- Rendered behavior requires a UI-capable check; data/API proxies do not prove it.
- Shared implementation comes before a platform override; specialize only for
  real divergence.

### Naming and locality

- Name domain concepts and behavior, not vague Helpers/Managers/Services.
- Keep files that change/verify together local.
- Public facades are explicit and behavior-free.
- Do not expose internal source paths or wildcard surfaces without a current
  reason.

## Adversarial pass

Attack applicable risks:

- empty/malformed/partial/extreme input;
- wrong identity/role/permission;
- duplicate/replay/concurrency/races;
- partial write/rollback/no-write after rejection;
- timeout/cancellation/process death/restart;
- provider interruption versus semantic failure;
- stale state/cache/generated output;
- resource leaks during setup/action/assertion/failure;
- wrong surface, zero test, no-op assertion, status-only green;
- UI hydration/visibility/interaction contradicted by a data proxy.

Keep exhaustive cases at local/unit/integration surfaces and only representative
behavior at end-to-end acceptance.

## Definition of done

- Required behavior is GREEN through the public seam.
- Affected callers/adapters compile and behave correctly.
- Negative/no-write/idempotency/cleanup guarantees are proven.
- Relevant standing checks pass or unrelated baseline failures are identified.
- No unauthorized or unrelated files changed.
- Unexpected resource/process/port/database/device/temp delta is zero.
- Report exact changed paths, decisive commands/results, residual risk, and
  next action.

Stop at the assigned implementation boundary. Do not self-audit or self-accept
when independent review is required.
