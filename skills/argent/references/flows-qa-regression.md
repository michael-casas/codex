# QA regression flows

Use for a test case, ticket, or acceptance criterion that must become a repeatable Argent flow. Read `flows-authoring.md` first.

Before touching the app, define a compact contract: start state, ordered actions, expected outcomes, stable executable evidence, data dependencies, side effects, and restoration. One behavioral scenario becomes one flow.

Completion requires:

1. Flow-owned launch and deterministic in-flow setup.
2. Every requirement mapped to an executable assertion/await or reviewed deterministic snapshot.
3. Destination identity plus readiness for every screen change.
4. Stable selectors and justified coordinate exceptions.
5. An end state that permits immediate rerun or restores the baseline.
6. Two consecutive full passes of unchanged YAML with the same runner; reset the streak after edits, recovery, baseline updates, or failures.

Keep strong failing checks and report product regressions. A failed launch is evidence about the app, not automatically an environment retry.

Repository acceptance doctrine remains authoritative; an Argent flow occupies only the layer assigned by that repository.

Provenance: curated from Casona `argent-qa-flows`.
