# file

> **Path:** `Agent-backend/packages/opencode/src/file/`

## Purpose

File system operations layer for the agent engine. Handles file reading (text, binary, images with base64), directory listing with gitignore respect, file search with fuzzy matching via fuzzysort, git diff/status tracking, and ripgrep-powered file indexing.

## Usage Status

| Product             | Status   | Notes                                               |
| ------------------- | -------- | --------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | Powers Read/Write/Glob tools and file explorer APIs |
| Orbit CLI           | `active` | Powers Read/Write/Glob tools and file explorer APIs |

## Key Files

| File         | Purpose                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------- |
| `index.ts`   | `File` namespace -- file read (text/binary/image), directory listing, git status/diff, fuzzy search, file event bus |
| `ripgrep.ts` | `Ripgrep` namespace -- ripgrep binary management (auto-download), file listing, and content search                  |
| `watcher.ts` | `FileWatcher` namespace -- real-time file change monitoring via `@parcel/watcher` with gitignore filtering          |
| `ignore.ts`  | `FileIgnore` -- gitignore/ignore file parsing for file watcher filtering                                            |
| `time.ts`    | `FileTime` -- file modification time tracking for detecting external edits                                          |
