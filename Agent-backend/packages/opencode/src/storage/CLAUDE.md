# storage

> **Path:** `Agent-backend/packages/opencode/src/storage/`

## Purpose

Database and persistent storage layer. Provides the SQLite database via Drizzle ORM (Bun's native SQLite), file-based storage with git-backed versioning, JSON-to-SQLite migration for legacy data, and shared schema utilities (timestamps).

## Usage Status

| Product             | Status   | Notes                                                                    |
| ------------------- | -------- | ------------------------------------------------------------------------ |
| Orbit Desktop (SDK) | `active` | All persistent data (sessions, messages, projects, settings) stored here |
| Orbit CLI           | `active` | All persistent data (sessions, messages, projects, settings) stored here |

## Key Files

| File                | Purpose                                                                                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `db.ts`             | `Database` namespace -- SQLite connection via `bun:sqlite` + Drizzle ORM, migration runner, `use()` and `transaction()` helpers, channel-specific DB path |
| `storage.ts`        | `Storage` namespace -- file-based key-value storage with git versioning, directory migrations                                                             |
| `schema.sql.ts`     | Shared Drizzle schema helpers (e.g., `Timestamps` with `time_created`/`time_updated`)                                                                     |
| `schema.ts`         | Re-exports all SQL table schemas from across the codebase                                                                                                 |
| `json-migration.ts` | One-time migration from legacy JSON file storage to SQLite with progress bar                                                                              |
