# Codex Workflows Self-Audit Report

**Campaign:** `CDX-WF-2026-08-07`  
**Candidate basis:** repository `HEAD` `28c4650c676644bdfac11aa25c46d5be9b15f833` plus the current campaign working tree  
**Audit role:** implementation-agent self-audit only; this is not independent verification, judgment, or acceptance

> **Attempt 1 reconciliation (2026-08-08):** The later independent
> `codex-workflows-external-audit-attempt-1.md` is controlling for the audited
> candidate and identified material findings `CWF-AUD-001` through
> `CWF-AUD-006`, including false-green weaknesses this self-audit did not find.
> This report remains unchanged below as historical self-audit; it does not
> override the independent score or findings. Bounded repair evidence is in
> `codex-workflows-repair-attempt-1.md`.

> **Attempt 2 reconciliation (2026-08-08):** The later independent Attempt 2
> audit controls over this historical self-audit for `CWF2-AUD-001` through
> `003`: full private host admission, actual standing-target selection, and
> honest zero-selection machine evidence were still open. Their failed-only
> repair evidence is in `codex-workflows-repair-attempt-2.md`; no fresh
> Preflight or acceptance is claimed here.

## Audit outcome before repair

The vertical slice is coherent and its existing tests are genuinely green, but
the candidate is **not yet ready for external audit**. Four actionable in-scope
implementation findings and one documentation-reconciliation finding remain.
The existing suites did not exercise these gaps, so their green results do not
disprove the findings.

The review covered every campaign-touched source, project configuration,
manifest, scenario, example, generated output, machine result, and root
configuration diff. It reconciled those surfaces with `SPEC.md`,
`ARCHITECTURE.md`, `PLAN.md`, the approved architecture report, repository and
Wiki law, resolved Nx configuration, and the installed SDK/runtime versions.

## Findings

### SA-001 — conditional branches need an explicit downstream join (T2)

`SPEC.md` requires conditional steps to have explicit downstream join behavior.
`packages/workflows/src/schema/validation.ts` validates the condition pointer
and comparison value, but it accepts a conditional step whose reachable
dependents never include a `join`. That permits an ambiguous branch boundary.

**Repair contract:** add an adversarial L1 integration test that accepts a
conditional branch only when a join is reachable in the dependency graph and
expects stable issue `CONDITIONAL_JOIN_REQUIRED` otherwise; then add graph
validation without changing existing assertions.

### SA-002 — planned nodes omit lowering requests required by the frozen contract (T2)

`SPEC.md` and `ARCHITECTURE.md` define planned nodes as the future durable
lowering seam, including node-specific capability/handler and policy requests.
`PlannedNode` currently contains identity, dependencies, status, and
kind-specific metadata only. Global `requiredCapabilities` and `policy` do not
identify the request attached to each expanded fan-out node, and a Codex prompt
cannot safely be represented by raw text.

**Repair contract:** add L1 integration assertions for a per-node
`capabilityRequest`, cloned `policyRequest`, and a redacted `handlerRequest`.
Codex handlers expose model plus prompt digest, never raw prompt; registered
handlers expose only their registered name.

### SA-003 — aggregate plan and legacy diagnostic bounds are incomplete (T2)

The source envelope bounds each workflow to 256 steps and each fan-out to 1,024
items, but multiple fan-outs may together create an unbounded-in-practice plan
relative to the stated diagnostic/resource contract. The `.pi` parser accepts
up to the loader byte ceiling yet copies every evidence/report string into
diagnostics without an independent claim-count or claim-length bound.

**Repair contract:** add adversarial L1 integration tests for an aggregate plan
node ceiling and deterministic legacy-claim truncation/count reporting. Keep
the original bytes and source digest authoritative; only bound the diagnostic
projection.

### SA-004 — Codex per-operation observations are absent (T2)

`ARCHITECTURE.md` requires secret-safe operation observations containing safe
requested fields, thread ID, normalized event types, usage, duration,
abort/error classification, SDK version, and the configuration fingerprint.
The host currently exposes only static diagnostics and process-local metrics.
It neither emits operation observations nor offers a callback for a composition
root to receive them.

**Repair contract:** add L1 integration RED for buffered success, streamed early
termination, and attributed failure. Implement a non-persistent callback that
emits repository-owned observation values and proves serialized output excludes
the prompt, raw error, API key, and environment values. The observer is not a
durable store or acceptance signal.

### SA-005 — root workspace documentation is stale (T1)

The root `README.md` project snapshot lists only the original daemon, daemon
E2E, and testing projects and describes durable orchestration surfaces more
broadly than current source supports. It does not identify the new workflows,
Codex SDK boundary, or CLI projects. `ARCHITECTURE.md` also shows an illustrative
Codex file split that differs from the compact implementation.

**Repair contract:** reconcile the root project/status documentation and the
architecture file map with the resolved Nx graph and current file ownership.
Do not claim that the absent durable process/delivery/transport implementation
exists.

## Controls that passed review

- The resolved new production dependency edge is only
  `codex-workflows -> workflows`; no package depends on an app and the CLI does
  not depend on the SDK boundary.
- The sole production import of `@openai/codex-sdk` is
  `packages/codex/src/runtime/adapter.ts`; the pinned dependency is exactly
  `0.147.0`.
- Durable CLI commands fail with exit 69 before source loading or SDK
  initialization. No second daemon, reducer, queue, retry engine, monitor,
  database, or tmux transport was added.
- The workflow and Codex libraries perform no production filesystem writes.
  `.pi` remains a read-only byte source.
- Existing L1/L2/L3 tests select nonzero behavior, machine artifacts report
  passing results, the controlled SDK child is reaped, and the affected Nx
  closure was green after correcting the graph-aware Ground-0 expectation.
- Exact-file formatting passed, Nx synchronization was current, and the built
  CLI remained directly executable with one shebang.
- The architecture research report and unrelated `.pi` contents were not
  modified. No commit, merge, push, publish, deployment, or worktree cleanup
  occurred.

## False-green attacks and residual boundaries

The audit explicitly inspected for zero-test success, assertion-free bindings,
L3-to-lower-layer invocation, SDK import leakage, raw prompts/secrets in default
output, ambient environment capture, local durable state, unsafe source module
execution, missing `finally` cleanup, repository temp residue, and destructive
`.pi` behavior. No additional actionable in-scope finding was identified.

The real SDK test intentionally uses the installed SDK with a controlled local
Codex executable, not a paid network turn. The repository still has no ratified
durable control-plane protocol implementation to wire into this CLI; fail-closed
exit 69 remains the correct frozen boundary, not an audit finding.

## Required next boundary

The implementation agent must produce meaningful additive RED for SA-001
through SA-004, implement the narrow repairs, reconcile SA-005, rerun the exact
repair targets plus aggregate and affected closure, recheck cleanup/resource
deltas, and record immutable command evidence. Only then may the closeout handoff
use `READY_FOR_EXTERNAL_AUDIT`; this report does not grant that status.
