# session

> **Path:** `Agent-backend/packages/opencode/src/session/`

## Purpose

Conversation session management -- the core of the agent's stateful interaction. Handles session lifecycle (create, list, get, delete, archive), message storage with structured parts (text, tool calls, tool results, files), LLM prompt assembly, system prompt generation, compaction (context window management), revert (undo), summary generation, todo tracking, retry logic, and the main LLM call orchestration.

## Usage Status

| Product             | Status   | Notes                                                             |
| ------------------- | -------- | ----------------------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | All conversation state, message processing, and LLM orchestration |
| Orbit CLI           | `active` | All conversation state, message processing, and LLM orchestration |

## Key Files

| File             | Purpose                                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`       | `Session` namespace -- session CRUD, message queries, title generation, session forking, archive, share, DB operations     |
| `llm.ts`         | LLM call orchestration -- tool resolution, message preparation, streaming, cost tracking                                   |
| `prompt.ts`      | `SessionPrompt` namespace -- main prompt loop (send message, process response, handle tools, retry), busy state management |
| `message.ts`     | Legacy message types (being replaced by `message-v2.ts`)                                                                   |
| `message-v2.ts`  | `MessageV2` namespace -- structured message model with typed parts (Text, ToolCall, ToolResult, File, Step), DB operations |
| `processor.ts`   | `SessionProcessor` -- AI SDK stream processing, part extraction, event publishing                                          |
| `system.ts`      | `SystemPrompt` -- provider-specific system prompt selection (Anthropic, OpenAI, Gemini, etc.) with environment context     |
| `instruction.ts` | `InstructionPrompt` -- loads AGENTS.md/CLAUDE.md/CONTEXT.md instruction files from project, global, and home directories   |
| `compaction.ts`  | `SessionCompaction` -- context window management via message summarization when approaching token limits                   |
| `revert.ts`      | `SessionRevert` -- undo last agent turn with snapshot restoration                                                          |
| `summary.ts`     | `SessionSummary` -- git diff summary generation after agent tool usage                                                     |
| `status.ts`      | `SessionStatus` -- session state tracking (idle, busy, retry) with event publishing                                        |
| `retry.ts`       | Retry logic for failed LLM calls with backoff                                                                              |
| `todo.ts`        | `Todo` -- per-session task list managed by the agent's TodoWrite/TodoRead tools                                            |
| `session.sql.ts` | Drizzle schemas for session, message, part, todo, and permission tables                                                    |
| `prompt/`        | System prompt templates (see `prompt/CLAUDE.md`)                                                                           |
