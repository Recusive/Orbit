# migration

> **Path:** `Agent-backend/packages/opencode/migration/`

## Purpose

SQLite database migrations managed by Drizzle ORM, with timestamped migration directories for schema evolution (sessions, projects, workspaces).

## Usage Status

| Product             | Status   | Notes                         |
| ------------------- | -------- | ----------------------------- |
| Orbit Desktop (SDK) | `active` | Migrations run on SDK startup |
| Orbit CLI           | `active` | Migrations run on CLI startup |
