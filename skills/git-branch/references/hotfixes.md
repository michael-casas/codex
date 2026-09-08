# Production Hotfix Protocol

Use this reference only for a confirmed production repair.

## Entry

1. Inspect and verify live `origin/main`.
2. Create `HOTFIX/<HOTFIX_HASH>` from that exact revision in an isolated
   worktree.
3. Make the smallest repair, run affected validation, and prove application or
   server boot plus a representative interaction where applicable.
4. Never push red.
5. Open a reviewed PR into `main`. No production deployment originates from the
   hotfix branch itself.

## Forward-port

After the hotfix merge:

1. Record the exact merged repair commit.
2. Create a forward-port branch from current `development`.
3. Cherry-pick the exact patch, reconcile conflicts semantically, and run
   affected validation.
4. Open a reviewed PR into `development`.
5. If a separate active staging release needs the repair before the next normal
   promotion, create and review a staging forward-port as well.
6. Active Tasks rebase only onto the now-updated `development` or their updated
   owning Epic integration branch.

Never rebase a shared canonical branch onto `main`. Never base ordinary Task
work directly on `main`.

## Completion

The hotfix is complete only when:

- production contains the repair;
- development contains the same semantic patch;
- any active staging candidate is reconciled;
- affected checks are green;
- the release record links the hotfix and forward-port commits;
- the owned hotfix worktree and branch are cleaned after evidence is secured.
