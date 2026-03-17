# config

> **Path:** `Agent-backend/packages/opencode/src/config/`

## Purpose

Configuration loading, parsing, validation, and path resolution. Handles a multi-layer config precedence system (well-known, global, project, managed) with JSONC support, `{env:VAR}` and `{file:path}` substitutions, markdown frontmatter parsing, and TUI-specific config.

## Usage Status

| Product             | Status   | Notes                                                                                       |
| ------------------- | -------- | ------------------------------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | Configuration drives all agent behavior, provider selection, permissions, and feature flags |
| Orbit CLI           | `active` | Same config system; TUI-specific settings (theme, keybinds, scroll) via `tui.json`          |

## Key Files

- `config.ts` — `Config` namespace: multi-layer config loading (well-known, global `~/.config/opencode/`, project `.orbit/`, managed `/Library/Application Support/orbit/`), Zod schema with `Info` type covering providers, agents, tools, MCP, permissions, instructions, plugins, and more; file watching for hot-reload; markdown instruction file loading
- `paths.ts` — `ConfigPaths` namespace: `projectFiles()` and `directories()` for config file discovery with `findUp`; `readFile()`, `parseText()` with JSONC parsing and `{env:VAR}`/`{file:path}` substitution; error types for JSON and validation failures
- `tui.ts` — `TuiConfig` namespace: loads TUI-specific settings from `tui.json`/`tui.jsonc` with same multi-layer precedence; handles migration from legacy config format
- `tui-schema.ts` — Zod schemas for TUI configuration: `TuiOptions` (scroll speed, acceleration, diff style) and `TuiInfo` (theme, keybinds, options)
- `markdown.ts` — `ConfigMarkdown` namespace: `@file` reference regex, `!shell` command regex, frontmatter parsing with YAML fallback sanitization for compatibility with other agents' config files
- `migrate-tui-config.ts` — One-time migration from legacy TUI config format to the current schema
