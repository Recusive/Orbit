# theme

> **Path:** `Agent-backend/packages/ui/src/theme/`

## Purpose

Theme system for the UI package. Contains `color.ts` (color manipulation utilities), `context.tsx` (theme context provider), `default-themes.ts` (built-in theme list), `loader.ts` (theme loading logic), `resolve.ts` (theme resolution/fallback), `types.ts` (theme type definitions), `desktop-theme.schema.json` (JSON schema for desktop theme files), `themes/` (15 individual theme JSON files), and `index.ts` (barrel export).

## Usage Status

| Product             | Status     | Notes                                              |
| ------------------- | ---------- | -------------------------------------------------- |
| Orbit Desktop (SDK) | `not used` | Desktop has its own theme system                   |
| Orbit CLI           | `rebuild`  | Theme schema and color resolution patterns to port |
