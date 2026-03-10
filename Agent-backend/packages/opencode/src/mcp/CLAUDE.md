# mcp

> **Path:** `Agent-backend/packages/opencode/src/mcp/`

## Purpose

Model Context Protocol (MCP) client implementation. Manages connections to local (stdio) and remote (StreamableHTTP/SSE) MCP servers, converts MCP tools to AI SDK format, handles OAuth authentication flows for remote servers, and supports prompts and resources. Servers are configured per-project or globally.

## Usage Status

| Product             | Status   | Notes                                                                 |
| ------------------- | -------- | --------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | Exposes MCP tools to the agent, server status/connect/disconnect APIs |
| Orbit CLI           | `active` | `mcp` subcommand for server management and OAuth authentication       |

## Key Files

| File                | Purpose                                                                                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`          | `MCP` namespace -- client lifecycle, tool conversion to AI SDK, prompts/resources, connect/disconnect, OAuth start/finish/authenticate |
| `auth.ts`           | `McpAuth` -- persistent OAuth token/code-verifier/state storage for MCP servers                                                        |
| `oauth-callback.ts` | `McpOAuthCallback` -- local HTTP callback server for OAuth redirect handling                                                           |
| `oauth-provider.ts` | `McpOAuthProvider` -- OAuth provider implementation for the MCP SDK (discovery, registration, token exchange)                          |
