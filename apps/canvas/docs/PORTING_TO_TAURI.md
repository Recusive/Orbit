# Orbit Canvas → Orbit Tauri Porting Guide

> **Status:** Ready for Implementation
> **Last Updated:** 2025-01-05
> **Estimated Effort:** 4-6 prompts

## Overview

orbit-canvas was built for VS Code webview communication using `window.vscode.postMessage()`. To work in Orbit (Tauri), we need to replace this with Tauri's `invoke()` for commands and `listen()` for events.

## Architecture Comparison

| Aspect                    | VS Code (Current)                    | Tauri (Target)                      |
| ------------------------- | ------------------------------------ | ----------------------------------- |
| **Send to Backend**       | `window.vscode.postMessage(msg)`     | `invoke('canvas_*', args)`          |
| **Receive from Backend**  | `window.addEventListener('message')` | `listen('canvas:*', handler)`       |
| **Environment Detection** | `window.vscode` exists               | `window.__TAURI__` exists           |
| **API Location**          | `src/hooks/useOrbitMessaging.ts`     | `src/hooks/useTauriCanvas.ts` (new) |

## Available Tauri Commands (Rust Side)

The following commands already exist in `src-tauri/src/commands/canvas/lifecycle.rs`:

```rust
canvas_create_session(session_id, config?)      // Create canvas session
canvas_delete_session(session_id)               // Delete canvas session
canvas_send_message(session_id, message, state) // Send message with canvas state
canvas_interrupt(session_id)                    // Stop agent
canvas_tool_response(session_id, response)      // Respond to tool request
```

## Tauri Events (from agent-bridge)

Events emitted by the sidecar via `BridgeEvent`:

| Event                 | Payload                                  | Description                  |
| --------------------- | ---------------------------------------- | ---------------------------- |
| `canvas:message`      | `{ sessionId, message: SDKMessage }`     | Agent text/thinking/tool_use |
| `canvas:tool_request` | `{ sessionId, request: McpToolRequest }` | Tool execution request       |
| `canvas:error`        | `{ sessionId, error: string }`           | Agent error                  |

## Files to Modify

### 1. Create New Hook: `src/hooks/useTauriCanvas.ts`

Replace `useOrbitMessaging.ts` with Tauri-native communication.

### 2. Update Entry Point: `src/main.tsx`

Replace VS Code API detection with Tauri detection.

### 3. Update Protocol Types: `src/types/ipcProtocol.ts`

Align types with Rust `protocol.rs` definitions.

### 4. Update CanvasApp.tsx

Switch from `useOrbitMessaging` to `useTauriCanvas`.

### 5. Optional: Create `src/lib/canvasBackend.ts`

Typed Tauri invoke wrappers (similar to `apps/agent/src/lib/backend.ts`).

---

## Implementation Prompts

### Prompt 1: Create Canvas Backend API

**Goal:** Create typed Tauri invoke wrappers for canvas commands.

```
Create a new file: apps/canvas/src/lib/canvasBackend.ts

This file should provide typed functions that wrap Tauri invoke calls for canvas operations.

Reference the existing pattern in apps/agent/src/lib/backend.ts for how to structure invoke calls.

The available Tauri commands are defined in src-tauri/src/commands/canvas/lifecycle.rs:
- canvas_create_session(session_id: string, config?: CanvasSessionConfig)
- canvas_delete_session(session_id: string)
- canvas_send_message(session_id: string, message: string, canvas_state: CanvasState)
- canvas_interrupt(session_id: string)
- canvas_tool_response(session_id: string, response: McpToolResponse)

The types are defined in src-tauri/src/agent/protocol.rs under "Canvas Types" section:
- CanvasState: { nodes: CanvasNode[], edges: CanvasEdge[], selectedNodeId?, selectedNodeType? }
- CanvasNode: tagged union with 'sandpack' | 'page' variants
- CanvasEdge: { id, source, target, sourceHandle?, targetHandle?, data? }
- CanvasSessionConfig: { sessionId?, cwd?, model?, thinkingEnabled? }
- McpToolResponse: { requestId, success, result?, error? }

Create these functions:
1. canvasCreateSession(sessionId: string, config?: CanvasSessionConfig): Promise<void>
2. canvasDeleteSession(sessionId: string): Promise<void>
3. canvasSendMessage(sessionId: string, message: string, state: CanvasState): Promise<void>
4. canvasInterrupt(sessionId: string): Promise<void>
5. canvasToolResponse(sessionId: string, response: McpToolResponse): Promise<void>

Also export types that match the Rust definitions.
```

---

### Prompt 2: Create Tauri Canvas Hook

**Goal:** Create `useTauriCanvas.ts` to replace `useOrbitMessaging.ts`.

```
Create a new file: apps/canvas/src/hooks/useTauriCanvas.ts

This hook replaces useOrbitMessaging.ts for Tauri communication.

Study the existing hooks:
- apps/canvas/src/hooks/useOrbitMessaging.ts (current VS Code implementation)
- apps/agent/src/hooks/use-tauri.ts (reference for Tauri patterns)

The hook should:

1. Check if running in Tauri environment:
   - Use `window.__TAURI__` detection (not `window.vscode`)

2. Listen for canvas events from the backend using Tauri's listen():
   - `canvas:message` -> SDKMessage (text, thinking, tool_use, result, error)
   - `canvas:tool_request` -> McpToolRequest
   - `canvas:error` -> error string

3. Provide functions that call Tauri commands (from canvasBackend.ts):
   - sendPrompt(prompt, nodeId?) -> canvasSendMessage()
   - sendCanvasState(nodes, edges, selectedNodeId?, selectedNodeType?)
   - createSession(sessionId) -> canvasCreateSession()
   - deleteSession(sessionId) -> canvasDeleteSession()
   - sendMcpToolResponse(requestId, success, result?, error?) -> canvasToolResponse()
   - interrupt(sessionId) -> canvasInterrupt()

4. Provide callbacks for message types (matching useOrbitMessaging interface):
   - onAgentResponse(content, nodeId?, done?)
   - onAgentThinking(content)
   - onAgentToolUse(toolName, toolId, toolInput, status)
   - onAgentError(error)
   - onMcpToolRequest(request)
   - onOrchestratorState(state) - if orchestrator events added later
   - onOrchestratorError(error) - if orchestrator events added later

5. Handle environment gracefully:
   - If not in Tauri, provide mock implementations (for standalone dev)
   - Log messages in mock mode for debugging

Export interface UseTauriCanvasResult matching the API of useOrbitMessaging:
- isConnected: boolean
- sendPrompt, sendCanvasState, createSession, deleteSession, etc.
- sendMcpToolResponse, sendOrchestratorControl, etc.

Keep the interface compatible with useOrbitMessaging so minimal changes needed elsewhere.
```

---

### Prompt 3: Update Entry Point (main.tsx)

**Goal:** Replace VS Code mock API with Tauri detection.

```
Update apps/canvas/src/main.tsx to work with Tauri instead of VS Code.

Current file uses:
- window.vscode / window.acquireVsCodeApi() detection
- Mock VS Code API for standalone development

Change to:
1. Detect Tauri environment using window.__TAURI__
2. For standalone development (no Tauri), keep a mock mode that logs messages
3. Remove all VS Code API references
4. Keep the ResizeObserver error suppression (still needed)

The key changes:
- Remove setupMockVSCodeApi() entirely
- Remove window.vscode postMessage at the end
- Add isTauriEnvironment() check
- For non-Tauri (browser dev), log a message saying "Running in standalone mode"

The CanvasApp component should still render normally regardless of environment.
Event listeners will be set up by useTauriCanvas hook, not here.
```

---

### Prompt 4: Update CanvasApp to Use Tauri Hook

**Goal:** Wire up the new `useTauriCanvas` hook in the main app.

```
Update apps/canvas/src/CanvasApp.tsx to use the new useTauriCanvas hook.

Find all usages of useOrbitMessaging and replace with useTauriCanvas:

1. Import change:
   - import { useOrbitMessaging } from './hooks/useOrbitMessaging'
   + import { useTauriCanvas } from './hooks/useTauriCanvas'

2. Hook call change:
   - const { sendPrompt, sendCanvasState, ... } = useOrbitMessaging({ ... })
   + const { sendPrompt, sendCanvasState, ... } = useTauriCanvas({ ... })

The API should be compatible, so minimal code changes needed.

Also search for any other files that import useOrbitMessaging:
- src/components/AgentChatPanel.tsx
- src/hooks/useAgentChat.ts
- src/hooks/useMcpToolExecution.ts
- src/hooks/useBackendSync.ts

Update all imports to use useTauriCanvas.

Note: Keep useOrbitMessaging.ts file for now (can be deleted later after verification).
```

---

### Prompt 5: Update Protocol Types

**Goal:** Ensure TypeScript types match Rust protocol definitions.

```
Update apps/canvas/src/types/ipcProtocol.ts to ensure types match the Rust definitions.

The Rust types are in src-tauri/src/agent/protocol.rs under "Canvas Types" section.

Key types to verify/align:

1. CanvasPosition: { x: number, y: number } ✓
2. CanvasNodeType: 'sandpack' | 'page' ✓
3. CanvasNode: tagged union - verify structure matches Rust
4. CanvasEdge: verify field names match (use camelCase in TS)
5. CanvasState: { nodes, edges, selectedNodeId?, selectedNodeType? }
6. CanvasSessionConfig: { sessionId?, cwd?, model?, thinkingEnabled? }
7. McpToolRequest: { requestId, tool, args } - verify matches
8. McpToolResponse: { requestId, success, result?, error? }

Also add types for Tauri events:
- CanvasMessageEvent: { sessionId, message: SDKMessage }
- CanvasToolRequestEvent: { sessionId, request: McpToolRequest }
- CanvasErrorEvent: { sessionId, error: string }

SDKMessage type (from agent-bridge/src/canvas/types.ts):
- type: 'text' | 'thinking' | 'tool_use' | 'error' | 'result'
- content: string
- metadata?: ToolUseMetadata | ErrorMetadata | Record<string, unknown>

Ensure all types use camelCase for JSON serialization (Rust uses #[serde(rename_all = "camelCase")]).
```

---

### Prompt 6: Test and Verify Integration

**Goal:** Verify the canvas works with Tauri backend.

```
Test the canvas integration with Tauri:

1. Build the canvas:
   cd apps/canvas
   bun install   # Install dependencies
   bun run build # Build the canvas

2. Start the full Tauri app:
   cd ../..      # Back to Orbit root
   bunx tauri dev

3. Test scenarios:
   a. Canvas should load without errors
   b. Sending a message should create a session and call the agent
   c. Agent responses should appear in the chat panel
   d. Tool requests should trigger UI updates
   e. Tool responses should be sent back correctly

4. Check browser console for:
   - "[Canvas] Connected to Tauri backend" on startup
   - No errors from Tauri invoke calls
   - Events being received from backend

5. If standalone mode (no Tauri):
   - Should log "[Canvas] Running in standalone mode"
   - Mock responses for development

If issues found, check:
- Tauri command names match exactly (snake_case)
- Event names match exactly (canvas:message, etc.)
- Type serialization (camelCase vs snake_case)
```

---

## Type Mapping Reference

| Rust (protocol.rs)                               | TypeScript (ipcProtocol.ts)                    |
| ------------------------------------------------ | ---------------------------------------------- |
| `CanvasPosition { x: f64, y: f64 }`              | `CanvasPosition { x: number, y: number }`      |
| `CanvasNodeType::Sandpack`                       | `'sandpack'`                                   |
| `CanvasNodeType::Page`                           | `'page'`                                       |
| `CanvasState { nodes, edges, selected_node_id }` | `CanvasState { nodes, edges, selectedNodeId }` |
| `session_id: String`                             | `sessionId: string`                            |
| `Option<T>`                                      | `T \| undefined` (use `?`)                     |

## Event Flow Diagram

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│  Canvas UI      │       │  Tauri (Rust)   │       │  agent-bridge   │
│  (React)        │       │  Commands       │       │  (Node.js)      │
└────────┬────────┘       └────────┬────────┘       └────────┬────────┘
         │                         │                         │
         │ invoke('canvas_send_message')                     │
         │─────────────────────────>│                        │
         │                         │  BridgeRequest JSON     │
         │                         │────────────────────────>│
         │                         │                         │
         │                         │                    CanvasAgent
         │                         │                    processes...
         │                         │                         │
         │                         │  BridgeEvent JSON       │
         │                         │<────────────────────────│
         │   emit('canvas:message')│                         │
         │<────────────────────────│                         │
         │                         │                         │
    useTauriCanvas                 │                         │
    callback triggered             │                         │
         │                         │                         │
```

## Files Changed Summary

| File                             | Action | Description                          |
| -------------------------------- | ------ | ------------------------------------ |
| `src/lib/canvasBackend.ts`       | CREATE | Tauri invoke wrappers                |
| `src/hooks/useTauriCanvas.ts`    | CREATE | Tauri communication hook             |
| `src/main.tsx`                   | MODIFY | Replace VS Code with Tauri detection |
| `src/CanvasApp.tsx`              | MODIFY | Use useTauriCanvas                   |
| `src/types/ipcProtocol.ts`       | MODIFY | Align types with Rust                |
| `src/hooks/useOrbitMessaging.ts` | KEEP   | For reference, delete later          |

## Potential Issues & Solutions

1. **Tauri not detected in dev mode**
   - Solution: `bunx tauri dev` starts both Vite and Tauri together

2. **Type mismatch errors**
   - Check Rust uses `#[serde(rename_all = "camelCase")]`
   - Ensure TS types use camelCase

3. **Events not received**
   - Check event names exactly match (case-sensitive)
   - Verify `listen()` is set up before first invoke

4. **Session not found errors**
   - Ensure `canvasCreateSession` called before `canvasSendMessage`
   - Check sessionId consistency
