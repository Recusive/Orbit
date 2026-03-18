# Skills Publishing Guide

How to create agent skills, publish to our repo, and get listed on skills.sh.

## Our Skills Repo

- **Repo:** https://github.com/Recusive/Skills
- **Install:** `npx skills add Recusive/Skills`
- **License:** MIT

## SKILL.md Format

Every skill is a folder with a `SKILL.md` file. YAML frontmatter + markdown body:

```markdown
---
name: my-skill-name
description: One-line description — shows up in search results, leaderboard, and CLI output. Include trigger phrases for auto-detection.
---

# Skill Title

Instructions for the AI agent go here...
```

### Frontmatter Fields

| Field         | Required | Purpose                                                               |
| ------------- | -------- | --------------------------------------------------------------------- |
| `name`        | Yes      | Lowercase, hyphenated identifier (e.g., `problem-clarifier`)          |
| `description` | Yes      | Search index + display text. Be descriptive — include trigger phrases |

### Folder Structure

```
skill-name/
  SKILL.md          # Required — frontmatter + full skill prompt
  references/       # Optional — supporting files the skill can reference
  helpers.md        # Optional — additional context files
```

**Important:** Standalone `.md` files at repo root are NOT detected by the CLI. Skills MUST be in `folder/SKILL.md` format.

## Scaffold a New Skill

```bash
npx skills init my-skill-name
```

## Publishing to Recusive/Skills

### Step 1: Clone the repo

```bash
cd /tmp
gh repo clone Recusive/Skills Skills-clone
cd Skills-clone
```

### Step 2: Create the skill folder

```bash
mkdir my-new-skill
```

### Step 3: Write SKILL.md

Create `my-new-skill/SKILL.md` with frontmatter + instructions.

### Step 4: Verify it's detected

```bash
npx skills add . --list
```

Runs against the local directory. The new skill should appear in the list.

### Step 5: Update README.md

Add a row to the Available Skills table.

### Step 6: Commit and push

```bash
git add my-new-skill/SKILL.md
git commit -m "Add my-new-skill"
git push origin main
```

### Step 7: Verify remote install works

```bash
npx skills add Recusive/Skills --list
```

## CLI Commands Reference

```bash
# List skills in a repo (without installing)
npx skills add Recusive/Skills --list

# Install all skills globally
npx skills add Recusive/Skills -g -y

# Install specific skill globally (no prompts)
npx skills add Recusive/Skills --skill problem-clarifier -g -y

# Install to specific agents only
npx skills add Recusive/Skills -a claude-code -a cursor --skill my-skill

# List installed skills
npx skills list
npx skills ls -g          # global only

# Search for skills by keyword
npx skills find "react testing"

# Check for updates
npx skills check

# Update all installed skills
npx skills update

# Remove a skill
npx skills remove my-skill
npx skills remove --all   # remove everything
```

### Install Scope

| Scope   | Flag      | Location            | Use Case                  |
| ------- | --------- | ------------------- | ------------------------- |
| Project | (default) | `./<agent>/skills/` | Shared with team via git  |
| Global  | `-g`      | `~/<agent>/skills/` | Available in all projects |

### Install Method

| Method            | Description                                 |
| ----------------- | ------------------------------------------- |
| Symlink (default) | Single source of truth, easy updates        |
| Copy (`--copy`)   | Independent copies, use when symlinks break |

## How skills.sh Leaderboard Works

- **URL:** https://skills.sh
- **No submission form.** Listing is automatic.
- **Powered by anonymous install telemetry** from the `npx skills` CLI
- When people run `npx skills add Recusive/Skills`, it gets tracked
- Skills rank by install count (All Time, Trending 24h, Hot)
- More installs = higher ranking = more visibility

### Leaderboard Categories

- **All Time** — cumulative installs
- **Trending** — 24h activity
- **Hot** — currently gaining traction

## Self-Hosted Skills (Well-Known Endpoint)

Alternative to GitHub — host skills on your own domain:

```
https://yourdomain.com/.well-known/skills/index.json
https://yourdomain.com/.well-known/skills/my-skill/SKILL.md
```

`index.json` format:

```json
{
  "skills": [
    {
      "name": "my-skill",
      "description": "What it does",
      "files": ["SKILL.md"]
    }
  ]
}
```

Install: `npx skills add https://yourdomain.com`

### Name Validation (Well-Known)

- 1-64 characters
- Lowercase alphanumeric and hyphens only
- Must include SKILL.md in files array
- No path traversal (`..`, leading `/` or `\`)

## Tips for Good Skills

1. **Description is your SEO** — it's the only thing searched by `npx skills find`. Include trigger phrases.
2. **Be prescriptive, not vague** — "Use AskUserQuestion tool" beats "ask the user"
3. **Include good vs bad examples** — agents learn patterns from contrast
4. **Define output format** — if the skill produces structured output, show the exact template
5. **State what NOT to do** — agents need explicit boundaries ("do NOT start planning")
6. **Keep it self-contained** — the skill should work without external context
7. **Test locally first** — `npx skills add . --list` before pushing

## Supported Agents (40+)

Skills work across: Orbit, Claude Code, Cursor, Codex, Cline, Windsurf, VS Code Copilot, OpenCode, and many more. The CLI auto-detects which agents are installed and symlinks skills into their config directories.

## Current Skills in Recusive/Skills

| Skill                       | What It Does                                            |
| --------------------------- | ------------------------------------------------------- |
| component-test              | Vitest tests from DevTools HTML elements                |
| fazxes                      | Production scope gatekeeper — catches buried scope cuts |
| mosaic                      | In-app stress tests from DevTools — no mocks            |
| problem-clarifier           | Reflect-back interview before planning                  |
| stress-test                 | Stress tests via DevTools console                       |
| test-engineer               | Meaningful tests for TS/React + Rust                    |
| vercel-react-best-practices | React/Next.js perf guidelines                           |
| web-design-guidelines       | UI review for accessibility/compliance                  |
