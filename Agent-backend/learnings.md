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

**WARNING:** `-d` is NOT a valid flag. It will crash with `Unknown argument: d` — but the error is swallowed by yargs `.fail()` handler (throws `undefined` because yargs passes `(msg, err)` where `err` is undefined for validation errors).

### Error Swallowing in index.ts

The top-level catch in `src/index.ts` (line ~166) catches all errors. The `.fail()` handler at line ~159 throws `err` which can be `undefined` for yargs validation errors, producing the cryptic "Unexpected error, check log file at for more details / undefined" output. If you need to debug startup crashes, temporarily add `console.error("DEBUG:", e)` in the catch block.

---

## Bugs Found & Fixed

### 1. `ERR_INVALID_URL: fetch() URL is invalid` (when sending a message)

**Root cause:** The `opencode-anthropic-auth` plugin intercepts all `fetch()` calls. The Anthropic provider in `models.dev` has NO `api` URL field (Anthropic's SDK has it hardcoded). The model resolution at `src/provider/provider.ts:751` falls through to `""` (empty string):

```typescript
url: model.provider?.api ?? provider.api ?? ""
```

Then `loadBaseURL()` returns `""`, which gets set as `options.baseURL = ""`, overriding `@ai-sdk/anthropic`'s default `https://api.anthropic.com/v1`. The SDK then constructs a URL like `/v1/messages` which is invalid for `fetch()`.

**Fix:** In `loadBaseURL()` (line 106), treat empty string as undefined:

```typescript
if (typeof raw !== "string" || raw === "") return raw === "" ? undefined : raw
```

This lets bundled SDKs (Anthropic, OpenAI, etc.) use their hardcoded default URLs.

**Stack trace pattern:**

```
service=session.processor error=fetch() URL is invalid
stack="TypeError: fetch() URL is invalid
    at fetch (unknown)
    at fetch (.../opencode-anthropic-auth/index.mjs:269:38)"
```

### 2. `undefined is not an object (evaluating 'x.keybind')` (dialog-command.tsx)

**Root cause:** During SolidJS reactivity cascades (theme initialization), `registrations().flatMap((x) => x())` produced undefined entries because some registration accessors return undefined before their components fully initialize.

**Fix:** Added `.filter(Boolean)` before `.map()` in the `entries` memo:

```typescript
const entries = createMemo(() => {
  const all = registrations()
    .flatMap((x) => x())
    .filter(Boolean)
  return all.map((x) => ({ ...x, footer: x.keybind ? keybind.print(x.keybind) : undefined }))
})
```

**File:** `src/cli/cmd/tui/component/dialog-command.tsx:56`

### 3. `undefined is not an object (evaluating 'status().type')` (prompt/index.tsx)

**Root cause:** On the home screen, `props.sessionID` is `undefined`. The status lookup `sync.data.session_status[props.sessionID ?? ""]` returns `undefined` because `session_status[""]` doesn't exist.

**Fix:** Added fallback:

```typescript
const status = createMemo(() => sync.data.session_status[props.sessionID ?? ""] ?? { type: "idle" as const })
```

**File:** `src/cli/cmd/tui/component/prompt/index.tsx:81`

### 4. `undefined is not an object (evaluating 'grouped().length')` (dialog-select.tsx)

**Root cause:** In `DialogCommand`, the `ref` for `DialogSelectRef` is set via a callback at render time (line 228), but the `list()` function accesses `ref.filter` during memo evaluation — before the callback runs.

**Fix:** Made `ref` optional and used optional chaining:

```typescript
let ref: DialogSelectRef<string> | undefined
const list = (): CommandOption[] => {
  if (ref?.filter) return props.options
  return [...props.suggestedOptions, ...props.options]
}
```

**File:** `src/cli/cmd/tui/component/dialog-command.tsx:161-163`

### 5. TUI screen blink on stream completion (intermittent, UNRESOLVED)

**Symptom:** When LLM streaming ends, the entire screen briefly goes blank then reappears. Happens intermittently, not every time. The loading bar under the chat input disappears and gets replaced by the response duration — during that transition, the screen flashes.

**Suspected cause:** Race condition between multiple SSE events firing in quick succession when streaming ends:

- `message.updated` (sets `time.completed`)
- `session.status` (transitions to `idle`)
- `message.part.updated` (final part update)

The `reconcile()` call in `sync.tsx:229` for `message.updated` triggers re-evaluation of `pending()`, `final()`, `lastAssistant()` memos, plus the `<Show when={status().type !== "idle"}>` in prompt/index.tsx:1082 switches from spinner to empty `<text />`. When these all fire in rapid succession, opentui's terminal renderer may produce a visible flash between frames.

**Key components in the render chain:**

- `sync.tsx:217` — `session.status` event handler
- `sync.tsx:229` — `message.updated` with `reconcile()`
- `session/index.tsx:164-166` — `pending` memo (assistant with `time.completed === 0`)
- `session/index.tsx:1516-1541` — `Switch/Match` for message footer (duration display)
- `prompt/index.tsx:1082` — `<Show when={status().type !== "idle"}>` (spinner/status bar)

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
