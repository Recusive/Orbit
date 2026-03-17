# bus

> **Path:** `Agent-backend/packages/opencode/src/bus/`

## Purpose

Internal event bus for publish/subscribe communication within a workspace instance. Events are typed via Zod schemas and also forwarded to a global cross-instance `EventEmitter` for SSE broadcasting to connected clients.

## Usage Status

| Product             | Status   | Notes                                                                                                        |
| ------------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| Orbit Desktop (SDK) | `active` | Core event backbone; session events, config changes, and tool executions flow through the bus to SSE clients |
| Orbit CLI           | `active` | TUI subscribes to bus events for real-time UI updates                                                        |

## Key Files

- `index.ts` — `Bus` namespace with `publish()`, `subscribe()`, `once()`, `subscribeAll()` functions; instance-scoped subscription map; forwards all events to `GlobalBus`
- `bus-event.ts` — `BusEvent` namespace with `define()` factory for creating typed event definitions with Zod schemas; `payloads()` generates a discriminated union of all registered events
- `global.ts` — `GlobalBus` singleton `EventEmitter` that bridges events across workspace instances; consumed by the SSE server and RPC worker
