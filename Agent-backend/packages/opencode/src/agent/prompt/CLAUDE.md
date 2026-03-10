# agent/prompt

> **Path:** `Agent-backend/packages/opencode/src/agent/prompt/`

## Purpose

Plain-text system prompt templates for specialized internal agents (compaction, explore, summary, title). These prompts are imported as text and injected into the agent definitions in `agent.ts`.

## Usage Status

| Product             | Status   | Notes                                                     |
| ------------------- | -------- | --------------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | Prompt files define LLM behavior for internal agent tasks |
| Orbit CLI           | `active` | Same prompts used across all interfaces                   |

## Key Files

- `compaction.txt` — System prompt for the compaction agent that summarizes long conversations
- `explore.txt` — System prompt for the explore agent specialized in codebase search and navigation
- `summary.txt` — System prompt for generating conversation summaries
- `title.txt` — System prompt for generating concise session titles (max 50 chars, language-aware, specific formatting rules)
