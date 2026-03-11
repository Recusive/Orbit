# OpenCode TUI — Learnings & Debugging Reference

> **Path:** `Agent-backend/packages/opencode/`
> **Last Updated:** March 10, 2026

---

## How to Debug the TUI

The TUI takes over the terminal, so `console.log` output is invisible. Here's what works:

### Debug Logging (built-in)

```bash
# Run with debug logs printed to stderr, redirect to a file
bun dev --print-logs 2>>/tmp/opencode-debug.log

# Use the TUI normally, trigger the bug, then quit (Ctrl+C)
# Read the log:
cat /tmp/opencode-debug.log
```

The actual log file is also at `~/.local/share/orbit/log/dev.log` — this captures ALL log entries regardless of `--print-logs`. Grep it for errors:

```bash
grep -i "ERROR\|WARN" ~/.local/share/orbit/log/dev.log | tail -30
```

### Bun Inspector (breakpoints)

```bash
bun run --inspect=ws://localhost:6499/ dev
# Or set it permanently:
export BUN_OPTIONS=--inspect=ws://localhost:6499/
```

**Known limitation:** `.tsx` files won't have correct breakpoint mapping due to Bun not supporting source maps on BunPlugin-transformed code. Workaround: insert `debugger;` statements directly in the code.

For server code breakpoints while TUI runs, use `bun dev spawn` (default runs server in a worker thread where breakpoints may not trigger).

### CLI Flags

| Flag                | Purpose                                      |
| ------------------- | -------------------------------------------- |
| `--print-logs`      | Print structured logs to stderr              |
| `--log-level DEBUG` | Set log verbosity (DEBUG, INFO, WARN, ERROR) |

**WARNING:** `-d` is NOT a valid flag. It will crash with `Unknown argument: d` — but the error is swallowed by yargs `.fail()` handler.

**WARNING:** `--log-level` requires UPPERCASE values (`DEBUG` not `debug`). Lowercase causes a fatal crash.

**WARNING:** `--print-logs` at INFO level produces 11K+ lines per session due to `service=permission` entries dumping full ruleset JSON arrays. Do NOT use `--print-logs` for routine debugging — use the log files instead.

### Error Swallowing in index.ts

The top-level catch in `src/index.ts` (line ~166) catches all errors. The `.fail()` handler at line ~159 throws `err` which can be `undefined` for yargs validation errors, producing the cryptic "Unexpected error, check log file at for more details / undefined" output. If you need to debug startup crashes, temporarily add `console.error("DEBUG:", e)` in the catch block.

---

## Server Logging & Debugging (for Orbit frontend integration)

### Where server logs live

The orbit-server binary writes structured logs to **`~/.local/share/orbit/log/`** (NOT `~/.local/share/opencode/log/` — that's for standalone opencode CLI runs).

| File                                        | Source                                                       |
| ------------------------------------------- | ------------------------------------------------------------ |
| `~/.local/share/orbit/log/2026-MM-DDT*.log` | Timestamped per server startup — **use this one**            |
| `~/.local/share/orbit/log/dev.log`          | Standalone `bun dev` runs only, NOT the Tauri-spawned server |
| `~/.local/share/opencode/log/*.log`         | Old opencode CLI runs (different binary name)                |

**To tail the active server log:**

```bash
# Always gets the latest timestamped file (new one created per Tauri restart)
tail -f "$(ls -t ~/.local/share/orbit/log/*.log | head -1)"
```

### Useful grep patterns for server logs

```bash
# Session prompt lifecycle (most important for debugging)
grep "session.prompt\|service=llm\|ERROR\|WARN\|cancel\|exiting" <logfile>

# Specific session
grep "ses_XXXXX" <logfile>

# LLM calls (did the server actually call the provider?)
grep "service=llm" <logfile>
```

### How Tauri spawns the server

**File:** `src-tauri/src/commands/opencode/lifecycle.rs` → `src-tauri/src/opencode/process.rs`

```
Command::new(orbit-server-binary)
  .args(["serve", "--port", &port.to_string()])
  .stdout(Stdio::piped())
  .stderr(Stdio::piped())
```

- Binary location: `src-tauri/binaries/orbit-server-{target}` (dev) or next to executable (prod)
- Port: scans TCP 4096-4196 for an available port
- Health check: pings `http://127.0.0.1:{port}/global/health` (40 retries, 250ms apart)
- stdout/stderr forwarded to Rust `log::info!/warn!/error!` with `[opencode]` prefix (visible in `bunx tauri dev` terminal)

### CLI flags for the server binary

```bash
./orbit-server serve --help
# --port <number>         Port to listen on (default: 0 = auto)
# --print-logs            Print logs to stderr (WARNING: extremely verbose — dumps permission rulesets)
# --log-level <LEVEL>     DEBUG | INFO | WARN | ERROR (UPPERCASE required)
# --hostname <string>     Default: 127.0.0.1
```

### Server-side prompt loop logging

The prompt loop in `packages/opencode/src/session/prompt.ts` has structured logging at every decision point:

| Log Message                         | What It Shows                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------- |
| `prompt`                            | Entry: sessionID, agent, noReply                                                            |
| `loop`                              | Each iteration: step number, sessionID                                                      |
| `exiting loop (aborted)`            | Loop exited due to abort signal                                                             |
| `messages scanned`                  | Message stream state: count, lastUserID, lastAssistantID, lastAssistantFinish, pendingTasks |
| `exiting loop (assistant finished)` | Normal exit: finish reason, user/assistant ID comparison                                    |
| `resolveTools (started/completed)`  | Tool resolution timing and tool count                                                       |
| `llm call (started/completed)`      | LLM invocation: model, provider, message count, result                                      |

The `prompt_async` HTTP route in `server/routes/session.ts` also logs `prompt_async received` when a message arrives.

---

## SolidJS TUI Gotchas

### Don't manually call function elements in JSX

SolidJS natively handles `() => JSX.Element` in JSX children as reactive computations. If you change rendering from:

```tsx
{
  value.stack.at(-1)?.element
}
```

to:

```tsx
{
  typeof element === "function" ? element() : element
}
```

...you **break** SolidJS's reactive context tracking. The function gets called outside the proper reactive scope.

**Rule:** Let SolidJS handle function-vs-element dispatch. Just pass it through in JSX.

### `createMemo`/`createSignal`/`createStore` must be in reactive scope

These primitives MUST be called during component initialization (inside the component function body or inside `createSimpleContext.init()`). Moving them outside breaks SolidJS ownership tracking.

### `reconcile()` in stores triggers downstream watchers

`setStore("path", reconcile(newObj))` does a deep diff but can trigger watchers on parent paths. When updating a single message in an array, all memos depending on `messages()` re-evaluate.

### `.filter(Boolean)` guard for reactive arrays

Registration-pattern arrays (like `registrations().flatMap(x => x())`) can contain `undefined` during SolidJS reactivity cascades. Always `.filter(Boolean)` before accessing properties.

---

## Architecture Notes

### Message Flow (streaming)

```
LLM Provider → session/processor.ts → Bus events → sync.tsx (SSE) → SolidJS store → <For> in session/index.tsx
```

Events during streaming:

- `message.part.delta` — text chunks (appended via `produce`)
- `message.part.updated` — part metadata updates (via `reconcile`)
- `message.updated` — message metadata (via `reconcile`)

Events at stream end:

- `message.updated` with `time.completed` set
- `session.status` → `{ type: "idle" }`

### Provider URL Resolution

```
models.dev JSON → model.api.url (can be "" for bundled providers)
                → loadBaseURL() → options.baseURL
                → @ai-sdk/anthropic createAnthropic({ baseURL })
                → fetch(url) via opencode-anthropic-auth interceptor
```

Bundled providers (Anthropic, OpenAI, etc.) have hardcoded URLs in their SDKs. Their `models.dev` entries have NO `api` field. The fallback `""` in model resolution MUST be treated as undefined to let the SDK defaults work.

### Plugin System

`opencode-anthropic-auth@0.0.13` is a built-in plugin loaded from `src/plugin/index.ts:24`. It's installed to `~/.cache/orbit/node_modules/` at runtime. It wraps `fetch()` to inject OAuth tokens and rename tools with `mcp_` prefix.

### Prompt Loop Exit Condition

The main loop in `session/prompt.ts` exits when:

```typescript
if (
  lastAssistant?.finish && // assistant has a finish reason
  !["tool-calls", "unknown"].includes(lastAssistant.finish) && // it's a "real" finish (e.g. "stop")
  lastUser.id < lastAssistant.id // user message came before assistant
) {
  break
}
```

This compares ULIDs — `lastUser.id < lastAssistant.id` checks chronological ordering. If the new user message's ULID sorts before the previous assistant message, the loop thinks the assistant already responded.

---

## Frontend Structured Logging

10 files across the OpenCode frontend pipeline have structured logging via `createLogger()`:

| Logger Name          | File                                        | What it logs                                         |
| -------------------- | ------------------------------------------- | ---------------------------------------------------- |
| `OcEventCoordinator` | `services/opencode/oc-event-coordinator.ts` | Event dispatch, directory filtering, unhandled types |
| `OcSseManager`       | `services/opencode/sse-manager.ts`          | SSE connect/disconnect/reconnect, event received     |
| `OcSessionService`   | `services/opencode/oc-session-service.ts`   | HTTP calls: list/create/delete/send/load sessions    |
| `OpenCodeLifecycle`  | `hooks/opencode/use-opencode-lifecycle.ts`  | Startup sequence, port assignment, backend switching |
| `OcClient`           | `services/opencode/client.ts`               | Client init/destroy, directory updates               |
| `OcSessionStore`     | `stores/opencode/oc-session-store.ts`       | Active session changes, status transitions           |
| `OcMessageStore`     | `stores/opencode/oc-message-store.ts`       | Message/part upserts, session clears                 |
| `OcChat`             | `hooks/chat/use-oc-chat.ts`                 | User send/stop actions, session creation             |
| `OcPermissionStore`  | `stores/opencode/oc-permission-store.ts`    | Permission/question add/remove                       |
| `OcUiBridge`         | `services/conversations/oc-ui-bridge.ts`    | Session select/restore/create/remove                 |

Check browser DevTools console for these logs. Cross-reference with server log at `~/.local/share/orbit/log/` for the `service=session.prompt` entries.
