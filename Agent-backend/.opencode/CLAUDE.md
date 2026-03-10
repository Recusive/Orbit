# .opencode

> **Path:** `Agent-backend/.opencode/`

## Purpose

OpenCode project-level configuration — custom agent definitions, slash commands, glossary translations, themes, and custom tools. This is how the OpenCode project itself extends its own agent with project-specific behaviors.

## Usage Status

| Product             | Status      | Notes                                                                                                                               |
| ------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `reference` | Demonstrates how to customize agents, commands, and tools per-project. Orbit's `.orbit/` config directory follows the same pattern. |
| Orbit CLI           | `reference` | Same — the CLI reads `.opencode/` for project-specific customization                                                                |

## Key Directories

| Directory   | Purpose                                                                                                                                                            |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `agent/`    | Custom agent definitions (4 agents): `docs.md` (documentation agent), `duplicate-pr.md` (PR dedup), `translator.md` (i18n translation), `triage.md` (issue triage) |
| `command/`  | Custom slash commands (7 commands): `ai-deps.md`, `audit-plan.md`, `commit.md`, `issues.md`, `learn.md`, `rmslop.md`, `spellcheck.md`                              |
| `glossary/` | Translation glossaries — 17 language files (ar, br, bs, da, de, es, fr, ja, ko, no, pl, ru, th, tr, zh-cn, zh-tw) + README                                         |
| `themes/`   | Custom themes: `mytheme.json`                                                                                                                                      |
| `tool/`     | Custom tools (2): `github-pr-search.ts`/`.txt`, `github-triage.ts`/`.txt` — each with implementation + prompt pair                                                 |

## Key Files

| File             | Purpose                              |
| ---------------- | ------------------------------------ |
| `opencode.jsonc` | Project configuration (JSONC format) |
| `package.json`   | Dependencies for custom tools        |
| `env.d.ts`       | Environment type declarations        |

## Notes

- **Custom tools follow the same `.ts` + `.txt` pattern** as built-in tools in `packages/opencode/src/tool/`. The `.ts` is the implementation, the `.txt` is the system prompt fragment.
- **17 translation glossaries** — used by the `translator` agent to maintain consistent terminology across i18n translations.
- **`rmslop.md`** — a custom command to remove AI-generated filler text ("slop") from code and docs. Shows how project-specific workflows can be encoded as slash commands.
- **This directory is the config format that Orbit's `.orbit/` directory mirrors** — same structure for agents, commands, and tools.
