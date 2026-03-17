# packages/sdk

> **Path:** `Agent-backend/packages/sdk/`

## Purpose

Auto-generated TypeScript SDK client for the OpenCode/Orbit HTTP API. Generated from `openapi.json` (11,860 lines) using `@hey-api/openapi-ts`. Provides typed methods for all server endpoints — sessions, messages, permissions, questions, files, providers, MCP, workspaces, etc. Two API versions: v1 (legacy) and v2 (current).

## Usage Status

| Product             | Status   | Notes                                                                                                                         |
| ------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | The desktop app uses `createOrbitClient()` to communicate with the headless server. Already rebranded (`OrbitClient` export). |
| Orbit CLI           | `active` | Internal use for programmatic session management and testing                                                                  |

## Key Files

| File                  | Purpose                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `openapi.json`        | OpenAPI 3.x specification — THE source of truth for all API endpoints (11,860 lines)                                |
| `js/package.json`     | `@orbit.build/sdk` — zero runtime dependencies, generated client code                                               |
| `js/src/client.ts`    | v1 client factory: `createOrbitClient()` / `createOpencodeClient()` — adds directory header + fetch timeout disable |
| `js/src/server.ts`    | Server-side type exports                                                                                            |
| `js/src/index.ts`     | Package root export                                                                                                 |
| `js/src/v2/client.ts` | v2 client factory: `createOpencodeClient()` used by E2E tests and web app                                           |
| `js/src/gen/`         | v1 auto-generated code: `types.gen.ts`, `sdk.gen.ts`, `client/`                                                     |
| `js/src/v2/gen/`      | v2 auto-generated code: same structure                                                                              |
| `js/script/build.ts`  | Build script                                                                                                        |
| `js/example/`         | Usage examples                                                                                                      |

## API Versions

| Version | Import Path                  | Factory                                                      |
| ------- | ---------------------------- | ------------------------------------------------------------ |
| v1      | `@orbit.build/sdk/client`    | `createOrbitClient(config)` / `createOpencodeClient(config)` |
| v2      | `@orbit.build/sdk/v2/client` | `createOpencodeClient(config)`                               |

The v2 client is used by E2E tests and the web app. The v1 client has the `OrbitClient` alias already added.

## Client Configuration

```typescript
import { createOpencodeClient } from "@orbit.build/sdk/v2/client"

const sdk = createOpencodeClient({
  baseUrl: "http://localhost:4096",
  directory: "/path/to/project", // Sent as x-opencode-directory header
  throwOnError: true,
})

// Session operations
const session = await sdk.session.create({ title: "My session" })
const messages = await sdk.session.messages({ sessionID: session.data.id })
await sdk.session.promptAsync({ sessionID, parts: [{ type: "text", text: "Hello" }] })

// Permission operations
const permissions = await sdk.permission.list()
await sdk.permission.reply({ requestID: id, reply: "allow" })
```

## Regeneration

When server API routes change in `packages/opencode/src/server/`:

```bash
./script/generate.ts   # From repo root — regenerates openapi.json + SDK client code
```

## Dependencies

- **Build-time only:** `@hey-api/openapi-ts` (code generation), `typescript`
- **Runtime:** Zero dependencies — the generated client uses native `fetch`

## Development Guide

Never edit files in `js/src/gen/` or `js/src/v2/gen/` — they are auto-generated. To add new API endpoints:

1. Add the route in `packages/opencode/src/server/routes/`
2. Run `./script/generate.ts` from repo root
3. The SDK types and methods are automatically generated

## Notes

- **Already rebranded** — `client.ts` exports `OrbitClient` and `createOrbitClient()` as aliases alongside the original `OpencodeClient` names. Both point to the same implementation.
- **Directory header injection** — `createOrbitClient()` automatically adds `x-opencode-directory` header when a `directory` option is provided. This tells the server which project directory to operate in.
- **Fetch timeout disabled** — the client sets `req.timeout = false` on the native fetch request, preventing timeouts on long-running operations (LLM calls can take 60+ seconds).
- **Zero runtime deps** — the generated client uses only native `fetch`, making it lightweight to bundle in any environment (web, Node, Bun, Deno).
