# util

> **Path:** `Agent-backend/packages/opencode/src/util/`

## Purpose

Shared utility modules used across the entire engine. Provides low-level primitives for logging, filesystem operations, git commands, process spawning, async patterns (abort, defer, lazy, lock, queue, signal, timeout), formatting (color, locale), globbing, hashing, keybindings, RPC, token counting, and wildcard matching.

## Usage Status

| Product             | Status   | Notes                                                |
| ------------------- | -------- | ---------------------------------------------------- |
| Orbit Desktop (SDK) | `active` | Foundational utilities used everywhere in the engine |
| Orbit CLI           | `active` | Foundational utilities used everywhere in the engine |

## Key Files

| File            | Purpose                                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `log.ts`        | `Log` namespace -- structured JSON logging to file with level filtering, service tags, timing helpers                    |
| `filesystem.ts` | `Filesystem` -- file read/write, exists, stat, mime detection, path containment, stream writing, `up()` directory walker |
| `git.ts`        | `git()` helper -- spawns git commands with configurable cwd and error handling                                           |
| `process.ts`    | `Process` -- cross-platform process spawning with `run()`, `text()`, `spawn()` helpers                                   |
| `glob.ts`       | `Glob` -- glob pattern matching via `fast-glob` with `scan()` and `scanSync()`                                           |
| `abort.ts`      | Abort signal utilities                                                                                                   |
| `archive.ts`    | Archive/compression utilities                                                                                            |
| `color.ts`      | Terminal color utilities                                                                                                 |
| `context.ts`    | `Context` -- async-local-storage-based context propagation                                                               |
| `defer.ts`      | `defer()` -- deferred promise pattern                                                                                    |
| `eventloop.ts`  | Event loop utilities (drain, flush)                                                                                      |
| `fn.ts`         | `fn()` -- Zod-validated function wrapper                                                                                 |
| `format.ts`     | Number/byte formatting helpers                                                                                           |
| `hash.ts`       | `Hash` -- content hashing utilities                                                                                      |
| `iife.ts`       | `iife()` -- immediately-invoked async function expression helper                                                         |
| `keybind.ts`    | Keyboard shortcut parsing                                                                                                |
| `lazy.ts`       | `lazy()` -- lazy initialization singleton pattern                                                                        |
| `locale.ts`     | Locale detection                                                                                                         |
| `lock.ts`       | `Lock` -- file-based locking                                                                                             |
| `queue.ts`      | `work()` -- concurrent work queue with configurable parallelism                                                          |
| `rpc.ts`        | RPC communication utilities                                                                                              |
| `scrap.ts`      | HTML scraping/text extraction                                                                                            |
| `signal.ts`     | Signal handling utilities                                                                                                |
| `timeout.ts`    | `withTimeout()` -- promise timeout wrapper                                                                               |
| `token.ts`      | `Token` -- LLM token counting and estimation                                                                             |
| `which.ts`      | `which()` -- executable path resolution (like Unix `which`)                                                              |
| `wildcard.ts`   | `Wildcard` -- glob-style pattern matching for permission patterns                                                        |
| `proxied.ts`    | Proxy object utilities                                                                                                   |
