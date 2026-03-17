# provider/sdk/copilot

> **Path:** `Agent-backend/packages/opencode/src/provider/sdk/copilot/`

## Purpose

GitHub Copilot AI SDK provider. Implements an OpenAI-compatible provider with both Chat Completions and Responses API support, tailored for the Copilot endpoint. Handles Copilot-specific authentication headers, model routing, and tool definitions including Copilot-native tools (code interpreter, file search, web search).

## Usage Status

| Product             | Status   | Notes                                                            |
| ------------------- | -------- | ---------------------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | Copilot model access for users with GitHub Copilot subscriptions |
| Orbit CLI           | `active` | Copilot model access for users with GitHub Copilot subscriptions |

## Key Files

| File                         | Purpose                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `copilot-provider.ts`        | `createOpenaiCompatible()` factory -- creates the Copilot provider with chat and responses model constructors |
| `index.ts`                   | Re-exports the provider factory                                                                               |
| `openai-compatible-error.ts` | Error structure definitions for OpenAI-compatible error responses                                             |
| `chat/`                      | Chat Completions API implementation (see `chat/CLAUDE.md`)                                                    |
| `responses/`                 | Responses API implementation (see `responses/CLAUDE.md`)                                                      |
