# command

> **Path:** `Agent-backend/packages/opencode/src/command/`

## Purpose

Slash-command system that provides named, templated commands users can invoke during a session (e.g., `/init`, `/review`). Aggregates commands from three sources: built-in definitions, user config, MCP prompts, and discovered skills.

## Usage Status

| Product             | Status   | Notes                                                                         |
| ------------------- | -------- | ----------------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | Commands are exposed via the API and available in the desktop command palette |
| Orbit CLI           | `active` | TUI command palette (`/command`) uses this registry                           |

## Key Files

- `index.ts` — `Command` namespace with Zod schema for `Info`, built-in commands (`init` for AGENTS.md creation, `review` for change review), config-defined commands, MCP prompt integration, skill integration, `hints()` for template placeholder extraction, bus event for command execution tracking
- `template/` — Prompt templates for built-in commands (see `template/CLAUDE.md`)
