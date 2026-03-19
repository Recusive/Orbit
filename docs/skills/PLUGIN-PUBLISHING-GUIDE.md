# Plugin Publishing Guide

How to create Claude Code plugins, package skills into a plugin, and distribute via GitHub.

## Our Plugin Repo

- **Repo:** https://github.com/Recusive/Orbit-plugin
- **Install:** `/plugin install Recusive/Orbit-plugin`
- **License:** MIT

## Plugin vs Skills — When to Use Which

| Distribution                 | Best For                                                                                | Install Method                          |
| ---------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------- |
| **Skills** (Recusive/Skills) | Individual skills, works across 40+ agents (Claude Code, Cursor, Codex, etc.)           | `npx skills add Recusive/Skills`        |
| **Plugin** (Orbit-plugin)    | Bundled skill suites, Claude Code-specific features (hooks, commands, agents, MCP, LSP) | `/plugin install Recusive/Orbit-plugin` |

Use skills when you want broad agent compatibility. Use a plugin when you need Claude Code-specific features or want to distribute a bundled suite.

## Plugin Structure

A Claude Code plugin is a **Git repo** with a `.claude-plugin/` directory:

```
my-plugin/
├── .claude-plugin/
│   └── plugin.json          # Manifest (only required file)
├── skills/                   # Skills (each subfolder has SKILL.md)
│   └── my-skill/
│       └── SKILL.md
├── commands/                 # Slash commands (optional, Markdown files)
├── agents/                   # Agent definitions (optional, Markdown with frontmatter)
├── hooks/
│   └── hooks.json            # Lifecycle hooks (optional)
├── .mcp.json                 # MCP server config (optional)
├── .lsp.json                 # LSP server config (optional)
├── README.md
└── LICENSE
```

**Auto-discovery:** Claude Code finds `skills/`, `commands/`, `agents/`, and `hooks/` directories automatically. The manifest just adds metadata.

## plugin.json Manifest

Lives in `.claude-plugin/plugin.json`:

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "What this plugin does",
  "author": {
    "name": "Orbit",
    "url": "https://github.com/Recusive"
  },
  "repository": "https://github.com/Recusive/my-plugin",
  "license": "MIT",
  "keywords": ["audit", "code-review"],
  "skills": "./skills/"
}
```

### Manifest Fields

| Field          | Required | Purpose                                         |
| -------------- | -------- | ----------------------------------------------- |
| `name`         | Yes      | Plugin identifier — used for namespacing        |
| `version`      | No       | Semver version string                           |
| `description`  | No       | Display text in plugin listings                 |
| `author`       | No       | `{ name, email, url }` object                   |
| `repository`   | No       | GitHub repo URL                                 |
| `license`      | No       | License identifier                              |
| `keywords`     | No       | Array of search terms                           |
| `skills`       | No       | Path to skills directory (default: `./skills/`) |
| `commands`     | No       | Path(s) to command files or directory           |
| `agents`       | No       | Path to agents directory                        |
| `hooks`        | No       | Path to hooks.json file                         |
| `mcpServers`   | No       | Path to MCP config or inline object             |
| `lspServers`   | No       | Path to LSP config                              |
| `outputStyles` | No       | Path to output styles directory                 |

## Plugin Components

### Skills

Same format as standalone skills — `folder/SKILL.md` with YAML frontmatter:

```markdown
---
name: my-skill
description: What it does — include trigger phrases for auto-detection
---

# My Skill

Instructions for the AI agent...
```

When installed as a plugin, skills are invoked as `plugin-name:skill-name` (e.g., `audit-suite:full-audit`) or just `skill-name` if there's no conflict.

### Commands (Optional)

Markdown files in `commands/` become slash commands:

```markdown
---
description: What this command does
argument-hint: <required-arg>
allowed-tools: Read, Glob, Grep, Write
---

# Command Name

Instructions...
```

### Hooks (Optional)

`hooks/hooks.json` defines lifecycle hooks — shell scripts that run on events:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "command": "node ./hooks/check-dangerous.js"
      }
    ]
  }
}
```

### Agents (Optional)

Markdown files in `agents/` with frontmatter defining name, description, and tools.

### MCP Servers (Optional)

`.mcp.json` at the plugin root configures Model Context Protocol servers.

### LSP Servers (Optional)

`.lsp.json` at the plugin root configures Language Server Protocol servers.

## Publishing a Plugin

### Step 1: Create the repo structure

```bash
mkdir my-plugin
cd my-plugin
git init && git branch -m main

mkdir -p .claude-plugin skills
```

### Step 2: Write plugin.json

```bash
cat > .claude-plugin/plugin.json << 'EOF'
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "What this plugin does",
  "author": {
    "name": "Orbit",
    "url": "https://github.com/Recusive"
  },
  "repository": "https://github.com/Recusive/my-plugin",
  "license": "MIT",
  "skills": "./skills/"
}
EOF
```

### Step 3: Add skills

Create `skills/<skill-name>/SKILL.md` for each skill. Same format as standalone skills.

### Step 4: Add README and LICENSE

Write a README with install instructions and a skills table.

### Step 5: Push to GitHub

```bash
gh repo create Recusive/my-plugin --public
git add -A
git commit -m "feat: initial plugin release"
git push -u origin main
```

### Step 6: Set repo description and topics

```bash
gh repo edit Recusive/my-plugin \
  --description "What this plugin does" \
  --add-topic "claude-code" \
  --add-topic "claude-code-plugin"
```

### Step 7: Verify install works

```bash
/plugin install Recusive/my-plugin
```

## Updating a Plugin

### Bump version

Update `version` in `.claude-plugin/plugin.json`, commit, push. Users get updates automatically.

### Add new skills

1. Create `skills/<new-skill>/SKILL.md`
2. Update README table
3. Bump version
4. Commit and push

### Remove skills

1. Delete the skill folder
2. Update README table
3. Bump version
4. Commit and push

## Install Scopes

Plugins can be installed at three scopes:

| Scope              | How                                                  | Use Case                                     |
| ------------------ | ---------------------------------------------------- | -------------------------------------------- |
| **User** (default) | `/plugin install Recusive/my-plugin`                 | Available globally                           |
| **Project**        | `/plugin install Recusive/my-plugin --scope project` | Shared with team via `.claude/settings.json` |
| **Local**          | (gitignored)                                         | Only in current directory                    |

## Plugin Data Storage

Plugins get a persistent data directory at `${CLAUDE_PLUGIN_DATA}` that survives plugin updates. Use this for caches, config, or generated state — not the plugin directory itself (which gets replaced on update).

## Marketplace Distribution

### Option A: Submit to official Anthropic marketplace

- Repo: https://github.com/anthropics/claude-plugins-official
- Open a PR to add your plugin to the marketplace catalog
- Users discover via `/plugin` > Discover

### Option B: Create your own marketplace

Any GitHub repo can be a marketplace. Add `.claude-plugin/marketplace.json`:

```json
{
  "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
  "name": "My Marketplace",
  "description": "Our team plugins",
  "owner": { "name": "Orbit", "email": "team@orbit.build" },
  "plugins": [
    {
      "name": "audit-suite",
      "description": "10 expert audit lenses + orchestrator",
      "version": "1.0.0",
      "source": "./plugins/audit-suite",
      "category": "code-quality"
    }
  ]
}
```

Users add: `/plugin marketplace add Recusive/my-marketplace`

### Option C: Direct install (no marketplace)

Any public GitHub repo with `.claude-plugin/plugin.json` can be installed directly:

```bash
/plugin install owner/repo
```

## Plugin CLI Commands

```bash
# Install a plugin
/plugin install Recusive/Orbit-plugin

# List installed plugins
/plugin list

# Update a plugin
/plugin update Recusive/Orbit-plugin

# Remove a plugin
/plugin remove Recusive/Orbit-plugin

# Add a marketplace
/plugin marketplace add owner/marketplace-repo

# Browse marketplace
/plugin
```

## Current Plugins

| Plugin                | Repo                                                              | What It Contains                                 |
| --------------------- | ----------------------------------------------------------------- | ------------------------------------------------ |
| **Orbit Audit Suite** | [Recusive/Orbit-plugin](https://github.com/Recusive/Orbit-plugin) | 10 expert audit lenses + full-audit orchestrator |

## Tips for Good Plugins

1. **Keep skills self-contained** — each skill should work without the others being installed
2. **Use `plugin.json` for metadata** — name, version, description, keywords all help discoverability
3. **Include a good README** — logo, badges, install command, skills table, quick start
4. **Version semantically** — bump patch for fixes, minor for new skills, major for breaking changes
5. **Cross-reference don't duplicate** — if a skill benefits from another skill's knowledge, reference it rather than copying content
6. **Test before publishing** — install locally, invoke each skill, verify output
7. **Set GitHub topics** — `claude-code` and `claude-code-plugin` help people find your plugin
