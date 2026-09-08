# CAS existing-thread handoff — implementation handoff

Status: **READY-FOR-AUDIT as implementation evidence; live Herdr-origin compatibility proof remains admission-gated.** Do not self-accept or merge.

## Publication

- Branch: `CAS/CAS-BASE_existing-thread-handoff`
- Immutable and current PR base: `63e6e2f64bca05d3883d2b485af057e15ee88c1f` (`CAS/CAS-BASE`)
- Implementation commit: `dd017e631ff225a538c6846a423e770f1823df7c`
- Draft PR: https://github.com/michael-casas/codex/pull/2
- Canonical repository: https://github.com/michael-casas/codex.git

The canonical base was fetched immediately before publication and still matched the immutable starting revision. No integration or history rewrite was needed.

## Public API

Adopt an idle thread with the existing `delegate_agent` tool. `hostId` and `existingThread.threadId` form the scoped identity. Adopted calls intentionally omit model, reasoning, sandbox, approval, network, and cwd overrides:

```json
{
  "idempotencyKey": "handoff-ada-001",
  "assignmentRef": "CAS-EXISTING-THREAD-HANDOFF-R1",
  "assignmentDigest": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "hostId": "local",
  "repositoryId": "codex",
  "baseRevision": "63e6e2f64bca05d3883d2b485af057e15ee88c1f",
  "assignmentId": "CAS-EXISTING-THREAD-HANDOFF-R1",
  "existingThread": {
    "threadId": "thread-existing",
    "activeTurn": { "behavior": "reject" }
  },
  "completionBoundary": "ready-for-audit",
  "prompt": "Continue this task using its existing history."
}
```

For an active thread, replace the policy with:

```json
{
  "behavior": "steer",
  "expectedTurnId": "turn-current"
}
```

The expected turn must still be active when mutation occurs. Reject policy, stale identity, wrong host, inaccessible thread, repository mismatch, or an independently held writer fails explicitly; none creates a substitute thread.

Continue the stable adopted handle through the new public tool:

```json
{
  "delegationId": "delegation-1",
  "prompt": "Apply the requested revision.",
  "expectedTurnId": "turn-current"
}
```

`expectedTurnId` is required when an adopted thread is active and omitted when it is idle. The result retains the same delegation/agent/thread identity, `ownership: "adopted"`, and viewer route.

Workflow authors can deliberately target an existing thread while leaving fresh nodes unchanged:

```ts
await agent({
  label: 'Continue existing review',
  existingThread: {
    hostId: 'local',
    threadId: 'thread-existing',
    activeTurn: { behavior: 'reject' },
  },
  prompt: 'Finish the review from the existing context.',
  input,
});
```

A workflow run rejects a second claim for the same host/thread pair before the second executor call.

## Supported origins and limits

The implementation targets Codex App Server's authoritative `thread/read`, `thread/resume`, `turn/start`, and `turn/steer` boundary. It supports an existing thread when:

1. its host is admitted;
2. that host's connected App Server can read the exact thread;
3. the thread cwd is proven to belong to the configured Git repository and requested revision; and
4. the connected App Server is permitted to mutate the idle thread or exact expected active turn.

This applies to managed local/remote App Server threads and can apply to CLI- or Herdr-origin threads when the controlling App Server exposes that thread and writer authority. It does **not** claim universal cross-writer compatibility. Read-only investigation found that a different active writer can return provider code `-32600` with `already has an active writer`; the product maps a non-ambiguous provider refusal to `DELEGATION_WRITER_CONFLICT` and tells the caller to reconnect through the controlling App Server with current turn identity. It never bypasses the writer lock.

No eligible live Herdr target was available in this isolated task: `HERDR_ENV` was absent, and the current Codex thread's Herdr context source resolved to `unmapped`. The environment did contain unrelated live Herdr sockets/processes, but the charter prohibited prompting a human task or provisioning/restarting shared runtime. Therefore no Herdr-origin prompt and no paid model turn was executed.

Required next live verification: the coordinator must provide a disposable Herdr-origin Codex thread mapped to an admitted repository and its controlling, protocol-compatible App Server endpoint. First prove idle read/resume/start and stable viewer identity; then, with a disposable independently held writer, prove either exact steer through the controlling server or the typed writer-conflict response. If a model response is indispensable, the charter permits requesting admission for at most two Luna-low turns; none is pre-authorized by this handoff.

## Mutation and ownership guarantees

- Adoption verifies host/thread and read-only repository association before turn mutation.
- An idle target is resumed and receives exactly one override-free follow-up turn; an active target is only steered with the exact caller-supplied expected turn ID.
- Idempotency fingerprints the complete request. Exact concurrent replay returns one durable binding and sends once; conflicting replay rejects.
- PostgreSQL persists `ownership`, scopes uniqueness to `(host_id, thread_id)`, and recovers the adopted binding through a new repository instance.
- Adopted cancellation/detach does not release or delete a workspace and does not close a CLI, App Server, Herdr pane, or external runtime. It can interrupt only the explicitly bound active turn.
- Managed delegation remains the default and retains its existing lease/thread lifecycle.
- Visibility and desktop/mobile UI expose `managed` versus `adopted` without persisting transcripts or private reasoning.

## BATDD evidence

Green Contract: `packages/testing/evidence/cas-existing-thread-handoff-green-contract.json` (`CAS-EXISTING-THREAD-HANDOFF-R1-GC4`, frozen and hash-verified).

- Acceptance rows: 12/12 green — 8 L1, 3 L2, 1 L3.
- Meaningful RED: five product surfaces failed before implementation (process, workflow authoring, App Server executor, public control catalog, PostgreSQL persistence). The initial transport run exposed a local protocol-version mismatch and was correctly not counted as behavioral RED.
- Core GREEN: process 45/45; workflows 84/84; App Server workflow executor 33/33; PostgreSQL L2 13/13.
- Control GREEN: Codex Control L1 and supplemental passed; plugin L1 8/8 and L2 2/2; physical Gherkin L3 passed 2 scenarios / 8 steps.
- Composition/UI GREEN: daemon L1 21/21 and L2 7/7; UI L1 10/10; adopted Playwright scenario passed desktop and mobile 2/2 with `maxActiveWaits=1`.
- Real transport boundary: focused `CAS-ETH-L2-002` passed 1/1 against the repository-pinned Codex 0.151 App Server. The full transport L2 suite had four unrelated environment failures (one unavailable local daemon proxy and three remote-auth fixtures); the new row passed.
- Affected closure: lint 17/17 projects and typecheck 17/17 projects passed with cache disabled. The implementation commit hook also passed its staged affected checks.
- Integrity: `git diff --check` passed and all frozen acceptance-file SHA-256 values match.
- Paid/model turns: 0.

## Cleanup and retained state

- Real database fixtures closed successfully; no test database was retained.
- App Server test connections and Playwright waits/browser fixtures closed.
- The temporary compatibility wrapper used during transport diagnosis was removed.
- No external checkout, dirty target, Herdr process, pane, socket, credential, shared service, or coordinator configuration was mutated.
- Pre-existing untracked `.codex-workspace-lease.json` remains untouched and is not part of either commit.

## Audit focus

Review the adoption bind-before-mutation ordering, provider conflict mapping, additive migration ACLs and host/thread uniqueness, workflow duplicate-claim guard, and external-resource cancellation semantics. Treat the deferred live Herdr-origin proof as an explicit external verification item, not as evidence already supplied here.
