# CI/CD Pipeline Guide

This document explains the CI/CD setup for the orbit-agent project.

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         CI/CD Pipeline                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Push/PR to main/develop                                        │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    CI Workflow (ci.yml)                   │  │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────┐ │  │
│  │  │ TypeScript │ │   ESLint   │ │    Test    │ │ Build  │ │  │
│  │  │   Check    │ │   Check    │ │            │ │        │ │  │
│  │  └──────┬─────┘ └──────┬─────┘ └──────┬─────┘ └───┬────┘ │  │
│  │         │              │              │           │       │  │
│  │         └──────────────┴──────────────┴───────────┘       │  │
│  │                        │                                  │  │
│  │                        ▼                                  │  │
│  │               ┌─────────────────┐                         │  │
│  │               │   CI Passed     │ ← Required status check │  │
│  │               └─────────────────┘                         │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Dependabot PR?                                                 │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │            Auto-merge Workflow (auto-merge.yml)           │  │
│  │  If minor/patch update → Auto-merge after CI passes       │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  Git Tag (v*)                                                   │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Release Workflow (release.yml)               │  │
│  │  Run checks → Build → Create GitHub Release               │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Workflow Files

### 1. CI Workflow (`.github/workflows/ci.yml`)

**Triggers:** Push or PR to `main` or `develop` branches

**Jobs (run in parallel):**
| Job | Purpose | Command |
|-----|---------|---------|
| `typecheck` | Verify TypeScript types | `npm run typecheck` |
| `lint` | Check code style (zero warnings) | `npm run lint` |
| `test` | Run unit tests | `npm run test` |
| `build` | Verify production build works | `npm run build` |
| `ci-passed` | Quality gate - fails if any job fails | Checks all job results |

**Artifacts:**

- Only uploaded on `main` branch pushes
- 3-day retention to save storage
- Named `dist-{commit-sha}`

### 2. Auto-merge Workflow (`.github/workflows/auto-merge.yml`)

**Triggers:** Dependabot PRs

**Behavior:**

- Minor version updates (1.2.0 → 1.3.0): Auto-merge
- Patch version updates (1.2.0 → 1.2.1): Auto-merge
- Major version updates (1.0.0 → 2.0.0): Manual review required

### 3. Release Workflow (`.github/workflows/release.yml`)

**Triggers:**

- Git tag push (`v*`)
- Manual dispatch with version input

**Steps:**

1. Run all CI checks
2. Build production bundle
3. Create zip and tar.gz archives
4. Create GitHub Release with assets

**Creating a release:**

```bash
# Option 1: Git tag
git tag v1.0.0
git push --tags

# Option 2: Manual trigger in GitHub Actions UI
```

### 4. Dependabot (`.github/dependabot.yml`)

**Schedule:** Weekly on Monday

**Behavior:**

- Groups minor/patch updates into single PRs
- Limits to 5 open PRs
- Adds labels: `dependencies`, `ci`

## Common Tasks

### Merge a Dependabot PR

```bash
# If CI passed, merge directly
gh pr merge <PR_NUMBER> --squash

# If needs rebase (conflict with main)
gh pr comment <PR_NUMBER> --body "@dependabot rebase"
# Wait for rebase, then merge
```

### Bulk Operations on Dependabot PRs

```bash
# List all open Dependabot PRs
gh pr list --author "app/dependabot" --state open

# Rebase all Dependabot PRs
gh pr list --author "app/dependabot" --state open --json number -q '.[].number' | \
  xargs -I {} gh pr comment {} --body "@dependabot rebase"

# Close all Dependabot PRs (they'll be recreated next week)
gh pr list --author "app/dependabot" --state open --json number -q '.[].number' | \
  xargs -I {} gh pr close {}
```

### Handle Failed CI

```bash
# Check what failed
gh run list --limit 5

# View specific run
gh run view <RUN_ID>

# Re-run failed jobs
gh run rewatch <RUN_ID>
```

### Skip CI for a Commit

Add `[skip ci]` to commit message:

```bash
git commit -m "docs: update README [skip ci]"
```

## Configuration Reference

### CI Checks Required for Merge

To enforce CI, set up branch protection:

1. Go to: `Settings → Branches → Add rule`
2. Branch name pattern: `main`
3. Enable:
   - ☑ Require a pull request before merging
   - ☑ Require status checks to pass
   - Required checks: `CI Passed`
   - ☑ Require branches to be up to date

### NPM Scripts Used by CI

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint src --max-warnings 0",
    "test": "vitest run",
    "build": "tsc --noEmit && vite build"
  }
}
```

### Environment Variables

| Variable       | Location      | Purpose              |
| -------------- | ------------- | -------------------- |
| `NODE_VERSION` | ci.yml        | Node.js version (22) |
| `GITHUB_TOKEN` | Auto-provided | GitHub API access    |

## Troubleshooting

### "Artifact storage quota has been hit"

**Cause:** Too many artifacts stored

**Fix:**

1. Artifacts now only upload on main (already configured)
2. Delete old artifacts:

```bash
gh api repos/{owner}/{repo}/actions/artifacts --paginate -q '.artifacts[].id' | \
  xargs -I {} gh api -X DELETE repos/{owner}/{repo}/actions/artifacts/{}
```

### Dependabot PR has merge conflict

**Cause:** Main branch changed since PR was created

**Fix:**

```bash
gh pr comment <PR_NUMBER> --body "@dependabot rebase"
```

### Major version update breaks build

**Cause:** Breaking API changes in dependency

**Options:**

1. Close the PR, stay on old version:

```bash
gh pr close <PR_NUMBER> --comment "Breaking changes, will upgrade separately"
```

2. Fix the code to work with new version, then merge

### CI passes locally but fails in GitHub

**Causes:**

- Different Node.js version
- Missing environment variables
- Cached dependencies

**Fix:**

```bash
# Match CI environment
rm -rf node_modules package-lock.json
npm install
npm run typecheck && npm run lint && npm run build
```

## File Structure

```
.github/
├── dependabot.yml          # Dependency update config
├── pull_request_template.md # PR template
└── workflows/
    ├── ci.yml              # Main CI pipeline
    ├── release.yml         # Release automation
    └── auto-merge.yml      # Dependabot auto-merge
```

## Best Practices

1. **Never skip CI** - Don't use `--no-verify` or `[skip ci]` for code changes
2. **Keep dependencies updated** - Merge Dependabot PRs regularly
3. **Review major updates** - Check changelogs for breaking changes
4. **Use semantic versioning** for releases (v1.0.0, v1.1.0, v2.0.0)
5. **Don't store secrets** in code - Use GitHub Secrets for API keys

## Quick Reference

| Task                | Command                                                              |
| ------------------- | -------------------------------------------------------------------- |
| Run CI locally      | `npm run typecheck && npm run lint && npm run test && npm run build` |
| List Dependabot PRs | `gh pr list --author "app/dependabot"`                               |
| Merge PR            | `gh pr merge <NUMBER> --squash`                                      |
| Rebase PR           | `gh pr comment <NUMBER> --body "@dependabot rebase"`                 |
| Create release      | `git tag v1.0.0 && git push --tags`                                  |
| View CI runs        | `gh run list`                                                        |
| Re-run CI           | `gh run rewatch <RUN_ID>`                                            |
