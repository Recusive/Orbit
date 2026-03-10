# sdks

> **Path:** `Agent-backend/sdks/`

## Purpose

Editor integration SDKs. Contains a VS Code extension that connects VS Code to the OpenCode server.

## Usage Status

| Product             | Status      | Notes                                                                                                                                                                                                                               |
| ------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orbit Desktop (SDK) | `reference` | Shows how to integrate OpenCode into a VS Code-like editor — directly relevant since Orbit was originally a VS Code fork. The extension's communication pattern (connecting to the headless server) is the same pattern Orbit uses. |
| Orbit CLI           | `not used`  | CLI doesn't integrate with editors                                                                                                                                                                                                  |

## Key Files

| Directory        | Purpose                    |
| ---------------- | -------------------------- |
| `vscode/src/`    | Extension source code      |
| `vscode/script/` | Build scripts              |
| `vscode/images/` | Extension icons and assets |

## Notes

- **This is an extension FOR VS Code** — it adds OpenCode capabilities to standard VS Code. Not to be confused with Orbit (which IS a VS Code fork).
- **Connects to the same headless server** — the extension communicates with `opencode serve` just like the web app and desktop app do.
