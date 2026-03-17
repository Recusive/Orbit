# control

> **Path:** `Agent-backend/packages/opencode/src/control/`

## Purpose

Control plane account management with OAuth token refresh. Stores enterprise/team account credentials (email, URL, access/refresh tokens) in SQLite and provides automatic token renewal on expiry.

## Usage Status

| Product             | Status   | Notes                                                                |
| ------------------- | -------- | -------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | Manages enterprise account authentication for control plane features |
| Orbit CLI           | `active` | `orbit auth` integrates with control plane accounts                  |

## Key Files

- `index.ts` — `Control` namespace with `Account` Zod schema, `account()` to get active account, `token()` to get access token with automatic refresh via OAuth endpoint; re-exports SQL table
- `control.sql.ts` — Drizzle schema for `control_account` table with email, URL, access/refresh tokens, token expiry, and active flag (composite primary key on email+url)
