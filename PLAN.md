# Codex Workflows direct TypeScript runner implementation plan

Completion scope is the full vertical slice. Evidence is implementer-authored
and stops at external-audit readiness.

## Hydration and contract

- [x] Read applicable instructions, READMEs, BATDD worker/profile, TESTING,
      specification/architecture/plan, implementation and audit history, and
      current diff.
- [x] Verify Agent Wiki index health and read the orchestration SPEC plus
      TESTING, BATDD, AUDIT, ORCHESTRATION, GHERKIN, and ROLES standards read-only.
- [x] Invoke the required workflow, BATDD, Nx, linking, skill, Wiki, and OpenAI
      documentation procedures.
- [x] Define additive Green Contract `CDX-WF-GC-2`, capture meaningful nonzero
      L1/L2/L3 RED, and freeze the contract/test hashes before product writes.
- [x] Preserve `.pi`, independent audits, locked JSON behavior, and unrelated
      user state.

## Direct runner implementation

- [x] Add typed `defineWorkflow`, `phase`, `parallel`, `agent`, `artifact`, and
      `executeWorkflow` exports.
- [x] Implement bounded concurrency, actual value dataflow, output-schema
      enforcement, stable frozen nodes, phases, artifacts, cancellation, sibling
      failure propagation, redacted events, and runtime cleanup.
- [x] Add exact-shebang/root-contained source admission and the internal
      TypeScript loader without a user-visible compile artifact.
- [x] Add local run composition, atomic bounded journal/artifacts, stable run
      IDs, deterministic exits, JSON/human output, and signal cleanup.
- [x] Preserve JSON validate/inspect/plan/dry-run/import behavior and fail
      closed on unavailable durable JSON/run-ID controls.
- [x] Retain SDK import exclusivity and fix emitted package/app build ownership
      so the pinned SDK can resolve its executable.
- [x] Link the package-owned bin into the existing normal Bun PATH.

## Founder Luna-only amendment

- [x] Stop the pre-override dogfood before a non-Luna consolidator launched;
      preserve its unfinished journal as historical evidence.
- [x] Record the original frozen contract digest and pre-amendment file hashes.
- [x] Add `TS-GC2-016`, capture meaningful static RED with zero agent launches,
      and freeze the amended contract.
- [x] Change both researchers, consolidator, schema/error/cancellation fixtures,
      in-process tests, controlled SDK assertions, Cucumber behavior, and JSON/TS
      examples to exact `gpt-5.6-luna` plus `medium`.
- [x] Replay the amended L1, L2, E2E, and L3 suite GREEN without silent model
      substitution.

## Founder `gpt-*` pass-through amendment

- [x] Preserve the Terra Medium exit-65 experiment as meaningful public RED.
- [x] Freeze `CDX-WF-GPT-GC-1` with basic and adversarial L1/L2/L3 rows.
- [x] Replace the Luna allowlist with bounded, non-whitespace `gpt-*`
      admission and byte-exact SDK forwarding.
- [x] Prove mixed Luna/Terra/Sol/future-shaped tags, malformed rejection, and
      no silent fallback through the affected native and Cucumber gates.
- [x] Re-run the exact two-agent Terra Medium Founder workflow through the
      public interpreter and retain its completed journal.

## Reconciliation and validation

- [x] Reconcile `SPEC.md`, `ARCHITECTURE.md`, `PLAN.md`, root/CLI/schema docs,
      examples, and the global `workflows` skill with the trusted TypeScript mode
      and current `gpt-*` pass-through override.
- [x] Run the live NestJS Luna/Luna/Luna research through the literal public
      interpreter; verify overlap, actual-output dataflow, model/reasoning journal,
      artifact, confidentiality, and cleanup.
- [x] Run all deterministic L1, real L2, L3, standing aggregates, SDK import
      exclusivity, Nx graph/boundaries, lint, typecheck, build, affected closure,
      sync, format, resource delta, journal integrity, skill validation, PATH/bin,
      `.pi`, and external-audit immutability checks.
- [x] Emit machine-readable final evidence with exact candidate identity,
      commands, counts, exits, hashes, journal/artifact paths, and limitations.

## Closeout

- [x] Write `docs/reports/codex-workflows-ts-runner-implementation-report.md`.
- [x] Write `docs/reports/codex-workflows-ts-runner-self-audit-report.md`.
- [x] Write `docs/reports/codex-workflows-ts-runner-external-audit-handoff.md`.
- [x] Append `READY_FOR_EXTERNAL_AUDIT` only after every required behavior and
      evidence gate is genuinely complete; never claim independent acceptance.
