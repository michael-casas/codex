# CAS branch governance

Founder ruling, 2026-09-04: apply the global git-branch skill to the Codex App
Server feature, identified as `CAS`. Jira integration is suspended for this
campaign while the Founder provisions a Jira space. Existing CAS seam IDs are
local task identifiers, not invented Jira tickets.

## Required route

Follow `/Users/mcasa_atlantis/.codex/skills/git-branch/SKILL.md` and its core
policy. Use the local equivalent of its hierarchy:

```text
CAS/<CAS task ID>_<subtask>
  -> CAS/<CAS task ID>
  -> CAS/integration
  -> development
  -> staging
  -> main
```

For example, `CAS/CAS-TEMP-R1` identifies the existing temp repair task.
Never create a bare `CAS` branch. Jira ticket creation, linkage, and lifecycle
are not gates during this explicit waiver. All other Git safeguards remain.

## Adoption checkpoint

Read-only preflight on 2026-09-04 found the current a4a6 worktree detached at
`b9dc01512975a8b11bc673b5ec906c818dd708f6`, with no upstream, 80 tracked
changes and 1,110 untracked files. Live origin/main matched that SHA; no
origin/development or origin/staging heads were returned. These are an opening
snapshot, not ongoing state or permission to capture every file in Git.

The accumulated candidate belongs to the existing shared-worktree campaign.
Preserve it and its prior custody exception during transition. Do not silently
stash all files, switch branches under active writers, copy credentials into
Git, or treat the candidate as a clean new task branch.

Before the next change-bearing Git operation, the coordinator must obtain a
quiescent repository write lease, inventory candidate versus unrelated and
sensitive paths, rerun upstream preflight, and present the exact adoption
topology. Bootstrap requires the technical user's approval under the skill;
this document does not itself authorize creation of canonical branches,
commits, merges, pushes, or cleanup.

New task assignments must name their local CAS ID, owning branch, parent,
isolated worktree and write lease before product mutation. Current workers
must not perform Git topology operations. Existing shared-worktree repairs
finish their scoped checkpoint without broadening that exception.

## Delivery

## Local adoption completed — 2026-09-04

Founder authorized adoption with “Engage branch topology adoption.” Both known
writers reached their checkpoints before the coordinator took the Git write
lease. After fetching origin, verified origin/main remained
`b9dc01512975a8b11bc673b5ec906c818dd708f6`.

Created `development`, `staging`, `CAS/integration`, and `CAS/CAS-BASE` in one
atomic ref transaction at that SHA. Attached this a4a6 worktree to
`CAS/CAS-BASE`. CAS-BASE is the local custody task for the accumulated Base
candidate, with intended parent `CAS/integration`; it is not a Jira issue.
This explicitly preserves the historical campaign base rather than pretending
the existing changes were independently developed on new task branches.

Before/after branch attachment, porcelain status fingerprint was identical
(`8d0fa7410b3a25160e33835fe9736450366b38e154cda5f1e29bca964aa8d64d`),
tracked raw-diff metadata fingerprint was identical
(`c264b1f5f486c95d81bcecc529b3738b62914f8bb658cefdac0eb201630a75bf`),
and the index remained empty. These checks establish unchanged Git status and
diff metadata, not a content digest of every untracked file.

No stash, commit, merge, push, reset, file cleanup, or service restart occurred.
All newly created branches are local and have no remote tracking upstream.
Remote rulesets and checks are not installed by this local adoption. New
isolated task worktrees require an appropriately reviewed candidate checkpoint
before they can inherit the accumulated uncommitted implementation. Do not
start a repair from the old baseline and claim it contains this candidate.

## Promotion requirements

Promotions use reviewed merge commits and affected validation. BASE_READY is
not permission to merge directly into main. Preserve all original evidence;
bind final validation to the actual integrated candidate. Jira adoption later
requires an explicit mapping and does not retroactively invalidate local IDs.
