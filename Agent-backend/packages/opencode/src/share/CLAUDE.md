# share

> **Path:** `Agent-backend/packages/opencode/src/share/`

## Purpose

Session sharing functionality. Syncs session data (messages, model info) to an external sharing service (opncd.ai or enterprise URL) for generating shareable conversation links. Subscribes to session and message update events for automatic sync when sharing is enabled.

## Usage Status

| Product             | Status   | Notes                                                      |
| ------------------- | -------- | ---------------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | Share button in the UI generates public conversation links |
| Orbit CLI           | `active` | Share command generates public conversation links          |

## Key Files

| File            | Purpose                                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| `share-next.ts` | `ShareNext` namespace -- session sync to sharing service, event-driven auto-sync on message/session updates |
| `share.sql.ts`  | Drizzle schema for the `session_share` table tracking shared session state                                  |
