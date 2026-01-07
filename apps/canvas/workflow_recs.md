# Workflow Mode Recommendations

This document captures architectural recommendations for the Workflow mode in Orbit Canvas.
These are **deferred** to focus on Design mode first.

---

## Current State

Workflow mode is a separate canvas mode with its own state management:

- **State:** `src/stores/workflowStore.ts` (Zustand)
- **Components:** `src/components/workflow/` (21 files)
- **Types:** `src/types/workflowTypes.ts`

The mode is toggled in `CanvasApp.tsx` and uses ReactFlow with different node types (MarkdownCards).

---

## Recommended Refactors (Future)

### 1. State Unification

**Problem:** Two state systems (`useDesignTree` for design, `workflowStore` for workflow) forces CanvasApp to be a 3000+ LOC mode-switching router.

**Recommendation:** Unify into a single graph store where Workflow nodes and Design nodes are different `NodeTypes` in the same ReactFlow instance.

**Approach:**

```typescript
// Discriminated union for clean types
type CanvasNode = DesignNode | WorkflowNode;

// Single Zustand store with selectors
const useCanvasStore = create<CanvasState>()((set, get) => ({
  nodes: Map<string, CanvasNode>,
  // ... unified actions
}));
```

**Why Zustand over Reducer:** `subscribeWithSelector` provides efficient partial updates critical for canvas performance.

---

### 2. Remove Collaboration Scaffolding

**Location:** `src/types/workflowTypes.ts`

```typescript
// These are unused - remove when refactoring
collaborators: CollaboratorInfo[]
visibility: 'private' | 'team' | 'public'
```

**Reason:** VS Code has Live Share for collaboration. Don't rebuild Google Docs.

---

### 3. Hardcoded User ID

**Locations:**

- `src/components/workflow/WorkflowCanvas.tsx:395`
- `src/components/workflow/WorkflowCanvas.tsx:445`

```typescript
createdBy: 'user', // TODO: Get actual user ID
```

**Fix:** Use `vscode.authentication` in extension host, send user info via message:

```typescript
// Extension host
const session = await vscode.authentication.getSession('github', ['user:email']);
webview.postMessage({ type: 'session-update', user: session.account.label });
```

---

### 4. Card Type Change (TODO)

**Location:** `src/components/workflow/MarkdownCardNode.tsx:760`

```typescript
// TODO: Add card type change submenu
```

**Recommendation:** Add context menu option to change card type after creation. Low priority.

---

### 5. Template Library

**Current:** Static JSON templates in card creation.

**Recommendation:** Replace with AI-driven component library. The AI generates cards based on context rather than picking from static templates.

---

### 6. Mermaid Diagrams

**Current:** Read-only rendering of Mermaid syntax in markdown.

**Recommendation:** Keep as read-only. Text-to-diagram via AI is the optimal UX. User edits the markdown source, AI updates the diagram. No need for drag-and-drop diagram editor.

---

### 7. Backend Sync Naming

**Current:** `src/hooks/useBackendSync.ts`

**Recommendation:** Rename to `useFilePersistence` to clarify intent. The "backend" is the local file system, not a cloud service.

---

### 8. Perception Integration

**Location:** `src/hooks/usePerception.ts`

**Status:** Exists but may be underutilized.

**Recommendation:** When workflow mode is enhanced, ensure the Agent Loop triggers perception constantly. The AI cannot reason about layout or accessibility without "seeing" computed bounds and ARIA trees.

---

## Files Involved in Workflow Mode

For reference, these are workflow-specific files:

```
src/stores/workflowStore.ts
src/types/workflowTypes.ts
src/hooks/useBackendSync.ts

src/components/workflow/
├── WorkflowCanvas.tsx
├── WorkflowSidebar.tsx
├── MarkdownCardNode.tsx
├── CardExpandedView.tsx
├── AIPromptPanel.tsx
├── AgentAssignmentPanel.tsx
├── CardHistoryPanel.tsx
├── ConnectionLabel.tsx
├── LineRangeSelector.tsx
├── TemplateGallery.tsx
└── ... (11 more files)
```

---

## Priority

These refactors are **deferred**. Current focus is Design mode stability and AI integration.

Revisit this document after:

1. Design mode is production-ready
2. AI agent loop is stable
3. Component library is implemented
