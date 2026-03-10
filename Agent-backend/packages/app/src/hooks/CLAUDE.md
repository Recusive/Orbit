# hooks

> **Path:** `Agent-backend/packages/app/src/hooks/`

## Purpose

Custom SolidJS hooks for the OpenCode web app. Currently contains a single hook.

## Usage Status

| Product             | Status      | Notes                                               |
| ------------------- | ----------- | --------------------------------------------------- |
| Orbit Desktop (SDK) | `reference` | The provider filtering pattern is directly relevant |
| Orbit CLI           | `reference` | Same                                                |

## Files

| File               | Purpose                                                                                                                                                                                                                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `use-providers.ts` | Provider list hook — `useProviders()` returns computed lists: `all` (every provider), `connected` (authenticated), `paid` (connected with non-zero cost), `popular` (curated list of 8: opencode, anthropic, github-copilot, openai, google, openrouter, vercel, opencode-go), and `default`. Reads from `GlobalSync` context. |

## Notes

- **Only one hook** — most reactive logic lives in `@/context/` providers rather than standalone hooks. This directory may grow as the app adds more cross-cutting concerns.
- **`popularProviders` array** is exported and used by the model picker dialog for provider ordering.
