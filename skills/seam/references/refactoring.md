# Seam Refactoring

Use for structural improvement that should preserve externally observable
behavior.

## Scope the survey

Start from the requested area, current change, repeated bug, hard-to-test flow,
or actively changing code. Do not scan the whole repository merely because the
mode can produce candidates.

Look for real friction:

- one concept requires opening many shallow modules;
- callers repeat ordering, normalization, error mapping, or cleanup;
- an interface exposes implementation sequence or provider vocabulary;
- tests must reach inside because the public interface is too weak;
- changes for one reason are scattered across unrelated locations;
- a pass-through wrapper adds vocabulary but no leverage;
- production callers bypass the supposed seam.

It is valid to conclude that the architecture is adequate or that no refactor
earns its cost.

## Candidate test

For each candidate record:

```text
cluster/current interface
observed friction
deletion result
current callers/adapters
dependency category
proposed responsibility behind seam
expected caller knowledge removed
test impact
risk/strength: strong / worth exploring / speculative
```

Reject a candidate when the benefit is only symmetry, naming fashion, file
motion, imagined extensibility, or more abstraction.

## Design the interface

For high-impact refactors, compare at least two plausible shapes without
requiring extra agents:

- smallest interface;
- caller-optimized interface;
- composition/adapter-oriented interface when real variation exists.

Compare:

- invariants and errors callers must know;
- ordering/configuration/side effects;
- depth/leverage;
- locality and ownership;
- number of seams/adapters;
- test durability;
- migration and rollback cost.

Prefer fewer seams and less caller knowledge. Do not expose internal test seams
through the public interface.

## Safe refactor sequence

1. Characterize current behavior through the highest faithful interface.
2. Freeze public outcomes and known failure/cleanup guarantees.
3. Introduce or reshape the interface only when it earns the seam.
4. Move responsibility behind it in small reversible steps.
5. Migrate one caller, validate, then migrate remaining callers.
6. Remove bypasses, obsolete wrappers, dead exports, and duplicate paths.
7. Replace shallow internal tests with interface behavior tests when coverage is
   equivalent; do not keep both by inertia.
8. Run affected callers, adapters, boundaries, and cleanup.
9. Audit the final seam for new indirection and test-only design.

Do not mix unrelated cleanup, dependency upgrades, formatting, or behavior
changes into the refactor. If new behavior is required, classify and authorize
it separately.

## Dependency strategy

- In-process: merge/deepen and test directly.
- Local-substitutable: use the real local stand-in through the module.
- Remote-owned: define a narrow owned capability only when production and
  controlled adapters are both current.
- True external: isolate provider translation/failure/cleanup behind the owned
  capability; preserve explicit real-boundary verification.

## Refactor completion

- Observable behavior remains characterized and unchanged.
- Callers learn less, not more.
- The new interface is smaller than the responsibility it hides.
- Bypasses and obsolete shallow paths are gone.
- Tests assert through the interface and survive internal rearrangement.
- Affected runtime/resource checks pass.
- The diff contains only the refactor seam and its direct consumers.

If these claims are not true, report the candidate as rejected or incomplete
rather than defending the abstraction.
