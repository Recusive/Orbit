# patches

> **Path:** `Agent-backend/patches/`

## Purpose

Bun/pnpm patch-package overrides for npm dependencies that need local fixes before upstream patches are available.

## Usage Status

| Product             | Status     | Notes                                               |
| ------------------- | ---------- | --------------------------------------------------- |
| Orbit Desktop (SDK) | `not used` | These patches are specific to upstream dependencies |
| Orbit CLI           | `not used` | Same                                                |

## Current Patches

| Patch                                                | Purpose                                 |
| ---------------------------------------------------- | --------------------------------------- |
| `@openrouter%2Fai-sdk-provider@1.5.4.patch`          | Fix for OpenRouter AI SDK provider      |
| `@standard-community%2Fstandard-openapi@0.2.9.patch` | Fix for Standard OpenAPI schema tooling |

## Notes

- **URL-encoded filenames** — Bun uses URL-encoded package names in patch filenames (`%2F` = `/`).
- **These are temporary fixes** — should be removed when upstream packages release patched versions.
