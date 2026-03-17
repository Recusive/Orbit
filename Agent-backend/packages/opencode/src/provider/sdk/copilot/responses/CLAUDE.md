# provider/sdk/copilot/responses

> **Path:** `Agent-backend/packages/opencode/src/provider/sdk/copilot/responses/`

## Purpose

OpenAI Responses API implementation for the GitHub Copilot provider. Supports the newer Responses API format with native tool definitions (code interpreter, file search, web search, image generation) and response streaming. This is the preferred API path for models that support it.

## Usage Status

| Product             | Status   | Notes                                                   |
| ------------------- | -------- | ------------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | Responses API path for Copilot models (GPT-5, o3, etc.) |
| Orbit CLI           | `active` | Responses API path for Copilot models (GPT-5, o3, etc.) |

## Key Files

| File                                    | Purpose                                                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `openai-responses-language-model.ts`    | `OpenAIResponsesLanguageModel` -- LanguageModelV2 implementation for the Responses API (doGenerate, doStream) |
| `convert-to-openai-responses-input.ts`  | Converts AI SDK messages to OpenAI Responses API input format                                                 |
| `openai-responses-prepare-tools.ts`     | Converts AI SDK tools to Responses API tool format including native tools                                     |
| `openai-responses-api-types.ts`         | TypeScript types for Responses API request/response                                                           |
| `openai-responses-settings.ts`          | Responses API settings and configuration                                                                      |
| `openai-config.ts`                      | Shared OpenAI configuration (base URL, headers, fetch)                                                        |
| `openai-error.ts`                       | Error handling for Responses API                                                                              |
| `map-openai-responses-finish-reason.ts` | Maps Responses API finish reasons to AI SDK finish reasons                                                    |
| `tool/`                                 | Native tool schemas (see `tool/CLAUDE.md`)                                                                    |
