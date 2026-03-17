# themes

> **Path:** `Agent-backend/.opencode/themes/`

## Purpose

Custom theme definitions for the OpenCode TUI. Theme files are JSON with a `$schema` reference to `opencode.ai/theme.json`. They define color palettes via a `defs` block (reusable color variables) and a `theme` block mapping semantic tokens (primary, text, background, diff, markdown, syntax) to light/dark variants.

## Usage Status

| Product             | Status      | Notes                                                               |
| ------------------- | ----------- | ------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `reference` | Theme schema format could inform Orbit's theming system             |
| Orbit CLI           | `reference` | The CLI loads custom themes from `.orbit/themes/` using this format |

## Files

| File           | Purpose                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `mytheme.json` | Example Nord-based theme — 16 Nord palette colors mapped to ~50 semantic tokens covering UI, diff, markdown, and syntax highlighting |
