# 07 — Collaboration: Trunk-Based Dev, PRs, Review, Breaking Changes

> Reference doc for the nx-monorepo skill. How change flows through the repo: branches, stacked
> PRs, review discipline, and the breaking-change protocol. Absorbs the former `workflow.md`
> reference and the git-workflow guidance from the retired monorepo-workflows skill.

## Branch model (Founder S7 — three-tier promotion)

```
main        === production. Receives ONLY staging → main promotion PRs, each under a
              FINAL full adversarial QA audit + review + code-quality check.
              On merge: CI runs the changesets version flow (ref 04).
staging     === QA. Receives ONLY development → staging promotion PRs, cut when a
              FEATURE SET is complete (all its features merged/rebased into development).
development === the working trunk. ALL worktrees/feature branches are cut FROM
              development and PR INTO development. Trunk-based discipline applies HERE.
```

Trunk discipline (against development):

```
1. SINGLE WORKING TRUNK: development is the integration branch
2. SHORT-LIVED BRANCHES: hours-to-a-day, not weeks
3. INTEGRATE CONTINUOUSLY: rebase on development daily at minimum
4. FEATURE FLAGS: ship incomplete work dark, not on a long branch
```

Daily loop:

```bash
git checkout development && git pull --rebase
git checkout -b feat/small-change
# … change + changeset (04) …
git commit -m "feat(scope): description"
git push -u origin feat/small-change
gh pr create --fill --base development
gh pr merge --squash --delete-branch
```

Squash-merge is the default for feature PRs: one PR = one conventional commit on
development, which keeps `nx affected --base` diffs and changelogs clean. Promotion PRs
(development → staging, staging → main) are **merge commits, never squash** — squashing a
promotion rewrites every feature commit into one and breaks the next promotion's diff.

Exemption: the changesets "Version Packages" PR (ref 04) targets main directly — it is
mechanical release bookkeeping, not feature work, and does not ride the promotion ladder.

## PR sizing and stacking

Stack when a feature exceeds ~400 lines, contains multiple logical units, or the foundation
needs early review.

```bash
# Graphite
gt create -m "feat(db): add builder seam"     # PR 1
gt create -m "feat(domains): use builder"     # PR 2 (stacked)
gt submit --stack
gt sync                                        # after merges, restack

# Manual
git checkout -b feat/base && git push && gh pr create
git checkout -b feat/next && git push && gh pr create --base feat/base
# after base merges:
git checkout feat/next && git rebase main && git push --force-with-lease
gh pr edit --base main
```

## PR structure

Title = conventional commit (`feat(ui): add combobox primitive`). Body answers:

```markdown
## What / Why

## Projects changed ← from `pnpm nx show projects --affected`

## Checklist

- [ ] Changeset added (or genuinely not needed — say why)
- [ ] Tests cover the change
- [ ] No new boundary violations (lint passes)
- [ ] Breaking changes documented + protocol followed
```

## Review discipline

Order of concerns:

```
[ ] Context: read the description and linked issue before the diff
[ ] Approach: is the shape right? (cheapest place to object)
[ ] Monorepo: boundaries respected? changes confined to the packages named?
    no new dependency edges that the tag matrix should forbid?
[ ] Correctness: does it do what it claims? edge cases?
[ ] Tests: present, at the right layer, actually assert behavior
[ ] Versioning: changeset present and honest about bump level
```

Comment conventions:

```
🚫 Blocking: must fix          💡 Suggestion: consider
❓ Question: need to understand 🔧 Nitpick: optional
✨ Praise: keep doing this
```

Distinguish blockers (security, data loss, boundary/invariant violations, broken contract) from
suggestions — never block on style that a formatter or lint doesn't already enforce.

## Breaking changes

A breaking change to a shared package follows the expand → migrate → contract protocol:

```markdown
## Breaking Change: @arcana-market/<pkg> vN

**Change:** removed `legacyThing()`
**Migration:** before/after snippet
**Timeline:** Day 0 announce · deprecation warning ships · removal PR
**Approvals:** [ ] owning team [ ] every consuming project's owner
```

1. **Expand:** add the new API alongside the old; mark old `@deprecated` with a pointer:

   ```ts
   /** @deprecated Use login() instead. Removed in next major. */
   export function legacyLogin(...args) {
     return login(...args);
   }
   ```

2. **Migrate:** update all internal consumers (`pnpm nx graph --focus=<pkg>` to find them) —
   in the monorepo you own every caller, so do the migration in the same stack.
3. **Contract:** remove the old API in a **major** changeset.

Never break-and-fix in one unreviewable mega-PR when a stack can stage it.

## Review checklist (for the reviewer of this doc's process itself)

- [ ] Branches short-lived; no long-running feature branches
- [ ] Squash-merged conventional titles on main
- [ ] Stacks used instead of >400-line PRs
- [ ] Changeset accompanies every consumer-visible package change
- [ ] Breaking changes staged expand → migrate → contract with owner approvals
