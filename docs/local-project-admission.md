# Local project admission

Codex Control can admit local Git projects through `admit_project` and select their
workflow sources with `run_workflow.repositoryId`. The operation registers a project;
it does not compile source or launch an agent. Direct delegation uses the same
repository registry and existing isolated Git lease service.

## Administrator setup

An administrator grants a trusted daemon actor a local host and approved parent
directories through the optional `localProjectPolicies` configuration array. This is
one grant for a scope of projects, not manual JSON registration of every project.
The actor comes from the authenticated server authorization, never a command field,
cwd, plugin directory, or client environment variable. Default production HTTP
authorization identifies the actor as `codex-control`.

Each policy has exactly `actorAgentId`, `hostId`, `allowedRoots`, `leaseRoot`,
`registryRoot`, and `runtimeProfile`. The runtime profile has exactly `model`,
`reasoningEffort`, `sandbox` (`readOnly` or `workspaceWrite`), and `approvalPolicy`
(`never`). The host must already be configured with transport `local-proxy`.
The filesystem root `/` cannot be granted. Approve only parent roots the actor is
authorized to admit. A checkout outside that grant fails closed.

The lease and registration directories are created with mode 0700 on first use.
Existing directories must already be owner-only directories, without symlink
redirection. Permissions are never silently changed. Registrations are bounded,
owner-only JSON files created atomically under the configured registry root. They
contain project configuration, not credentials, execution state, or transcripts.
Startup validates saved bindings against current policy and Git/source boundaries.
Use the public operation to register; do not edit these files manually. Removing a
policy revokes its saved registrations on restart. No existing execution is adopted.

`hosts`, `repositories`, `workflows`, and `viewer` retain their existing shapes.
With an admission policy, the two repository/workflow arrays may start empty.
Existing static repository and source registrations remain supported.

## Public operations

`admit_project` requires the `control:project` scope and exactly these fields:

| Field             | Meaning                                                              |
| ----------------- | -------------------------------------------------------------------- |
| `hostId`          | An already granted local host                                        |
| `repositoryId`    | Unique immutable identity for the admitted worktree/revision binding |
| `assignmentId`    | Authorized source-workflow assignment                                |
| `baseRevision`    | Full 40-character commit SHA available in this repository            |
| `checkoutPath`    | Canonical absolute Git worktree root                                 |
| `sourceRoot`      | Canonical existing directory inside that checkout                    |
| `admissionIntent` | Exactly `admit-local-project`, expressing approved admission intent  |

Identical admission retries return the same identity. A different path, assignment,
revision, or owner cannot overwrite that identity. Use a new approved repository ID
for a new binding. Admission does not infer source scope from path existence.
Remote host registration remains a separate administrator operation.

After admission, submit `{ source, input, hostId, repositoryId, idempotencyKey }` to
`run_workflow`. `source` is relative to the admitted source root. The compiler
provides the owned `@codex/workflows` authoring API, so external repositories do not
need to install `.codex` internals. Relative imports remain restricted to the
approved source closure. Source loading executes trusted local code; it does not
provide a sandbox for top-level module code or workflow callbacks.

For direct `delegate_agent`, supply the returned `hostId`, `repositoryId`, and
`baseRevision`; supply `assignmentId`, `assignmentRef`, the actual SHA-256
`assignmentDigest`, `idempotencyKey`, `model`, `reasoningEffort`, `sandbox`,
`approvalPolicy`, `completionBoundary`, and `prompt` from the authorized assignment.
The MCP fields are flat. The HTTP `delegateAgent` form nests repository/base/assignment
under `workspace`, and model/reasoning/sandbox/approval under `runtimeProfile`.
Admission's sandbox ceiling applies and does not grant network access. Another
actor cannot delegate into the dynamic binding.

The HTTP equivalents are authenticated POST operations at `/api/control/admitProject`,
`/api/control/runWorkflow`, and `/api/control/delegateAgent`. Authentication and
loopback/origin restrictions are unchanged. No credential belongs in a URL.

## Compatibility and diagnostics

Legacy source calls without `repositoryId` still work when actor plus optional host
selects exactly one context. Multiple contexts require explicit selection. Explicit
source selection scopes idempotency to actor, host, repository, and caller key.
Dynamic admissions use project-scoped identities even when a single context is selected
without `repositoryId`. Dynamic direct delegation uses the same project isolation principle. Existing
unscoped calls retain their original identities: retry with the original call form;
switching forms creates a distinct identity and can create a new run.

| Code                             | Corrective action                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `PROJECT_ADMISSION_UNAUTHORIZED` | Check trusted actor, local host, operation scope, and administrator grant; do not forge client identity |
| `PROJECT_ROOT_UNAUTHORIZED`      | Obtain an explicit grant for the actual parent root                                                     |
| `PROJECT_REPOSITORY_INVALID`     | Supply the canonical Git worktree root                                                                  |
| `PROJECT_REVISION_INVALID`       | Verify the full commit SHA in that repository                                                           |
| `PROJECT_SOURCE_MISSING`         | Create or select the approved source directory before admission                                         |
| `PROJECT_SOURCE_OUTSIDE_ROOT`    | Correct the source boundary or symlink escape                                                           |
| `PROJECT_STORAGE_UNSAFE`         | Have the administrator inspect the configured directories and permissions                               |
| `PROJECT_IDENTITY_CONFLICT`      | Preserve the existing binding and use a new approved identity                                           |
| `WORKFLOW_CONTEXT_MISSING`       | Admit/select the correct actor-bound repository and host                                                |
| `WORKFLOW_CONTEXT_AMBIGUOUS`     | Supply both `hostId` and `repositoryId`                                                                 |
| `WORKFLOW_SOURCE_NOT_FOUND`      | Correct the source path relative to the selected source root                                            |

Errors return codes without private filesystem paths or raw compiler diagnostics.

## Concrete project registration plan — coordinator action only

Verified checkout: `/Users/mcasa_atlantis/.herdr/worktrees/michael-casas/worktree-quiet-meadow-9e6d`.
Verified revision: `96158642cb8e160de714111481b6236470f8764e`.
Verified prepared source: `.agent/workflows/multi-brand-guide/multi-brand-guide.workflow.ts`.

After reviewing and installing this candidate, the coordinator may add the following
policy to the existing daemon configuration. Preserve the current host, repository,
workflow-source, viewer, and authentication configuration. This example grants the
named owner's worktree parent, so subsequent projects beneath that approved parent
use the tool without per-project daemon edits. Broader parents need their own explicit grant.

```json
{
  "actorAgentId": "codex-control",
  "hostId": "local-demo",
  "allowedRoots": ["/Users/mcasa_atlantis/.herdr/worktrees/michael-casas"],
  "leaseRoot": "/Users/mcasa_atlantis/.codex/.agent/workspaces",
  "registryRoot": "/Users/mcasa_atlantis/.codex/.agent/project-admissions",
  "runtimeProfile": {
    "model": "gpt-5.6-luna",
    "reasoningEffort": "high",
    "sandbox": "workspaceWrite",
    "approvalPolicy": "never"
  }
}
```

Then call `admit_project` once with this exact registration request, after rechecking
the revision and confirming the actual configured host is still `local-demo`:

```json
{
  "hostId": "local-demo",
  "repositoryId": "michael-casas-quiet-meadow-96158642",
  "assignmentId": "multi-brand-guide",
  "baseRevision": "96158642cb8e160de714111481b6236470f8764e",
  "checkoutPath": "/Users/mcasa_atlantis/.herdr/worktrees/michael-casas/worktree-quiet-meadow-9e6d",
  "sourceRoot": "/Users/mcasa_atlantis/.herdr/worktrees/michael-casas/worktree-quiet-meadow-9e6d/.agent/workflows/multi-brand-guide",
  "admissionIntent": "admit-local-project"
}
```

The future source selector is `source: "multi-brand-guide.workflow.ts"`,
`hostId: "local-demo"`, and `repositoryId: "michael-casas-quiet-meadow-96158642"`.
This document does not authorize launching that workflow.

The original `submission-status.json` reports `blocked-before-admission`, `ENOENT`,
and no run ID. Reconcile any intervening attempts before choosing a run key; do not
assume that report proves the current daemon state. Preserve the logical key only
after confirming that no prior admitted run exists and choosing the explicit form.

Registration alone does not resolve the original workflow's remaining custody
issues. Its source hardcodes the original worktree for charters, transcript, and
`docs/design-system` exports. The lease service clones the chosen committed revision;
it does not copy dirty/untracked files or credentials. Before launch, the coordinator
must inventory and explicitly package required inputs/charters through approved
tracked files or bounded artifacts, and reconcile absolute original-worktree reads
and writes with the intended lease/export authority. Do not blanket-copy the worktree,
discard dirty state, or read the transcript as part of this registration repair.

## Focused validation

Use Bun and Nx. On the standing 0.151.0 runtime profile, prepend
`/Users/mcasa_atlantis/.local/opt/codex-0.151.0/node_modules/.bin` to `PATH`.

```sh
bun nx run @codex/daemon:test-project-context-l2 --skipNxCache
bun nx run @codex/daemon:test-project-context-l3 --skipNxCache
bun nx run @codex/testing:test-policy --skipNxCache
```

The acceptance fixture uses three independent temporary Git projects, real HTTP/MCP,
real source compilation, persistent admission reconstruction, and real App Server
workspace lease commands. Deliberately invalid workflow exports prove selection
without reaching workflow persistence or a paid model turn. Separate L1 assertions
prove project-scoped prepared run identities. These checks do not launch the original
design workflow or claim independent review approval.
