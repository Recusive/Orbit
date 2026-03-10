# lsp

> **Path:** `Agent-backend/packages/opencode/src/lsp/`

## Purpose

Language Server Protocol client infrastructure. Manages LSP server lifecycle (spawn, connect, shutdown), routes requests (hover, diagnostics, go-to-definition, references, symbols, call hierarchy) to the correct server based on file extension, and supports both built-in and user-configured LSP servers.

## Usage Status

| Product             | Status   | Notes                                                 |
| ------------------- | -------- | ----------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | Powers the LSP tool and diagnostics for agent context |
| Orbit CLI           | `active` | Powers the LSP tool and diagnostics for agent context |

## Key Files

| File          | Purpose                                                                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`    | `LSP` namespace -- client management, request routing (hover, diagnostics, definition, references, symbols, call hierarchy), server lifecycle |
| `client.ts`   | `LSPClient` -- JSON-RPC connection wrapper, document sync, diagnostics collection                                                             |
| `server.ts`   | `LSPServer` -- built-in server definitions (TypeScript, Python/Pyright, Go, Rust, etc.) with extension mappings and spawn logic               |
| `language.ts` | Language-to-extension mappings for LSP server routing                                                                                         |
