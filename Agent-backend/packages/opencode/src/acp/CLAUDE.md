# acp

> **Path:** `Agent-backend/packages/opencode/src/acp/`

## Purpose

Agent Client Protocol (ACP) implementation that exposes the opencode agent as a standards-compliant ACP server over JSON-RPC stdio. Enables integration with editors like Zed that support the ACP specification.

## Usage Status

| Product             | Status   | Notes                                                            |
| ------------------- | -------- | ---------------------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | ACP server allows external editors to use the Orbit agent engine |
| Orbit CLI           | `active` | `orbit acp` command starts the ACP stdio server                  |

## Key Files

- `agent.ts` — Implements the `Agent` interface from `@agentclientprotocol/sdk`; handles initialization, session lifecycle, prompt processing, mode/model switching, and fork/resume
- `session.ts` — `ACPSessionManager` class that maps ACP sessions to internal opencode sessions via the SDK client
- `types.ts` — `ACPSessionState` and `ACPConfig` type definitions
- `README.md` — Detailed protocol compliance notes, integration guide (Zed config), and architecture overview
