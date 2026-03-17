# skill

> **Path:** `Agent-backend/packages/opencode/src/skill/`

## Purpose

Custom skill/command system. Discovers and loads SKILL.md files from project directories (`.claude/skills/`, `.agents/skills/`, `.opencode/skills/`), global config, and remote URLs. Skills are markdown files with frontmatter metadata that provide reusable prompt instructions the agent can invoke via the Skill tool.

## Usage Status

| Product             | Status   | Notes                                            |
| ------------------- | -------- | ------------------------------------------------ |
| Orbit Desktop (SDK) | `active` | Skill discovery and execution via the Skill tool |
| Orbit CLI           | `active` | Skill discovery and execution via the Skill tool |

## Key Files

| File           | Purpose                                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`     | Re-exports from `skill.ts`                                                                                                                            |
| `skill.ts`     | `Skill` namespace -- skill discovery from project/global/external directories, SKILL.md parsing with frontmatter validation, skill listing and lookup |
| `discovery.ts` | `Discovery` namespace -- remote skill index fetching and caching, downloads skill files from URLs to local cache                                      |
