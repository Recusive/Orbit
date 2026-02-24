# CLAUDE.md - Shared Rust Crates

> **Parent:** See [`../../CLAUDE.md`](../../CLAUDE.md) for monorepo-wide guidance.

## Overview

Shared Rust library crates used by the Tauri backend (`src-tauri/`). All crates live under `crates/common/` and are part of the Cargo workspace defined in the root `Cargo.toml`.

## Crate Reference

| Crate             | Description                                                                  | Status              | Key Exports                                                       |
| ----------------- | ---------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------- |
| **core**          | Foundation types, text editing (ropey), error handling, crash logging        | Active              | `Buffer`, `Document`, `Edit`, `EditHistory`, `CrashManager`       |
| **fs**            | File I/O, directory listing, file watching (notify), gitignore-aware walking | Active              | `read_file`, `write_file`, `list_directory`, `watch_files`        |
| **terminal**      | PTY management and shell spawning via portable-pty                           | Active              | `TerminalConfig`, PTY lifecycle, shell session management         |
| **git**           | Git operations via libgit2 (status, diff, blame, branches, commits)          | Active              | `DiffHunk`, `FileDiff`, `BlameLine`, `CommitInfo`                 |
| **conversations** | Pure JSONL disk reader for Claude Code session files                         | Active              | `Message`, `MessageRole`, `ToolUse`, conversation loading/parsing |
| **settings**      | User settings persistence (editor, theme, AI config)                         | Active              | `EditorSettings`, `ThemeSettings`, `AISettings`                   |
| **search**        | File/text search with fuzzy matching (nucleo) for @mention picker            | Active              | `FileIndex`, `SearchManager`                                      |
| **lsp**           | Language Server Protocol client (completion, hover, diagnostics)             | Active              | `ServerConfig`, LSP lifecycle, message handling                   |
| **sf-symbols**    | Native macOS SF Symbol rendering via objc2 AppKit                            | Active (macOS only) | `render_sf_symbol()` → PNG bytes + dimensions                     |
| **ai**            | Claude API integration placeholder                                           | **Stub**            | `AiManager` (unused — AI goes through agent-bridge sidecar)       |
| **syntax**        | Tree-sitter syntax highlighting placeholder                                  | **Stub**            | `Language` enum, extension-based language detection               |

## Dependency Graph

All crates depend on **core** for shared types and error handling:

```text
core ← fs, git, terminal, conversations, settings, lsp, search, ai, syntax
fs   ← search (reuses file walking)
```

External key dependencies:

- `serde` + `serde_json` — serialization (all crates)
- `tokio` — async runtime (terminal, lsp, git)
- `git2` — libgit2 bindings (git, fs)
- `portable-pty` — PTY (terminal)
- `notify` — file watching (fs)
- `nucleo-matcher` — fuzzy matching (search)
- `objc2` / `objc2-app-kit` — macOS native APIs (sf-symbols)

## Patterns

### Error Handling

Each crate defines its own error type wrapping `orbit_core::Error`:

```rust
// Return Result<T, String> from Tauri commands (not crate errors directly)
state.operation(&param).map_err(|e| e.to_string())
```

### Adding a New Crate

1. Create directory under `crates/common/<name>/`
2. Add `Cargo.toml` with `orbit-core` dependency
3. Register in root `Cargo.toml` workspace members
4. Add as dependency in `src-tauri/Cargo.toml`

### Stubs

`ai` and `syntax` are intentional stubs:

- **ai**: All AI communication goes through the agent-bridge sidecar (Bun binary), not Rust directly
- **syntax**: Syntax highlighting is done in the frontend via Shiki; tree-sitter integration is planned but not started
