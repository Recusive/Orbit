# id

> **Path:** `Agent-backend/packages/opencode/src/id/`

## Purpose

Monotonic ID generation with type-safe prefixes. Generates time-ordered IDs (ascending or descending) with domain-specific prefixes (`ses_`, `msg_`, `per_`, `pty_`, `tool_`, etc.) using a timestamp + counter + random base62 suffix. Supports extracting timestamps from ascending IDs.

## Usage Status

| Product             | Status   | Notes                                                                     |
| ------------------- | -------- | ------------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | All entity IDs (sessions, messages, permissions, PTYs) are generated here |
| Orbit CLI           | `active` | All entity IDs (sessions, messages, permissions, PTYs) are generated here |

## Key Files

| File    | Purpose                                                                                                                           |
| ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `id.ts` | `Identifier` namespace -- `ascending()`, `descending()`, `create()`, `timestamp()`, Zod `schema()` helper for typed ID validation |
