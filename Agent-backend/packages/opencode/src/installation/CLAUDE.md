# installation

> **Path:** `Agent-backend/packages/opencode/src/installation/`

## Purpose

Installation detection, version management, and self-upgrade. Detects how the binary was installed (npm, bun, brew, scoop, choco, curl, etc.), fetches the latest version from the appropriate registry, and performs upgrades via the detected package manager.

## Usage Status

| Product             | Status   | Notes                                                                     |
| ------------------- | -------- | ------------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | Version info (`Installation.VERSION`), user agent string, update checking |
| Orbit CLI           | `active` | Self-upgrade command, version display, update notifications               |

## Key Files

| File       | Purpose                                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `index.ts` | `Installation` namespace -- `method()` detects install source, `latest()` fetches latest version, `upgrade()` performs self-update, `VERSION`/`CHANNEL`/`USER_AGENT` constants |
