# Merge Strategy: feat/migration-granular + feat/migration

## Overview

We have two branches that contain the same codebase changes from `v0.0.6`:

| Branch                    | Purpose                                   | Commits         |
| ------------------------- | ----------------------------------------- | --------------- |
| `feat/migration-granular` | ~2,600 small commits (contribution graph) | ~100 lines each |
| `feat/migration`          | Real development branch (ongoing work)    | Normal commits  |

Both started from `v0.0.6`. The granular branch is a mechanical split of the same code.

---

## Step-by-Step Merge Guide

### Step 1: Merge the granular branch first

This gets the ~2,600 commits onto main and lights up the contribution graph.

```bash
# Push the granular branch if not already pushed
git push -u origin feat/migration-granular

# Create PR on GitHub
gh pr create \
  --base main \
  --head feat/migration-granular \
  --title "feat: Orbit v0.0.7 codebase (granular)" \
  --body "Granular commit history for the v0.0.7 migration."
```

**Merge method: Rebase and merge** (this preserves all ~2,600 individual commits on main).

> DO NOT use squash merge — it would collapse everything into 1 commit, defeating the purpose.

### Step 2: Rebase feat/migration onto main

After the granular PR is merged, main now has all the code. Rebase your working branch on top:

```bash
git checkout feat/migration
git fetch origin
git rebase origin/main
```

**What happens during rebase:**

- Git replays your `feat/migration` commits on top of main
- Commits that introduce code already on main (from the granular merge) will become **empty**
- Git auto-skips empty commits, or you can use `--skip` if prompted
- Only commits with **new work** (done after the granular split) will remain

If you get conflicts:

```bash
# For each conflict, keep your feat/migration version (it's the "real" one)
git checkout --theirs .
git add .
git rebase --continue
```

### Step 3: Continue working on feat/migration

After rebasing, your branch is clean — sitting on top of main with only your new commits. Keep developing normally.

### Step 4: Merge feat/migration to main when ready

```bash
git push -u origin feat/migration --force-with-lease

gh pr create \
  --base main \
  --head feat/migration \
  --title "feat: Orbit v0.0.7 continued development" \
  --body "Ongoing development work on top of the v0.0.7 migration."
```

**Merge method: Rebase and merge** (as always).

---

## Timeline

```
TODAY
  │
  ├─ feat/migration-granular created (same code, ~2,600 commits)
  │
  ▼ WHENEVER READY (can be today or later)
  │
  ├─ Merge feat/migration-granular → main (PR, rebase and merge)
  │
  ├─ Rebase feat/migration onto main (git rebase origin/main)
  │   └─ Old commits auto-skip, only new work remains
  │
  ├─ Continue developing on feat/migration...
  │
  ▼ WHEN DEVELOPMENT IS DONE
  │
  └─ Merge feat/migration → main (PR, rebase and merge)
```

---

## FAQ

**Q: What if I haven't done any new work on feat/migration after the granular split?**
A: Then after rebasing, feat/migration will have zero new commits. Nothing to merge — you're already on main.

**Q: What if I've been working on feat/migration and modified files that are in the granular branch?**
A: You'll get merge conflicts during rebase. Resolve by keeping your feat/migration version (`git checkout --theirs .`). These are straightforward since you know your version is correct.

**Q: Can I delete feat/migration-granular after merging it?**
A: Yes. Once merged to main, the branch is just a pointer. Delete it on GitHub and locally:

```bash
git branch -d feat/migration-granular
git push origin --delete feat/migration-granular
```

**Q: What if I want to merge feat/migration first instead?**
A: That works too, but then the granular branch will have conflicts with main (since the same files exist). You'd need to rebase granular onto main, which would make most of its commits empty. The contribution graph would only count the non-empty ones. Merging granular first avoids this.

**Q: Will GitHub count all ~2,600 commits on my contribution graph?**
A: Yes, as long as:

1. You use **Rebase and merge** (not squash)
2. The commit author email matches your GitHub account
3. The commits land on the default branch (main)
