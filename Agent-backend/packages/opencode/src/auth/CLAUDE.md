# auth

> **Path:** `Agent-backend/packages/opencode/src/auth/`

## Purpose

Credential storage and retrieval for LLM provider authentication. Supports three auth types: OAuth (with refresh/access tokens), API key, and well-known token. Persists credentials to `auth.json` in the global data directory.

## Usage Status

| Product             | Status   | Notes                                                            |
| ------------------- | -------- | ---------------------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | Manages provider API keys and OAuth tokens for all LLM providers |
| Orbit CLI           | `active` | `orbit auth` commands read/write credentials through this module |

## Key Files

- `index.ts` — `Auth` namespace with Zod schemas for `Oauth`, `Api`, and `WellKnown` discriminated union; `get()`, `set()`, `remove()`, `all()` functions for CRUD on `auth.json`; file permissions set to `0o600` for security
