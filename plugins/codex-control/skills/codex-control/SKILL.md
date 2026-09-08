---
name: codex-control
description: Launch, observe, message, and cancel local or remote Codex agents and workflows through Codex Control; open their live viewer beside the orchestrator and return an available mobile link.
metadata:
  version: '1.1.0'
---

# Codex Control

Codex tasks are the orchestrators. Codex App Server executes the agents;
the Svelte web application displays their activity. This is the Codex plugin
workflow, not ChatGPT website app registration. Keep execution through the
installed control tools; do not substitute the TypeScript SDK or alternate
harness transports when a control operation fails.

Discover the installed tool schemas before calling unfamiliar operations.
Use returned handles rather than reconstructing IDs or reading raw database
tables. Do not assume every backend operation has a public tool.

Use one task-level Codex Control tool call for the requested intent:

- `admit_project` for explicit first-use admission of an authorized local Git project; this operation launches no agents.
- `delegate_agent` for one local or remote Codex assignment.
- `run_workflow` for one trusted workflow source file or an accepted registered workflow.
- `get_control_snapshot` or `wait_control_delta` for visibility without launch.
- `send_agent_message`, `ask_agent`, or `reply_agent` for addressed durable
  messages. Preserve returned message/correlation IDs; message acceptance is
  not proof that the recipient read it or completed the requested action.
- `cancel_agent` or `cancel_workflow` for user-authorized cancellation of an
  exact handle. A user's explicit stop request supplies the intent; satisfy
  the tool's confirmation field without asking the same question again.

For direct delegation, obtain the real host/repository IDs, base revision,
assignment reference/digest, sandbox, approval policy and completion boundary
from the authorized assignment. Never fabricate missing values. Follow the
repository's charter requirements before launching implementation agents.

Supply explicit model and reasoningEffort when delegating or submitting the
registered-workflow form. Source submissions obtain their admitted host,
repository, assignment and execution envelope from actor-bound daemon context.
Preserve each workflow node's explicit model and reasoning. Never silently
substitute medium or a different model. Provider support errors must remain
visible. Named Codex configuration profiles are separate and are not supported
by pretending their values are explicit settings.

## Admit and select a local project

Codex Control serves authorized projects outside its own installation. Never infer
the caller's repository from the daemon cwd, plugin cache, or a global source root.
Inspect the task's actual local Git worktree and approved scope. If the host cannot
attest cwd, supply its explicit canonical path and identity. A path is not authority:
the daemon checks the authenticated actor's administrator-granted `localProjectPolicies`.
One policy can grant approved parent roots for many projects; it is not a per-project
daemon JSON registration. Remote admission remains a separate administrator operation.

For first use, call `admit_project` with all seven fields:

- `hostId`: the granted local-proxy host identity.
- `repositoryId`: a stable, unique identity for this admitted worktree/revision binding.
- `assignmentId`: the authorized assignment used by source submissions.
- `baseRevision`: the verified full Git commit SHA available in that worktree.
- `checkoutPath`: its canonical absolute Git worktree root.
- `sourceRoot`: the approved canonical directory inside that worktree containing trusted workflow source.
- `admissionIntent`: exactly `admit-local-project`, supplied only when project admission is authorized by the task.

Reuse the returned `hostId` and `repositoryId` in `run_workflow`, with `source` relative
to that `sourceRoot`. The same admission can be retried safely and survives daemon
restart. A changed path, revision, or assignment cannot silently overwrite an existing
binding; use a new approved repository identity. Do not edit registration storage.
Changing `CODEX_CONTROL_ACTOR_AGENT_ID` does not change the trusted HTTP actor or grant
permission. The daemon's authenticated authorization is authoritative.

Direct `delegate_agent` uses the returned `hostId`, `repositoryId`, and `baseRevision`,
plus the actual `assignmentId`, `assignmentRef`, `assignmentDigest`, `idempotencyKey`,
`model`, `reasoningEffort`, `sandbox`, `approvalPolicy`, `completionBoundary`, and
`prompt` from the approved charter. Do not invent a digest. The admitted policy limits
the sandbox; local admission does not grant network access. No existing thread is adopted.

Leases contain the selected committed revision. Dirty files, untracked inputs, and
charters are not automatically copied. Preserve their custody: use explicitly approved
tracked inputs or bounded artifacts, and keep exports inside the owned lease or an
explicitly approved export operation. Do not copy an entire dirty worktree or credentials.
Daemon compilation supplies `@codex/workflows`; an external project does not need to
install internal `.codex` packages. Compilation loads trusted code, not a sandbox.

Diagnostics are codes without private paths. `PROJECT_ADMISSION_UNAUTHORIZED` requires
the correct trusted actor/local host and an existing policy grant. `PROJECT_ROOT_UNAUTHORIZED`
means the checkout is outside that grant. `PROJECT_STORAGE_UNSAFE` requires the operator
to check the configured owner-only lease/registry directories; first use creates missing
directories safely and never changes permissions on existing directories. `PROJECT_REVISION_INVALID`
requires a verified available commit. `PROJECT_IDENTITY_CONFLICT` requires preserving
the old binding and selecting a new approved identity. Never retry by broadening scope.

Respect the user's concurrency and usage budget. For validation, use the
approved low-cost model/effort and smallest useful run; do not turn an example
into a paid test automatically. Production tasks retain their requested effort.

## Write one file, submit once

Write trusted `.workflow.ts` source beneath the caller's authorized source root.
Keep the existing `@codex/workflows` API; no SDK client or registration script:

```ts
import { agent, defineWorkflow, parallel, phase } from '@codex/workflows';
export default defineWorkflow({
  id: 'parallel-review',
  title: 'Parallel review and synthesis',
  maxConcurrency: 2,
  async run(input: { topics: string[] }) {
    const notes = await phase('Research', () => parallel(input.topics.map((topic) => () => agent({ label: topic, model: 'gpt-5.6-luna', reasoning: 'high', prompt: topic }))));
    return phase('Synthesize', () =>
      agent({
        label: 'Synthesis',
        model: 'gpt-5.6-sol',
        reasoning: 'medium',
        prompt: 'Synthesize the supplied notes.',
        input: notes,
      }),
    );
  },
});
```

Call `run_workflow` once with `{ source, input, idempotencyKey, hostId, repositoryId }`; use a relative
source path and a stable key for retries. A new intentional run gets a new key.
Optional `hostId` and `repositoryId` select among already authorized contexts. Legacy
calls omitting repository selection remain valid when exactly one actor context matches.
Explicit selections and dynamically admitted contexts scope idempotency to actor, host, and repository. Retry with the same
selection and key; do not switch a legacy unscoped retry to the explicit form, which has
a distinct identity. `WORKFLOW_CONTEXT_AMBIGUOUS` requires explicit selection;
`WORKFLOW_CONTEXT_MISSING` requires admission under the correct actor/host;
`WORKFLOW_SOURCE_NOT_FOUND` requires correcting the path relative to the admitted source root.
Do not supply a
manual sourceDigest, generated JavaScript path, or workflow registration.
Missing/ambiguous context is an explicit setup error, never permission to invent
an assignment or copy credentials. Relative imports are bundled and bound to the
executable identity; unbound dynamic imports are rejected. Loading source executes
trusted code and is not a sandbox. Request schemas only for structured results.

After submission, use the returned runId/browserUrl with the Browser rule below.

Give workflows a human `title`, phases meaningful names, and agents readable
labels. Pass actual upstream outputs through `input`; prose claiming a handoff
does not establish one. Keep final artifact export inside the workflow before
lease release, using only its exact owned paths. A model-authored filesystem
path is not a download URL or a published preview.

## Open the viewer

For delegation or workflow launch, validate the stable `agentId` or `runId` and
`presentation.browserUrl`. The URL must use `http://127.0.0.1` and contain no
credentials. Then make one `browser:control-in-app-browser` call to open that
exact URL beside the orchestrating Codex task.

Use the Browser skill's setup when necessary; the two-call pattern describes
the normal launch-plus-open path, not permission to bypass browser setup.
Keep the resulting tab as a user-facing deliverable. Select an agent to open
its feed and verify readable messages, rather than treating a successful page
load as proof of live updates.

If the same handle returns the same browserUrl, reuse the existing tab; do not
open a duplicate. If the Browser capability is unavailable, return the
browserUrl and say the view was not opened—do not claim that a tab opened.

When mobile viewing is requested, return an already configured and verified
HTTPS viewer URL with the same workflow route. Do not derive a hostname from a
machine name, put a capability token in the URL, or expose the App Server
endpoint as the viewer. Provisioning a new tunnel or changing its access is a
separate operation requiring appropriate authorization.

## Observe efficiently

Read one snapshot, retain its cursor, then use `wait_control_delta` with
`afterCursor` and a bounded `waitMs` (currently at most 30000). Unchanged state
is normal. Avoid tight polling and repeatedly emitting the whole snapshot.
For background monitoring, use the host's supported automation mechanism and
the user's interval; notify on meaningful progress, completion, or a blocker.
Do not promise monitoring unless it was actually armed.

Request detail only for the currently selected agent, pairing
`selectedAgentId` with `selectionId`. Change that selection identity when
switching agents and ignore late results for the old selection. Do not open
one detail subscription per agent in the workflow.

Distinguish workflow status, per-agent status, and viewer connection health.
An offline viewer cannot establish that agents stopped or that no work exists.
After cancellation, wait for authoritative terminal state; an interrupt request
or closed connection alone does not confirm cessation. Keep uncertainty visible.

## Recover without duplicate work

For an uncertain submission response, reconcile the handle and retry the same
source/input with the same idempotency key. Do not mint a new key simply because
the response was lost. A deliberate rerun receives a new key after the earlier
run's state and resource ownership are established.

Handle recoverable failures within the authorized scope. Inspect durable status
and the concrete diagnostic before changing anything; let the backend own
delivery retries. Clean up only exact, owned disposable resources once inactive,
preserving required artifacts. Do not delete history or another agent's lease
to make a failed run look successful.

Missing host context, credentials, provider support, or unclear remote write
authority is a real blocker: report the exact missing prerequisite. Do not
weaken TLS/authentication, broaden a sandbox, silently substitute a model, or
restart shared infrastructure to bypass it.

## Report the actual outcome

Return the workflow/agent handle, readable status, viewer link, verified mobile
link when available, result or artifact location, and any unresolved limitation.
If screenshots were requested, capture actual states in the in-app browser and
include the saved images in the response; do not reconstruct states that were
missed or expose credentials/private reasoning.

Check the requested result, not just the agent's terminal status. An agent can
finish while a build fails, artifact export fails, or the workflow fails.
Separate source creation, successful build, running preview, verified UI,
workflow completion, and campaign acceptance. Never infer BASE_READY, audit
acceptance, or merge authority from green task status.

Keep remote App Server URLs and credentials behind Codex Control. Do not route
this workflow through ChatGPT Developer Mode, a registered ChatGPT app, or a
Secure MCP Tunnel.
