# command

> **Path:** `Agent-backend/.opencode/command/`

## Purpose

Custom slash commands for the OpenCode project. Each markdown file defines a command that can be invoked via `/command-name` in the agent chat. Commands can specify a model, description, and whether they run as subtasks. The frontmatter configures behavior; the body is the prompt.

## Usage Status

| Product             | Status      | Notes                                                                              |
| ------------------- | ----------- | ---------------------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `reference` | Demonstrates the command definition format for Orbit's `.orbit/command/` directory |
| Orbit CLI           | `reference` | Same — the CLI loads commands from `.orbit/command/` using this format             |

## Files

| File            | Purpose                                                                                                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `ai-deps.md`    | AI dependency management command                                                                                                  |
| `audit-plan.md` | Audit/planning command                                                                                                            |
| `commit.md`     | Git commit + push command — runs `git diff`, enforces prefix (`docs:`, `tui:`, `core:`, `ci:`, etc.), user-facing commit messages |
| `issues.md`     | GitHub issues command                                                                                                             |
| `learn.md`      | Learning/context gathering command                                                                                                |
| `rmslop.md`     | Remove AI-generated slop — strips unnecessary comments, defensive checks, `any` casts, emoji, style inconsistencies               |
| `spellcheck.md` | Spellchecking command                                                                                                             |
