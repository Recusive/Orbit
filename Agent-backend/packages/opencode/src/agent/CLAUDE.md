# agent

> **Path:** `Agent-backend/packages/opencode/src/agent/`

## Purpose

Defines all built-in agent personalities (build, plan, explore, general, compaction, title, summary) with their permission rulesets, model configurations, and system prompts. Also provides agent generation via LLM.

## Usage Status

| Product             | Status   | Notes                                                                                          |
| ------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | Agent definitions drive the core agent behavior, permission boundaries, and prompt engineering |
| Orbit CLI           | `active` | Same agent definitions power the CLI TUI and headless modes                                    |

## Key Files

- `agent.ts` — `Agent` namespace with Zod schema for `Info`, built-in agent definitions (build, plan, explore, general, compaction, title, summary), permission merging from config, `generate()` for LLM-powered agent creation
- `generate.txt` — System prompt for generating new agent configurations from natural language descriptions
- `prompt/` — Subdirectory containing agent-specific system prompts (see `agent/prompt/CLAUDE.md`)
