# Plan: xterm.js Performance Addons & Keyboard Protocol

## Context

The terminal currently uses xterm.js v6's **default DOM renderer** (the slowest option). For a production code editor competing with VS Code/Cursor/Zed, this is a bottleneck — rapid TUI output (vim scrolling, `htop`, streaming logs) causes visible rendering lag. Additionally, modern terminal programs (Neovim, Helix) rely on the `modifyOtherKeys` keyboard protocol to distinguish key combinations, which we don't enable.

This plan adds: WebGL renderer (with Canvas fallback), SIXEL image support, Unicode 11 width tables, and `modifyOtherKeys` mode 2.

---

## Changes

### 1. Install 4 new packages

**File:** `package.json`

```
"@xterm/addon-webgl": "^0.19.0"
"@xterm/addon-canvas": "^0.7.0"
"@xterm/addon-image": "^0.9.0"
"@xterm/addon-unicode11": "^0.8.0"
```

Then `bun install`.

---

### 2. Register in Vite config

**File:** `vite.config.ts` — add to `optimizeDeps.include` after line 195:

```typescript
'@xterm/addon-webgl',
'@xterm/addon-canvas',
'@xterm/addon-image',
'@xterm/addon-unicode11',
```

The existing `manualChunks` rule at line 115 (`id.includes('node_modules/@xterm')`) already catches all `@xterm/*` packages — no change needed there. The `vendor-xterm` chunk grows from ~200KB to ~350KB.

---

### 3. Add `modifyOtherKeys` + `COLORTERM` in Rust PTY

**File:** `crates/common/terminal/src/lib.rs`

**3a.** After line 382 (`cmd.env("TERM", "xterm-256color")`), add:

```rust
cmd.env("COLORTERM", "truecolor");
```

**3b.** After the writer is obtained (line 400-403), before the writer is wrapped in `PtyWriter` at the bottom of `Terminal::new()`, write the escape sequence:

```rust
// Enable modifyOtherKeys mode 2 for TUI apps (Neovim, Helix, etc.)
// Allows programs to distinguish Ctrl+Shift+P from Ctrl+P, etc.
// Reference: https://invisible-island.net/xterm/ctlseqs/ctlseqs.html
writer
    .write_all(b"\x1b[>4;2m")
    .map_err(|e| Error::Terminal(format!("Failed to write modifyOtherKeys: {e}")))?;
writer
    .flush()
    .map_err(|e| Error::Terminal(format!("Failed to flush modifyOtherKeys: {e}")))?;
```

**Why Rust, not frontend:** Must arrive before the shell prompt renders. Sending from frontend would require a `terminal:write` round trip with race condition risk.

---

### 4. Load post-open addons in TerminalInstance

**File:** `apps/agent/src/services/terminal/terminal-instance.ts`

This is the main change. Renderer addons **must** be loaded after `terminal.open()`.

**4a. New static imports** (after line 14):

```typescript
import { ImageAddon } from '@xterm/addon-image';
import { Unicode11Addon } from '@xterm/addon-unicode11';
```

WebGL and Canvas addons use **dynamic import** (lazy — ~100KB WebGL only loaded when needed).

**4b. New private fields** (around line 103):

```typescript
private rendererAddon: IDisposable | null = null;
private rendererType: 'webgl' | 'canvas' | 'dom' = 'dom';
```

**4c. Call `loadPostOpenAddons()` after `terminal.open()` (line 222)**:

```typescript
this.terminal.open(this.wrapperElement);
this.loadPostOpenAddons(); // ← new
```

**4d. New method `loadPostOpenAddons()`:**

- Load `Unicode11Addon` + activate version '11'
- Load `ImageAddon` with SIXEL/IIP/Kitty support enabled
- Call `loadRendererAddon()` (WebGL → Canvas → DOM fallback chain)

**4e. New method `loadRendererAddon()`:**

- Dynamic `import('@xterm/addon-webgl')` → try `new WebglAddon()`
- Register `onContextLoss` handler → disposes WebGL, calls `loadCanvasFallback()`
- Catch block → calls `loadCanvasFallback()`
- All paths log via `createLogger` with renderer type

**4f. New method `loadCanvasFallback()`:**

- Dynamic `import('@xterm/addon-canvas')` → try `new CanvasAddon()`
- Catch → stays on DOM renderer, logs warning

**4g. Update `dispose()` (around line 1077):**

- Dispose `this.rendererAddon` if set

**Key details:**

- ImageAddon loaded BEFORE renderer addon (needs to register parser hooks first)
- Dynamic imports have `isDisposed` guards against late resolution
- Existing `clearTextureAtlas()` calls in `attachToElement()` work for all renderer types
- Liquid Glass semi-transparent bg (`rgba(0,0,0,0.01)`) already set by `buildThemeFromCSSVars()` works with WebGL — no `preserveDrawingBuffer` needed

---

### 5. Mouse events — no code changes

xterm.js handles mouse reporting protocols (X10, SGR, URXVT) transparently when programs request them. The existing keyboard shortcuts capture-phase listener only handles `keydown` and doesn't interfere with mouse events.

---

## Files Modified

| File                                                    | Change                                                                                                         |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `package.json`                                          | Add 4 `@xterm/addon-*` dependencies                                                                            |
| `vite.config.ts:195`                                    | Add 4 packages to `optimizeDeps.include`                                                                       |
| `crates/common/terminal/src/lib.rs:382,403`             | Add `COLORTERM=truecolor` env + write `\x1b[>4;2m` to PTY                                                      |
| `apps/agent/src/services/terminal/terminal-instance.ts` | Add imports, fields, `loadPostOpenAddons()`, `loadRendererAddon()`, `loadCanvasFallback()`, update `dispose()` |

---

## Verification

1. **WebGL renderer** — Open terminal, check dev console for `[TerminalInstance] WebGL renderer loaded`. Run `ls --color` and toggle dark/light theme.
2. **Canvas fallback** — Temporarily make WebGL throw, verify `Canvas renderer loaded (fallback)` log.
3. **Liquid Glass** — Enable transparency, verify vibrancy shows through terminal with both renderers.
4. **SIXEL** — `brew install libsixel && img2sixel some-image.png` in terminal.
5. **modifyOtherKeys** — Open Neovim, verify `Ctrl+Shift+P` is distinguished from `Ctrl+P`.
6. **Unicode** — Type emoji/CJK chars, verify cursor alignment is correct.
7. **Build** — `cargo check` (Rust), `bun run typecheck` (TS), `bunx tauri dev` (full app).
