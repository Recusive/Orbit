# provider/sdk/copilot/responses/tool

> **Path:** `Agent-backend/packages/opencode/src/provider/sdk/copilot/responses/tool/`

## Purpose

Zod schemas for OpenAI Responses API native (provider-defined) tool inputs and outputs. These tools are executed server-side by the provider, not locally by the agent.

## Usage Status

| Product             | Status   | Notes                                               |
| ------------------- | -------- | --------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | Schema validation for Copilot native tool responses |
| Orbit CLI           | `active` | Schema validation for Copilot native tool responses |

## Key Files

| File                    | Purpose                                            |
| ----------------------- | -------------------------------------------------- |
| `code-interpreter.ts`   | Input/output schemas for the code interpreter tool |
| `file-search.ts`        | Output schema for the file search tool             |
| `image-generation.ts`   | Output schema for the image generation tool        |
| `web-search.ts`         | Input schema for the web search tool               |
| `web-search-preview.ts` | Input schema for the web search preview tool       |
| `local-shell.ts`        | Input/output schemas for the local shell tool      |
