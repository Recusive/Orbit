# patch

> **Path:** `Agent-backend/packages/opencode/src/patch/`

## Purpose

Structured patch parsing and application (the `apply_patch` tool backend). Parses a custom patch format with `*** Begin Patch` / `*** End Patch` markers supporting file add, delete, update, and move operations. Applies patches to disk with multi-pass fuzzy matching (exact, rstrip, trim, Unicode normalization) for resilience against whitespace and encoding differences.

## Usage Status

| Product             | Status   | Notes                                                       |
| ------------------- | -------- | ----------------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | Backend for the `apply_patch` tool used by Codex/GPT agents |
| Orbit CLI           | `active` | Backend for the `apply_patch` tool used by Codex/GPT agents |

## Key Files

| File       | Purpose                                                                                                                                                                                             |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts` | `Patch` namespace -- `parsePatch()`, `applyPatch()`, `applyHunksToFiles()`, `deriveNewContentsFromChunks()`, `maybeParseApplyPatch()` for bash command interception, multi-pass fuzzy line matching |
