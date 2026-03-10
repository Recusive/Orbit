# Terminal Migration: xterm.js to ghostty-web

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace xterm.js with ghostty-web (Ghostty WASM) as Orbit's terminal emulator, rebuilding shell integration, command decorations, and search on the new foundation, while fixing Cmd+A selection, focus after CLI launch, and window refocus bugs.

**Architecture:** Intercept the raw PTY data stream before `terminal.write()` to parse OSC 633/1337 sequences (replacing xterm's parser hooks). Use DOM overlays for command decorations (replacing xterm's `registerMarker`/`registerDecoration`). Build search on ghostty-web's buffer API. Adopt the Agent-backend's proven WASM loading and focus patterns.

**Tech Stack:** ghostty-web (anomalyco fork), React 19, TypeScript, Vite, Tauri 2, Zustand, Bun

**Reference implementation:** `Agent-backend/packages/app/src/components/terminal.tsx` — SolidJS but patterns translate directly.

---

## Context

Orbit's terminal uses xterm.js 6.0 with 3 npm addons and 3 custom addons. The Agent-backend (OpenCode) already runs ghostty-web in production — Ghostty's battle-tested VT parser compiled to WASM with an xterm.js-compatible API. This migration gains:

- Better VT100 parsing (Ghostty's production parser vs xterm's JS reimplementation)
- Kitty keyboard protocol support
- Buffer serialization for terminal persistence
- Unified terminal tech across Orbit and Agent-backend

Current bugs to fix during migration:

1. Cmd+A doesn't select anything
2. Focus lost after launching CLI apps (e.g., Claude Code)
3. Focus lost after switching away from and back to the Orbit window

## Dependency Changes

**Remove:** `@xterm/xterm ^6.0.0`, `@xterm/addon-fit ^0.11.0`, `@xterm/addon-search 0.16.0`, `@xterm/addon-web-links ^0.12.0`

**Add:** `ghostty-web: github:anomalyco/ghostty-web#main` (same fork as Agent-backend)

## File Map

### New Files

| File                                                  | Purpose                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------ |
| `services/terminal/ghostty-loader.ts`                 | Singleton WASM loader — lazy-loads ghostty-web module + Ghostty instance |
| `lib/terminal/osc-stream-interceptor.ts`              | Parses OSC 633/1337 from raw PTY data before terminal.write()            |
| `lib/terminal/decorations/dom-overlay-decorations.ts` | Positioned DOM elements for command gutter marks                         |
| `lib/terminal/addons/search-addon.ts`                 | Buffer-based search (replaces @xterm/addon-search)                       |

### Rewrite Files

| File                                               | Lines | Why                                                           |
| -------------------------------------------------- | ----- | ------------------------------------------------------------- |
| `services/terminal/terminal-instance.ts`           | 1081  | Every xterm API call changes                                  |
| `lib/terminal/addons/shell-integration-addon.ts`   | 312   | No parser hooks in ghostty-web — becomes interceptor consumer |
| `lib/terminal/addons/command-decorations-addon.ts` | 410   | No registerMarker/registerDecoration — uses DOM overlay       |
| `services/terminal/terminal-fit-debouncer.ts`      | 188   | FitAddon type changes; ghostty-web has observeResize()        |
| `styles/terminal.css`                              | 244   | xterm-specific CSS selectors change                           |

### Light Modifications

| File                                           | Change                                  |
| ---------------------------------------------- | --------------------------------------- |
| `lib/terminal/utils/theme-sync.ts`             | Replace `ITheme` import with local type |
| `lib/terminal/addons/mark-navigation-addon.ts` | Update type imports                     |
| `components/terminal/terminal-panel.tsx`       | Add WASM loading state                  |
| `package.json`                                 | Dependency swap                         |
| `vite.config.ts`                               | Update chunk splitting + optimizeDeps   |

### Unchanged (no xterm runtime imports)

`terminal-instance-manager.ts`, `use-terminal-instance-manager.ts`, `terminal-handlers.ts`, `terminal-store.ts`, `terminal-search-bar.tsx`, `terminal-context-menu.tsx`, `lib/api/terminal.ts`

### Unchanged Backend (PTY layer stays as-is)

`crates/common/terminal/src/lib.rs`, `src-tauri/src/commands/common/terminal.rs`

---

## Phase 0: Foundation (no behavior change — all additive)

### Task 0.1: WASM Loader Singleton

**Files:**

- Create: `apps/agent/src/services/terminal/ghostty-loader.ts`
- Test: `apps/agent/src/services/terminal/__tests__/ghostty-loader.test.ts`

- [ ] **Step 1: Write failing test** — singleton returns same promise on concurrent calls; clears cache on failure for retry

- [ ] **Step 2: Run test, verify FAIL**

```bash
bun run test -- ghostty-loader
```

- [ ] **Step 3: Implement ghostty-loader.ts**

```typescript
import type { Ghostty, Terminal, FitAddon } from 'ghostty-web';
import { createLogger } from '@/lib/logger';

const logger = createLogger('GhosttyLoader');

export interface GhosttyModule {
  mod: typeof import('ghostty-web');
  ghostty: Ghostty;
}

let shared: Promise<GhosttyModule> | undefined;

export function loadGhostty(): Promise<GhosttyModule> {
  if (shared) return shared;
  logger.info('Loading ghostty-web WASM...');
  shared = import('ghostty-web')
    .then(async (mod) => {
      const ghostty = await mod.Ghostty.load();
      logger.info('ghostty-web WASM loaded');
      return { mod, ghostty };
    })
    .catch((err: unknown) => {
      logger.error('Failed to load ghostty-web WASM', err);
      shared = undefined;
      throw err;
    });
  return shared;
}

export function isGhosttyLoaded(): boolean {
  return shared !== undefined;
}
```

- [ ] **Step 4: Run test, verify PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/services/terminal/ghostty-loader.ts apps/agent/src/services/terminal/__tests__/ghostty-loader.test.ts
git commit -m "feat(terminal): add ghostty-web WASM loader singleton"
```

---

### Task 0.2: OSC Stream Interceptor

**Files:**

- Create: `apps/agent/src/lib/terminal/osc-stream-interceptor.ts`
- Test: `apps/agent/src/lib/terminal/__tests__/osc-stream-interceptor.test.ts`

**Context:** ghostty-web has no `terminal.parser.registerOscHandler()`. This module intercepts raw PTY data, parses OSC 633/1337 sequences, fires callbacks, and passes data through unchanged.

- [ ] **Step 1: Write failing tests** — cover:
  - OSC 633;A (prompt start), 633;B (prompt end), 633;C (command start), 633;D;0 (command end with exit code)
  - OSC 633;E;ls -la;nonce (command line capture)
  - OSC 633;P;Cwd=/home/user (CWD property)
  - OSC 1337;CurrentDir=/home/user (iTerm2 CWD)
  - Partial sequences split across two data chunks
  - Normal data without OSC sequences passes through unchanged
  - Mixed data: text + OSC + text

- [ ] **Step 2: Run tests, verify FAIL**

- [ ] **Step 3: Implement osc-stream-interceptor.ts**

Key design:

- `OscStreamInterceptor` class with `process(data: string): void` — fires callbacks as side effect, does NOT modify data
- Small state machine for partial sequence handling (buffering between `\x1b]` and `\x07` or `\x1b\\`)
- Callback interface:
  ```typescript
  interface OscInterceptorCallbacks {
    onPromptStart?: () => void;
    onPromptEnd?: () => void;
    onCommandStart?: (commandLine?: string) => void;
    onCommandEnd?: (exitCode?: number) => void;
    onCwdChange?: (cwd: string) => void;
    onCapabilitiesChange?: (capabilities: ShellCapabilities) => void;
  }
  ```
- OSC sequence format: `ESC ] <code> ; <params> ST` where ST is `BEL` (`\x07`) or `ESC \` (`\x1b\\`)

- [ ] **Step 4: Run tests, verify PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/lib/terminal/osc-stream-interceptor.ts apps/agent/src/lib/terminal/__tests__/osc-stream-interceptor.test.ts
git commit -m "feat(terminal): add OSC stream interceptor for shell integration"
```

---

### Task 0.3: DOM Overlay Decoration System

**Files:**

- Create: `apps/agent/src/lib/terminal/decorations/dom-overlay-decorations.ts`
- Test: `apps/agent/src/lib/terminal/decorations/__tests__/dom-overlay-decorations.test.ts`

**Context:** Replaces xterm's `registerMarker()` + `registerDecoration()` with positioned DOM elements overlaid on the terminal canvas.

- [ ] **Step 1: Write failing tests** — position calculation given row, scroll offset, cell height; show/hide based on viewport bounds; element creation and update

- [ ] **Step 2: Run tests, verify FAIL**

- [ ] **Step 3: Implement dom-overlay-decorations.ts**

Key design:

- `DecorationOverlay` class manages a container `<div>` positioned absolutely over the terminal
- `addDecoration(row, config)`: Creates a positioned element at `top = (row - scrollOffset) * cellHeight`
- `updateScroll(scrollOffset)`: Repositions all visible decorations, hides out-of-viewport ones
- `getCellDimensions(terminal)`: Measures cell width/height from terminal's font metrics
- Reuses existing CSS classes: `.terminal-command-decoration`, `.success`, `.error`, `.default-color`
- Each decoration element has: icon span, tooltip, click handler

- [ ] **Step 4: Run tests, verify PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/lib/terminal/decorations/
git commit -m "feat(terminal): add DOM overlay decoration system"
```

---

## Phase 1: Core Swap

### Task 1.1: Swap Dependencies

**Files:**

- Modify: `package.json`
- Modify: `vite.config.ts` (if xterm-specific chunk splitting or optimizeDeps exist)

- [ ] **Step 1: Update package.json** — remove 4 xterm packages, add ghostty-web

- [ ] **Step 2: Run `bun install`** — verify clean install

- [ ] **Step 3: Update vite.config.ts** — replace any xterm references in `manualChunks` and `optimizeDeps.include` with ghostty-web. Ensure `build.target: 'esnext'` is set.

- [ ] **Step 4: Verify `bun run dev` starts** (will fail on imports — that's expected, just verify Vite doesn't crash on config)

- [ ] **Step 5: Commit**

```bash
git add package.json bun.lockb vite.config.ts
git commit -m "chore(terminal): swap xterm.js deps for ghostty-web"
```

---

### Task 1.2: Rewrite theme-sync.ts

**Files:**

- Modify: `apps/agent/src/lib/terminal/utils/theme-sync.ts`

- [ ] **Step 1: Replace `import type { ITheme } from '@xterm/xterm'` with local interface**

```typescript
export interface TerminalTheme {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent?: string;
  selectionBackground?: string;
  selectionForeground?: string;
  // ANSI colors
  black?: string;
  red?: string;
  green?: string;
  yellow?: string;
  blue?: string;
  magenta?: string;
  cyan?: string;
  white?: string;
  brightBlack?: string;
  brightRed?: string;
  brightGreen?: string;
  brightYellow?: string;
  brightBlue?: string;
  brightMagenta?: string;
  brightCyan?: string;
  brightWhite?: string;
}
```

- [ ] **Step 2: Update all functions to use `TerminalTheme`** instead of `ITheme`

- [ ] **Step 3: Commit**

```bash
git add apps/agent/src/lib/terminal/utils/theme-sync.ts
git commit -m "refactor(terminal): use local TerminalTheme type"
```

---

### Task 1.3: Rewrite terminal-fit-debouncer.ts

**Files:**

- Modify: `apps/agent/src/services/terminal/terminal-fit-debouncer.ts`

- [ ] **Step 1: Replace `import type { FitAddon } from '@xterm/addon-fit'`** with ghostty-web's FitAddon type:

```typescript
import type { FitAddon } from 'ghostty-web';
```

- [ ] **Step 2: Verify the FitAddon interface matches** — ghostty-web's FitAddon has `fit()`, `proposeDimensions()`, and `observeResize()`. Our debouncer only uses `fit()`. No logic changes needed.

- [ ] **Step 3: Commit**

```bash
git add apps/agent/src/services/terminal/terminal-fit-debouncer.ts
git commit -m "refactor(terminal): update FitAddon type to ghostty-web"
```

---

### Task 1.4: Rewrite shell-integration-addon.ts

**Files:**

- Modify: `apps/agent/src/lib/terminal/addons/shell-integration-addon.ts`

**Context:** Convert from xterm `ITerminalAddon` (parser hooks) to an event-driven class consuming `OscStreamInterceptor`.

- [ ] **Step 1: Remove `ITerminalAddon` implementation and `terminal.parser.registerOscHandler()` calls**

- [ ] **Step 2: Add constructor that accepts `OscStreamInterceptor`** and wires callbacks:

```typescript
export class ShellIntegration {
  constructor(interceptor: OscStreamInterceptor, callbacks: ShellIntegrationCallbacks) {
    interceptor.onPromptStart = () => this._handlePromptStart();
    interceptor.onCommandStart = (cmd) => this._handleCommandStart(cmd);
    // ... wire all callbacks
  }
}
```

- [ ] **Step 3: Keep the state machine logic identical** — `_commandState`, `_handlePromptStart`, `_handlePromptEnd`, `_handleCommandStart`, `_handleCommandEnd`, `_handleCwdProperty` all stay the same.

- [ ] **Step 4: Add `dispose()` method** to unregister from interceptor

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/lib/terminal/addons/shell-integration-addon.ts
git commit -m "refactor(terminal): rewrite shell integration as interceptor consumer"
```

---

### Task 1.5: Rewrite command-decorations-addon.ts

**Files:**

- Modify: `apps/agent/src/lib/terminal/addons/command-decorations-addon.ts`

**Context:** Replace xterm's `registerMarker()` + `registerDecoration()` with the DOM overlay system from Task 0.3. The command mark data structure and public API stay the same.

- [ ] **Step 1: Remove xterm-specific imports** (`IMarker`, `IDecoration`, `IBufferRange`)

- [ ] **Step 2: Replace marker/decoration creation** with `DecorationOverlay.addDecoration()`:

```typescript
markCommandStart(commandLine?: string): string {
  const buffer = this._terminal.buffer.active;
  const currentLine = buffer.baseY + buffer.cursorY;
  const mark: CommandMark = {
    id: crypto.randomUUID(),
    commandLine,
    startLine: currentLine,
    isRunning: true,
    startTime: Date.now(),
  };
  this._commandMarks.push(mark);
  this._overlay.addDecoration(currentLine, {
    icon: '●', cssClass: 'default-color',
    tooltip: commandLine ?? 'Running...',
    onClick: () => this.scrollToMark(mark.id),
  });
  return mark.id;
}
```

- [ ] **Step 3: Wire `terminal.onScroll` and `terminal.onRender`** to `overlay.updateScroll()` for repositioning

- [ ] **Step 4: Keep public API unchanged** — `markCommandStart`, `markCommandEnd`, `getCommandMarks`, `scrollToMark`, `scrollToNextCommand`, `scrollToPreviousCommand`, `getCommandOutputRange`

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/lib/terminal/addons/command-decorations-addon.ts
git commit -m "refactor(terminal): rewrite command decorations with DOM overlay"
```

---

### Task 1.6: Update mark-navigation-addon.ts

**Files:**

- Modify: `apps/agent/src/lib/terminal/addons/mark-navigation-addon.ts`

- [ ] **Step 1: Update type imports** — replace `@xterm/xterm` types with ghostty-web equivalents or use the terminal instance directly without typed imports

- [ ] **Step 2: Verify `attachCustomKeyEventHandler` exists** in ghostty-web (it does — same API)

- [ ] **Step 3: Verify buffer API** — `buffer.active.baseY`, `buffer.cursorY`, `scrollToLine()` exist in ghostty-web

- [ ] **Step 4: Commit**

```bash
git add apps/agent/src/lib/terminal/addons/mark-navigation-addon.ts
git commit -m "refactor(terminal): update mark navigation types for ghostty-web"
```

---

### Task 1.7: Rewrite terminal-instance.ts (CRITICAL)

**Files:**

- Modify: `apps/agent/src/services/terminal/terminal-instance.ts`

This is the largest and most critical task. The `TerminalInstance` class must be rewritten section by section.

- [ ] **Step 1: Update imports**

```typescript
// REMOVE
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

// ADD
import type { Terminal, FitAddon, Ghostty } from 'ghostty-web';
import type { GhosttyModule } from './ghostty-loader';
import { OscStreamInterceptor } from '@/lib/terminal/osc-stream-interceptor';
import { ShellIntegration } from '@/lib/terminal/addons/shell-integration-addon';
import { SearchAddon } from '@/lib/terminal/addons/search-addon';
```

- [ ] **Step 2: Update constructor** to accept `GhosttyModule`:

```typescript
constructor(options: TerminalInstanceOptions & { ghosttyModule: GhosttyModule }) {
  const { mod, ghostty } = options.ghosttyModule;
  this.terminal = new mod.Terminal({
    cursorBlink: true,
    cursorStyle: 'bar',
    fontSize: TERMINAL.fontSize,
    fontFamily: TERMINAL.fontFamily,
    lineHeight: 1.2,
    scrollback: 10000,
    theme: buildThemeFromCSSVars(),
    allowTransparency: false,
    ghostty,
  });
}
```

- [ ] **Step 3: Update addon loading**

```typescript
// FitAddon — built-in
this.fitAddon = new mod.FitAddon();
this.terminal.loadAddon(this.fitAddon);

// Search — custom (replaces @xterm/addon-search)
this.searchAddon = new SearchAddon();
this.terminal.loadAddon(this.searchAddon);

// OSC interceptor + shell integration (replaces parser hooks)
this.oscInterceptor = new OscStreamInterceptor();
this.shellIntegration = new ShellIntegration(this.oscInterceptor, {
  onCommandStart: this.options.onCommandStart,
  onCommandEnd: this.options.onCommandEnd,
  onCwdChange: this.options.onCwdChange,
  onCapabilitiesChange: this.options.onCapabilitiesChange,
});

// Command decorations — DOM overlay
this.commandDecorations = new CommandDecorationsAddon(this.terminal, this.wrapperElement);
// MarkNavigation — same as before
this.markNavigation = new MarkNavigationAddon(this.commandDecorations);
```

- [ ] **Step 4: Update `handleMessage` for terminal:data** — feed through interceptor:

```typescript
case 'terminal:data': {
  this.oscInterceptor.process(message.data);
  this.terminal.write(atob(message.data));
  this.unacknowledgedBytes += message.data.length;
  break;
}
```

- [ ] **Step 5: Fix focus management** — adopt Agent-backend's triple-focus pattern:

```typescript
focus(): void {
  this.terminal.focus();
  this.terminal.textarea?.focus();
  setTimeout(() => this.terminal.textarea?.focus(), 0);
}
```

- [ ] **Step 6: Add pointerdown handler** on wrapper for focus restoration:

```typescript
this.wrapperElement.addEventListener('pointerdown', () => {
  const active = document.activeElement;
  if (
    active instanceof HTMLElement &&
    active !== this.wrapperElement &&
    !this.wrapperElement.contains(active)
  ) {
    active.blur();
  }
  this.focus();
});
```

- [ ] **Step 7: Fix Cmd+A** in `setupKeyboardShortcuts()`:

```typescript
if (modKey && key === 'a' && !event.shiftKey && !event.altKey) {
  event.preventDefault();
  event.stopPropagation();
  this.terminal.selectAll();
  // If selectAll() only selects viewport, use:
  // const totalLines = this.terminal.buffer.active.length;
  // this.terminal.selectLines(0, totalLines - 1);
  return;
}
```

- [ ] **Step 8: Update copy/paste** — use native clipboard events (capturing phase) matching Agent-backend:

```typescript
this.wrapperElement.addEventListener(
  'copy',
  (event: ClipboardEvent) => {
    const selection = this.terminal.getSelection();
    if (!selection) return;
    event.clipboardData?.setData('text/plain', selection);
    event.preventDefault();
  },
  true
);

this.wrapperElement.addEventListener(
  'paste',
  (event: ClipboardEvent) => {
    const text = event.clipboardData?.getData('text/plain') ?? '';
    if (!text) return;
    event.preventDefault();
    event.stopPropagation();
    this.terminal.paste(text);
  },
  true
);
```

- [ ] **Step 9: Remove WebLinksAddon** — use ghostty-web's built-in link detection via `registerLinkProvider()` if needed, or rely on the default behavior

- [ ] **Step 10: Update `attachToElement()` and `detachFromElement()`** — ghostty-web's `terminal.open(container)` works the same way. The ResizeObserver pattern for PTY creation stays. ghostty-web's FitAddon has `observeResize()` — evaluate using it alongside the manual debouncer.

- [ ] **Step 11: Update theme sync** — `terminal.options.theme = newTheme` works the same way in ghostty-web. Verify `setOptionIfSupported()` pattern works (from Agent-backend's runtime-adapters.ts).

- [ ] **Step 12: Verify flow control, cursor blink optimization, and search pass-through** all work with the new API

- [ ] **Step 13: Commit**

```bash
git add apps/agent/src/services/terminal/terminal-instance.ts
git commit -m "feat(terminal): rewrite terminal-instance for ghostty-web"
```

---

### Task 1.8: Update terminal-instance-manager.ts

**Files:**

- Modify: `apps/agent/src/services/terminal/terminal-instance-manager.ts`

- [ ] **Step 1: Call `loadGhostty()` before creating instances**

```typescript
async createInstance(options: TerminalInstanceOptions): Promise<TerminalInstance> {
  const ghosttyModule = await loadGhostty();
  return new TerminalInstance({ ...options, ghosttyModule });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/agent/src/services/terminal/terminal-instance-manager.ts
git commit -m "feat(terminal): load ghostty WASM before creating instances"
```

---

### Task 1.9: Rewrite terminal.css

**Files:**

- Modify: `apps/agent/src/styles/terminal.css`

- [ ] **Step 1: Inspect ghostty-web's DOM structure** — run `bunx tauri dev`, open DevTools, examine the terminal container. Identify ghostty-web's CSS class names (they differ from xterm's `.xterm`, `.xterm-viewport`, `.xterm-screen`).

- [ ] **Step 2: Update CSS selectors** to match ghostty-web's structure. Key rules to preserve:
  - Container hierarchy (`.terminal-outer-container`, `.terminal-groups-container`, etc.)
  - Terminal padding with gutter: `padding: 4px 8px 4px var(--terminal-gutter-width)`
  - Canvas rendering hints: `-webkit-optimize-contrast`, `image-rendering: pixelated`
  - Command decoration gutter styling (now targets DOM overlay elements)
  - Scrollbar styling
  - Z-index layering

- [ ] **Step 3: Remove xterm-specific overrides** that no longer apply (`.xterm-viewport`, `.xterm-screen`, `.xterm-decoration-container`)

- [ ] **Step 4: Commit**

```bash
git add apps/agent/src/styles/terminal.css
git commit -m "style(terminal): update CSS for ghostty-web DOM structure"
```

---

### Task 1.10: Update terminal-panel.tsx for WASM loading

**Files:**

- Modify: `apps/agent/src/components/terminal/terminal-panel.tsx`

- [ ] **Step 1: Add loading state** while WASM initializes (first terminal creation may have a brief delay):

The WASM loads lazily on first terminal creation via `terminal-instance-manager.ts`. The panel may need a brief loading indicator if the first terminal takes a moment. Check if this is noticeable — if WASM loads in <100ms, skip the loading state.

- [ ] **Step 2: Add window focus listener** for focus restoration (Bug #3):

```typescript
useEffect(() => {
  const handleWindowFocus = (): void => {
    if (activeSessionId) {
      const instance = terminalManager.getInstance(activeSessionId);
      instance?.focus();
    }
  };
  window.addEventListener('focus', handleWindowFocus);
  return () => window.removeEventListener('focus', handleWindowFocus);
}, [activeSessionId, terminalManager]);
```

- [ ] **Step 3: Commit**

```bash
git add apps/agent/src/components/terminal/terminal-panel.tsx
git commit -m "feat(terminal): add window focus restoration and WASM loading support"
```

---

## Phase 2: Search Implementation

### Task 2.1: Build Search Addon

**Files:**

- Create: `apps/agent/src/lib/terminal/addons/search-addon.ts`
- Test: `apps/agent/src/lib/terminal/addons/__tests__/search-addon.test.ts`

**Context:** ghostty-web has no search addon. Build one on the buffer API, matching the interface of `@xterm/addon-search` so `TerminalSearchBar` needs no changes.

- [ ] **Step 1: Write failing tests** — findNext returns true/false, case-sensitive matching, regex matching, whole-word matching, findPrevious, wrap-around search, clearSearch

- [ ] **Step 2: Run tests, verify FAIL**

- [ ] **Step 3: Implement search-addon.ts**

```typescript
export class SearchAddon {
  private _terminal: Terminal | undefined;
  private _currentMatchIndex = -1;
  private _matches: Array<{ line: number; startCol: number; length: number }> = [];

  activate(terminal: Terminal): void {
    this._terminal = terminal;
  }
  dispose(): void {
    this._terminal = undefined;
  }

  findNext(query: string, options?: SearchOptions): boolean {
    if (!this._terminal || !query) return false;
    this._buildMatchList(query, options);
    if (this._matches.length === 0) return false;
    this._currentMatchIndex = (this._currentMatchIndex + 1) % this._matches.length;
    this._highlightMatch(this._matches[this._currentMatchIndex]);
    return true;
  }

  findPrevious(query: string, options?: SearchOptions): boolean {
    // Similar, decrement index
  }

  clearDecorations(): void {
    this._matches = [];
    this._currentMatchIndex = -1;
    this._terminal?.clearSelection();
  }

  private _buildMatchList(query: string, options?: SearchOptions): void {
    const buffer = this._terminal!.buffer.active;
    this._matches = [];
    for (let i = 0; i < buffer.length; i++) {
      const line = buffer.getLine(i);
      if (!line) continue;
      const text = line.translateToString();
      // Find all matches in this line
      // ... regex or string matching based on options
    }
  }

  private _highlightMatch(match: { line: number; startCol: number; length: number }): void {
    this._terminal?.select(match.startCol, match.line, match.length);
    this._terminal?.scrollToLine(match.line);
  }
}
```

- [ ] **Step 4: Run tests, verify PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/lib/terminal/addons/search-addon.ts apps/agent/src/lib/terminal/addons/__tests__/search-addon.test.ts
git commit -m "feat(terminal): add buffer-based search addon for ghostty-web"
```

---

## Phase 3: Cleanup & Polish

### Task 3.1: Remove Dead Code

- [ ] **Step 1: Delete `@xterm/xterm/css/xterm.css` import** (already removed in Task 1.7)

- [ ] **Step 2: Run `bun run knip`** to find any remaining dead xterm references

- [ ] **Step 3: Clean up any orphaned type imports or barrel exports**

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(terminal): remove dead xterm.js references"
```

---

### Task 3.2: Update Documentation

- [ ] **Step 1: Update `apps/agent/CLAUDE.md`** — change terminal technology references from xterm.js to ghostty-web

- [ ] **Step 2: Commit**

```bash
git commit -m "docs: update terminal docs for ghostty-web migration"
```

---

## Verification

### Automated

```bash
bun run check          # TypeScript + ESLint + tests
bun run test           # Vitest suite
cargo check            # Rust (unchanged, but verify)
```

### Manual Testing (bunx tauri dev)

1. Terminal creates and shows cursor
2. Type commands, see output
3. Copy text (select + Cmd+C), paste (Cmd+V)
4. Cmd+A selects terminal content
5. Theme toggle (dark/light) — terminal recolors
6. Command gutter decorations appear (✓ for success, ✕ for failure)
7. Ctrl+Up/Down navigates between commands
8. Cmd+F opens search, find next/previous works
9. Multiple terminal tabs — create, switch, close
10. Panel collapse/expand — terminal survives
11. Launch `claude` in terminal, exit — terminal regains focus
12. Switch to another app, switch back — terminal accepts input immediately
13. Links in terminal output are clickable

### Performance Spot Check

- WASM load time on first terminal: should be <200ms
- Terminal responsiveness during rapid output (`find / 2>/dev/null`)
- No visual glitches during panel resize

---

## Rollback

- **Before Phase 1**: All new files are additive. Delete them.
- **During Phase 1**: `git stash` or revert the feature branch.
- **After Phase 1**: If search or decorations need more time, ship without them — the core terminal works. Re-add features incrementally.
- **No feature flag needed**: The migration scope is atomic enough to ship as one branch.

---

## Task Dependency Graph

```
Phase 0 (parallel):
  Task 0.1 (WASM loader)
  Task 0.2 (OSC interceptor)
  Task 0.3 (DOM overlay)

Phase 1 (sequential, depends on Phase 0):
  Task 1.1 (deps) → Task 1.2 (theme) → Task 1.3 (fit) → Task 1.4 (shell) →
  Task 1.5 (decorations) → Task 1.6 (nav) → Task 1.7 (terminal-instance) →
  Task 1.8 (manager) → Task 1.9 (CSS) → Task 1.10 (panel)

Phase 2 (after Phase 1):
  Task 2.1 (search)

Phase 3 (after Phase 2):
  Task 3.1 (cleanup) → Task 3.2 (docs)
```

Phase 0 tasks are independent and can be done in parallel.
Phase 1 tasks are sequential (each builds on the previous).
Phase 2 and 3 follow after Phase 1.
