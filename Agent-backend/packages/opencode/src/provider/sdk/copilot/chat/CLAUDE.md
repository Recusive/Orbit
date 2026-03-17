# provider/sdk/copilot/chat

> **Path:** `Agent-backend/packages/opencode/src/provider/sdk/copilot/chat/`

## Purpose

OpenAI-compatible Chat Completions API implementation for the GitHub Copilot provider. Handles message conversion to the OpenAI chat format, tool preparation, response streaming, metadata extraction, and finish reason mapping.

## Usage Status

| Product             | Status   | Notes                                    |
| ------------------- | -------- | ---------------------------------------- |
| Orbit Desktop (SDK) | `active` | Chat completions path for Copilot models |
| Orbit CLI           | `active` | Chat completions path for Copilot models |

## Key Files

| File                                            | Purpose                                                                                                           |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `openai-compatible-chat-language-model.ts`      | `OpenAICompatibleChatLanguageModel` -- LanguageModelV2 implementation for chat completions (doGenerate, doStream) |
| `convert-to-openai-compatible-chat-messages.ts` | Converts AI SDK messages to OpenAI chat message format                                                            |
| `openai-compatible-chat-options.ts`             | Chat model options and provider options Zod schema                                                                |
| `openai-compatible-prepare-tools.ts`            | Converts AI SDK tool definitions to OpenAI function calling format                                                |
| `openai-compatible-api-types.ts`                | TypeScript types for OpenAI chat API request/response                                                             |
| `get-response-metadata.ts`                      | Extracts provider metadata from chat API responses                                                                |
| `map-openai-compatible-finish-reason.ts`        | Maps OpenAI finish reasons to AI SDK finish reasons                                                               |
| `openai-compatible-metadata-extractor.ts`       | Metadata extractor interface for streaming responses                                                              |
