# cli/cmd/tui/context/theme

> **Path:** `Agent-backend/packages/opencode/src/cli/cmd/tui/context/theme/`

## Purpose

JSON theme definition files for the TUI. Each file defines a complete color palette (primary, secondary, accent, background, foreground, borders, syntax highlighting, diff colors, ANSI palette) for a specific visual theme.

## Usage Status

| Product             | Status   | Notes                                                                                   |
| ------------------- | -------- | --------------------------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | Theme palette definitions can be referenced when aligning desktop and CLI color systems |
| Orbit CLI           | `active` | Users switch between these themes via `orbit` TUI theme picker or `tui.json` config     |

## Key Files

34 theme JSON files including:

- `orbit.json` — Default Orbit theme
- `orng.json` / `lucent-orng.json` / `ember.json` — Custom branded themes
- `catppuccin.json` / `catppuccin-frappe.json` / `catppuccin-macchiato.json` — Catppuccin variants
- `tokyonight.json` / `dracula.json` / `nord.json` / `gruvbox.json` — Popular community themes
- `github.json` / `vercel.json` / `cursor.json` — Editor-inspired themes
- Plus: aura, ayu, carbonfox, cobalt2, everforest, flexoki, kanagawa, material, matrix, mercury, monokai, nightowl, one-dark, osaka-jade, palenight, rosepine, solarized, synthwave84, vesper, zenburn
