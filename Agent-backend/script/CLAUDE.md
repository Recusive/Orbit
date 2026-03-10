# script

> **Path:** `Agent-backend/script/`

## Purpose

Repository-level build, release, and maintenance scripts. Handles SDK generation, versioning, changelog, publishing, release management, and development tooling.

## Usage Status

| Product             | Status      | Notes                                                                                                        |
| ------------------- | ----------- | ------------------------------------------------------------------------------------------------------------ |
| Orbit Desktop (SDK) | `reference` | `generate.ts` (SDK regeneration) is actively relevant. Release and versioning patterns are useful reference. |
| Orbit CLI           | `reference` | Same                                                                                                         |

## Key Files

| File              | Purpose                                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| `generate.ts`     | **Critical** — regenerates the TypeScript SDK from OpenAPI spec. Run after changing server routes. |
| `version.ts`      | Version management across all packages                                                             |
| `publish.ts`      | Publish packages to npm                                                                            |
| `release/`        | Release management scripts                                                                         |
| `changelog.ts`    | Auto-generate changelog from commits                                                               |
| `beta.ts`         | Beta release workflow                                                                              |
| `stats.ts`        | Usage statistics                                                                                   |
| `format.ts`       | Code formatting                                                                                    |
| `hooks/`          | Git hook scripts                                                                                   |
| `duplicate-pr.ts` | Detect duplicate PRs                                                                               |
| `sync-zed.ts`     | Sync Zed extension with main package                                                               |

## Notes

- **`generate.ts` is the most important script for Orbit** — after modifying any server route in `packages/opencode/src/server/routes/`, run `./script/generate.ts` to regenerate `packages/sdk/openapi.json` and the TypeScript SDK client code.
