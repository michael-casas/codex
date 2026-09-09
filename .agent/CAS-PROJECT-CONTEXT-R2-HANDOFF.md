# CAS-PROJECT-CONTEXT-R2 handoff

Status: READY-FOR-REVIEW. Worker claim: READY-FOR-AUDIT; independent acceptance remains coordinator-owned.

PR: https://github.com/michael-casas/codex/pull/6
Branch: `CAS/CAS-BASE_project-context`; target: `CAS/integration`.
Base: `48bdb3eef84dd23a4eb6a20ed01a327133202417`.
Product commit: `083330b111aa0f9f280f5cfcbe38ae175a6e9001`.
The following documentation commit contains this handoff and final evidence metadata; its exact SHA is the branch head. No merge performed.

## Delivered behavior

The public `admit_project` tool and authenticated HTTP `POST /api/control/admitProject` register immutable local Git bindings under an administrator-granted actor/host/root policy. A caller path alone grants no authority. Persistent owner-only configuration survives reconstruction; safe first-use directories avoid manual per-project daemon edits. Source selection accepts `repositoryId` alongside `hostId`; direct delegation uses the same registry and real isolated Git lease service.

Validation rejects unauthorized actors, hosts, roots, symlink escapes, invalid Git/revisions, conflicting identities and ambiguous selection before compilation or launch. Missing-source diagnostics are redacted. Compilation supplies the owned `@codex/workflows` authoring API to external repositories. Dynamic source/direct retry identities are scoped by actor, host and repository. Static single-context calls preserve old identities; switching to explicit selection changes identity and requires reconciliation.

Changed surfaces: daemon admission/config/source resolution, workflow source contract/compiler, public gateway/HTTP/MCP, plugin entrypoint/skill/built artifact/version, focused tests/manifest and operator docs. No existing-thread adoption or remote admission changes.

## API and original-project registration

[local-project-admission.md](../docs/local-project-admission.md) contains the exact administrator policy, tool examples, source/direct HTTP field mapping, diagnostics and migration procedure. After review/install and the documented parent-root grant, the first-use request is:

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

Future `run_workflow` selects `source: "multi-brand-guide.workflow.ts"` with that host/repository, approved input and a reconciled idempotency key. This plan does not authorize launch. Direct `delegate_agent` accepts flat host/repository/base/assignment fields plus assignment reference/digest, prompt, runtime profile, completion boundary and idempotency key; HTTP nests workspace/runtimeProfile.

The verified original revision is above. Its historical status reported blocked-before-admission, ENOENT and no run ID; reconcile intervening attempts before launch. The prepared workflow hardcodes original paths for charters, transcript and exports. Dirty/untracked inputs do not enter committed Git leases. Coordinator must inventory/package approved inputs and establish original-path/export custody first. No transcript was read or original file changed.

## Validation and evidence

Frozen contract: [project-context-contract.json](project-context-contract.json). Row identities, report paths and SHA-256 hashes: [CAS-PROJECT-CONTEXT-R2-EVIDENCE.json](CAS-PROJECT-CONTEXT-R2-EVIDENCE.json). Raw reports remain in this retained lease's `test-output/`.

- Meaningful RED: four new L1 rows, fourteen L2 rows, one L3 public-tool scenario; all required rows subsequently GREEN. Frozen semantics preserved; permitted formatting/type/scanner plumbing recorded in evidence.
- Affected lint/typecheck/build: eight projects passed, with 39 existing unrelated lint warnings and zero errors.
- Affected L1: 191 tests across six projects passed. Affected L2: seven projects passed. Affected L3: nine scenarios across four projects passed.
- Final dynamic-context identity change: focused workflows/daemon/plugin build/typecheck/lint, workflows/daemon L1, fourteen project L2 rows and one public L3 scenario/five steps passed.
- Test policy: 116 selected tests, 13 standing targets passed. Plugin validation and two generator runs passed.
- Final credential-free native smoke passed install/reinstall, installed skill, ten MCP tools and discovery after restart using Codex 0.151.0/Bun 1.4.2. Package SHA-256: `0ba4ed2899376818d349429bd780f93c9d112c4364a875ce6295f8d23d0d1f21`. Owned container absent. No paid turn.
- Commit hooks ran required affected validation successfully. First-commit lint-staged restaging emitted an ignored `.agent` path warning after validation; Git completed the commit and force-staged evidence was verified present. No hook bypass.
- `git diff --check` passed; canonical checkout remained clean. Zero owned temporary project fixtures remained; fixture teardown cleaned listeners/hosts/leases. Assigned lease/reports retained. Unrelated `.codex-workspace-lease.json` preserved and excluded.

The initial native inventory failed because it expected nine tools; adding the required new tool to the declared inventory made the clean-install gate pass. Intentional pre-implementation RED reports are retained.

## Remaining coordinator work

Review/audit candidate and hosted CI, then decide live plugin/config installation and restart. No canonical runtime/config/service changes, PR #2 changes, child agents, paid turns, original workflow launch or merge occurred. Original input/export custody remains a launch blocker separate from this repair.

Runtime scratchpad initialization was unavailable because this session's CODEX_HOME lacked the referenced Python initializer. Runtime configuration was left untouched; this handoff/evidence preserve the record. That ancillary observation is not product acceptance evidence.
