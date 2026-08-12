# ARCHITECTURE — Decision Intermediate Representation

**Pipeline position:** between `PRD_IR` (Layer 1) and `DOMAINS` (Layer 2).
**Consumes:** `PRD.md` (intent). **Emits:** `ARCHITECTURE.md` (decisions + invariants).
**Reads:** nothing downstream. **Writes:** only architectural decisions and their rationale.

## What

The layer that records **how the system is shaped and why**, as a set of
numbered Architecture Decision Records (ADRs) plus the load-bearing
invariants every downstream artifact must respect. It sits above DOMAINS so
that each capability cluster can trace back to a decision instead of
re-litigating it.

## Who

- **Primary:** Founder / architect ratifying cross-cutting decisions
- **Secondary:** the lowering engine — DOMAINS/FEATURES consume ADRs as fixed constraints

## Why

A PRD states intent; it does not fix the load-bearing choices (payment rail,
custody model, trust boundary, data store). If those are decided implicitly
inside DOMAINS or FEATURES, they get re-decided differently in each file and
drift. ARCHITECTURE pins them once, in one place, with consequences and
rejected alternatives attached.

## What problem it solves

1. **Decision drift** — the same choice (e.g. "who holds the keys") answered
   differently across feature docs.
2. **Untraceable domains** — DOMAINS boundaries with no recorded rationale.
3. **Abstraction bleed** — architecture decisions buried inside implementation
   docs (types, schemas, flag tables), where they are invisible to reviewers.

## Success

- Every cross-cutting decision is exactly one numbered ADR.
- Every DOMAINS cluster cites the ADR(s) it derives from.
- Invariants are stated as "always reject X" rules, testable at any layer.
- Zero code, zero schemas, zero flag tables in the document.

## Artifact Schema — `ARCHITECTURE.md` sections

1. **Context & System Position** — what the system is / is not; the owned-vs-not
   boundary table. (One paragraph + one table.)
2. **Invariants** — the hard rules that govern every layer, each with a short
   code (e.g. `INV-3 Custodial-Spend`). An invariant is phrased as a rejection:
   "every attempt to X MUST reject."
3. **Architecture Decision Records** — inline, numbered:
   ```
   ### ADR-NNN: <title>
   **Status:** Accepted | Proposed | Superseded · <date>
   **Context:** why the decision was needed
   **Decision:** what was decided (one or two sentences)
   **Consequences:** what changes downstream (domains/features affected)
   **Alternatives:** what was rejected and why
   ```
   `Proposed` ADRs are open questions in ADR clothing — carry them inline so
   they are searchable, never in a separate "open questions" appendix.
4. **RLR Firewall / Out-of-Scope** — what the system deliberately does NOT do,
   with the justification for each (supersedes ad-hoc scope notes downstream).
5. **Supersessions** — any PRD assumption this document overrides, named.
6. **Cross-references** — pointers to the contract/schema surfaces
   (product PRDs, SCHEMA.md) and to ROADMAP so DOMAINS can resolve detail.

## Constraints (high-level)

- **Decisions and rationale only.** The moment you write a type, a CLI flag, a
  SQL column, or a function body, it belongs one layer down (SCHEMA.md, a
  product PRD, or a FEATURE.md) — not here.
- **One ADR per decision.** If an ADR needs "and" to state, split it.
- **Invariants are rejections**, not aspirations — each must be checkable.
- **No build plan.** Sequencing, phases, waves, and tasks live in ROADMAP →
  PHASE → tasks.md, never here.
- **IR purity:** reads only `PRD.md`; never back-patches the PRD, never forward-
  references DOMAINS structure.

## Non-goals

- NOT a product spec (that is the PRD and the per-product PRDs).
- NOT a data model (that is SCHEMA.md / FEATURE.md).
- NOT a mechanism/design doc (deep sequences fold into FEATURE.md).
- NOT a roadmap (that is the ROADMAP branch).
- Does NOT replace Founder judgment on the `Proposed` ADRs.

## Outcomes (must be true when "done")

- Every load-bearing choice is a single, dated, numbered ADR.
- Every invariant is a rejection rule a downstream test could assert.
- DOMAINS.md can be written with each cluster citing an ADR number.
- Implementation detail that surfaced during the decision has been *promoted
  down* (to SCHEMA/PRD/FEATURE), not discarded.

## Promotion rule (the salvage contract)

When the source discussion contains implementation detail too low-level for
ARCHITECTURE, it is not deleted — it is relocated to its owner:

| Detail kind | Promotes to |
|-------------|-------------|
| CLI commands, flags, exit codes, MCP tools | per-product PRD / INTERFACE surface |
| JSON envelopes, wire formats | per-product PRD / SCHEMA.md |
| Config schemas, DB DDL, TS types | SCHEMA.md or the owning FEATURE.md |
| Deep mechanism / sequence diagrams | the owning FEATURE.md |
| Build phases, lane DAG, DoD | ROADMAP.md → PHASE-n → tasks.md |
| Function bodies / reference code | the implementation task |
