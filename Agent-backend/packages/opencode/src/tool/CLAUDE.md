# tool

> **Path:** `Agent-backend/packages/opencode/src/tool/`

## Purpose

Built-in tool definitions for the agent. Each tool has a `.ts` implementation file and a `.txt` system prompt file that instructs the LLM how to use it. The tool registry discovers and registers all built-in tools, plugin-provided tools, and custom user tools from config directories.

## Usage Status

| Product             | Status   | Notes                                              |
| ------------------- | -------- | -------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | All agent tool execution flows through this module |
| Orbit CLI           | `active` | All agent tool execution flows through this module |

## Key Files

| File                                           | Purpose                                                                                                                       |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `tool.ts`                                      | `Tool` namespace -- base tool type definitions (`Info`, `Context`, `define()`), parameter validation wrapper                  |
| `registry.ts`                                  | `ToolRegistry` -- discovers and registers all tools (built-in, plugin, custom), agent-specific tool filtering (build vs plan) |
| `bash.ts` / `bash.txt`                         | Bash command execution with timeout, process tree kill, apply_patch interception                                              |
| `read.ts` / `read.txt`                         | File reading with line range support, image encoding, PDF handling                                                            |
| `write.ts` / `write.txt`                       | File writing with directory creation and formatting                                                                           |
| `edit.ts` / `edit.txt`                         | Exact string replacement in files                                                                                             |
| `multiedit.ts` / `multiedit.txt`               | Multiple edits in a single tool call                                                                                          |
| `glob.ts` / `glob.txt`                         | File pattern matching                                                                                                         |
| `grep.ts` / `grep.txt`                         | Content search via ripgrep                                                                                                    |
| `ls.ts` / `ls.txt`                             | Directory listing                                                                                                             |
| `apply_patch.ts` / `apply_patch.txt`           | Structured patch application (via `Patch` module)                                                                             |
| `codesearch.ts` / `codesearch.txt`             | Semantic code search combining grep + LSP                                                                                     |
| `webfetch.ts` / `webfetch.txt`                 | HTTP URL fetching with HTML-to-text conversion                                                                                |
| `websearch.ts` / `websearch.txt`               | Web search via external APIs                                                                                                  |
| `lsp.ts` / `lsp.txt`                           | LSP operations (diagnostics, hover, references, definitions)                                                                  |
| `plan.ts` / `plan-enter.txt` / `plan-exit.txt` | Plan mode enter/exit                                                                                                          |
| `question.ts` / `question.txt`                 | Ask user a structured question                                                                                                |
| `skill.ts`                                     | Invoke a discovered skill                                                                                                     |
| `task.ts` / `task.txt`                         | Spawn a sub-agent task                                                                                                        |
| `todo.ts` / `todoread.txt` / `todowrite.txt`   | Session task list read/write                                                                                                  |
| `batch.ts` / `batch.txt`                       | Batch multiple tool calls                                                                                                     |
| `truncation.ts`                                | Output truncation utilities for large tool outputs                                                                            |
| `invalid.ts`                                   | Handler for invalid/unknown tool calls                                                                                        |
| `external-directory.ts`                        | Access control for paths outside project directory                                                                            |
