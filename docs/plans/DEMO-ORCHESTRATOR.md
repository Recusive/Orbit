# Demo Orchestrator — Launch Video Cursor Control

## Context

You want to record a polished launch video showcasing Orbit's features. The stress test system (`window.__orbit_debug`) can drive real actions but has no visual cursor, no typing animation, and no choreography. This plan adds a **Demo Orchestrator** — a scripted demo mode that renders a virtual macOS cursor, types character-by-character into the real input, moves smoothly between UI elements, and waits for Claude responses. You'll run it from DevTools, screen record, and get a cinematic demo.

---

## Architecture

```
window.__orbit_debug.runDemo(script)       ← DevTools entry point
window.__orbit_debug.runLaunchDemo()       ← Pre-built launch video
        │
        ▼
  Script Runner (sequential async stepper + pause/resume/cancel)
        │
        ▼
  Actions (moveTo, click, type, sendMessage, togglePanel, wait, ...)
        │
        ▼
  Engines: Cursor (DOM element + rAF)  │  Typing (contentEditable injection)
```

- **Virtual cursor**: Plain DOM `<div>` appended to `document.body` (not React) with `position: fixed; z-index: 99999; pointer-events: none`. Uses `transform: translate()` animated via `requestAnimationFrame` for GPU-composited 120fps movement.
- **Typing engine**: Gets the chat input via `queryVisible('[data-demo-input]')` (visibility-aware — avoids hidden Editor tab's ChatInput), appends characters to `textContent`, dispatches real `InputEvent` so React state updates naturally. Intentionally does NOT set cursor position — prevents `@mention` and `/slash` popovers from triggering during demo typing.
- **Cancellation**: All async operations (typing, movement, waits) accept an `AbortSignal`. `cancel()` aborts the signal, breaking out of loops and cleaning up DOM elements.
- **Dev-only**: All code behind `import.meta.env.DEV` + dynamic imports. Tree-shaken from production.

---

## New Files

```
apps/agent/src/demo/
├── index.ts                 # Public API: runDemoScript(), DemoDeps, re-exports
├── types.ts                 # DemoStep, DemoScript, DemoConfig, DemoDeps, CursorConfig, etc.
├── cursor.ts                # createCursor(), destroyCursor(), moveTo(), clickEffect(), highlight()
├── typing-engine.ts         # typeText() — char-by-char into contentEditable
├── script-runner.ts         # Sequential executor with pause/resume/cancel
├── actions.ts               # Step dispatch: maps DemoStep → engine calls + store actions
├── wait-utils.ts            # Shared waitForAgentComplete, waitForStreaming, sleep (extracted from stress tests)
├── easing.ts                # Easing functions (easeOutCubic, easeInOutCubic, easeOutQuint)
└── scripts/
    └── launch-video.ts      # Pre-built launch video choreography
```

---

## Modified Files

### 1. `apps/agent/src/components/chat/input/ChatInput.tsx` (line 207)

Add `data-demo-input` to the contentEditable div so the typing engine can find it:

```tsx
<div
  ref={inputRef}
  data-demo-input          // ← add this
  contentEditable
  ...
/>
```

### 2. `apps/agent/src/components/chat/input/InputControls.tsx` (line 222)

Add `data-demo-send` to the send/stop button:

```tsx
<button
  data-demo-send           // ← add this
  onClick={isAgentRunning && isInputEmpty ? handleStop : handleSend}
  ...
/>
```

### 3. `apps/agent/src/hooks/chat/use-chat-messages.ts`

**Type import** (top of file, with other stress test type imports):

```typescript
import type { DemoConfig, DemoRunnerControls, DemoScript } from '@/demo/types';
```

**Type declaration** (~line 57, inside `Window.__orbit_debug`):

```typescript
runDemo?: (script: DemoScript, config?: DemoConfig) => Promise<DemoRunnerControls>;
runLaunchDemo?: (config?: DemoConfig) => Promise<DemoRunnerControls>;
```

**Dynamic import registration** (~line 490, inside the dev-mode useEffect):

```typescript
runDemo: async (script, config) => {
  const { runDemoScript } = await import('@/demo');
  return runDemoScript(script, { handleSend: actions.handleSend, handleStop: actions.handleStop, handleOpenFile: actions.handleOpenFile, postMessage }, config);
},
runLaunchDemo: async (config) => {
  const { launchVideoScript } = await import('@/demo/scripts/launch-video');
  const { runDemoScript } = await import('@/demo');
  return runDemoScript(launchVideoScript, { handleSend: actions.handleSend, handleStop: actions.handleStop, handleOpenFile: actions.handleOpenFile, postMessage }, config);
},
```

**Cleanup: key-scoped deletion** (~line 500, replace existing cleanup):

The existing cleanup at line 501 sets `window.__orbit_debug = undefined`, which **destroys all keys** — including those registered by other hooks (`use-auto-update.ts` registers `simulateUpdate`/`simulateUpdateQuickCycle` independently). This is a pre-existing codebase bug. The demo must not make it worse.

The demo registration should use key-scoped cleanup — delete only the keys it owns:

```typescript
// Keys owned by this useEffect
const DEMO_KEYS = ['runDemo', 'runLaunchDemo'] as const;

return (): void => {
  if (window.__orbit_debug) {
    for (const key of DEMO_KEYS) {
      delete window.__orbit_debug[key];
    }
  }
};
```

> **Pre-existing issue**: The existing cleanup `window.__orbit_debug = undefined` (line 501) should also be changed to key-scoped deletion for `handleSend`, `handleRewind`, `handleStop`, and all `run*StressTest` keys. This is a separate fix — not in scope for the demo orchestrator, but should be done alongside to avoid regression.

---

## Key Type Definitions (`demo/types.ts`)

```typescript
type DemoStep =
  | { action: 'moveTo'; target: string | { x: number; y: number }; duration?: number }
  | { action: 'click'; target?: string }
  | { action: 'type'; text: string; charDelay?: number }
  | { action: 'sendMessage'; text: string; charDelay?: number }
  | { action: 'waitForAgent'; timeout?: number }
  | { action: 'waitForStreaming'; timeout?: number }
  | { action: 'wait'; ms: number }
  | { action: 'togglePanel'; panel: PanelAction }
  | { action: 'openFile'; path: string }
  | { action: 'switchTab'; tab: 'agent' | 'editor' | 'canvas' }
  | { action: 'scroll'; target: string; direction: 'up' | 'down'; amount: number }
  | { action: 'highlight'; target: string; duration?: number }
  | { action: 'showCursor' }
  | { action: 'hideCursor' }
  | { action: 'label'; text: string }; // Logs a section marker: logger.warn(`[Demo] ▸ ${text}`)

type PanelAction =
  | 'sidebar'
  | 'activity'
  | 'terminal'
  | 'sourceControl'
  | 'browser'
  | 'vault'
  | 'files';

/** Deps injected from use-chat-messages.ts — only non-store deps.
 *  Panel/tab actions use useUIStore.getState() directly (matches stress test pattern). */
interface DemoDeps {
  handleSend: (text: string) => void;
  handleStop: () => void;
  handleOpenFile: (path: string) => void;
  postMessage: (message: WebviewMessage) => void;
}

interface DemoConfig {
  /** Multiplier for all delays. 0.5 = double speed, 2 = half speed. Default: 1 */
  speedMultiplier?: number;
}
```

`DemoRunnerControls` returned to DevTools: `{ pause(), resume(), cancel(), done: Promise<StepResult[]> }`

---

## Action → Store Mapping

The `togglePanel` action uses **deterministic wrappers** — not raw toggles. Raw `toggleLeftSidebar()`, `toggleBottomPanel()`, and `toggleVault()` flip state, making scripts dependent on initial UI state. The demo wraps these with precondition checks so behavior is repeatable across runs:

```typescript
// demo/actions.ts — deterministic panel helpers
import { SIDEBAR } from '@/lib/utils/constants';

function ensurePanelOpen(panel: PanelAction): void {
  const s = useUIStore.getState();
  switch (panel) {
    case 'sidebar':
      // leftSidebarOpen is stale — sidebar truth is width-driven.
      // Matches useIsLeftSidebarCollapsed selector semantics.
      if (s.leftSidebarWidth <= SIDEBAR.collapsed) s.toggleLeftSidebar();
      break;
    case 'terminal':
      // Two states need handling: fully closed (bottomPanelOpen=false)
      // and collapsed-header (bottomPanelOpen=true, terminalCollapsed=true).
      // toggleBottomPanel opens fully when closed, or uncollapses when header-only.
      if (!s.bottomPanelOpen || s.terminalCollapsed) s.toggleBottomPanel();
      break;
    case 'vault':
      if (!s.vaultOpen) s.toggleVault();
      break;
    case 'activity':
      if (!s.reviewPanelOpen) s.toggleReviewPanel();
      break;
    // sourceControl, browser, files use open* (already idempotent)
    case 'sourceControl':
      s.openSourceControl();
      break;
    case 'browser':
      s.openBrowserTab();
      break;
    case 'files':
      s.openFileTab();
      break;
  }
}
```

| Action        | Value                         | Store call                                                                           |
| ------------- | ----------------------------- | ------------------------------------------------------------------------------------ |
| `togglePanel` | `sidebar`                     | `ensurePanelOpen('sidebar')` — checks `leftSidebarWidth <= SIDEBAR.collapsed` first  |
| `togglePanel` | `activity`                    | `ensurePanelOpen('activity')` — checks `reviewPanelOpen` first                       |
| `togglePanel` | `terminal`                    | `ensurePanelOpen('terminal')` — checks `bottomPanelOpen && !terminalCollapsed` first |
| `togglePanel` | `sourceControl`               | `useUIStore.getState().openSourceControl()` (already idempotent)                     |
| `togglePanel` | `browser`                     | `useUIStore.getState().openBrowserTab()` (already idempotent)                        |
| `togglePanel` | `vault`                       | `ensurePanelOpen('vault')` — checks `vaultOpen` first                                |
| `togglePanel` | `files`                       | `useUIStore.getState().openFileTab()` (already idempotent)                           |
| `switchTab`   | `agent` / `editor` / `canvas` | `useUIStore.getState().setActiveTab(tab)`                                            |
| `openFile`    | `path`                        | `deps.handleOpenFile(path)`                                                          |

---

## Virtual Cursor Design

- macOS-style pointer arrow SVG (inline, no external asset)
- Movement: `requestAnimationFrame` loop with easing (default `easeOutCubic` — matches project's `cubic-bezier(0.165, 0.84, 0.44, 1)`)
- Click effect: scale pulse (1 → 0.85 → 1 over 150ms) + ephemeral ripple circle at click position
- `humanize: true` by default — adds ±3px random offset to target positions, clamped to `Math.min(offset, targetRect.width / 4, targetRect.height / 4)` so cursor always lands visually within small targets (e.g., the 28×28px send button)
- CSS injected via `<style id="orbit-demo-cursor-styles">` element — idempotent: `createCursor()` checks for existing cursor/style elements and removes them before creating new ones. Safe to call multiple times without accumulating DOM debris.
- Avoids `backdrop-filter` (WKWebView quirk per CLAUDE.md)
- Only animates `transform` and `opacity` (safe properties per codebase convention)

---

## Typing Engine Design

- Finds input via `queryVisible('[data-demo-input]')` — uses the same visibility resolver as action targets (see Target Resolution below) to avoid hidden-tab ambiguity. The Editor tab's `EditorChatPanel` mounts a second `<ChatInput>` that stays in the DOM via `display:none`; a naive `querySelector` could return that hidden instance instead of the active one.
- Clears existing input text before typing (prevents concatenation with leftover text)
- For each character: appends to `textContent`, dispatches `new InputEvent('input', { bubbles: true })`
- The existing `handleInputChange` in `use-chat-input.ts` reads `e.currentTarget.textContent` — works naturally
- Intentionally does NOT set cursor position via Selection/Range — prevents `@mention` and `/slash` popovers from triggering during demo typing (documented, not a bug)
- Variable timing: base 45ms + 30ms at spaces + 80ms at punctuation + ±15ms random variance
- All delays accept `AbortSignal` for clean cancellation mid-character

### `sendMessage` Composite — Visual Typing + Programmatic Send

The `sendMessage` action performs visual choreography but sends the message programmatically via `deps.handleSend(text)` — the same pattern stress tests use. This avoids a **React state timing issue**: `handleSend()` in `use-chat-input.ts` reads `inputText` from React state, but React 19 batches state updates from `InputEvent` dispatches. Clicking the DOM send button too quickly could find `inputText` still empty and the button `disabled`.

```
sendMessage composite:
  1. moveTo [data-demo-input]     — visual cursor movement
  2. clickEffect on input         — visual click animation
  3. typeText(text)               — character-by-character into contentEditable
  4. await requestAnimationFrame  — let React flush state for visual consistency
  5. moveTo [data-demo-send]      — visual cursor to send button
  6. clickEffect on send          — visual click animation
  7. deps.handleSend(text)        — ACTUAL send (bypasses button disabled state)
  8. clearInput(inputEl)          — reset DOM + dispatch InputEvent so isInputEmpty → true
  9. resolveSessionIdForWait()    — get effective session ID (see below)
```

**Step 8 is critical**: `deps.handleSend(text)` sends the message via `createChatActions`, which never touches the DOM input. Without clearing, the contentEditable still shows the typed text, `inputText` state remains non-empty, `isInputEmpty` stays `false`, and the send button renders as "Queue message" instead of "Stop agent" — a visual bug.

**Step 9 handles session creation**: When the demo starts from an empty state (no active conversation), `handleSend` takes the `conversation:create` path — it stores a `pendingMessage`, sends `conversation:create` to the backend, and returns immediately. The actual `message:send` happens later in Effect 4 (`use-chat-messages.ts`), which reacts to `lastCreatedSessionId` changing. If the demo reads `activeSessionId` right after step 7, it gets `''`. `resolveSessionIdForWait()` handles this by returning the current `activeSessionId` if one exists, or subscribing to the store and waiting for `lastCreatedSessionId`/`activeSessionId` to be set. The resolved session ID is stored in module-level `lastSentSessionId` for the subsequent `waitForAgent` step.

```typescript
function clearInput(inputEl: HTMLElement): void {
  inputEl.textContent = '';
  inputEl.dispatchEvent(new InputEvent('input', { bubbles: true }));
}
```

### Queued Message Behavior

If `sendMessage` fires while the agent is already running (e.g., a script sends two messages back-to-back without an intervening `waitForAgent`), `handleSend` in `chat-actions.ts` does **not** send immediately. Instead it stores the message in `QueuedMessageStore`. A React effect in `use-queued-message.ts` watches for `!isAgentRunning && queuedMessage` — when the first turn finishes, it auto-sends the queued message and the agent starts again.

**Impact on `waitForAgent`**: `waitForAgentComplete` resolves when `isAgentRunning` becomes `false` after the **first** turn — not after the queued message's turn. The demo would proceed as if done, but the queued send starts a second agent turn in the background.

**Script authoring rule**: Always place `{ action: 'waitForAgent' }` between consecutive `sendMessage` steps. The `sendMessage` action logs a warning if `isAgentRunning` is `true` at send time:

```typescript
// Inside sendMessage action, before deps.handleSend(text):
const session = useChatStore.getState().sessions[activeSessionId ?? ''];
if (session?.isAgentRunning) {
  logger.warn(
    '[Demo] sendMessage while agent is running — message will be queued by handleSend. ' +
      'The next waitForAgent resolves for the CURRENT turn, not the queued message. ' +
      'Add { action: "waitForAgent" } between sends to ensure sequential execution.'
  );
}
```

If a script intentionally queues (e.g., to demo the queued-message UI bubble), it must use **two** `waitForAgent` steps — one for the active turn, one for the queued turn.

---

## Target Resolution & Error Handling

Actions that accept CSS selector strings (`moveTo`, `click`, `highlight`, `scroll`) resolve targets via a shared `resolveTarget()` function that returns only **visible** elements.

**Why visibility filtering matters**: The app uses a mount-once tab model (`App.tsx`). When the Agent tab is active, the Editor tab's `EditorChatPanel` is still mounted but hidden via `display:none`. Both panels render `<ChatInput>` with `data-demo-input`. A naive `document.querySelector('[data-demo-input]')` could return the hidden Editor instance. The resolver must filter by visibility.

```typescript
/** Find the first VISIBLE match for a selector (non-zero rect, not display:none) */
function queryVisible(selector: string): HTMLElement | null {
  const candidates = document.querySelectorAll<HTMLElement>(selector);
  for (const el of candidates) {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    if (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      rect.width > 0 &&
      rect.height > 0
    ) {
      return el;
    }
  }
  return null;
}

function resolveTarget(target: string | { x: number; y: number }): ResolvedTarget {
  if (typeof target !== 'string') {
    return { el: null, point: target };
  }
  const el = queryVisible(target);
  if (!el) {
    logger.warn(`[Demo] Target not found (or not visible): ${target}, skipping step`);
    return { el: null, point: { x: 0, y: 0 }, skipped: true };
  }
  const rect = el.getBoundingClientRect();
  return { el, point: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } };
}
```

When a target is not found or not visible, the step is **skipped** (not failed) — subsequent steps continue. For critical targets, scripts should use `wait` steps before `moveTo` to give panel animations time to complete.

---

## Cancellation & Singleton Runner

The script runner enforces **single active runner** — calling `runDemoScript()` while another is running auto-cancels the previous one. This prevents interleaved sends, waits, and panel toggles from concurrent invocations.

```typescript
// demo/script-runner.ts — module-level singleton
let activeRunnerAbort: AbortController | null = null;

export function runDemoScript(
  script: DemoScript,
  deps: DemoDeps,
  config?: DemoConfig
): DemoRunnerControls {
  // Auto-cancel any previous run
  activeRunnerAbort?.abort();
  destroyCursor();

  const controller = new AbortController();
  activeRunnerAbort = controller;

  const done = (async (): Promise<StepResult[]> => {
    try {
      return await runScriptInternal(script, deps, config, controller.signal);
    } finally {
      if (activeRunnerAbort === controller) activeRunnerAbort = null;
    }
  })();

  return {
    pause: () => {
      /* set paused flag */
    },
    resume: () => {
      /* clear paused flag */
    },
    cancel: () => {
      controller.abort();
      destroyCursor();
    },
    done,
  };
}
```

All async operations (typing, movement, waits) accept the `AbortSignal`:

```typescript
// Cancellable sleep
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true }
    );
  });
}
```

The runner catches `AbortError` and returns results collected so far.

---

## Shared Wait Utilities (`demo/wait-utils.ts`)

Extracted from the 5x copy-pasted `waitForAgentComplete` across stress tests but with a critical improvement: **session-scoped waits**.

The stress test versions subscribe to `useChatStore` and check `isAgentRunning` on the active session. But during a demo, the user could switch conversations — `activeSessionId` changes and the wait resolves against the wrong session (or never resolves). The demo's wait utilities take an explicit `sessionId` parameter:

```typescript
function waitForAgentComplete(
  sessionId: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Immediate abort guard — fail fast if already cancelled.
    // Without this, a wait started after cancellation hangs until timeout.
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const check = (): boolean => {
      const session = useChatStore.getState().sessions[sessionId];
      return session !== undefined && !session.isAgentRunning && !session.isStopPending;
    };
    if (check()) {
      resolve();
      return;
    }

    const unsub = useChatStore.subscribe(() => {
      if (check()) {
        clearTimeout(timer);
        unsub();
        resolve();
      }
    });

    const timer = setTimeout(() => {
      unsub();
      reject(new Error(`waitForAgentComplete timed out for ${sessionId}`));
    }, timeoutMs);

    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        unsub();
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true }
    );
  });
}
```

### Session Resolution for Waits

When `handleSend()` starts from an empty state (no active conversation), the session doesn't exist yet — `activeSessionId` is `''`. The session is created asynchronously via `conversation:create` → backend → `conversation:created` → Effect 4 in `use-chat-messages.ts`. `resolveSessionIdForWait()` bridges this gap:

```typescript
/** Resolve the effective session ID, waiting for creation if needed. */
async function resolveSessionIdForWait(timeoutMs: number, signal?: AbortSignal): Promise<string> {
  const current = useChatStore.getState().activeSessionId;
  if (current && current.length > 0) {
    return current;
  }

  // No active session — handleSend took the conversation:create path.
  // Wait for handleConversationCreated to set activeSessionId/lastCreatedSessionId.
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const timer = setTimeout(() => {
      unsub();
      reject(new Error('Timed out waiting for session creation'));
    }, timeoutMs);

    const unsub = useChatStore.subscribe((state) => {
      const sid = state.lastCreatedSessionId ?? state.activeSessionId;
      if (sid && sid.length > 0) {
        clearTimeout(timer);
        unsub();
        resolve(sid);
      }
    });

    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        unsub();
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true }
    );
  });
}
```

### Agent Start Gate

`waitForAgentComplete` checks `!isAgentRunning` — but in the new-conversation flow, `isAgentRunning` is still `false` when the session is first created. It only becomes `true` when Effect 4 fires and sends the actual `message:send`. Without a start gate, `waitForAgentComplete` would resolve **immediately** (before the agent even begins) because `!isAgentRunning` is already `true`.

```typescript
/** Wait for agent to START running — needed when send is async (new conversation flow). */
function waitForAgentStarted(
  sessionId: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const session = useChatStore.getState().sessions[sessionId];
    if (session?.isAgentRunning) {
      resolve();
      return;
    }

    const unsub = useChatStore.subscribe(() => {
      const s = useChatStore.getState().sessions[sessionId];
      if (s?.isAgentRunning) {
        clearTimeout(timer);
        unsub();
        resolve();
      }
    });

    const timer = setTimeout(() => {
      unsub();
      reject(new Error(`waitForAgentStarted timed out for ${sessionId}`));
    }, timeoutMs);

    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        unsub();
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true }
    );
  });
}
```

### `waitForAgent` Step Flow

The `waitForAgent` step handler (in `actions.ts`) combines all three utilities with a **conditional start gate**. The `waitForAgentStarted` gate is only needed when `sendMessage` just triggered an async send (new conversation flow). Without the gate, calling `waitForAgent` standalone (before any `sendMessage`, or to wait on a manually-started agent) would hang waiting for a start that already happened or never will.

```typescript
// Module-level state — set by sendMessage, consumed by waitForAgent
let lastSentSessionId: string | null = null;

// Inside sendMessage action (after step 7: deps.handleSend):
lastSentSessionId = await resolveSessionIdForWait(15_000, signal);

// Inside waitForAgent action handler:
async function handleWaitForAgent(timeout: number, signal?: AbortSignal): Promise<void> {
  const sid = lastSentSessionId ?? useChatStore.getState().activeSessionId ?? '';
  if (!sid)
    throw new Error('No session to wait on — call sendMessage first or ensure an active session');

  const session = useChatStore.getState().sessions[sid];

  if (session?.isAgentRunning) {
    // Agent is currently running — just wait for completion
    await waitForAgentComplete(sid, timeout, signal);
  } else if (lastSentSessionId === sid) {
    // We just sent a message — agent may not have started yet (async conversation:create path)
    await waitForAgentStarted(sid, 30_000, signal);
    await waitForAgentComplete(sid, timeout, signal);
  } else {
    // Standalone waitForAgent with no recent send — agent is already idle.
    // Either already completed or never started. Skip with warning.
    logger.warn('[Demo] waitForAgent: agent not running and no recent send — skipping');
  }

  // Consume after use — prevents stale session from affecting future waitForAgent steps
  lastSentSessionId = null;
}
```

**Three resolution paths:**

| Scenario                                     | `isAgentRunning`                           | `lastSentSessionId` | Behavior                                          |
| -------------------------------------------- | ------------------------------------------ | ------------------- | ------------------------------------------------- |
| **Existing session send**                    | `true` (set synchronously by `handleSend`) | matches `sid`       | Skip start gate → wait for completion             |
| **New conversation send**                    | `false` (Effect 4 hasn't fired)            | matches `sid`       | Start gate → wait for start → wait for completion |
| **Standalone wait** (no prior `sendMessage`) | varies                                     | `null`              | If running → wait; if idle → skip with warning    |

**Note**: Only the demo system will import these initially. Deduplicating the stress tests is a separate cleanup task — not in scope.

---

## Launch Video Script (`demo/scripts/launch-video.ts`)

Showcases all features in this order:

1. **Chat** — Cursor moves to input, types a prompt, clicks send, Claude streams
2. **File explorer** — Opens activity panel with files tab, opens a specific file
3. **Source control** — Switches to git panel, shows branch/staged files
4. **Terminal** — Toggles terminal open, waits for visibility
5. **Vault** — Opens vault, shows notes view, closes
6. **Browser** — Opens browser tab in activity panel
7. **Mode switching** — Cycles through Editor → Canvas → Agent tabs
8. **Agent completion** — Waits for Claude to finish, shows full response

Each act has `wait` steps between transitions so panel animations complete before the cursor moves. The script is fully customizable — you can reorder acts, change prompts, adjust timing.

---

## Usage (from DevTools console)

```javascript
// Run the pre-built launch video
const demo = await window.__orbit_debug.runLaunchDemo();

// Controls while running:
demo.pause(); // Pause after current step
demo.resume(); // Continue
demo.cancel(); // Abort + remove cursor

// With speed control (0.5 = double speed, 2 = half speed)
await window.__orbit_debug.runLaunchDemo({ speedMultiplier: 0.8 });

// Custom script
await window.__orbit_debug.runDemo({
  name: 'Quick typing demo',
  steps: [
    { action: 'showCursor' },
    { action: 'moveTo', target: '[data-demo-input]' },
    { action: 'type', text: 'Hello from the demo orchestrator!' },
    { action: 'wait', ms: 1000 },
    { action: 'hideCursor' },
  ],
});
```

---

## Implementation Order

| Step | File(s)                        | What                                                                 |
| ---- | ------------------------------ | -------------------------------------------------------------------- |
| 1    | `demo/types.ts`                | All type definitions                                                 |
| 2    | `demo/easing.ts`               | Easing functions                                                     |
| 3    | `demo/wait-utils.ts`           | Shared wait primitives                                               |
| 4    | `demo/cursor.ts`               | Virtual cursor (DOM create/destroy, moveTo, click effect, highlight) |
| 5    | `demo/typing-engine.ts`        | Character-by-character typing                                        |
| 6    | `demo/actions.ts`              | Step action dispatch                                                 |
| 7    | `demo/script-runner.ts`        | Sequential executor + pause/resume                                   |
| 8    | `demo/index.ts`                | Public API                                                           |
| 9    | `ChatInput.tsx`                | Add `data-demo-input`                                                |
| 10   | `InputControls.tsx`            | Add `data-demo-send`                                                 |
| 11   | `use-chat-messages.ts`         | Type declaration + dynamic import registration                       |
| 12   | `demo/scripts/launch-video.ts` | Full launch video choreography                                       |

---

## Known Edge Cases

| Scenario                                                | Behavior                                                                                                                                                                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **User interacts during demo**                          | Not blocked — user clicks could desynchronize cursor. Acceptable for v1; a transparent input-blocking overlay is a future enhancement.                                                                                                            |
| **Agent triggers permission request**                   | `waitForAgent` will timeout. Launch video prompts should be designed to avoid tool use (same strategy as stress tests). If permissions are needed, add `inputMode: 'accept'` prerequisite.                                                        |
| **`runLaunchDemo()` called twice**                      | Singleton runner auto-cancels the previous run before starting the new one. Cursor is destroyed and recreated. Previous `done` promise resolves with partial results.                                                                             |
| **Existing text in input**                              | `sendMessage` clears input before typing via `inputEl.textContent = ''` + `InputEvent` dispatch.                                                                                                                                                  |
| **`cancel()` mid-typing**                               | `AbortController.abort()` breaks the character loop, clears pending `setTimeout`s, and `destroyCursor()` removes DOM elements.                                                                                                                    |
| **Target element not mounted**                          | Step is skipped with `logger.warn`. Scripts should use `wait` steps after panel transitions.                                                                                                                                                      |
| **Hidden tab has matching selector**                    | `queryVisible()` filters by `display`, `visibility`, and non-zero `BoundingClientRect`. Hidden Editor tab's `ChatInput` is ignored.                                                                                                               |
| **User switches session during `waitForAgent`**         | Wait is scoped to explicit `sessionId` captured at send time — resolves correctly regardless of `activeSessionId` changes.                                                                                                                        |
| **Panel already in target state**                       | `ensurePanelOpen()` checks current state before toggling. Calling `togglePanel: 'terminal'` when terminal is already open and expanded is a no-op.                                                                                                |
| **Sidebar collapsed by width**                          | `ensurePanelOpen('sidebar')` uses `leftSidebarWidth <= SIDEBAR.collapsed` (not the stale `leftSidebarOpen` boolean) — matches `useIsLeftSidebarCollapsed` semantics.                                                                              |
| **Terminal in collapsed-header state**                  | `ensurePanelOpen('terminal')` checks `!bottomPanelOpen \|\| terminalCollapsed`. If terminal shows header-only bar, `toggleBottomPanel()` uncollapses it. Scripts that need visible terminal content are safe.                                     |
| **`waitForAgentComplete` called after cancel**          | Immediate `signal.aborted` guard at top of promise rejects with `AbortError` before setting up any subscription or timer — no hang-until-timeout.                                                                                                 |
| **Input non-empty after programmatic send**             | `clearInput()` resets DOM `textContent` + dispatches `InputEvent` so `inputText` → empty, `isInputEmpty` → true, button renders "Stop" instead of "Queue".                                                                                        |
| **Demo starts with no active conversation**             | `resolveSessionIdForWait()` waits for `lastCreatedSessionId`/`activeSessionId` after `handleSend` triggers `conversation:create`. `waitForAgentStarted()` gates `waitForAgentComplete` so it doesn't resolve prematurely before the agent begins. |
| **`waitForAgentComplete` resolves before agent starts** | `waitForAgentStarted()` inserted before `waitForAgentComplete` in the `waitForAgent` step handler. Only after `isAgentRunning` becomes `true` does the completion wait begin.                                                                     |
| **`waitForAgent` before any `sendMessage`**             | `handleWaitForAgent` uses conditional start gate: if `lastSentSessionId` is null, falls back to `activeSessionId`. If agent is running → wait for completion. If agent is idle and no recent send → skip with warning (no hang).                  |
| **`sendMessage` while agent is running**                | `handleSend` queues the message via `QueuedMessageStore`. The demo logs a warning. The next `waitForAgent` resolves for the _current_ turn, not the queued one. Scripts must use two `waitForAgent` steps to wait for both turns.                 |
| **`__orbit_debug` cleanup collision**                   | Demo keys use key-scoped `delete` in cleanup (not `= undefined`). Only `runDemo`/`runLaunchDemo` are removed, preserving keys from `use-auto-update.ts` and stress tests.                                                                         |

---

## Verification

1. `bun run typecheck` — All new types compile
2. `bun run lint` — Zero warnings (createLogger, no console.log, explicit return types)
3. `bun run build` — Production bundle does NOT include demo code (dynamic imports behind `import.meta.env.DEV`)
4. `bunx tauri dev` → DevTools console → `window.__orbit_debug.runLaunchDemo()` — Full visual test
5. Pause/resume/cancel controls work correctly
6. Cursor renders at 120fps, no jank during panel transitions
7. Calling `cancel()` mid-demo cleans up cursor and stops execution
8. Calling `runLaunchDemo()` twice doesn't create duplicate cursors
