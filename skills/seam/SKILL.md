---
name: seam
description: Classify, plan, implement, refactor, and audit coherent behavior seams. Use for cross-layer features, interface design, dependency halt/re-entry, seam-based DAGs, module deepening, or full-seam review. Skip for trivial edits with obvious ownership and no meaningful interface decision.
metadata:
  version: "1.0.0"
---

# Seam

Organize work around one coherent behavior and change vector behind a stable
interface. A seam is where behavior can vary without forcing callers to
understand or edit the implementation.

## Core law

Before planning or coding, classify the work seam:

- What actor-visible or operational outcome changes?
- What interface should callers and tests use?
- Which invariants, errors, ordering, side effects, cleanup, and performance
  belong to that interface?
- Who owns the change vector?
- Which current callers and concrete adapters exist?
- What dependency would make faithful progress halt?
- What is the highest faithful test surface?

Prefer one deep module with a narrow interface over several shallow wrappers.
Apply the deletion test: if removing the module would spread real complexity
across callers, it earns its place; if only forwarding disappears, keep the
logic local or inline it.

Do not add a replaceable interface for imagined variation. One adapter is
usually hypothetical; two current concrete adapters make a real variation seam.
In-process behavior may need no adapter at all.

Choose the leanest implementation that fully preserves validation,
authorization, cleanup, accessibility, data integrity, and other accepted
behavior. If no current behavior or test fails without proposed code, do not
add it.

## Route the task

Read only the reference needed for the current mode:

| Mode | Read | Use when |
|---|---|---|
| Classify | [classification.md](references/classification.md) | Scope is unclear, work crosses layers, or a proposed interface/package may be artificial |
| Plan/orchestrate | [planning.md](references/planning.md) | Designing a seam plan, dependency DAG, three-phase execution, halt/re-entry, roles, or checkpoints |
| Implement | [implementation.md](references/implementation.md) | Adding or repairing behavior after the seam and authority are known |
| Refactor | [refactoring.md](references/refactoring.md) | Deepening shallow modules, consolidating tangled responsibility, moving a seam, or reducing caller knowledge without changing behavior |
| Audit | [audit.md](references/audit.md) | Reviewing the complete seam, attacking false greens, compiling findings, or verifying Final Polish |

Several modes may apply. Classify once, then read the smallest additional set.
Do not turn a simple edit into an architecture program.

## Universal workflow

1. Read available local instructions, behavior/specification, current code,
   callers, tests, and directly relevant history. If they do not exist, state
   the minimum assumptions and proceed without inventing authority.
2. Produce the compact seam classification described in the classification
   reference.
3. Confirm the proposed seam passes deletion/variation tests. It is valid to
   conclude that no new seam is needed.
4. Select the applicable mode reference and follow its output/stop contract.
5. Keep changes local to the owning seam and validate through the same public
   interface callers use.
6. Stop on missing authority, unsafe overlap, unavailable dependency, or a
   materially different outcome. Name the exact resume condition.

## Standalone guarantee

This skill requires no other skill, agent framework, Wiki, issue tracker,
monorepo, test framework, version-control host, or orchestration service. Use
the capabilities available in the current environment:

- If native planning/tasks exist, use them; otherwise keep a concise checklist.
- If tests exist, run the repository's declared commands; otherwise leave the
  smallest runnable check appropriate to the change.
- If multiple agents exist, preserve role/write separation; otherwise execute
  serially and state which independent review remains unavailable.
- If version control and commit authority exist, use scoped phase commits;
  otherwise use explicit candidate/checkpoint identities.

Never claim unavailable evidence, independence, durability, or external
authorization.

## Stop boundary

Do not widen the seam to repair unrelated failures, create speculative
infrastructure, or make downstream behavior convenient. Report:

- seam and interface;
- outcome achieved or blocker;
- changed/inspected surface;
- decisive validation;
- residual risk and exact next action.
