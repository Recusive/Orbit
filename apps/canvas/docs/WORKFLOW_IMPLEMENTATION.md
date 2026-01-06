# Workflow System Implementation

This document tracks the implementation work done on the Workflow System in orbit-canvas.

---

## Phase 1: Remove Mockup Workflow (COMPLETED)

**Problem:** WorkflowCanvas.tsx contained hardcoded demo data that interfered with real workflow functionality.

**Changes:**

- Removed hardcoded mock workflow data from `WorkflowCanvas.tsx`
- Connected canvas to Zustand workflow store
- Built and deployed to Orbit

**Files Modified:**

- `src/components/workflow/WorkflowCanvas.tsx`

---

## Phase 1A: Fix Instant Workflow Creation (COMPLETED)

**Problem:** Creating a new workflow required app reload to appear in sidebar, while delete worked immediately.

**Root Cause:**

- `workflow:created` handler only called `loadWorkflow()` (updates `activeWorkflow`)
- Did NOT update `workflowList` that sidebar subscribes to
- Delete worked because it called `removeWorkflowFromList()`

**Fix:** Updated `workflow:created` handler to also update `workflowList` with new workflow metadata.

**Files Modified:**

- `src/hooks/useBackendSync.ts`

---

## Phase 1B: Add Card/Edge Creation UI (COMPLETED)

**Problem:** No comprehensive way to add cards and edges. Only double-click worked.

**Solution:** Created floating toolbar and modal dialog for card creation.

### New Files Created:

1. **`src/components/workflow/WorkflowFloatingToolbar.tsx`**
   - Floating toolbar at bottom-center of canvas
   - "+ Add Card" button opens AddCardDialog
   - Zoom controls (zoom in, zoom out, fit view)
   - Semi-transparent, appears on hover

2. **`src/components/workflow/AddCardDialog.tsx`**
   - Modal dialog for creating new cards
   - Name input field (auto-focused)
   - Type selector with 5 visual buttons (Prompt, Response, Decision, Diagram, Code)
   - Keyboard shortcuts: 1-5 for type selection, Enter to create, Escape to close
   - Creates card at viewport center

### Files Modified:

- `src/components/workflow/WorkflowCanvas.tsx` - Added dialog state and keyboard shortcuts
- `src/CanvasApp.tsx` - Renders floating toolbar in workflow mode

### Keyboard Shortcuts:

- `Cmd+N` / `Ctrl+N`: Open Add Card dialog
- `1-5` in dialog: Quick select card type
- `Enter`: Create card
- `Escape`: Close dialog

---

## Phase 1C: Workflow-Specific Right Sidebar (COMPLETED)

**Problem:** Right sidebar was generic, not workflow-aware.

**Solution:** Created 3-tab workflow-specific right sidebar.

### New Files Created:

1. **`src/components/workflow/WorkflowRightSidebar.tsx`**
   - Main sidebar container with tab navigation
   - Three tabs: Properties, Connections, Info
   - Collapsible with expand/collapse button

2. **`src/components/workflow/CardPropertiesPanel.tsx`**
   - Card name (inline editable)
   - Type selector (can change card type)
   - Tags editor (add/remove tags)
   - Created/Updated timestamps
   - Lock toggle and Delete button
   - Shows "No card selected" when nothing selected

3. **`src/components/workflow/ConnectionsPanel.tsx`**
   - Incoming connections list
   - Outgoing connections list
   - Click connection to select on canvas
   - Edit label inline
   - Delete connection button

4. **`src/components/workflow/WorkflowInfoPanel.tsx`**
   - Workflow name and description (editable)
   - Stats: Card count, Connection count
   - Created/Last modified dates
   - Export dropdown (JSON, Markdown)
   - Snapshots section (list, create, restore)

### Files Modified:

- `src/CanvasApp.tsx` - Conditional render based on `canvasMode`

---

## Phase 1D: Bug Fixes & Improvements (COMPLETED)

### Bug Fix: AddCardDialog Create Button Not Working

**Problem:** Enter key and "Create Card" button didn't create the card.

**Root Cause:** Stale closure in keyboard event listener. The `handleCreate` callback was defined after the `useEffect` that referenced it, causing the event listener to capture an old version with empty `name` value.

**Fix:**

1. Moved `handleCreate` definition before the `useEffect` that references it
2. Updated dependency array to include `handleCreate`

**File Modified:** `src/components/workflow/AddCardDialog.tsx`

---

### Feature: Right Sidebar Collapse Button

**Problem:** No way to collapse the workflow right sidebar like the left sidebar.

**Solution:** Added collapse/expand functionality matching WorkflowSidebar pattern.

**File Modified:** `src/components/workflow/WorkflowRightSidebar.tsx`

**Changes:**

1. Added `ChevronLeftIcon` and `ChevronRightIcon` components
2. Added `isCollapsed` and `isCollapseHovered` state
3. Added `handleCollapseToggle` callback
4. Added collapsed state render (40px wide bar with expand button)
5. Added collapse button in expanded state header

---

### Bug Fix: Workflow Loading Error - `cardIds is not iterable`

**Problem:** Loading existing workflows failed with error `i.cardIds is not iterable`.

**Root Cause:** Data format mismatch between backend and frontend:

- Backend sends `cards: {}` and `connections: {}` as objects (Record<string, T>)
- Frontend expects `cardIds: []` and `connectionIds: []` as arrays

**Fix:** Added `normalizeWorkflow()` function to convert backend format to frontend format.

**File Modified:** `src/hooks/useBackendSync.ts`

```typescript
interface BackendWorkflowPayload {
  id: string;
  name: string;
  description?: string;
  tags: string[];
  cards?: Record<string, MarkdownCard>;
  connections?: Record<string, WorkflowConnection>;
  cardIds?: string[];
  connectionIds?: string[];
  // ... other fields
}

function normalizeWorkflow(payload: BackendWorkflowPayload): {
  workflow: Workflow;
  cards: MarkdownCard[];
  connections: WorkflowConnection[];
} {
  const cardsObj = payload.cards ?? {};
  const cards = Object.values(cardsObj);
  const cardIds = payload.cardIds ?? Object.keys(cardsObj);

  const connectionsObj = payload.connections ?? {};
  const connections = Object.values(connectionsObj);
  const connectionIds = payload.connectionIds ?? Object.keys(connectionsObj);

  const workflow: Workflow = {
    id: payload.id,
    name: payload.name,
    tags: payload.tags,
    cardIds,
    connectionIds,
    // ... other fields
  };

  if (payload.description !== undefined) {
    workflow.description = payload.description;
  }

  return { workflow, cards, connections };
}
```

**Handlers updated:**

- `workflow:loaded`
- `workflow:created`
- `workflow:imported`

---

## Known Issues (Deferred)

### Auto-save Failing

**Error:** `Cannot convert undefined or null to object` in WorkflowStorage.updateIndex

**Location:** Orbit backend - `src/orbit/workflow/workflowStorage.ts` line 128

**Status:** Deferred - Storage layer needs implementation work. This will be fixed as part of Phase 2 storage refactor.

---

## File Summary

### New Files (Phase 1B-1C)

| File                                                  | Purpose                               |
| ----------------------------------------------------- | ------------------------------------- |
| `src/components/workflow/WorkflowFloatingToolbar.tsx` | Floating toolbar with Add Card button |
| `src/components/workflow/AddCardDialog.tsx`           | Modal dialog for card creation        |
| `src/components/workflow/WorkflowRightSidebar.tsx`    | 3-tab workflow sidebar                |
| `src/components/workflow/CardPropertiesPanel.tsx`     | Card properties tab                   |
| `src/components/workflow/ConnectionsPanel.tsx`        | Connections tab                       |
| `src/components/workflow/WorkflowInfoPanel.tsx`       | Workflow info tab                     |

### Modified Files

| File                                         | Changes                                                  |
| -------------------------------------------- | -------------------------------------------------------- |
| `src/components/workflow/WorkflowCanvas.tsx` | Removed mock data, added dialog state                    |
| `src/hooks/useBackendSync.ts`                | Fixed instant workflow creation, added normalizeWorkflow |
| `src/CanvasApp.tsx`                          | Toolbar and conditional sidebar render                   |

---

## Future Work (Deferred)

### Phase 2+: Storage Layer Refactor

- Folder-per-workflow structure
- Markdown files for cards
- Shared card library
- See plan file for detailed architecture
