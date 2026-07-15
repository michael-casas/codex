# Ground-0 testing harness

This Nx project owns the repository-local BATDD execution machinery. It classifies and validates L1/L2/L3 files, runs ordered project aggregates, rejects false-green Cucumber evidence, records machine-readable child results, and normalizes staged Git changes into one Nx affected invocation.

## Commands

```sh
bun nx test-l1 @orchestration/testing
bun nx test-l2 @orchestration/testing --skipNxCache
bun nx test-l3 @orchestration/testing --skipNxCache
bun nx test @orchestration/testing --configuration=ground-zero --skipNxCache
bun nx test-policy @orchestration/testing
```

Read the workspace `AGENTS.md` and root `TESTING.md` before changing tests or harness behavior. The physical feature in `src/ground-zero/ground-zero.feature` is canonical; `FEATURE.md` links to it without duplicating Gherkin.
