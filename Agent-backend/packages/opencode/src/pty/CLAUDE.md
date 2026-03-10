# pty

> **Path:** `Agent-backend/packages/opencode/src/pty/`

## Purpose

Pseudo-terminal management via `bun-pty`. Creates and manages PTY instances for interactive terminal sessions, supports WebSocket-based terminal streaming with binary framing, handles resize/input/output, and tracks terminal session lifecycle (running/exited).

## Usage Status

| Product             | Status   | Notes                                                |
| ------------------- | -------- | ---------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | Terminal emulation for the integrated terminal panel |
| Orbit CLI           | `active` | Terminal emulation for the TUI terminal              |

## Key Files

| File       | Purpose                                                                                                                                      |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts` | `Pty` namespace -- PTY creation/destruction, WebSocket streaming with binary cursor framing, input/resize handling, session state management |
