# format

> **Path:** `Agent-backend/packages/opencode/src/format/`

## Purpose

Auto-formatting integration for edited files. Subscribes to `File.Event.Edited` and runs the appropriate formatter (gofmt, prettier, mix, oxfmt, rustfmt, etc.) based on file extension. Formatters are configurable via project config and auto-detected from the system PATH.

## Usage Status

| Product             | Status   | Notes                                            |
| ------------------- | -------- | ------------------------------------------------ |
| Orbit Desktop (SDK) | `active` | Runs formatters after Write/Edit tool executions |
| Orbit CLI           | `active` | Runs formatters after Write/Edit tool executions |

## Key Files

| File           | Purpose                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| `index.ts`     | `Format` namespace -- formatter orchestration, config-driven enable/disable, file-edited event subscription   |
| `formatter.ts` | Formatter definitions (gofmt, prettier, mix, oxfmt, rustfmt, etc.) with extension mappings and PATH detection |
