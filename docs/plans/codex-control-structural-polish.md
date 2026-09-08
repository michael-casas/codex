# Codex Control — mandatory structural polish register

**Disposition:** existing structural debt deferred from Base to Final Polish by
Founder ruling on 2026-09-03. This is not a conformance finding or a permanent waiver.
**Confirmed count:** seven implemented packages. Transport is unassessed, not cleared.
**Execution:** planning and source annotations only; no refactor or auditor launch authorized here.

## Governing rule: File System AND Clean Code

Read the canonical Agent Wiki standards together:

- [File System](</Users/mcasa_atlantis/Documents/vaults/Agent Wiki/standards/File System.md>):
  domain CQRS layout (§4.1), provider locality (§4.2), seam naming (§5),
  explicit facades (§7), dependency direction (§9), and generator correction (§18).
- [Clean Code](</Users/mcasa_atlantis/Documents/vaults/Agent Wiki/standards/Clean Code.md>):
  cohesive implementation, understandable behavior, narrow interfaces, and testability.

Ponytail chooses the least complex compliant implementation. It does not waive
either standard. Clean implementation does not establish clean structure, and
well-named folders do not establish correct behavior.

The Founder temporarily suspends blocking Base on the existing findings below.
Every new or materially rewritten implementation must follow both standards.
Do not copy existing violations as precedent, add wildcard barrels, or create
new structural debt under this suspension. Unrelated inherited debt need not
be repaired opportunistically; record it for the authorized polish scope.

## Mandatory carry-forward findings

These stable IDs also appear in source-local MARK:REFACTOR comments. They are
confirmed findings from a targeted inspection, not an exhaustive repository audit.

| ID        | Package         | Confirmed evidence                                                                                                                                                                      | Required polish disposition                                                                                                               |
| --------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| CAS-FS-01 | process         | src/index.ts wildcard exports; agent-directory/agent-directory.ts mixes registration and queries; delegation/delegation.ts combines use cases and App Server method/parameter knowledge | Explicit public exports; CQRS-layered domain application commands/queries; domain-owned contracts; provider translation behind an adapter |
| CAS-FS-02 | db              | src/index.ts wildcard exports                                                                                                                                                           | Explicit supported exports; preserve persistence adapters implementing domain-owned ports                                                 |
| CAS-FS-03 | delivery        | src/index.ts wildcard exports                                                                                                                                                           | Explicit supported exports; preserve pg-boss as delivery/retry-timing authority                                                           |
| CAS-FS-04 | codex           | src/index.ts wildcard export for app-server-workflow                                                                                                                                    | Explicit handwritten exports; preserve generated protocol identity and provider locality                                                  |
| CAS-FS-05 | control-gateway | src/index.ts wildcard exports; src/lib/control-gateway.ts and control-http.ts lack the prescribed module/seam organization                                                              | Explicit supported exports; localized protocol/controller/client seams without an artificial CQRS conversion of a protocol adapter        |
| CAS-FS-06 | workflows       | src/index.ts wildcard exports                                                                                                                                                           | Explicit supported exports; classify domain use cases versus authoring/compiler mechanics before applying the required domain CQRS layout |
| CAS-FS-07 | testing         | src/index.ts wildcard export                                                                                                                                                            | Explicit supported exports; tooling locality, not blanket domain CQRS scaffolding                                                         |

**Do not claim seven CQRS violations:** all seven have confirmed facade
violations; process additionally has confirmed domain CQRS and provider-isolation
debt. Further findings require evidence.

**Open inspection item CAS-FS-08:** transport has not been cleared. Inspect
handwritten seam filenames, exports, locality, and dependencies during the
authorized quality/polish pass. Apps and plugins are outside the seven-package
count and must be separately dispositioned if included in that pass.

## Required Final Polish work packet

The future authorized CAS-13/polish envelope must carry CAS-FS-01 through
CAS-FS-07 explicitly, and disposition CAS-FS-08 as inspected or still open.
These items may not disappear into a generic “clean up code” task.

1. Bind findings to the then-current candidate and inspect public callers.
2. Classify domains versus providers/tooling. Apply CQRS to domains; retain
   vertical locality for actual provider adapters. Do not invent empty layers.
3. Preserve public behavior, stable handles, authorization, idempotency,
   selected-feed bounds, cleanup, and the frozen campaign acceptance.
4. Replace wildcard facades with deliberate exports; relocate domain use cases
   and provider translation with supported package entrypoints.
5. Reconcile filenames, test locality, export maps, TypeScript references, and
   Nx ownership for every moved surface; serialize shared-root changes.
6. Add or extend focused structural checks for explicit facades and dependency
   direction. Record the domain layout checks; existing green lint is not proof.
7. Run affected behavioral, build, typecheck, lint, and resolution checks under
   the repository BATDD profile. Pure refactors preserve characterization GREEN.
8. Record before/after paths and evidence for every finding. Clear a source MARK
   only after its disposition and required validation, never merely after renaming.

Do not report Final Polish complete while a required finding remains unresolved,
unless the Founder explicitly grants a further waiver. Base implementation
readiness is not structural acceptance or merge approval.

## Evidence provenance

Source annotations added under this Founder request are comments only.
Historical candidate hashes describe the earlier candidate and must not be
rewritten to pretend the annotated candidate is byte-identical. Bind future
polish evidence to the new candidate. No behavioral changes or retrospective
test-pass claims are introduced by this register.
