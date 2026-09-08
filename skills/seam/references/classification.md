# Seam Classification

Classify before planning, implementation, refactoring, or audit whenever
ownership or the test surface is not obvious.

## Vocabulary

- **Module:** anything with an interface and implementation: function, hook,
  class, package, process, UI slice, or cross-tier capability.
- **Interface:** everything callers must know—inputs, outputs, invariants,
  errors, ordering, configuration, side effects, cleanup, and relevant
  performance.
- **Seam:** the location of that interface; behavior behind it can change
  without editing callers.
- **Adapter:** a concrete implementation satisfying an interface.
- **Depth:** behavior hidden per unit of caller knowledge.
- **Leverage:** useful capability obtained through the interface.
- **Locality:** concentration of related change, failure, knowledge, and
  verification.
- **Work seam:** one coherent outcome and change vector assigned and verified as
  a unit.

## Seam classes

Choose the smallest faithful class:

1. **Local behavior seam** — deterministic rules inside one module/process.
2. **Persistence seam** — behavior crosses durable state or transactions.
3. **Provider/protocol seam** — behavior crosses a network, process, device,
   filesystem, queue, or external system.
4. **Platform seam** — the same intent has genuinely different Web/native/OS
   mechanics.
5. **Vertical product seam** — one actor outcome crosses UI, transport,
   application behavior, persistence, and adapters.
6. **Structural refactor seam** — behavior is preserved while responsibility
   moves behind a better interface.
7. **Orchestration seam** — one work seam depends on another accepted interface
   and must halt/re-enter at that dependency.

A task can use several technical boundaries but should have one owning work
seam. Do not make each framework layer its own work seam unless each delivers
an independently valuable outcome.

## Qualification checks

### Outcome check

Name the actor/system and observable result. “Refactor services” or “build the
backend” is not an outcome.

### Change-vector check

What single reason would make this seam change? If several unrelated reasons
exist, split them. If two proposed seams always change together for the same
reason, consider combining them.

### Deletion test

If the proposed module vanished:

- responsibility spreads across callers -> it likely earns the seam;
- only a forwarding line/name disappears -> inline or keep local;
- behavior disappears entirely -> verify it is currently required.

### Variation test

List current concrete adapters. Production plus controlled test adapter,
persistent plus in-memory repository, or real platform differences can justify
variation. A hypothetical future vendor does not.

Do not force adapters onto pure in-process behavior.

### Interface test

Can a caller use the interface without knowing internal sequence, provider
types, file layout, or framework plumbing? Can tests assert observable outcomes
through the same interface? If not, deepen or move the seam.

### Dependency check

List required predecessor interfaces, facts, credentials, permissions, and
runtime boundaries. Mark each available, locally implementable, or external/
unauthorized. This determines halt/re-entry.

### Scope check

Identify the smallest owning write surface and every directly affected caller.
Shared lockfiles, migrations, composition roots, and generated outputs require
single-writer ownership.

## Dependency categories

Use categories to choose test strategy, not to manufacture abstractions:

- **In-process:** direct interface tests; usually no adapter.
- **Local-substitutable:** real local stand-in such as in-memory repository or
  temporary filesystem.
- **Remote but owned:** owned port with production transport and controlled
  adapter.
- **True external:** narrow owned port; controlled adapter for deterministic
  behavior and explicit real-boundary verification when authorized.

## Classification output

```text
Seam ID/name:
Actor and outcome:
Class:
Problem/change vector:
Interface and invariants:
Current callers:
Current adapters:
Deletion result:
Variation result:
Dependencies/blockers:
Owning/affected surface:
Highest faithful test surface:
Recommendation: reuse / inline / deepen / split / combine / no change
Confidence and open decision:
```

If the evidence does not support a new seam, say so. Do not create a candidate
because the mode expects findings.
