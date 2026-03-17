# The Definitive Guide to Building Agent Skills for Claude

> Compiled from Anthropic's official "The Complete Guide to Building Skills for Claude" (33-page PDF),
> the Agent Skills open specification at github.com/agentskills/agentskills (specification, client
> implementation guide, evaluation guide, and scripting guide), and the skills-ref reference library.
> This document contains every rule, pattern, and best practice needed to build
> production-grade skills aligned with how Anthropic's own team builds them.

---

## Table of Contents

1. [What Is a Skill](#1-what-is-a-skill)
2. [Progressive Disclosure — The Core Architecture](#2-progressive-disclosure--the-core-architecture)
3. [File Structure & Naming Rules](#3-file-structure--naming-rules)
4. [YAML Frontmatter — The Most Important Part](#4-yaml-frontmatter--the-most-important-part)
5. [Writing the Description Field](#5-writing-the-description-field)
6. [Writing the Main Instructions (SKILL.md Body)](#6-writing-the-main-instructions-skillmd-body)
7. [Best Practices for Instructions](#7-best-practices-for-instructions)
8. [Using Scripts in Skills](#8-using-scripts-in-skills)
9. [Use Case Categories](#9-use-case-categories)
10. [The 5 Canonical Patterns](#10-the-5-canonical-patterns)
11. [How Agents Discover, Load, and Manage Skills](#11-how-agents-discover-load-and-manage-skills)
12. [Testing & Evaluation](#12-testing--evaluation)
13. [Iteration & Feedback Loop](#13-iteration--feedback-loop)
14. [Distribution & Sharing](#14-distribution--sharing)
15. [Troubleshooting Common Issues](#15-troubleshooting-common-issues)
16. [Pre-Upload Checklist](#16-pre-upload-checklist)
17. [Success Metrics](#17-success-metrics)
18. [Security Rules](#18-security-rules)
19. [Quick Reference Card](#19-quick-reference-card)

---

## 1. What Is a Skill

A skill is a **folder** containing instructions, scripts, and resources that teach Claude how to handle specific tasks or workflows. Instead of re-explaining preferences, processes, and domain expertise in every conversation, you teach Claude once and it applies that knowledge every time.

Skills work identically across Claude.ai, Claude Code, and the API. Build once, use everywhere.

**The Kitchen Analogy (from Anthropic):**

- **MCP provides the professional kitchen** — access to tools, ingredients, and equipment
- **Skills provide the recipes** — step-by-step instructions on how to create something valuable
- Together, they enable users to accomplish complex tasks without figuring out every step themselves

| MCP (Connectivity)                                            | Skills (Knowledge)                                 |
| ------------------------------------------------------------- | -------------------------------------------------- |
| Connects Claude to your service (Notion, Asana, Linear, etc.) | Teaches Claude how to use your service effectively |
| Provides real-time data access and tool invocation            | Captures workflows and best practices              |
| What Claude can do                                            | How Claude should do it                            |

**Why this matters for MCP users:**

Without skills:

- Users connect your MCP but don't know what to do next
- Support tickets asking "how do I do X with your integration"
- Each conversation starts from scratch
- Inconsistent results because users prompt differently each time
- Users blame your connector when the real issue is workflow guidance

With skills:

- Pre-built workflows activate automatically when needed
- Consistent, reliable tool usage
- Best practices embedded in every interaction
- Lower learning curve for your integration

### Two Paths Through This Guide

- **Building standalone skills without MCP?** Focus on Fundamentals (sections 1-8), Planning and Design (sections 9-10), and Testing (sections 12-13). You can always return to the MCP sections later.
- **Enhancing an MCP integration?** The "Skills + MCP" sections (Use Case Category 3 and Pattern 2) are for you. Both paths share the same technical requirements, but you choose what's relevant to your use case.

### Who This Is For

- **Developers** who want Claude to follow specific workflows consistently
- **Power users** who want Claude to follow specific workflows
- **Teams** looking to standardize how Claude works across their organization

### Key Properties

**Composability:** Claude can load multiple skills simultaneously. Your skill should work well alongside others, not assume it's the only capability available.

**Portability:** Skills work identically across Claude.ai, Claude Code, and API. Create a skill once and it works across all surfaces without modification, provided the environment supports any dependencies the skill requires.

**What you'll get out of this guide:** By the end, you'll be able to build a functional skill in a single sitting. Expect about 15-30 minutes to build and test your first working skill using the skill-creator.

---

## 2. Progressive Disclosure — The Core Architecture

This is the key architectural insight that makes skills token-efficient. Skills use a **three-level system**:

| Tier            | What's Loaded                             | When                                               | Token Cost                |
| --------------- | ----------------------------------------- | -------------------------------------------------- | ------------------------- |
| 1. Catalog      | `name` + `description` (YAML frontmatter) | Session start, always                              | ~50-100 tokens per skill  |
| 2. Instructions | Full `SKILL.md` body                      | When skill is activated (task matches description) | < 5000 tokens recommended |
| 3. Resources    | Scripts, references, assets               | Only when instructions reference them              | Varies                    |

**Why this matters:** An agent with 20 installed skills doesn't pay the token cost of 20 full instruction sets upfront. Only the frontmatter of all skills loads at startup. The full body loads only when Claude thinks the skill is relevant. Referenced files load only on demand.

**Key constraint:** Keep your main `SKILL.md` under **500 lines** and under **5000 tokens**. Move detailed reference material to separate files in `references/`.

### How Discovery Works Under the Hood

Agents scan standard directories at session startup. Understanding this helps you place skills where they'll be found.

**Scanning locations (by scope):**

| Scope   | Path                        | Purpose                          |
| ------- | --------------------------- | -------------------------------- |
| Project | `<project>/.agents/skills/` | Cross-client interoperability    |
| Project | `<project>/.claude/skills/` | Claude-specific (widely adopted) |
| User    | `~/.agents/skills/`         | Cross-client interoperability    |
| User    | `~/.claude/skills/`         | Claude-specific                  |

The `.agents/skills/` paths are the emerging cross-client convention — skills installed by other compliant clients are automatically visible to yours, and vice versa.

**Scanning rules:**

- Agents look for subdirectories containing a file named exactly `SKILL.md`
- Directories like `.git/` and `node_modules/` are skipped
- `.gitignore` may be respected to avoid scanning build artifacts
- Reasonable bounds are set (e.g., max depth of 4-6 levels, max 2000 directories) to prevent runaway scanning

**Name collision handling:** When two skills share the same `name`, project-level skills override user-level skills. Within the same scope, the agent picks one deterministically (first-found or last-found). A warning is logged so the user knows a skill was shadowed.

**Trust considerations:** Project-level skills come from the repository being worked on, which may be untrusted (e.g., a freshly cloned open-source project). Consider gating project-level skill loading on a trust check — only load them if the user has marked the project folder as trusted. This prevents untrusted repositories from silently injecting instructions into the agent's context.

**Cloud-hosted and sandboxed agents:**

- **Project-level skills** travel with the code — if the agent operates on a cloned repo (even inside a sandbox), project skills can be scanned from the repo's directory tree
- **User-level and organization-level skills** don't exist in the sandbox — they must be provisioned from an external source (config repo, skill URLs, web UI upload)
- **Built-in skills** can be packaged as static assets within the agent's deployment artifact

---

## 3. File Structure & Naming Rules

### Required Structure

```
your-skill-name/
  SKILL.md                    # Required - main skill file
  scripts/                    # Optional - executable code
    process_data.py
    validate.sh
  references/                 # Optional - documentation loaded as needed
    api-guide.md
    examples/
  assets/                     # Optional - templates, fonts, icons
    report-template.md
```

### Critical Naming Rules

**SKILL.md naming:**

- Must be exactly `SKILL.md` (case-sensitive)
- No variations accepted (SKILL.MD, skill.md, Skill.md are all wrong)
- **Lenient validation note:** Some implementations will warn but still load on minor issues (name mismatch with folder, name exceeding 64 chars). However, a missing or empty description will cause the skill to be **skipped entirely**, and completely unparseable YAML will also cause a skip.

**Skill folder naming:**

- kebab-case ONLY: `notion-project-setup`
- No spaces: ~~`Notion Project Setup`~~
- No underscores: ~~`notion_project_setup`~~
- No capitals: ~~`NotionProjectSetup`~~
- No consecutive hyphens: ~~`pdf--processing`~~
- Cannot start or end with hyphen: ~~`-pdf-reader`~~
- Max 64 characters
- Must match the `name` field in frontmatter exactly

**No README.md inside skill folders:**

- All documentation goes in SKILL.md or `references/`
- README.md is for GitHub repos containing skills, not inside skill folders
- Note: when distributing via GitHub, you'll still want a repo-level README for human users — see Distribution and Sharing

### Optional Directories

**`scripts/`** — Contains executable code that agents can run. Scripts should be self-contained or clearly document dependencies, include helpful error messages, and handle edge cases gracefully.

**`references/`** — Contains additional documentation agents can read on demand:

- `REFERENCE.md` — Detailed technical reference
- `FORMS.md` — Form templates or structured data formats
- Domain-specific files (`finance.md`, `legal.md`, etc.)
- Keep individual reference files focused. Agents load these on demand, so smaller files mean less use of context.

**`assets/`** — Contains static resources: templates, images, diagrams, data files, lookup tables, schemas.

**`evals/`** — Contains test cases for structured evaluation (see Testing & Evaluation section):

- `evals.json` — Test case definitions with prompts, expected outputs, and assertions
- `files/` — Input files for test cases

### File References

When referencing other files in your skill, use **relative paths from the skill root**:

```markdown
See [the reference guide](references/REFERENCE.md) for details.

Run the extraction script:
scripts/extract.py
```

Keep file references one level deep from `SKILL.md`. Avoid deeply nested reference chains.

---

## 4. YAML Frontmatter — The Most Important Part

The YAML frontmatter is how Claude decides whether to load your skill. Get this right.

### Minimal Required Format

```yaml
---
name: your-skill-name
description: What it does and when to use it. Include specific trigger phrases.
---
```

### All Fields (Required + Optional)

```yaml
---
name: skill-name
description: [required description - max 1024 chars]
license: MIT
compatibility: 'Designed for Claude Code. Requires git and Node.js 18+'
allowed-tools: 'Bash(git:*) Bash(jq:*) Read'
metadata:
  author: Company Name
  version: '1.0'
  mcp-server: server-name
  category: productivity
  tags: [project-management, automation]
  documentation: https://example.com/docs
  support: support@example.com
---
```

### Field Reference

| Field           | Required | Constraints                                                                                                                                                                                                    |
| --------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`          | Yes      | Max 64 chars. Lowercase letters, numbers, hyphens only. Must match folder name. No start/end hyphens. No consecutive hyphens.                                                                                  |
| `description`   | Yes      | Max 1024 chars. Non-empty. Must describe WHAT + WHEN. Include trigger phrases users would say.                                                                                                                 |
| `license`       | No       | License name or reference to bundled LICENSE file (e.g., `"Proprietary. LICENSE.txt has complete terms"`)                                                                                                      |
| `compatibility` | No       | Max 500 chars. Environment requirements (intended product, packages, network). Most skills don't need this.                                                                                                    |
| `allowed-tools` | No       | Space-delimited list of pre-approved tools. Experimental — support varies between agent implementations.                                                                                                       |
| `metadata`      | No       | Arbitrary key-value map (string keys to string values). Use reasonably unique key names to avoid conflicts. Suggested keys: `author`, `version`, `mcp-server`, `category`, `tags`, `documentation`, `support`. |

### What's Forbidden in Frontmatter

- **XML angle brackets (< >)** — security restriction, frontmatter appears in system prompt. Malicious content could inject instructions.
- **Code execution in YAML** — safe YAML parsing only (strictyaml in reference implementation)
- **Skills named with "claude" or "anthropic" prefix** — reserved

### What's Allowed in Frontmatter

- Any standard YAML types (strings, numbers, booleans, lists, objects)
- Custom metadata fields
- Long descriptions (up to 1024 characters)

### Handling Malformed YAML

Skills authored for other clients may contain technically invalid YAML that their parsers happen to accept. The most common issue is **unquoted values containing colons**:

```yaml
# Technically invalid YAML — the colon breaks parsing
description: Use this skill when: the user asks about PDFs

# Fix: quote the value
description: "Use this skill when: the user asks about PDFs"
```

Consider a fallback that wraps such values in quotes or converts them to YAML block scalars before retrying. This improves cross-client compatibility.

### Lenient Validation Rules

Agents apply lenient validation to maximize compatibility:

| Issue                               | Behavior                                                     |
| ----------------------------------- | ------------------------------------------------------------ |
| Name doesn't match parent directory | Warn, load anyway                                            |
| Name exceeds 64 characters          | Warn, load anyway                                            |
| Description is missing or empty     | **Skip the skill** (description is essential for disclosure) |
| YAML is completely unparseable      | **Skip the skill**, log the error                            |

Record diagnostics so they can be surfaced to the user (debug command, log file, or UI), but don't block skill loading on cosmetic issues.

---

## 5. Writing the Description Field

The description is the SINGLE MOST IMPORTANT field. It determines whether Claude loads your skill or ignores it. It's the first tier of progressive disclosure — always in Claude's system prompt.

### Formula

```
[What it does] + [When to use it] + [Key capabilities/trigger phrases]
```

### Good Descriptions

```yaml
# Specific and actionable
description: Analyzes Figma design files and generates developer handoff
  documentation. Use when user uploads .fig files, asks for "design specs",
  "component documentation", or "design-to-code handoff".

# Includes trigger phrases
description: Manages Linear project workflows including sprint planning,
  task creation, and status tracking. Use when user mentions "sprint",
  "Linear tasks", "project planning", or asks to "create tickets".

# Clear value proposition
description: End-to-end customer onboarding workflow for PayFlow. Handles
  account creation, payment setup, and subscription management. Use when
  user says "onboard new customer", "set up subscription", or "create
  PayFlow account".

# With negative triggers (prevents over-triggering)
description: Advanced data analysis for CSV files. Use for statistical
  modeling, regression, clustering. Do NOT use for simple data exploration
  (use data-viz skill instead).

# Scoped to specific domain
description: PayFlow payment processing for e-commerce. Use specifically
  for online payment workflows, not for general financial queries.

# Mentions relevant file types
description: Extracts text and tables from PDF files, fills PDF forms, and
  merges multiple PDFs. Use when working with PDF documents or when the user
  mentions PDFs, forms, or document extraction.
```

### Bad Descriptions (and why)

```yaml
# Too vague — won't trigger reliably
description: Helps with projects.

# Missing triggers — Claude doesn't know WHEN to use it
description: Creates sophisticated multi-page documentation systems.

# Too technical, no user triggers
description: Implements the Project entity model with hierarchical relationships.

# Too broad — will over-trigger
description: Processes documents
```

---

## 6. Writing the Main Instructions (SKILL.md Body)

After the frontmatter, write the actual instructions in Markdown. There are NO format restrictions, but Anthropic recommends this structure:

### Recommended Template

````markdown
---
name: your-skill
description: [...]
---

# Your Skill Name

## Instructions

### Step 1: [First Major Step]

Clear explanation of what happens.

Example:

```bash
python scripts/fetch_data.py --project-id PROJECT_ID
Expected output: [describe what success looks like]
```
````

(Add more steps as needed)

## Examples

### Example 1: [common scenario]

User says: "Set up a new marketing campaign"

Actions:

1. Fetch existing campaigns via MCP
2. Create new campaign with provided parameters

Result: Campaign created with confirmation link

(Add more examples as needed)

## Troubleshooting

### Error: [Common error message]

Cause: [Why it happens]
Solution: [How to fix]

(Add more error cases as needed)

````

---

## 7. Best Practices for Instructions

### Be Specific and Actionable

```markdown
# GOOD
Run `python scripts/validate.py --input {filename}` to check data format.
If validation fails, common issues include:
- Missing required fields (add them to the CSV)
- Invalid date formats (use YYYY-MM-DD)

# BAD
Validate the data before proceeding.
````

### Use Bullet Points and Numbered Lists

- Keep instructions concise
- Use bullet points and numbered lists
- Move detailed reference to separate files

### Put Critical Instructions at the Top

- Use `## Important` or `## Critical` headers
- Repeat key points if needed

### Avoid Ambiguous Language

```markdown
# BAD

Make sure to validate things properly

# GOOD

CRITICAL: Before calling create_project, verify:

- Project name is non-empty
- At least one team member assigned
- Start date is not in the past
```

### Explain the Why

Reasoning-based instructions work better than rigid directives:

```markdown
# BETTER — model understands the purpose

Do X because Y tends to cause Z

# WORSE — rigid directive without context

ALWAYS do X, NEVER do Y
```

Models follow instructions more reliably when they understand the purpose behind them.

### Include Error Handling

```markdown
## Common Issues

### MCP Connection Failed

If you see "Connection refused":

1. Verify MCP server is running: Check Settings > Extensions
2. Confirm API key is valid
3. Try reconnecting: Settings > Extensions > [Your Service] > Reconnect
```

### Reference Bundled Resources Clearly

```markdown
Before writing queries, consult `references/api-patterns.md` for:

- Rate limiting guidance
- Pagination patterns
- Error codes and handling
```

### Use Progressive Disclosure

Keep SKILL.md focused on core instructions. Move detailed documentation to `references/` and link to it.

### Combat Model Laziness

Add explicit encouragement in the SKILL.md body or have users add to their prompt:

```markdown
## Performance Notes

- Take your time to do this thoroughly
- Quality is more important than speed
- Do not skip validation steps
```

**Pro tip from Anthropic:** Adding performance notes to user prompts is more effective than in SKILL.md.

### For Critical Validations, Use Scripts Instead of Instructions

Code is deterministic; language interpretation isn't. For critical checks, bundle a validation script:

```bash
python scripts/check_report.py
```

Rather than relying on Claude to interpret "make sure the formatting is consistent."

---

## 8. Using Scripts in Skills

### One-Off Commands (No scripts/ Needed)

When an existing package does what you need, reference it directly. Many ecosystems provide tools that auto-resolve dependencies at runtime:

**Python (uvx — recommended):**

```bash
uvx ruff@0.8.0 check .
uvx black@24.10.0 .
```

- Not bundled with Python — requires a separate install.
- Fast. Caches aggressively so repeat runs are near-instant.

**Python (pipx — mature alternative):**

```bash
pipx run 'black==24.10.0' .
pipx run 'ruff==0.8.0' check .
```

- Available via OS package managers (`apt install pipx`, `brew install pipx`).
- While `uvx` has become the standard recommendation, `pipx` remains reliable.

**Node.js (npx):**

```bash
npx eslint@9 --fix .
npx create-vite@6 my-app
```

- Bundled with Node.js — no extra install needed.

**Bun (bunx):**

```bash
bunx eslint@9 --fix .
bunx create-vite@6 my-app
```

- Drop-in replacement for `npx` in Bun-based environments.

**Deno:**

```bash
deno run npm:create-vite@6 my-app
deno run --allow-read npm:eslint@9 -- --fix .
```

- Permission flags (`--allow-read`, etc.) are required for filesystem/network access.
- Use `--` to separate Deno flags from the tool's own flags.

**Go:**

```bash
go run golang.org/x/tools/cmd/goimports@v0.28.0 .
go run github.com/golangci/golangci-lint/cmd/golangci-lint@v1.62.0 run
```

- Built into Go — no extra tooling needed.

**Always pin versions** for reproducibility: `npx eslint@9.0.0` not `npx eslint`.

**State prerequisites** in your `SKILL.md` (e.g., "Requires Node.js 18+") rather than assuming. For runtime-level requirements, use the `compatibility` frontmatter field.

**Move complex commands into scripts.** A one-off command works well when you're invoking a tool with a few flags. When a command grows complex, a tested script in `scripts/` is more reliable.

### Self-Contained Scripts with Inline Dependencies

**Python (PEP 723 — recommended pattern):**

```python
# /// script
# dependencies = [
#   "beautifulsoup4>=4.12,<5",
# ]
# requires-python = ">=3.10"
# ///

from bs4 import BeautifulSoup
# ... script logic
```

Run with: `uv run scripts/extract.py`

- Pin versions with PEP 508 specifiers: `"beautifulsoup4>=4.12,<5"`
- Use `requires-python` to constrain the Python version
- Use `uv lock --script` to create a lockfile for full reproducibility

**Deno (self-contained by default):**

```typescript
#!/usr/bin/env -S deno run

import * as cheerio from 'npm:cheerio@1.0.0';

const html = `<html><body><p class="info">This is a test.</p></body></html>`;
const $ = cheerio.load(html);
console.log($('p.info').text());
```

Run with: `deno run scripts/extract.ts`

- Use `npm:` for npm packages, `jsr:` for Deno-native packages
- Version specifiers follow semver: `@1.0.0` (exact), `@^1.0.0` (compatible)
- Dependencies are cached globally. Use `--reload` to force re-fetch.

**Bun (auto-install):**

```typescript
#!/usr/bin/env bun

import * as cheerio from 'cheerio@1.0.0';

const html = `<html><body><p class="info">This is a test.</p></body></html>`;
const $ = cheerio.load(html);
console.log($('p.info').text());
```

Run with: `bun run scripts/extract.ts`

- No `package.json` or `node_modules` needed. TypeScript works natively.
- **Important:** If a `node_modules` directory exists anywhere up the directory tree, auto-install is disabled and Bun falls back to standard Node.js resolution.

**Ruby (bundler/inline):**

```ruby
require 'bundler/inline'

gemfile do
  source 'https://rubygems.org'
  gem 'nokogiri', '~> 1.16'
end

doc = Nokogiri::HTML('<p class="info">Test</p>')
puts doc.at_css('p.info').text
```

Run with: `ruby scripts/extract.rb`

- Pin versions explicitly — there is no lockfile.
- An existing `Gemfile` or `BUNDLE_GEMFILE` env var in the working directory can interfere.

### Designing Scripts for Agents

These rules make scripts dramatically easier for Claude to use:

1. **NEVER use interactive prompts** — agents can't respond to TTY prompts. Accept all input via CLI flags, env vars, or stdin. A script that blocks on interactive input will hang indefinitely.

```
# Bad: hangs waiting for input
$ python scripts/deploy.py
Target environment: _

# Good: clear error with guidance
$ python scripts/deploy.py
Error: --env is required. Options: development, staging, production.
Usage: python scripts/deploy.py --env staging --tag v1.2.3
```

2. **Document with --help** — this is the primary way the agent learns your script's interface. Include a brief description, available flags, and usage examples. Keep it concise — the output enters the agent's context window.

3. **Write helpful error messages** — "Error: --format must be one of: json, csv, table. Received: 'xml'" not "Error: invalid input"

4. **Use structured output** — JSON/CSV over free-form text. Data to stdout, diagnostics to stderr. This lets the agent capture clean, parseable output while still having diagnostic information.

5. **Make scripts idempotent** — agents may retry. "Create if not exists" is safer than "create and fail on duplicate"

6. **Support --dry-run** — for destructive operations

7. **Use meaningful exit codes** — different codes for different failure types. Document them in `--help` output.

8. **Control output size** — agent harnesses automatically truncate tool output beyond a threshold (typically 10-30K characters), potentially losing critical information. Default to summaries or reasonable limits, and support flags like `--offset` for pagination. For large output, require `--output FILE` to write to disk.

9. **Reject ambiguous input** — Use enums and closed sets where possible rather than guessing. Validate early with clear errors.

10. **Use safe defaults** — Consider whether destructive operations should require explicit confirmation flags (`--confirm`, `--force`) or other safeguards appropriate to the risk level.

### Referencing Scripts from SKILL.md

Use **relative paths from the skill directory root**. The agent resolves these paths automatically:

````markdown
## Available scripts

- **`scripts/validate.sh`** - Validates configuration files
- **`scripts/process.py`** - Processes input data

## Workflow

1. Run the validation script:
   ```bash
   bash scripts/validate.sh "$INPUT_FILE"
   ```
````

```

---

## 9. Use Case Categories

Anthropic has identified three common categories:

### Before You Start: Ask Yourself

Before writing any code, identify 2-3 concrete use cases your skill should enable.

```

Use Case: Project Sprint Planning
Trigger: User says "help me plan this sprint" or "create sprint tasks"
Steps:

1. Fetch current project status from Linear (via MCP)
2. Analyze team velocity and capacity
3. Suggest task prioritization
4. Create tasks in Linear with proper labels and estimates
   Result: Fully planned sprint with tasks created

````

**Four key questions:**
- What does a user want to accomplish?
- What multi-step workflows does this require?
- Which tools are needed (built-in or MCP)?
- What domain knowledge or best practices should be embedded?

### Category 1: Document & Asset Creation

Creating consistent, high-quality output (documents, presentations, apps, designs, code).

**Real example:** [frontend-design skill](https://github.com/anthropics/skills) (also see skills for docx, pptx, xlsx, and ppt)

> "Create distinctive, production-grade frontend interfaces with high design quality. Use when building web components, pages, artifacts, posters, or applications."

**Key techniques:**
- Embedded style guides and brand standards
- Template structures for consistent output
- Quality checklists before finalizing
- No external tools required — uses Claude's built-in capabilities

### Category 2: Workflow Automation

Multi-step processes with consistent methodology, including coordination across MCP servers.

**Real example:** [skill-creator skill](https://github.com/anthropics/skills)

> "Interactive guide for creating new skills. Walks the user through use case definition, frontmatter generation, instruction writing, and validation."

**Key techniques:**
- Step-by-step workflow with validation gates
- Templates for common structures
- Built-in review and improvement suggestions
- Iterative refinement loops

### Category 3: MCP Enhancement

Workflow guidance layered on top of MCP server tool access.

**Real example:** [sentry-code-review skill](https://github.com/anthropics/skills) (from Sentry)

> "Automatically analyzes and fixes detected bugs in GitHub Pull Requests using Sentry's error monitoring data via their MCP server."

**Key techniques:**
- Coordinates multiple MCP calls in sequence
- Embeds domain expertise
- Provides context users would otherwise need to specify
- Error handling for common MCP issues

---

## 10. The 5 Canonical Patterns

These patterns emerged from real usage by Anthropic's internal teams and early adopters. They represent common approaches that work well, not prescriptive templates.

### Choosing Your Approach: Problem-First vs. Tool-First

Think of it like Home Depot. You might walk in with a problem — "I need to fix a kitchen cabinet" — and an employee points you to the right tools. Or you might pick out a new drill and ask how to use it for your specific job.

Skills work the same way:
- **Problem-first:** "I need to set up a project workspace" — skill orchestrates the right MCP calls in the right sequence; users describe outcomes, the skill handles the tools
- **Tool-first:** "I have Notion MCP connected" — skill teaches Claude optimal workflows and best practices; users have access, skill provides expertise

Most skills lean one direction. Knowing which framing fits your use case helps you choose the right pattern below.

### Pattern 1: Sequential Workflow Orchestration

**Use when:** Multi-step processes in a specific order.

```markdown
## Workflow: Onboard New Customer

### Step 1: Create Account
Call MCP tool: `create_customer`
Parameters: name, email, company

### Step 2: Setup Payment
Call MCP tool: `setup_payment_method`
Wait for: payment method verification

### Step 3: Create Subscription
Call MCP tool: `create_subscription`
Parameters: plan_id, customer_id (from Step 1)

### Step 4: Send Welcome Email
Call MCP tool: `send_email`
Template: welcome_email_template
````

**Key techniques:** Explicit step ordering, dependencies between steps, validation at each stage, rollback instructions for failures.

### Pattern 2: Multi-MCP Coordination

**Use when:** Workflows span multiple services.

```markdown
### Phase 1: Design Export (Figma MCP)

1. Export design assets from Figma
2. Generate design specifications
3. Create asset manifest

### Phase 2: Asset Storage (Drive MCP)

1. Create project folder in Drive
2. Upload all assets
3. Generate shareable links

### Phase 3: Task Creation (Linear MCP)

1. Create development tasks
2. Attach asset links to tasks
3. Assign to engineering team

### Phase 4: Notification (Slack MCP)

1. Post handoff summary to #engineering
2. Include asset links and task references
```

**Key techniques:** Clear phase separation, data passing between MCPs, validation before moving to next phase, centralized error handling.

### Pattern 3: Iterative Refinement

**Use when:** Output quality improves with iteration.

```markdown
## Iterative Report Creation

### Initial Draft

1. Fetch data via MCP
2. Generate first draft report
3. Save to temporary file

### Quality Check

1. Run validation script: `scripts/check_report.py`
2. Identify issues:
   - Missing sections
   - Inconsistent formatting
   - Data validation errors

### Refinement Loop

1. Address each identified issue
2. Regenerate affected sections
3. Re-validate
4. Repeat until quality threshold met

### Finalization

1. Apply final formatting
2. Generate summary
3. Save final version
```

**Key techniques:** Explicit quality criteria, iterative improvement, validation scripts, know when to stop iterating.

### Pattern 4: Context-Aware Tool Selection

**Use when:** Same outcome, different tools depending on context.

```markdown
## Smart File Storage

### Decision Tree

1. Check file type and size
2. Determine best storage location:
   - Large files (>10MB): Use cloud storage MCP
   - Collaborative docs: Use Notion/Docs MCP
   - Code files: Use GitHub MCP
   - Temporary files: Use local storage

### Execute Storage

Based on decision:

- Call appropriate MCP tool
- Apply service-specific metadata
- Generate access link

### Provide Context to User

Explain why that storage was chosen
```

**Key techniques:** Clear decision criteria, fallback options, transparency about choices.

### Pattern 5: Domain-Specific Intelligence

**Use when:** Your skill adds specialized knowledge beyond tool access.

```markdown
## Payment Processing with Compliance

### Before Processing (Compliance Check)

1. Fetch transaction details via MCP
2. Apply compliance rules:
   - Check sanctions lists
   - Verify jurisdiction allowances
   - Assess risk level
3. Document compliance decision

### Processing

IF compliance passed:

- Call payment processing MCP tool
- Apply appropriate fraud checks
- Process transaction
  ELSE:
- Flag for review
- Create compliance case

### Audit Trail

- Log all compliance checks
- Record processing decisions
- Generate audit report
```

**Key techniques:** Domain expertise embedded in logic, compliance before action, comprehensive documentation, clear governance.

---

## 11. How Agents Discover, Load, and Manage Skills

This section consolidates the full client implementation lifecycle from the Agent Skills specification. Understanding how the engine works helps you write better skills.

### Step 1: The Skill Catalog

At session startup, agents build a catalog from all discovered skills. This catalog is injected into the system prompt or a tool description:

```xml
<available_skills>
<skill>
<name>pdf-processing</name>
<description>Extract text and tables from PDF files...</description>
<location>/path/to/pdf-processing/SKILL.md</location>
</skill>
</available_skills>
```

Each skill adds ~50-100 tokens. Even with dozens of skills, the catalog stays compact.

**Behavioral instructions** are included alongside the catalog, telling the model how to use skills:

For file-read activation:

```
The following skills provide specialized instructions for specific tasks.
When a task matches a skill's description, use your file-read tool to load
the SKILL.md at the listed location before proceeding.
When a skill references relative paths, resolve them against the skill's
directory (the parent of SKILL.md) and use absolute paths in tool calls.
```

For dedicated tool activation:

```
The following skills provide specialized instructions for specific tasks.
When a task matches a skill's description, call the activate_skill tool
with the skill's name to load its full instructions.
```

**Filtering:** Skills the user has disabled or that lack permissions are hidden entirely from the catalog. Don't list-and-block — this prevents the model from wasting turns attempting to load skills it can't use.

**When no skills are available:** Omit the catalog and behavioral instructions entirely. Don't show an empty `<available_skills/>` block — this would confuse the model.

### Step 2: Activation

Two mechanisms for loading a skill's full instructions:

**File-read activation:** The model calls its standard file-read tool with the `SKILL.md` path from the catalog. No special infrastructure needed — simplest approach when the model has file access.

**Dedicated tool activation:** A registered tool (e.g., `activate_skill`) takes a skill name and returns the content. Advantages:

- Control what content is returned (strip frontmatter or preserve it)
- Wrap content in structured tags for identification
- List bundled resources alongside instructions
- Enforce permissions or prompt for user consent
- Track activation for analytics
- **Constrain the `name` parameter to valid skill names as an enum** — prevents the model from hallucinating nonexistent skill names. If no skills are available, don't register the tool at all.

**User-explicit activation:** Users can also activate skills directly via slash commands (`/skill-name`) or mention syntax (`$skill-name`). The harness intercepts, does the lookup, and injects content so the model receives it without taking an activation action. An autocomplete widget makes this discoverable.

### Step 3: What the Model Receives

When activated, the model sees either:

**Full file (with frontmatter):** Natural outcome with file-read activation. The frontmatter may contain useful fields at activation time — e.g., `compatibility` notes environment requirements.

**Body only (frontmatter stripped):** The harness parses and removes YAML frontmatter, returning only the markdown instructions. Most dedicated tool implementations take this approach.

Both work in practice.

### Structured Wrapping

Dedicated tools often wrap skill content in identifying tags:

```xml
<skill_content name="pdf-processing">
[SKILL.md body content]

Skill directory: /path/to/pdf-processing
Relative paths in this skill are relative to the skill directory.

<skill_resources>
  <file>scripts/extract.py</file>
  <file>references/pdf-spec-summary.md</file>
</skill_resources>
</skill_content>
```

Benefits:

- The model can clearly distinguish skill instructions from other conversation content
- The harness can identify skill content during context compaction
- Bundled resources are surfaced without being eagerly loaded

**Listing bundled resources:** Enumerate supporting files (scripts, references, assets) but **do not eagerly read them**. The model loads specific files on demand when the skill's instructions reference them.

### Step 4: Managing Skills Over Time

**Protect from context compaction:** If your agent truncates older messages when the context window fills up, **exempt skill content from pruning**. Skill instructions are durable behavioral guidance — losing them mid-conversation silently degrades performance without any visible error. Use the structured tags to identify and preserve skill content during compaction.

**Deduplicate activations:** Track which skills have been activated in the current session. Skip re-injection if the same skill is loaded again.

**Permission allowlisting:** If your agent gates file access, **allowlist skill directories** so the model can read bundled resources (scripts, references) without triggering user confirmation prompts for every file.

**Subagent delegation (advanced):** Instead of injecting skill instructions into the main conversation, run the skill in a **separate subagent session**. The subagent receives the instructions, performs the task, and returns a summary. Useful for complex workflows that benefit from a dedicated, focused session.

---

## 12. Testing & Evaluation

### Three Testing Approaches

1. **Manual testing in Claude.ai** — Run queries directly, observe behavior. Fast iteration, no setup.
2. **Scripted testing in Claude Code** — Automate test cases for repeatable validation.
3. **Programmatic testing via skills API** — Build evaluation suites with defined test sets.

Choose the approach that matches your quality requirements and visibility. A skill used internally by a small team has different testing needs than one deployed to thousands of enterprise users.

**Pro tip from Anthropic:** Iterate on a single task before expanding. The most effective skill creators iterate on a single challenging task until Claude succeeds, then extract the winning approach into a skill. This leverages in-context learning and provides faster signal than broad testing.

### 1. Triggering Tests

**Goal:** Ensure your skill loads at the right times.

```
Should trigger:
- "Help me set up a new ProjectHub workspace"
- "I need to create a project in ProjectHub"
- "Initialize a ProjectHub project for Q4 planning"

Should NOT trigger:
- "What's the weather in San Francisco?"
- "Help me write Python code"
- "Create a spreadsheet" (unless your skill handles sheets)
```

**How to test:** Ask Claude "When would you use the [skill name] skill?" — it will quote the description back. Adjust based on what's missing.

### 2. Functional Tests

**Goal:** Verify correct outputs.

```
Test: Create project with 5 tasks
Given: Project name "Q4 Planning", 5 task descriptions
When: Skill executes workflow
Then:
  - Project created in ProjectHub
  - 5 tasks created with correct properties
  - All tasks linked to project
  - No API errors
```

**Test cases should cover:**

- Valid outputs generated
- API calls succeed
- Error handling works
- Edge cases covered

### 3. Performance Comparison

**Goal:** Prove the skill improves results vs. baseline.

```
Without skill:
- User provides instructions each time
- 15 back-and-forth messages
- 3 failed API calls requiring retry
- 12,000 tokens consumed

With skill:
- Automatic workflow execution
- 2 clarifying questions only
- 0 failed API calls
- 6,000 tokens consumed
```

### Structured Eval Framework

Store test cases in `evals/evals.json`:

```json
{
  "skill_name": "csv-analyzer",
  "evals": [
    {
      "id": 1,
      "prompt": "I have a CSV of monthly sales data in data/sales_2025.csv. Can you find the top 3 months by revenue and make a bar chart?",
      "expected_output": "A bar chart image showing the top 3 months by revenue, with labeled axes and values.",
      "files": ["evals/files/sales_2025.csv"],
      "assertions": [
        "The output includes a bar chart image file",
        "The chart shows exactly 3 months",
        "Both axes are labeled",
        "The chart title or caption mentions revenue"
      ]
    }
  ]
}
```

**Tips for writing good test prompts:**

- Start with 2-3 test cases. Don't over-invest before first results.
- Vary phrasings, detail levels, and formality ("hey can you clean up this csv" vs. "Parse the CSV at data/input.csv, drop rows where column B is null...").
- Cover at least one boundary condition (malformed input, unusual request, ambiguous instructions).
- Use realistic context (real file paths, column names, personal context). "Process this data" is too vague.

### Eval Workspace Structure

Organize eval results alongside your skill directory:

```
csv-analyzer-workspace/
└── iteration-1/
    ├── eval-top-months-chart/
    │   ├── with_skill/
    │   │   ├── outputs/       # Files produced by the run
    │   │   ├── timing.json    # Tokens and duration
    │   │   └── grading.json   # Assertion results
    │   └── without_skill/
    │       ├── outputs/
    │       ├── timing.json
    │       └── grading.json
    ├── eval-clean-missing-emails/
    │   ├── with_skill/
    │   │   └── ...
    │   └── without_skill/
    │       └── ...
    └── benchmark.json         # Aggregated statistics
```

Each eval run should start with a **clean context** — no leftover state. In environments with subagents (Claude Code), each child task starts fresh. Without subagents, use a separate session per run.

**timing.json:**

```json
{
  "total_tokens": 84852,
  "duration_ms": 23332
}
```

### Writing Good Assertions

**Good:**

- "The output file is valid JSON" — programmatically verifiable
- "The bar chart has labeled axes" — specific and observable
- "The report includes at least 3 recommendations" — countable

**Bad:**

- "The output is good" — too vague
- "The output uses exactly the phrase 'Total Revenue: $X'" — too brittle

Not everything needs an assertion. Some qualities (writing style, visual design, whether the output "feels right") are better caught during human review.

### Grading Principles

Grade each assertion as PASS or FAIL with **specific evidence** — quote or reference the output, don't just state an opinion.

```json
{
  "assertion_results": [
    {
      "text": "The output includes a bar chart image file",
      "passed": true,
      "evidence": "Found chart.png (45KB) in outputs directory"
    },
    {
      "text": "Both axes are labeled",
      "passed": false,
      "evidence": "Y-axis is labeled 'Revenue ($)' but X-axis has no label"
    }
  ],
  "summary": {
    "passed": 3,
    "failed": 1,
    "total": 4,
    "pass_rate": 0.75
  }
}
```

- **Require concrete evidence for a PASS.** Don't give the benefit of the doubt. If an assertion says "includes a summary" and the output has a section titled "Summary" with one vague sentence, that's a FAIL.
- **Review the assertions themselves, not just the results.** Notice when assertions are too easy (always pass), too hard (always fail even when output is good), or unverifiable (can't be checked from output alone). Fix these for the next iteration.

### Blind Comparison

For comparing two skill versions, present both outputs to an LLM judge **without revealing which came from which version**. The judge scores holistic qualities — organization, formatting, usability, polish — on its own rubric, free from bias. This complements assertion grading: two outputs might both pass all assertions but differ significantly in overall quality.

### Aggregating Results (benchmark.json)

```json
{
  "run_summary": {
    "with_skill": {
      "pass_rate": { "mean": 0.83, "stddev": 0.06 },
      "time_seconds": { "mean": 45.0, "stddev": 12.0 },
      "tokens": { "mean": 3800, "stddev": 400 }
    },
    "without_skill": {
      "pass_rate": { "mean": 0.33, "stddev": 0.1 },
      "time_seconds": { "mean": 32.0, "stddev": 8.0 },
      "tokens": { "mean": 2100, "stddev": 300 }
    },
    "delta": {
      "pass_rate": 0.5,
      "time_seconds": 13.0,
      "tokens": 1700
    }
  }
}
```

The `delta` tells you what the skill costs (more time, more tokens) and what it buys (higher pass rate). A skill that adds 13 seconds but improves pass rate by 50 percentage points is probably worth it. A skill that doubles token usage for a 2-point improvement might not be.

### Human Review (feedback.json)

Record specific, actionable feedback per test case:

```json
{
  "eval-top-months-chart": "The chart is missing axis labels and the months are in alphabetical order instead of chronological.",
  "eval-clean-missing-emails": ""
}
```

"The chart is missing axis labels" is actionable; "looks bad" is not. Empty feedback means the output passed your review.

### Pattern Analysis After Aggregation

- **Remove assertions that always pass in both configs** — they don't measure skill value
- **Investigate assertions that always fail in both** — assertion might be broken
- **Study assertions that pass WITH skill but fail WITHOUT** — this is where skill adds value. Understand _why_ — which instructions or scripts made the difference?
- **Tighten instructions when results are inconsistent** — high stddev means ambiguous instructions. Add examples or more specific guidance.
- **Check time and token outliers** — if one eval takes 3x longer, read its execution transcript to find the bottleneck

---

## 13. Iteration & Feedback Loop

### Using the skill-creator Skill

Built into Claude.ai and available for Claude Code. Use: "Help me build a skill using skill-creator"

**Creating:** Generates skills from descriptions, produces properly formatted SKILL.md, suggests trigger phrases.

**Reviewing:** Flags common issues (vague descriptions, missing triggers, structural problems), identifies over/under-triggering risks, suggests test cases.

**Iterating:** "Use the issues & solution identified in this chat to improve how the skill handles [specific edge case]"

**Important caveat:** skill-creator helps you design and refine skills but **does not execute automated test suites or produce quantitative evaluation results.** Use the eval framework (Section 12) for that.

### Three Sources of Improvement Signal

After grading and reviewing, you have:

1. **Failed assertions** — point to specific gaps (missing step, unclear instruction, unhandled case)
2. **Human feedback** — points to broader quality issues (wrong approach, poor structure, technically correct but unhelpful)
3. **Execution transcripts** — reveal _why_ things went wrong. If the agent ignored an instruction, it may be ambiguous. If the agent spent time on unproductive steps, those instructions need simplifying.

### The Improvement Loop

1. Give all three signals (failed assertions + human feedback + execution transcripts) and current `SKILL.md` to an LLM
2. Ask it to propose improvements following these principles:
   - **Generalize from feedback** — fix underlying issues broadly, not narrow patches for specific test cases. The skill will be used across many different prompts.
   - **Keep the skill lean** — fewer, better instructions outperform exhaustive rules. If transcripts show wasted work, remove those instructions. If pass rates plateau despite adding more rules, try removing instructions and see if results hold.
   - **Explain the why** — "Do X because Y tends to cause Z" works better than "ALWAYS do X". Models follow instructions more reliably when they understand the purpose.
   - **Bundle repeated work** — if every test run independently wrote a similar helper script (a chart builder, a data parser), bundle it in `scripts/`. See Using Scripts section.
3. Review and apply changes
4. Rerun all test cases in new `iteration-N+1/` directory
5. Grade and aggregate
6. Human review
7. Stop when feedback is consistently empty or no meaningful improvement between iterations

### Feedback Signals

**Undertriggering signals:**

- Skill doesn't load when it should
- Users manually enabling it
- Support questions about when to use it
- **Fix:** Add more detail and nuance to the description, include keywords for technical terms

**Overtriggering signals:**

- Skill loads for irrelevant queries
- Users disabling it
- Confusion about purpose
- **Fix:** Add negative triggers ("Do NOT use for..."), be more specific about scope

**Execution issues:**

- Inconsistent results
- API call failures
- User corrections needed
- **Fix:** Improve instructions, add error handling

---

## 14. Distribution & Sharing

### Current Distribution Model

Skills make your MCP integration more complete. As users compare connectors, those with skills offer a faster path to value, giving you an edge over MCP-only alternatives.

**How individual users get skills:**

1. Download the skill folder
2. Zip the folder (if needed)
3. Upload to Claude.ai via Settings > Capabilities > Skills
4. Or place in Claude Code skills directory

**Organization-level skills** (shipped December 18, 2025):

- Admins can deploy skills workspace-wide
- Automatic updates
- Centralized management

### An Open Standard

Anthropic has published [Agent Skills](https://github.com/agentskills/agentskills) as an open standard. Like MCP, skills should be portable across tools and platforms — the same skill should work whether you're using Claude or other AI platforms. That said, some skills are designed for specific platforms; authors can note this in the `compatibility` field.

### Using Skills via API

For programmatic use cases — building applications, agents, or automated workflows — the API provides direct control over skill management and execution.

**Key capabilities:**

- `/v1/skills` endpoint for listing and managing skills
- Add skills to Messages API requests via the `container.skills` parameter
- Version control and management through the Claude Console
- Works with the Claude Agent SDK for building custom agents

**Note:** Skills in the API require the Code Execution Tool beta, which provides the secure environment skills need to run.

### When to Use API vs. Claude.ai

| Use Case                                        | Best Surface            |
| ----------------------------------------------- | ----------------------- |
| End users interacting with skills directly      | Claude.ai / Claude Code |
| Manual testing and iteration during development | Claude.ai / Claude Code |
| Individual, ad-hoc workflows                    | Claude.ai / Claude Code |
| Applications using skills programmatically      | API                     |
| Production deployments at scale                 | API                     |
| Automated pipelines and agent systems           | API                     |

### Cross-Client Interoperability

Skills are stored in standard locations for cross-client sharing:

| Scope   | Path                        | Purpose                          |
| ------- | --------------------------- | -------------------------------- |
| Project | `<project>/.agents/skills/` | Cross-client interoperability    |
| User    | `~/.agents/skills/`         | Cross-client interoperability    |
| Project | `<project>/.claude/skills/` | Claude-specific (widely adopted) |
| User    | `~/.claude/skills/`         | Claude-specific                  |

### Recommended Approach Today

Start by hosting your skill on GitHub with a public repo, clear README (separate from SKILL.md for human visitors), and example usage with screenshots. Then add a section to your MCP documentation that links to the skill and provides a quick-start guide.

**1. Host on GitHub:**

- Public repo for open-source skills
- Clear README with installation instructions
- Example usage and screenshots

**2. Document in Your MCP Repo:**

- Link to skills from MCP documentation
- Explain the value of using both together
- Provide quick-start guide

**3. Create an Installation Guide:**

```markdown
## Installing the [Your Service] skill

1. Download the skill:
   - Clone repo: `git clone https://github.com/yourcompany/skills`
   - Or download ZIP from Releases

2. Install in Claude:
   - Open Claude.ai > Settings > skills
   - Click "Upload skill"
   - Select the skill folder (zipped)

3. Enable the skill:
   - Toggle on the [Your Service] skill
   - Ensure your MCP server is connected

4. Test:
   - Ask Claude: "Set up a new project in [Your Service]"
```

### Positioning Your Skill

**Focus on outcomes, not features:**

```
# GOOD
"The ProjectHub skill enables teams to set up complete project workspaces
in seconds -- including pages, databases, and templates -- instead of
spending 30 minutes on manual setup."

# BAD
"The ProjectHub skill is a folder containing YAML frontmatter and
Markdown instructions that calls our MCP server tools."
```

**Highlight the MCP + skills story:**

```
"Our MCP server gives Claude access to your Linear projects.
Our skills teach Claude your team's sprint planning workflow.
Together, they enable AI-powered project management."
```

### Official Resources & References

**Anthropic Documentation:**

- Best Practices Guide
- Skills Documentation
- API Reference
- MCP Documentation

**Blog Posts:**

- Introducing Agent Skills
- Engineering Blog: Equipping Agents for the Real World
- Skills Explained
- How to Create Skills for Claude
- Building Skills for Claude Code
- Improving Frontend Design through Skills

**Example Skills:**

- GitHub: [anthropics/skills](https://github.com/anthropics/skills) — Anthropic-created skills you can customize
- Document Skills — PDF, DOCX, PPTX, XLSX creation
- Partner Skills Directory — Asana, Atlassian, Canva, Figma, Sentry, Zapier, and more

**Support:**

- General questions: Claude Developers Discord
- Bug reports: GitHub Issues at anthropics/skills/issues (include skill name, error message, steps to reproduce)

---

## 15. Troubleshooting Common Issues

### "Could not find SKILL.md in uploaded folder"

**Cause:** File not named exactly `SKILL.md` (case-sensitive)
**Fix:** Rename to `SKILL.md`. Verify with `ls -la`.

### "Invalid frontmatter"

**Cause:** YAML formatting issue

```yaml
# WRONG - missing delimiters
name: my-skill
description: Does things

# WRONG - unclosed quotes
name: my-skill
description: "Does things

# WRONG - unquoted colon in value
name: my-skill
description: Use this skill when: the user asks about PDFs

# CORRECT
---
name: my-skill
description: "Use this skill when: the user asks about PDFs"
---
```

### "Invalid skill name"

**Cause:** Name has spaces or capitals

```yaml
# WRONG
name: My Cool Skill

# CORRECT
name: my-cool-skill
```

### Skill Doesn't Trigger

**Symptom:** Skill never loads automatically

**Quick checklist:**

- Is the description too generic? ("Helps with projects" won't work)
- Does it include trigger phrases users would actually say?
- Does it mention relevant file types if applicable?

**Debug:** Ask Claude "When would you use the [skill name] skill?" and adjust.

### Skill Triggers Too Often

**Solutions:**

1. Add negative triggers: "Do NOT use for simple data exploration (use data-viz skill instead)"
2. Be more specific: "Processes PDF legal documents for contract review" not "Processes documents"
3. Clarify scope: "Use specifically for online payment workflows, not for general financial queries"

### Instructions Not Followed

**Common causes:**

1. **Too verbose** — keep concise, use bullet points, move details to references
2. **Buried** — put critical instructions at top, use ## Important headers, repeat key points if needed
3. **Ambiguous** — be specific: "Before calling create_project, verify: Project name is non-empty, At least one team member assigned"
4. **Model laziness** — add explicit encouragement: "Take your time, quality > speed, don't skip validation"
5. **Missing the why** — "Do X because Y tends to cause Z" works better than "ALWAYS do X"

**Advanced technique:** For critical validations, bundle a script that performs the checks programmatically rather than relying on language instructions. Code is deterministic; language interpretation isn't. See the [Office skills](https://github.com/anthropics/skills) for examples of this pattern.

### MCP Connection Issues

**Checklist:**

1. Verify MCP server is connected (Settings > Extensions > [Your Service] > "Connected")
2. Check authentication (API keys valid, permissions/scopes granted, OAuth tokens refreshed)
3. Test MCP independently — ask Claude to call MCP directly without skill
4. Verify tool names are correct (case-sensitive, check MCP server documentation)

### Large Context Issues

**Symptom:** Skill seems slow or responses degraded

**Solutions:**

1. **Optimize SKILL.md size** — move detailed docs to `references/`, keep under 5000 words
2. **Reduce enabled skills** — evaluate if you have more than 20-50 simultaneously
3. **Use progressive disclosure** — don't load all content upfront
4. **Consider skill "packs"** — group related capabilities into a single skill rather than multiple small ones

---

## 16. Pre-Upload Checklist

### Before You Start

- [ ] Identified 2-3 concrete use cases
- [ ] Tools identified (built-in or MCP?)
- [ ] Reviewed this guide and example skills
- [ ] Planned folder structure

### During Development

- [ ] Folder named in kebab-case
- [ ] `SKILL.md` file exists (exact spelling, case-sensitive)
- [ ] YAML frontmatter has `---` delimiters
- [ ] `name` field: kebab-case, no spaces, no capitals
- [ ] `description` includes WHAT and WHEN
- [ ] No XML tags (< >) anywhere in the skill
- [ ] Instructions are clear and actionable
- [ ] Error handling included
- [ ] Examples provided
- [ ] References clearly linked

### Before Upload

- [ ] Tested triggering on obvious tasks
- [ ] Tested triggering on paraphrased requests
- [ ] Verified doesn't trigger on unrelated topics
- [ ] Functional tests pass
- [ ] Tool integration works (if applicable)
- [ ] Compressed as .zip file

### After Upload

- [ ] Test in real conversations
- [ ] Monitor for under/over-triggering
- [ ] Collect user feedback
- [ ] Iterate on description and instructions
- [ ] Update version in metadata

---

## 17. Success Metrics

### Define Success Criteria

These are **aspirational targets — rough benchmarks rather than precise thresholds**. Aim for rigor but accept that there will be an element of vibes-based assessment. Anthropic is actively developing more robust measurement guidance and tooling.

### Quantitative

- **Skill triggers on 90% of relevant queries**
  - _How to measure:_ Run 10-20 test queries that should trigger your skill. Track how many times it loads automatically vs. requires explicit invocation.
- **Completes workflow in X tool calls**
  - _How to measure:_ Compare the same task with and without the skill enabled. Count tool calls and total tokens consumed.
- **0 failed API calls per workflow**
  - _How to measure:_ Monitor MCP server logs during test runs. Track retry rates and error codes.

### Qualitative

- **Users don't need to prompt Claude about next steps**
  - _How to assess:_ During testing, note how often you need to redirect or clarify. Ask beta users for feedback.
- **Workflows complete without user correction**
  - _How to assess:_ Run the same request 3-5 times. Compare outputs for structural consistency and quality.
- **Consistent results across sessions**
  - _How to assess:_ Can a new user accomplish the task on first try with minimal guidance?

---

## 18. Security Rules

### Forbidden in Frontmatter

- XML angle brackets (< >) — could inject instructions into system prompt
- Code execution constructs
- Skills named with "claude" or "anthropic" prefix (reserved)

### Allowed in Frontmatter

- Any standard YAML types (strings, numbers, booleans, lists, objects)
- Custom metadata fields
- Long descriptions (up to 1024 characters)

### Trust Considerations

- Project-level skills come from the repository being worked on, which may be untrusted
- Consider gating project-level skill loading on a trust check
- User-level skills are more trusted (installed by the user themselves)

---

## 19. Quick Reference Card

### Minimum Viable Skill

```
my-skill/
  SKILL.md
```

```yaml
---
name: my-skill
description: What it does. Use when user asks to [specific phrases].
---

# My Skill

## Instructions

### Step 1: [Action]
Do this specific thing.

### Step 2: [Action]
Then do this.

## Common Issues

### Error: [message]
Fix: [solution]
```

### All Optional Fields

```yaml
---
name: skill-name
description: [required description]
license: MIT
compatibility: 'Designed for Claude Code. Requires git and Node.js 18+'
allowed-tools: 'Bash(git:*) Bash(jq:*) Read'
metadata:
  author: Company Name
  version: '1.0.0'
  mcp-server: server-name
  category: productivity
  tags: [project-management, automation]
  documentation: https://example.com/docs
  support: support@example.com
---
```

### Validation Command

```bash
# Using the reference library
pip install skills-ref
skills-ref validate ./my-skill

# Read skill properties (outputs JSON)
skills-ref read-properties ./my-skill

# Generate <available_skills> XML for agent prompts
skills-ref to-prompt ./my-skill ./other-skill
```

### Prompt XML Format (How Claude Sees the Catalog)

```xml
<available_skills>
<skill>
<name>pdf-processing</name>
<description>Extract text and tables from PDF files...</description>
<location>/path/to/pdf-processing/SKILL.md</location>
</skill>
</available_skills>
```

### Key Resources

- Official spec: github.com/agentskills/agentskills
- Example skills: github.com/anthropics/skills
- Reference library: github.com/agentskills/agentskills/tree/main/skills-ref
- Best practices: platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
- Claude Developers Discord (for support)
- GitHub Issues: github.com/anthropics/skills/issues (for bug reports)

---

_Source: "The Complete Guide to Building Skills for Claude" by Anthropic (2026) + Agent Skills Open Specification (github.com/agentskills/agentskills) — specification, client implementation guide, evaluation guide, scripting guide, and reference library_
