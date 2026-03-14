# packages/script

> **Path:** `Agent-backend/packages/script/`

## Purpose

Shared build and development script utilities (`@orbit.build/script`). Provides helpers used by build scripts across packages — version management via semver, build orchestration, and script utilities.

## Usage Status

| Product             | Status   | Notes                            |
| ------------------- | -------- | -------------------------------- |
| Orbit Desktop (SDK) | `active` | Used by opencode's build scripts |
| Orbit CLI           | `active` | Same build infrastructure        |

## Key Files

| File           | Purpose                |
| -------------- | ---------------------- |
| `src/index.ts` | Script utility exports |

## Dependencies

- `semver` — Semantic versioning for version management and comparison

## Notes

- **Minimal package** — single source file with semver dependency. Exists as a separate workspace package so build scripts across the monorepo can share version management logic without duplicating it.
