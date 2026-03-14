# tool

> **Path:** `Agent-backend/.opencode/tool/`

## Purpose

Custom tool definitions for the OpenCode project. Each tool is a paired `.ts` (implementation) + `.txt` (description prompt) file. Tools use the `@orbit.build/plugin` SDK's `tool()` function to define typed arguments, descriptions, and async execute functions. These are project-specific tools loaded at runtime alongside built-in tools.

## Usage Status

| Product             | Status      | Notes                                                                                                                |
| ------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `reference` | Demonstrates the custom tool format — same `.ts` + `.txt` pattern as built-in tools in `packages/opencode/src/tool/` |
| Orbit CLI           | `reference` | The CLI loads custom tools from `.orbit/tool/` using this format                                                     |

## Files

| File                   | Purpose                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `github-pr-search.ts`  | Tool implementation — searches GitHub PRs in `anomalyco/opencode` via GitHub Search API. Uses `@orbit.build/plugin` `tool()` with typed args (`query`, `limit`, `offset`) |
| `github-pr-search.txt` | Tool description — tells the agent when and how to use the PR search tool                                                                                                 |
| `github-triage.ts`     | Tool implementation — assigns labels and owners to GitHub issues based on triage policy                                                                                   |
| `github-triage.txt`    | Tool description — tells the agent to choose labels and assignees using current triage policy                                                                             |
