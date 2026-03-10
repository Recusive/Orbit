# ide

> **Path:** `Agent-backend/packages/opencode/src/ide/`

## Purpose

IDE detection and VS Code extension installation. Detects the current IDE (VS Code, Cursor, Windsurf, VSCodium, Code Insiders) from environment variables, and installs the OpenCode VS Code extension via the CLI (`--install-extension`).

## Usage Status

| Product             | Status   | Notes                                                   |
| ------------------- | -------- | ------------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | IDE detection for environment context in system prompts |
| Orbit CLI           | `active` | IDE detection and extension installation command        |

## Key Files

| File       | Purpose                                                                                                                                                                           |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts` | `Ide` namespace -- `ide()` detects current IDE from `TERM_PROGRAM`/`GIT_ASKPASS`, `install()` installs VS Code extension, `alreadyInstalled()` checks if running inside extension |
