# Orchestration Testing Execution Profile

**Status:** Ground-0 implemented; baseline revision is the commit containing this profile.

This file resolves the canonical Agent Wiki `TESTING` standard for this Bun-managed Nx workspace. It declares how this repository must classify, locate, and execute tests. It does not replace the cross-repository testing, Gherkin, BATDD, audit, or orchestration standards.

Canonical sources:

- `/Users/mcasa_atlantis/Documents/vaults/Agent Wiki/standards/TESTING.md`
- `/Users/mcasa_atlantis/Documents/vaults/Agent Wiki/standards/GHERKIN.md`
- `/Users/mcasa_atlantis/Documents/vaults/Agent Wiki/standards/BATDD.md`
- `/Users/mcasa_atlantis/Documents/vaults/Agent Wiki/standards/AUDIT.md`

Read those notes with the global `agent-wiki` skill. Wiki writes require explicit Founder approval.

## Compiled Worker hot path

Ordinary Worker assignments use the compact, versioned execution projection under `.agents/batdd/`:

- `WORKER-CONTRACT.md` — concise activation, planning, vertical-slice, RED/GREEN, evidence, and stop law.
- `profile.json` — repository runners, patterns, targets, N/A surfaces, standard versions, and escalation conditions.
- `profile.schema.json` — validation contract for the repository profile.
- `assignment.schema.json` — validation contract for immutable Worker, repair, verification, judgment, and coordination envelopes.
- `assignments/*.json` — narrow task facts that vary per dispatch.

The dispatcher sends an assignment handle rather than repeating this document or the Wiki constitution. The global `batdd` skill compiles the profile and assignment into a compact runtime-native plan.

Workers load full Wiki doctrine only for contract authoring/amendment, verification or judgment, a missing/invalid/stale/version-conflicted compiled contract, an authority conflict, or an unresolved fidelity boundary. Compiled files are projections and MUST NOT weaken their canonical sources.

## Ground-0 status

Ground-0 is implemented through `@codex/testing`:

- Vitest owns TypeScript L1 and non-UI L2 without `passWithNoTests`.
- The strict Cucumber wrapper owns physical L3 and rejects zero, undefined, ambiguous, pending, skipped, assertion-free, and malformed evidence.
- Every testable project exposes its applicable Nx layer targets and an ordered `test` aggregate.
- Aggregate machine results are written under `test-output/ground-zero/`; the Cucumber artifact is written under `test-output/cucumber/`.
- `test-l2*` and `test-l3` are uncached by target policy. The `ground-zero` aggregate configuration also bypasses cache for child L1 targets.
- Husky, commitlint, and one normalized lint-staged A/M/D/R-to-Nx-affected boundary are active.
- Playwright/web and Maestro/mobile are explicit N/A in `packages/testing/testing.profile.json` because no corresponding product surface exists.

Run the complete uncached baseline with `bun run ground-zero`. The immutable baseline revision is the Git commit containing this sentence and is discoverable with `git log -1 --format=%H -- TESTING.md`.

## Layer and runtime ownership

| Layer | Classification                           | Canonical runtime | File pattern                 |
| ----- | ---------------------------------------- | ----------------- | ---------------------------- |
| L1    | Unit                                     | Vitest            | `*.test.ts`                  |
| L1    | In-process integration                   | Vitest            | `*.test.ts`                  |
| L2    | Non-UI real-boundary integration         | Vitest            | `*.spec.ts`                  |
| L2    | Non-UI end-to-end                        | Vitest            | `*.spec.ts`                  |
| L2    | Web integration and end-to-end           | Playwright        | `*.spec.ts`                  |
| L2    | Mobile integration and end-to-end        | Maestro           | `*.spec.yaml`                |
| L3    | Behavioral acceptance and direct dogfood | Cucumber          | `*.feature` and `*.steps.ts` |

Playwright and Maestro are N/A until this workspace owns a web or mobile surface. N/A is an explicit profile decision; it must not be simulated by a different runtime.

For non-UI behavior, direct dogfood may use the public CLI, MCP, Unix socket, service process, protocol, database projection, restart path, or another ratified public surface. Computer use is required only when visual or experiential interaction is load-bearing.

## Classification rule

Ask whether the test crosses a real process, protocol, infrastructure, persistence, delivery, or rendered-interface boundary.

- **No:** L1.
- **Yes:** L2.
- **Representative behavior executed from canonical Gherkin through an appropriate real surface:** L3.

Integration is not a separate constitutional layer:

- In-process integration belongs to L1.
- Real-boundary integration belongs to L2.
- All end-to-end testing belongs to L2, but not every L2 test is end-to-end.

## File ordering and markers

L1 `*.test.ts` files must place unit suites before in-process integration suites:

```ts
// === L1: UNIT TESTS ===
describe('[L1:UNIT] ...', () => {});

// === L1: IN-PROCESS INTEGRATION TESTS ===
describe('[L1:INTEGRATION] ...', () => {});
```

L2 TypeScript `*.spec.ts` files must place real-boundary integration before end-to-end suites:

```ts
// === L2: REAL-BOUNDARY INTEGRATION TESTS ===
describe('[L2:INTEGRATION] ...', () => {});

// === L2: END-TO-END TESTS ===
describe('[L2:E2E] ...', () => {});
```

The “middle” is semantic, not a literal line-number midpoint. Tests must remain independently runnable; ordering expresses increasing fidelity, not shared mutable state.

## Feature layout

The canonical feature shape is:

```text
packages/<domain>/src/<feature>/
  FEATURE.md
  <feature>.feature
  index.steps.ts
  <feature>.test.ts
  <feature>.spec.ts
  support/
    fixtures.ts
    drivers.ts
    assertions.ts
    world.ts
```

- `FEATURE.md` owns intent, rules, boundaries, and coverage links.
- The physical `*.feature` file owns canonical behavioral scenarios.
- `index.steps.ts` is a thin L3 semantic adapter using scenario-scoped World state.
- `support/` is framework-neutral and may be consumed independently by L1, L2, and L3.
- Each `packages/<domain>` root must be an independently registered Nx project so `nx affected` can select it accurately.

Not every feature requires every optional support file. Every applicable layer must use its canonical filename and runtime.

## Cross-layer dependency law

Tests may share product code, fixtures, builders, drivers, and framework-neutral assertions. Test entrypoints must not execute or import one another.

Forbidden examples:

- L3 steps invoking an L1 or L2 Nx target.
- L3 steps importing a `*.test.ts` or `*.spec.ts` entrypoint.
- L2 specs importing L1 test entrypoints.
- `test.steps.ts` or another runner-of-runners.
- A Cucumber step pretending an API query proves browser rendering or hydration.

Every asynchronous operation and assertion must be awaited or returned. Every `Then` must assert an observable outcome. Scenario-order dependency and module-global mutable scenario state are forbidden.

## Nx target contract

Every testable project must expose the applicable subset of these targets; `test` is the complete project aggregate:

- `test-l1-unit`
- `test-l1-integration`
- `test-l1`
- `test-l2-integration`
- `test-l2-e2e`
- `test-l2`
- `test-l3`
- `test`

An inapplicable target must be declared N/A by project metadata or profile validation. It must not pass by collecting zero tests.

`bun nx test <project>` must emit suites in this order:

```text
=== Layer 1 Test Suite ===
--- Unit Tests [L1:UNIT] ---
--- In-Process Integration Tests [L1:INTEGRATION] ---
=== Layer 2 Test Suite ===
--- Real-Boundary Integration Tests [L2:INTEGRATION] ---
--- End-to-End Tests [L2:E2E] ---
=== Layer 3 Test Suite ===
--- Cucumber Behavioral Tests ---
```

The aggregate must preserve each child exit code, selected-test count, duration, and status in a machine-readable result artifact. Required collectors must fail on zero selected tests, undefined or ambiguous steps, pending or skipped scenarios, and assertion-free bindings.

## Ground-0 and affected-only execution

Ground-0 must establish and commit:

- Husky hooks.
- commitlint with Conventional Commits.
- lint-staged.
- complete L1, L2, and L3 runners.
- the Nx aggregate target contract.
- nonzero collector enforcement.
- an uncached full-workspace green baseline.

After that baseline is ratified, routine worker and preflight validation must test only changed projects and their transitive Nx dependents. Nx chooses scope; cache policy separately decides whether a selected target executes.

The staged-file gate must:

- derive one normalized changed-file set including additions, modifications, deletions, and renames;
- pass that set to Nx once through a supported `--files` or stdin boundary;
- never invoke Nx once per lint-staged glob;
- use explicit immutable base and candidate revisions for campaign or preflight execution.

Live L2 and L3 evidence must not be accepted from stale cache. Preflight may bypass cache only after Nx has reduced the graph to the affected projects.

Nx named inputs must include every file capable of changing behavior or evidence, including source, tests, features, steps, runner configuration, lockfiles, Docker files, bootstrap SQL, migrations, protocol schemas, and shared testing support.

## Orchestration real-boundary inventory

When implemented, L2 and L3 profiles must account for applicable real boundaries:

- localized PostgreSQL and its role grants;
- process-schema migrations and bootstrap invariants;
- pg-boss delivery, leases, retry, and recovery;
- `LISTEN/NOTIFY` plus reconciliation;
- Unix socket and persistent service lifecycle;
- CLI and MCP adapters;
- direct tmux process, prompt-delivery, identity, restart, reconciliation, and cleanup behavior;
- Codex hook publication and hook-missing recovery;
- scoped database clients and destructive-action rejection;
- resource inventory and zero-delta cleanup.

Tests must use a dedicated test database or isolated container strategy. Production-like process schemas ban destructive operations; the test mirror may allow explicit reset through its designated owner fixture. Tests must not query or truncate pg-boss internal tables as a public contract.

## Evidence and authority

- Runtime completion and authored reports are claims.
- Registered immutable artifacts, exact execution identity, selected-test counts, and observable assertions are evidence.
- An implementer cannot certify its own work.
- L3 execution does not replace fresh verification or Judge authority.
- A verifier that implements a repair loses independence for that repair.

See the canonical `BATDD`, `AUDIT`, and orchestration specifications for role, retry, and verdict law.

## Ground-0 exit criteria

This profile becomes active execution law only after all of the following are true:

- every declared runner is installed and Nx-owned;
- `bun nx test <project>` produces the required ordered output;
- no required collector can pass empty;
- layer marker and cross-layer import checks are executable;
- affected selection is proven for source, tests, Gherkin, database, Docker, and shared configuration changes;
- the complete uncached workspace gate is green;
- the Founder-authorized baseline commit and revision are recorded.

## Implementation paths

- Harness project: `packages/testing/project.json`
- Aggregate CLI and policy engine: `packages/testing/src/cli.ts`
- Project manifests: `packages/testing/manifests/*.json`
- Canonical feature: `packages/testing/src/ground-zero/ground-zero.feature`
- Contract provenance: `packages/testing/evidence/ground-zero-contract.json`
- Staged affected boundary: `tools/testing/staged-affected.ts` runs affected
  lint, typecheck, and deterministic L1 tests. Networked/live L3 acceptance is
  reserved for the explicit Ground-0 and campaign gates, not commit hooks.
