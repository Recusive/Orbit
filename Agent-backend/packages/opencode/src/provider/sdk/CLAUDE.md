# provider/sdk

> **Path:** `Agent-backend/packages/opencode/src/provider/sdk/`

## Purpose

Custom AI SDK provider implementations for providers that need non-standard handling. Currently contains the GitHub Copilot provider, which implements both the Chat Completions API and the Responses API with Copilot-specific authentication and tool handling.

## Usage Status

| Product             | Status   | Notes                          |
| ------------------- | -------- | ------------------------------ |
| Orbit Desktop (SDK) | `active` | GitHub Copilot LLM integration |
| Orbit CLI           | `active` | GitHub Copilot LLM integration |

## Key Files

| File       | Purpose                                                                       |
| ---------- | ----------------------------------------------------------------------------- |
| `copilot/` | GitHub Copilot provider implementation (see `provider/sdk/copilot/CLAUDE.md`) |
