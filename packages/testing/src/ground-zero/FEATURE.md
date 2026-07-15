# Nx-native testing feedback

Ground-0 gives a future working agent one repository-native test entrypoint that preserves layer ownership, fidelity order, selected counts, failure status, artifact identity, and cleanup.

## Rules

- The aggregate runs independently owned L1, L2, and L3 suites in fidelity order.
- A required collector cannot pass with zero selected tests.
- Human-readable headings and machine-readable evidence describe the same execution.
- Web and mobile stay explicit N/A until corresponding product surfaces exist.

## Canonical behavior

- [Physical Gherkin](./ground-zero.feature) — `G0-AGGREGATE-001`

## Native coverage

- [L1 contracts](./harness.test.ts)
- [L2 real-boundary contracts](./harness.spec.ts)
