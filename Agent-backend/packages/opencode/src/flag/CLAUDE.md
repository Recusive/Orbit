# flag

> **Path:** `Agent-backend/packages/opencode/src/flag/`

## Purpose

Feature flags and configuration toggles read from environment variables. Controls experimental features, disabling subsystems (LSP, autoupdate, autocompact, Claude Code integration), permission modes, and client identification. Some flags use dynamic getters for runtime evaluation.

## Usage Status

| Product             | Status   | Notes                                   |
| ------------------- | -------- | --------------------------------------- |
| Orbit Desktop (SDK) | `active` | Feature gating across the entire engine |
| Orbit CLI           | `active` | Feature gating across the entire engine |

## Key Files

| File      | Purpose                                                                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `flag.ts` | `Flag` namespace -- all `OPENCODE_*` environment variable flags with truthy/falsy/number parsing and dynamic `Object.defineProperty` getters for runtime-evaluated flags |
