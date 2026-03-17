# Upstream Sync Reference Guide

This repo is a private fork of [anomalyco/opencode](https://github.com/anomalyco/opencode) maintained at [Recusive/Orbit-infra](https://github.com/Recusive/Orbit-infra). Our custom modifications live on the `Orbit` branch. This fork serves as the **AI SDK server** for the Snowflake desktop app — it runs as a Tauri sidecar and exposes an HTTP + SSE API that the React frontend consumes directly.

**Two sync strategies are documented below:**

1. **Tag Merge** (§ Syncing Upstream Releases) — merge entire release tags. Best when divergence is small.
2. **Selective Cherry-Pick** (§ Selective Sync) — diff a release, hand-pick what you want. Best after heavy rebrand/customization.

---

## Current Baseline

| Field                     | Value                                          |
| ------------------------- | ---------------------------------------------- |
| **Last synced tag**       | `v1.2.24`                                      |
| **Custom commits on top** | 1 (`155ab89 feat: custom Orbit modifications`) |
| **Date synced**           | March 2026                                     |

> **Update this table** every time you sync upstream. This is how future sessions know the starting point.

---

## Two-Repo Workflow

There are two copies of this codebase that serve different purposes:

```
/Users/no9labs/Developer/Recursive/opencode/          ← GIT SYNC HUB
  • Has .git with full history
  • Has upstream + origin remotes
  • Orbit branch for our changes
  • This is where merges/cherry-picks happen

/Users/no9labs/Developer/Recursive/Snowflake-v0/Agent-backend/  ← WORKING COPY
  • No .git (lives inside Snowflake-v0's git)
  • This is where you develop day-to-day
  • Changes flow FROM opencode/ TO here after sync
```

### Sync flow

```
1. GitHub notification: "opencode v1.2.25 released"
          │
2. cd ~/Developer/Recursive/opencode/
   git fetch upstream --tags
   git checkout Orbit
   git merge v1.2.25   (or cherry-pick)
          │
3. After resolving conflicts + testing:
   Copy changed files → Agent-backend/
          │
4. Rebuild sidecar:
   ./scripts/build-orbit-sdk.sh
```

### Copying changes from opencode/ to Agent-backend/

After a successful merge in the opencode repo:

```bash
# See what files changed in the merge
cd /Users/no9labs/Developer/Recursive/opencode
git diff --name-only HEAD~1..HEAD

# Copy specific changed files (NOT rsync the whole thing — preserves our Agent-backend-only changes)
cp packages/opencode/src/session/prompt.ts \
   /Users/no9labs/Developer/Recursive/Snowflake-v0/Agent-backend/packages/opencode/src/session/prompt.ts

# Or for a larger sync, use rsync with exclusions:
rsync -av --exclude='node_modules' --exclude='dist' --exclude='.git' \
  packages/opencode/src/provider/ \
  /Users/no9labs/Developer/Recursive/Snowflake-v0/Agent-backend/packages/opencode/src/provider/
```

---

## Monitoring Upstream Releases

Upstream ships ~50 commits/day but tags releases roughly once per day. You need to know **when** a new tag drops and **what changed**.

### Method 1: GitHub Watch (set up once)

1. Go to [github.com/anomalyco/opencode](https://github.com/anomalyco/opencode)
2. Click **Watch** → **Custom** → check **Releases only**
3. You'll get an email/GitHub notification whenever they tag a new version

### Method 2: Quick CLI check (on-demand)

```bash
cd /Users/no9labs/Developer/Recursive/opencode
git fetch upstream --tags

# Latest upstream tags
git tag --sort=-creatordate | head -5

# Your last sync point
git describe --tags --abbrev=0 Orbit

# If these differ, there's a new release to review
```

### Method 3: check-upstream script (recommended)

Save this as `scripts/check-upstream.sh` in the opencode repo:

```bash
#!/bin/bash
# Check for new upstream opencode releases
set -e
cd "$(dirname "$0")/.."

echo "Fetching upstream tags..."
git fetch upstream --tags --quiet

CURRENT=$(git describe --tags --abbrev=0 Orbit 2>/dev/null || echo "unknown")
LATEST=$(git tag --sort=-creatordate | head -1)

echo ""
echo "Your tag:   $CURRENT"
echo "Latest tag: $LATEST"

if [ "$CURRENT" = "$LATEST" ]; then
  echo ""
  echo "✓ You're up to date."

  # Show unreleased commits on upstream dev
  UNRELEASED=$(git log --oneline $LATEST..upstream/dev 2>/dev/null | wc -l | tr -d ' ')
  if [ "$UNRELEASED" -gt 0 ]; then
    echo "  ($UNRELEASED unreleased commits on upstream/dev — wait for next tag)"
  fi
else
  echo ""
  echo "⚠ New release available: $LATEST"
  echo ""
  echo "=== Files changed in engine (packages/opencode/src/) ==="
  git diff --stat $CURRENT..$LATEST -- packages/opencode/src/ 2>/dev/null || echo "(no engine changes)"
  echo ""
  echo "=== Commits ==="
  git log --oneline $CURRENT..$LATEST -- packages/opencode/src/ 2>/dev/null || echo "(none)"
  echo ""

  # Show changes in critical directories
  for dir in session server provider tool bus permission mcp; do
    COUNT=$(git diff --name-only $CURRENT..$LATEST -- packages/opencode/src/$dir/ 2>/dev/null | wc -l | tr -d ' ')
    if [ "$COUNT" -gt 0 ]; then
      echo "  $dir/  — $COUNT files changed"
    fi
  done

  echo ""
  echo "Run: git checkout Orbit && git merge $LATEST"
  echo "  or use selective cherry-pick (see upstream-sync.md)"
fi
```

Run it anytime:

```bash
cd /Users/no9labs/Developer/Recursive/opencode
./scripts/check-upstream.sh
```

Example output when a new release exists:

```
Your tag:   v1.2.24
Latest tag: v1.2.25

⚠ New release available: v1.2.25

=== Files changed in engine (packages/opencode/src/) ===
 session/prompt.ts   | 12 ++++++---
 provider/adapters/  |  3 +++
 2 files changed, 10 insertions(+), 5 deletions(-)

  session/  — 1 files changed
  provider/ — 1 files changed

Run: git checkout Orbit && git merge v1.2.25
  or use selective cherry-pick (see upstream-sync.md)
```

---

## Remotes

| Remote     | URL                                           | Purpose                         |
| ---------- | --------------------------------------------- | ------------------------------- |
| `origin`   | `https://github.com/Recusive/Orbit-infra.git` | Private repo (our code)         |
| `upstream` | `https://github.com/anomalyco/opencode.git`   | Public opencode repo (upstream) |

## Branches

| Branch  | Tracks         | Purpose                                                     |
| ------- | -------------- | ----------------------------------------------------------- |
| `dev`   | `upstream/dev` | Clean mirror of upstream. **Never commit directly here.**   |
| `Orbit` | `origin/Orbit` | Our custom changes, merged on `dev`. All work happens here. |

---

## Day-to-Day Development

Work on the `Orbit` branch. Commit and push normally:

```bash
git checkout Orbit
# make changes
git add <files>
git commit -m "description of change"
git push origin Orbit
```

---

## Syncing Upstream Releases

**Sync on release tags, not individual commits.** Tagged releases are tested and stable. See § Monitoring Upstream Releases for how to know when a new tag drops.

### Step 1: Fetch upstream and tags

```bash
git fetch upstream --tags
```

### Step 2: Check for new releases

```bash
git tag --sort=-creatordate | head -10
```

Compare against the last tag you merged (check merge log):

```bash
git log --oneline Orbit --grep="Merge tag" | head -5
```

### Step 3: Preview what's coming

Before merging, understand the scope:

```bash
# What files did upstream change since last release?
git diff --name-only v1.2.24..v1.2.25

# What files have WE changed?
git diff --name-only dev..Orbit

# Which files OVERLAP (potential conflicts)?
comm -12 \
  <(git diff --name-only dev..Orbit | sort) \
  <(git diff --name-only v1.2.24..v1.2.25 | sort)
```

### Step 4: Merge the release tag

```bash
git checkout Orbit
git merge v1.2.25
```

Three outcomes per file:

| Category                            | What happens     | Action needed    |
| ----------------------------------- | ---------------- | ---------------- |
| Files only **upstream** changed     | Auto-merged      | None             |
| Files only **you** changed          | Untouched        | None             |
| Files **both** changed (same lines) | Conflict markers | Resolve manually |

### Step 5: Resolve conflicts (if any) and push

```bash
# see conflicted files
git status

# fix each one, then
git add <resolved-files>
git commit          # git pre-fills "Merge tag v1.2.25"
git push origin Orbit
```

---

## Interactive Conflict Resolution

When conflicts arise during a merge, use this process to review and resolve them one by one with full control.

### Step 1: Start the merge

```bash
git checkout Orbit
git merge v1.2.25
```

If there are conflicts, git will stop and report them.

### Step 2: List all conflicts

```bash
git diff --name-only --diff-filter=U
```

This prints every conflicted file. Example output:

```
packages/opencode/src/session/prompt.ts
packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx
bun.lock
```

### Step 3: For each file, review the conflict

Before touching anything, see what both sides did:

```bash
# Show our version vs their version for a specific file
git diff --merge HEAD...MERGE_HEAD -- <file>

# Or open the file and look at the markers:
#   <<<<<<< HEAD (Orbit — our code)
#   ... our version ...
#   =======
#   ... their version ...
#   >>>>>>> v1.2.25 (upstream)
```

### Step 4: Pick a resolution strategy per file

For each conflicted file, you have four options:

```bash
# Option A: Keep OUR version (discard upstream's changes to this file)
git checkout --ours <file>
git add <file>

# Option B: Take THEIR version (discard our changes to this file)
git checkout --theirs <file>
git add <file>

# Option C: Manually merge (open file, edit, combine both)
# edit the file, remove <<<<<<< ======= >>>>>>> markers
git add <file>

# Option D: Skip this file for now, come back later
# just don't git add it yet
```

### Step 5: Verify and commit

```bash
# Confirm no conflicts remain
git diff --name-only --diff-filter=U

# If empty, all conflicts resolved — commit
git commit
git push origin Orbit
```

### Step 6: Abort if needed

If the merge is too messy and you want to start over:

```bash
git merge --abort
```

This returns you to exactly where you were before the merge. Nothing lost.

---

## Rename Strategy

When renaming `opencode` → `Orbit`, do it in exactly **two commits** to preserve git's rename tracking:

### Commit 1: File/folder renames only

```bash
git mv packages/opencode packages/orbit
# fix import paths to match new folder
# NO logic changes, NO branding changes
git commit -m "rename: packages/opencode → packages/orbit"
```

Git detects this as a rename (high similarity %). Future upstream merges will apply their `packages/opencode/` changes to your `packages/orbit/` paths automatically.

### Commit 2: Branding/string changes

```bash
# Replace user-facing strings: "OpenCode" → "Orbit" in prompts, UI, CLI output
# Leave internal plumbing alone (.opencode/ dirs, config keys)
git commit -m "brand: opencode → Orbit in user-facing strings"
```

### What to rename vs what to leave alone

| Rename to "Orbit"                        | Leave as "opencode"           |
| ---------------------------------------- | ----------------------------- |
| System prompts                           | `.opencode/` config directory |
| CLI output / help text                   | Internal variable names       |
| UI labels and titles                     | Import paths                  |
| Window titles, branding                  | `opencode.json` config files  |
| Orbit package imports (`@orbit.build/*`) |                               |

Renaming internal plumbing creates ~300 extra conflict points for zero user-facing value.

---

## How Merge Conflicts Actually Work

Upstream does 50 commits/day but most touch files you haven't modified. The conflict math:

```
48 files upstream changed  ←  auto-merged (you didn't touch them)
16 files you changed       ←  untouched (they didn't touch them)
 4 files both changed      ←  potential conflicts
 2 files same-line overlap ←  actual conflicts you resolve
```

Real-world resolution is typically 5-10 minutes per release merge.

---

## Pre-Push Hook

The repo has a husky pre-push hook that runs `bun turbo typecheck` across all packages.

- Requires **Bun >= 1.3.10** (check with `bun --version`, upgrade with `bun upgrade`)
- If typecheck fails, fix the errors before pushing
- Only use `--no-verify` as a last resort for non-code pushes

---

## Adding the Remotes from Scratch

If you clone fresh from the private repo:

```bash
git clone https://github.com/Recusive/Orbit-infra.git opencode
cd opencode
git remote add upstream https://github.com/anomalyco/opencode.git
git fetch upstream --tags
```

Then checkout the branches:

```bash
git checkout dev
git checkout Orbit
```

---

## Selective Sync (Cherry-Pick Approach)

After heavy rebranding or restructuring, full tag merges may produce too many conflicts. Use selective sync instead — diff the release, read what changed, grab only what you want.

### Step 1: Fetch and identify the new release

```bash
git fetch upstream --tags
git tag --sort=-creatordate | head -5
# v1.2.30  ← new
# v1.2.29  ← last one you synced
```

### Step 2: See what changed (high-level)

```bash
# File-level summary
git diff --stat v1.2.29..v1.2.30 -- packages/opencode/src/

# Commit-level summary (one line per commit)
git log --oneline v1.2.29..v1.2.30 -- packages/opencode/src/
```

### Step 3: Drill into areas you care about

Only look at the directories that matter for the SDK:

```bash
# New providers / model support
git diff v1.2.29..v1.2.30 -- packages/opencode/src/provider/

# Tool system changes
git diff v1.2.29..v1.2.30 -- packages/opencode/src/tool/

# Session / prompt loop improvements
git diff v1.2.29..v1.2.30 -- packages/opencode/src/session/

# MCP updates
git diff v1.2.29..v1.2.30 -- packages/opencode/src/mcp/

# Permission system
git diff v1.2.29..v1.2.30 -- packages/opencode/src/permission/

# Bus / SSE events
git diff v1.2.29..v1.2.30 -- packages/opencode/src/bus/

# Server routes (new endpoints?)
git diff v1.2.29..v1.2.30 -- packages/opencode/src/server/
```

Directories you can **skip** (we don't use these):

```bash
# Skip — their UI, TUI, desktop shell, website
packages/app/
packages/tui/
packages/desktop/
packages/web/
```

### Step 4: Grab what you want

**Option A: Copy an entire file** (cleanest for self-contained additions)

```bash
# Example: they added a new provider adapter
git show v1.2.30:packages/opencode/src/provider/adapters/gemini-2.5.ts > /tmp/gemini.ts
# Review it, then copy into your codebase and adapt naming
```

**Option B: Cherry-pick a specific commit** (best for targeted fixes)

```bash
# Find the exact commit
git log --oneline v1.2.29..v1.2.30 -- packages/opencode/src/session/prompt.ts
# abc1234 fix: SSE memory leak on long-running sessions

# Apply it
git cherry-pick abc1234
# If it conflicts (due to our renames), resolve manually
```

**Option C: Apply a patch** (best when cherry-pick conflicts but the change is small)

```bash
# Generate a patch from their commit
git diff v1.2.29..v1.2.30 -- packages/opencode/src/session/prompt.ts > /tmp/prompt-fix.patch

# Review, then manually apply the relevant hunks to your file
# (since file paths may differ after rebrand)
```

### Step 5: Record what you synced

After cherry-picking, document what you took so future syncs know the baseline:

```bash
git commit -m "$(cat <<'EOF'
upstream: cherry-pick from v1.2.30

Selectively applied:
- feat: gemini-2.5-pro provider adapter (provider/adapters/)
- fix: SSE memory leak on long-running sessions (session/prompt.ts)
- fix: MCP OAuth token refresh race condition (mcp/index.ts)

Skipped:
- TUI redesign (not applicable)
- New onboarding flow (we have our own)
- Package.json dependency bumps (we manage our own)
EOF
)"
```

---

## What to Watch For in Upstream Releases

Not all upstream changes are equal. Prioritize by impact:

### Always grab (security + stability)

| Area                | Why                          | Files                                         |
| ------------------- | ---------------------------- | --------------------------------------------- |
| Security fixes      | Auth bypass, injection, etc. | `src/auth/`, `src/permission/`, `src/server/` |
| SSE/Bus fixes       | Event stream reliability     | `src/bus/`                                    |
| Session crash fixes | Data loss prevention         | `src/session/`                                |
| Provider auth fixes | Token refresh, OAuth         | `src/provider/`, `src/auth/`                  |

### Usually grab (features)

| Area                      | Why                            | Files                   |
| ------------------------- | ------------------------------ | ----------------------- |
| New provider adapters     | More model options for free    | `src/provider/`         |
| New tools                 | Expanded agent capabilities    | `src/tool/`             |
| MCP improvements          | Better tool server integration | `src/mcp/`              |
| Permission system updates | Better safety defaults         | `src/permission/`       |
| Prompt loop optimizations | Faster, smarter agent          | `src/session/prompt.ts` |

### Probably skip (their product, not ours)

| Area                    | Why                                          | Files               |
| ----------------------- | -------------------------------------------- | ------------------- |
| TUI changes             | We don't use the terminal UI                 | `packages/tui/`     |
| SolidJS app changes     | We have our own React UI                     | `packages/app/`     |
| Desktop shell changes   | We have our own Tauri app                    | `packages/desktop/` |
| CLI command changes     | We only use `serve`                          | `src/index.ts`      |
| Website / marketing     | Not applicable                               | `packages/web/`     |
| Config schema additions | Review case-by-case — may add useful options | `src/config/`       |

### Review carefully (could break our customizations)

| Area                        | Why                                       | Files                       |
| --------------------------- | ----------------------------------------- | --------------------------- |
| Server route changes        | Could conflict with our custom routes     | `src/server/routes/`        |
| SSE event type changes      | Could break our TauriProvider translation | `src/bus/bus-event.ts`      |
| Session data model changes  | Could break our conversation adapter      | `src/session/message-v2.ts` |
| Agent configuration changes | Could conflict with our agent CRUD        | `src/agent/`                |

---

## Snowflake Integration Context

This fork is consumed by Snowflake-v0 as a sidecar binary:

```
Snowflake-v0/src-tauri/binaries/orbit-sdk-aarch64-apple-darwin
  ↑
  Built from: opencode/packages/opencode/ (this repo)
  Built with: bun build --compile (standalone binary)
  Spawned by: Tauri on app startup
  Talks via:  HTTP + SSE on localhost:<random-port>
```

### Build and deploy to Snowflake

```bash
# Build the sidecar binary
cd packages/opencode
bun run build --single

# Copy to Snowflake
cp dist/opencode-darwin-arm64/bin/opencode \
   /Users/no9labs/Developer/Recursive/Snowflake-v0/src-tauri/binaries/orbit-sdk-aarch64-apple-darwin

# Test
cd /Users/no9labs/Developer/Recursive/Snowflake-v0
bunx tauri dev
```

### Custom routes we've added (our orbit-\* files)

These files are ours — upstream will never conflict with them:

| File                                  | Purpose                                               |
| ------------------------------------- | ----------------------------------------------------- |
| `src/server/routes/orbit-agent.ts`    | Agent CRUD (create/update/delete agent definitions)   |
| `src/server/routes/orbit-command.ts`  | Command CRUD (create/update/delete slash commands)    |
| `src/server/routes/orbit-generate.ts` | AI generation (agent defs, command defs, bug reports) |
| `src/server/routes/orbit-browser.ts`  | Browser tool bridge (WKWebView ↔ agent tool calls)    |

These are registered via one import in `server.ts`. When syncing upstream changes to `server.ts`, preserve that import line.

---

## Rules

1. **Never commit directly to `dev`** — it must stay a clean mirror of upstream
2. **All custom work goes on `Orbit`** — this is the only branch with our modifications
3. **Sync on release tags, not individual commits** — tags are tested and stable
4. **Choose your sync strategy per release** — small release → tag merge; big release after heavy customization → cherry-pick
5. **Preview before merging** — always check the overlap before running `git merge`
6. **Per-file conflict resolution** — review each conflict individually, pick ours/theirs/manual
7. **Use `git merge --abort` freely** — if a merge looks bad, abort and reassess
8. **Rename in two commits** — file moves first, content changes second, to preserve rename tracking
9. **Record what you cherry-picked** — commit messages should list what was taken and what was skipped
10. **Always grab security fixes** — watch releases for auth, permission, and injection fixes
11. **Update the baseline table** — after every sync, update § Current Baseline with the new tag and date
12. **Copy to Agent-backend/** — after merging in the opencode repo, copy changed files to `Snowflake-v0/Agent-backend/` (see § Two-Repo Workflow)
13. **Watch for releases** — set up GitHub Watch (releases only) on `anomalyco/opencode` or run `./scripts/check-upstream.sh` periodically
