# Upstream Sync Process: OpenCode Fork

> How to sync upstream OpenCode changes into the Orbit fork.
> Based on the v1.2.24 → v1.2.26 sync (March 2026).

## Overview

Orbit's AI engine is a fork of [OpenCode](https://github.com/sst/opencode) living at `Agent-backend/packages/opencode/`. The fork powers two products:

1. **Orbit CLI** — standalone terminal agent (`orbit` binary)
2. **Orbit Editor** — Tauri desktop app where the engine runs as `orbit-server` sidecar

Upstream syncs bring bug fixes, new features, and provider updates. The process is manual and deliberate — not a `git merge` — because the fork has Orbit-specific changes (renames, config paths, desktop integration) that must be preserved.

## Directory Layout

```
Agent-backend/
├── packages/opencode/            # THE FORK (what we modify)
├── upstream/
│   ├── UPSTREAM-SYNC-PROCESS.md  # This file
│   ├── CLAUDE.md                 # Folder guide
│   ├── repo/                     # GITIGNORED — all upstream repo data
│   │   ├── clone/                # Full git clone of sst/opencode
│   │   └── reference/            # IDE-browsable snapshots per version
│   │       ├── 1.2.26/app/       # Their SolidJS web app at v1.2.26
│   │       └── 1.2.27/           # (stub)
│   ├── diffs/                    # Diff analysis documents per version
│   │   ├── 1.2.26/DIFF.md
│   │   └── 1.2.27/
│   └── plans/                    # Implementation plans per version
│       ├── 1.2.26/00-*.md through 11-*.md
│       └── 1.2.27/README.md
└── packages/sdk/js/              # Auto-generated TypeScript SDK client
```

## Prerequisites

- Upstream clone at `Agent-backend/upstream/repo/clone/`
- Fork at `Agent-backend/packages/opencode/`
- Bun 1.3+ installed
- Access to `gh` CLI for release notes

---

## Step-by-Step Process

### Step 1: Check Current Fork Version

```bash
cat Agent-backend/packages/opencode/package.json | grep '"version"'
```

Record this as `OLD_VERSION` (e.g., `1.2.24`).

### Step 2: Check Upstream Latest

```bash
cd Agent-backend/upstream/repo/clone
git fetch origin --tags
gh api repos/sst/opencode/releases/latest --jq '.tag_name + " (" + .published_at + ")"'
git tag --sort=-v:refname | head -5
```

Record the target as `NEW_VERSION` (e.g., `1.2.26`).

### Step 3: Update Upstream Clone

```bash
cd Agent-backend/upstream/repo/clone
git checkout main
git pull origin main
```

### Step 4: Generate the FULL Diff

> **CRITICAL: Diff the ENTIRE repo, not just `packages/opencode/src/`.**
> The v1.2.24→v1.2.26 sync missed changes in `packages/app/`, `packages/desktop*/`,
> `packages/plugin/`, `packages/util/`, `.opencode/`, and root configs by scoping too narrow.

Run these from inside the upstream clone:

```bash
cd Agent-backend/upstream/repo/clone

# ===== FULL REPO OVERVIEW =====
git diff v${OLD}..v${NEW} --stat | tail -5  # Total file count

# ===== AREA-BY-AREA BREAKDOWN =====

# Engine source (the core — most changes live here)
git diff v${OLD}..v${NEW} --stat -- packages/opencode/src/
git diff v${OLD}..v${NEW} --diff-filter=A --name-only -- packages/opencode/src/  # Added
git diff v${OLD}..v${NEW} --diff-filter=D --name-only -- packages/opencode/src/  # Deleted
git diff v${OLD}..v${NEW} --diff-filter=M --name-only -- packages/opencode/src/  # Modified
git diff v${OLD}..v${NEW} --diff-filter=R --summary -- packages/opencode/src/    # Renamed

# Engine tests
git diff v${OLD}..v${NEW} --stat -- packages/opencode/test/

# Engine config (package.json, tsconfig, build script, migrations)
git diff v${OLD}..v${NEW} --stat -- packages/opencode/ ':!packages/opencode/src/' ':!packages/opencode/test/'

# Their web/desktop app (SolidJS — reference for Orbit features)
git diff v${OLD}..v${NEW} --stat -- packages/app/

# Their desktop wrappers (Electron + Tauri — architecture reference)
git diff v${OLD}..v${NEW} --stat -- packages/desktop-electron/
git diff v${OLD}..v${NEW} --stat -- packages/desktop/

# Shared packages (plugin SDK, utilities — we use these)
git diff v${OLD}..v${NEW} --stat -- packages/plugin/
git diff v${OLD}..v${NEW} --stat -- packages/util/

# SDK (auto-generated — affects our frontend)
git diff v${OLD}..v${NEW} --stat -- packages/sdk/

# Project-level config (.opencode/ agents, tools, themes)
git diff v${OLD}..v${NEW} --stat -- .opencode/

# Root configs
git diff v${OLD}..v${NEW} -- package.json .gitignore AGENTS.md

# Their cloud console (usually skip — but check for relevant patterns)
git diff v${OLD}..v${NEW} --stat -- packages/console/ | tail -3

# CI/infra (reference only)
git diff v${OLD}..v${NEW} --stat -- .github/
```

### Step 5: Copy Their App for Reference

Always snapshot their `packages/app/` for feature reference:

```bash
cd Agent-backend/upstream/repo/clone
git checkout v${NEW} -- packages/app/
mkdir -p ../reference/${NEW}
cp -R packages/app ../reference/${NEW}/app
git checkout v${OLD} -- packages/app/  # restore clone state
echo "Copied $(find ../reference/${NEW}/app -type f | wc -l) files"
```

This gives you their full SolidJS app to study when building equivalent features in Orbit's React frontend.

### Step 6: Read Release Notes

```bash
# For each version in the range
gh api repos/sst/opencode/releases/tags/v${NEW} --jq '.body'
```

Also check intermediate releases if there's more than one:

```bash
gh api repos/sst/opencode/releases --jq '.[] | "\(.tag_name) \(.published_at | split("T")[0])"' | head -10
```

### Step 7: Write the Diff Analysis Document

Create `Agent-backend/upstream/UPSTREAM-DIFF-v${OLD}-to-v${NEW}.md` with:

- Table of contents
- **Engine source:** New, modified, deleted, renamed files with descriptions
- **Engine tests:** New and modified test files
- **Engine config:** package.json, tsconfig, build script, migration changes
- **App (reference):** HIGH-value features to port to Orbit, with relevance ratings
- **Desktop wrappers:** Architecture insights relevant to Orbit's Tauri backend
- **Shared packages:** Plugin SDK, util changes that affect our fork
- **Root configs:** Dependency changes, .gitignore, .opencode/ updates
- **PICK?** column on every section

See `UPSTREAM-DIFF-v1.2.24-to-v1.2.26.md` as a template.

### Step 8: Decision Pass

Go through each section and mark: **YES** / **NO** / **LATER** / **PARTIAL**.

Decision criteria:

| Question                                        | If YES                                                     | If NO |
| ----------------------------------------------- | ---------------------------------------------------------- | ----- |
| Is it a bug fix we'd hit?                       | YES                                                        | NO    |
| Does it fix a provider issue?                   | YES (providers affect all users)                           |       |
| Is it a new feature we want?                    | YES or LATER                                               | NO    |
| Does it add a new dependency?                   | Check if we want it (e.g., Effect.ts was a major decision) |       |
| Is it a cloud-only feature (accounts, sharing)? | NO (unless we add cloud)                                   |       |
| Does it touch CLI-only code (TUI, yargs)?       | YES (CLI is a product)                                     |       |
| Is it in their app?                             | Copy for reference, port concepts if relevant              |       |
| Is it in their desktop wrapper?                 | Check for architecture insights                            |       |
| Is it a pure refactor with no behavior change?  | LATER (unless blocking a YES item)                         |       |

### Step 9: Cross-Reference with Fork

Check what files exist in the fork vs upstream:

```bash
# Files in upstream but not fork (stripped or need to add)
cd Agent-backend
comm -23 \
  <(cd upstream/opencode-upstream && git ls-tree -r --name-only v${NEW} -- packages/opencode/src/ | sort) \
  <(find packages/opencode/src/ -name "*.ts" -o -name "*.tsx" | sed 's|^|packages/opencode/|' | sort)

# Files in fork but not upstream (Orbit additions)
comm -13 \
  <(cd upstream/opencode-upstream && git ls-tree -r --name-only v${NEW} -- packages/opencode/src/ | sort) \
  <(find packages/opencode/src/ -name "*.ts" -o -name "*.tsx" | sed 's|^|packages/opencode/|' | sort)
```

**Important:** Your fork stripped 74 files from v1.2.24 (mostly `.txt` prompts, JSON themes, READMEs). All core `.ts` source files are intact. If a YES decision targets a file that doesn't exist in the fork, flag it.

### Step 10: Create Per-Phase Plans

One markdown file per category in `Agent-backend/upstream/plans/`:

Each plan includes:

- **Summary** — what changes and why
- **What we have today** — current state of the fork
- **What changes** — specific file edits with before/after
- **New files** — files to create (full path + what they contain)
- **Modified files** — files to edit (what changes in each)
- **Deleted files** — files to remove (and what replaces them)
- **Breaking changes** — anything that could crash existing functionality
- **Rename required** — any `opencode` → `orbit` for user-facing strings
- **Desktop app impact** — does the frontend/Tauri need updates?
- **Dependencies** — which other phases must complete first
- **Verification steps** — commands to confirm the change works
- **Files changed** — complete list

### Step 11: Execute Plans in Dependency Order

Phases are ordered by dependency:

1. **Dependencies first** (Phase 0) — `bun install` must succeed before anything else
2. **Foundation** (new files, no modifications) — create schemas, utilities, helpers
3. **Bug fixes** — safe, targeted changes
4. **Features** — new functionality
5. **Refactors** — restructuring, may touch many files
6. **Tests** — add test coverage
7. **Rename pass** — opencode → orbit for user-facing strings
8. **Desktop app integration** — always last

Within each phase:

- Apply changes file-by-file, not bulk copy
- Run `bun run typecheck` after each significant change
- Commit after each phase

### Step 12: Regenerate SDK Client

After engine changes are ported:

```bash
cd Agent-backend
./script/generate.ts
```

This updates:

- `packages/sdk/openapi.json` — from engine's Hono routes
- `packages/sdk/js/src/v2/gen/types.gen.ts` — TypeScript types
- `packages/sdk/js/src/v2/gen/sdk.gen.ts` — Client implementation

### Step 13: Verify

```bash
# Engine type-checks
cd Agent-backend/packages/opencode && bun run typecheck

# Engine tests pass
cd Agent-backend/packages/opencode && bun test --timeout 30000

# Frontend type-checks (catches SDK type mismatches)
cd /Users/no9labs/Developer/Recursive/Snowflake-v0 && bun run typecheck

# Frontend tests pass
cd /Users/no9labs/Developer/Recursive/Snowflake-v0 && bun run test

# Build sidecar binary
cd /Users/no9labs/Developer/Recursive/Snowflake-v0 && bun run build:opencode

# Desktop app launches and works end-to-end
cd /Users/no9labs/Developer/Recursive/Snowflake-v0 && bunx tauri dev
```

---

## Rename Checklist

Every sync, grep for new `opencode` references that need renaming:

```bash
# Count all occurrences
grep -rn "opencode" Agent-backend/packages/opencode/src/ --include="*.ts" | grep -v node_modules | wc -l

# Focus on user-facing strings
grep -rn '"opencode\|opencode['"'"'"]' Agent-backend/packages/opencode/src/ --include="*.ts" | grep -v node_modules
```

### Rename Categories

| Category              | Rule                                          | Examples                                                                      |
| --------------------- | --------------------------------------------- | ----------------------------------------------------------------------------- |
| **MUST rename**       | User-facing strings, CLI text, error messages | `"opencode"` in help text, `"OpenCode"` in error messages, User-Agent headers |
| **SHOULD rename**     | Internal service tags, log prefixes           | `Log.create({ service: "opencode" })`, Effect service tags                    |
| **CANNOT rename**     | External npm packages, plugin API names       | `@opencode-ai/plugin`, `@opencode-ai/sdk`                                     |
| **CONTEXT-DEPENDENT** | Data directories, config paths                | `~/.opencode/` vs `~/.orbit/` — backward compat matters                       |
| **DEFER**             | Environment variables                         | `OPENCODE_*` env vars — renaming breaks existing users' configs               |

### Safe bulk patterns

```bash
# These are usually safe to find-and-replace:
"OpenCode" → "Orbit"         # Display names in error messages, CLI text
"opencode" → "orbit"         # Binary names, User-Agent, data dirs (check context!)
"opencode.ai" → "orbit.dev"  # URLs (only if you have your own domain)

# These need manual review:
OPENCODE_*                    # Env vars — keep for backward compat, add ORBIT_* aliases
.opencode/                    # Config dirs — support both .opencode/ and .orbit/
@opencode                     # Effect service tags — can rename but purely internal
ProviderID.opencode           # Provider ID constant — rename to ProviderID.orbit
```

---

## What to Diff (Complete Checklist)

> Learned from the v1.2.24→v1.2.26 sync where we initially missed `packages/app/`,
> `packages/desktop*/`, `packages/plugin/`, and `packages/util/`.

| Area                                         | Why It Matters                             | Always Check?                  |
| -------------------------------------------- | ------------------------------------------ | ------------------------------ |
| `packages/opencode/src/`                     | Engine source — the core                   | **YES**                        |
| `packages/opencode/test/`                    | Engine tests                               | **YES**                        |
| `packages/opencode/drizzle/` or `migration/` | DB schema changes                          | **YES**                        |
| `packages/opencode/package.json`             | New dependencies                           | **YES**                        |
| `packages/opencode/tsconfig.json`            | Compiler config changes                    | **YES**                        |
| `packages/opencode/script/`                  | Build script changes                       | **YES**                        |
| `packages/app/`                              | Their web app — feature reference          | **YES** (copy for reference)   |
| `packages/desktop-electron/`                 | Electron wrapper — architecture insights   | **YES**                        |
| `packages/desktop/`                          | Tauri wrapper — directly relevant to Orbit | **YES**                        |
| `packages/plugin/`                           | Plugin SDK — we ship this                  | **YES**                        |
| `packages/util/`                             | Shared utilities — we use these            | **YES**                        |
| `packages/sdk/`                              | Generated SDK — affects our frontend       | **YES**                        |
| `.opencode/`                                 | Project agents, tools, themes              | **YES** (check for new agents) |
| `package.json` (root)                        | Workspace deps, catalog entries            | **YES**                        |
| `.gitignore`, `AGENTS.md`                    | Config                                     | Quick check                    |
| `packages/console/`                          | Their cloud console                        | Skim only                      |
| `.github/`, `nix/`, `infra/`                 | CI/infra                                   | Skip unless relevant           |
| `packages/web/`                              | Their docs site                            | Skip                           |
| `packages/enterprise/`                       | Enterprise features                        | Skip unless relevant           |

---

## Tips and Lessons Learned

### From the v1.2.24 → v1.2.26 sync

1. **Diff the WHOLE repo, not just `src/`.** We missed 147 files in `packages/app/` (including follow-up queue, debug bar, terminal reconnection, per-session model selection), plus plugin SDK fixes and util additions. Always check every area listed above.

2. **Copy their app as reference.** Their SolidJS web app has features we want in Orbit's React frontend. Snapshot it at each sync version for study.

3. **Check for new dependencies before porting code.** The v1.2.26 sync added `effect@4.0.0-beta.31`. Files importing from `effect` fail to compile until it's installed. This was a major decision point.

4. **Effect.ts adoption is the biggest decision.** Upstream is migrating to Effect for auth, providers, and branded IDs. Each sync will be harder if we diverge further. The v1.2.26 sync was the fork in the road — we chose to adopt.

5. **Branded IDs are all-or-nothing per type.** Once you brand `SessionID` in the schema, every file that creates or passes session IDs must use the branded constructor. The 25+ file ripple proves it.

6. **Custom agents come from `.opencode/agent/*.md`, not engine code.** The "docs" and "claude" modes visible when pressing Tab in the TUI are project-level markdown files, not hardcoded. Any `.md` in the agent dir gets loaded — including accidental files like `CLAUDE.md`.

7. **SDK regeneration is the bridge.** Engine API changes don't affect the frontend directly — they affect the generated SDK types. Always regenerate after engine changes.

8. **The desktop app is remarkably resilient.** Because the frontend connects via HTTP/JSON, most engine refactors (Effect migration, branded IDs, server factory) have zero impact. Only API surface changes matter.

9. **Their Tauri wrapper simplified dramatically.** `lib.rs` went from 236 to ~100 lines — always spawn local sidecar, credentials before health check. Compare with Orbit's `opencode/process.rs` for simplification opportunities.

10. **Test the sidecar binary, not just the dev server.** `bun dev serve` and the compiled `orbit-server` binary can behave differently. Always rebuild and test.

### General

- **Don't copy files blindly.** Apply changes surgically — the fork has modifications upstream doesn't have (Orbit renames, config paths, removed prompts).
- **One commit per phase.** Makes it easy to bisect if something breaks.
- **Run typecheck often.** TypeScript catches most integration issues before runtime.
- **The diff analysis document is the most valuable artifact.** It takes time to write but saves days of confusion. Don't skip it.

---

## Frequency

Upstream releases roughly every 1-2 weeks. Recommended sync cadence:

| Cadence                | When to use                                              |
| ---------------------- | -------------------------------------------------------- |
| **Every release**      | If upstream is making breaking changes or critical fixes |
| **Every 2-4 releases** | Normal cadence — batch small changes, catch up monthly   |
| **On-demand**          | When a specific upstream fix/feature is needed           |

Check releases:

```bash
gh api repos/sst/opencode/releases --jq '.[] | "\(.tag_name) \(.published_at | split("T")[0]) \(.name)"' | head -10
```

---

## Checklist Template

Copy this for each sync:

```markdown
## Sync: v*** → v***

### Prep

- [ ] Updated upstream clone: `git fetch origin --tags`
- [ ] Generated FULL diff (all areas, not just src/)
- [ ] Copied packages/app/ to reference/app-v\_\_\_/
- [ ] Read release notes for all versions in range

### Analysis

- [ ] Written diff analysis document (UPSTREAM-DIFF-v***-to-v***.md)
- [ ] Made PICK decisions for all changes
- [ ] Cross-referenced fork vs upstream file trees
- [ ] Checked for new dependencies
- [ ] Checked .opencode/agent/ for new custom agents

### Plans

- [ ] Created per-phase plans in plans/

### Execution

- [ ] Phase 0: Dependencies installed
- [ ] Phase 1-N: Engine changes ported
- [ ] Shared packages updated (plugin/, util/)
- [ ] SDK regenerated: `./script/generate.ts`

### Verification

- [ ] Engine typecheck: `cd packages/opencode && bun run typecheck`
- [ ] Engine tests: `cd packages/opencode && bun test --timeout 30000`
- [ ] Frontend typecheck: `bun run typecheck`
- [ ] Frontend tests: `bun run test`
- [ ] Sidecar binary: `bun run build:opencode`
- [ ] Desktop app: `bunx tauri dev`
- [ ] Rename audit: `grep -rn "opencode" packages/opencode/src/ --include="*.ts" | wc -l`

### Cleanup

- [ ] Plans committed
- [ ] Diff analysis committed
- [ ] Reference app snapshot committed
- [ ] Updated fork version in package.json
```

---

## Resuming Past Sync Sessions

Sync conversations are long and context-heavy. If interrupted, resume with:

```bash
# v1.2.24 → v1.2.26 sync (March 2026)
claude --resume 09fd32d9-4702-4035-a617-5a336e5c60ca
```

After each sync, record the session ID here so future conversations can pick up where they left off.

| Sync              | Session ID                             | Status                          |
| ----------------- | -------------------------------------- | ------------------------------- |
| v1.2.24 → v1.2.26 | `09fd32d9-4702-4035-a617-5a336e5c60ca` | Plans written, ready to execute |
