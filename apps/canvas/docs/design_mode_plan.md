# Design Mode Sprint Plan

Focus: Design mode stability, AI integration, and CanvasApp cleanup.
Workflow mode is frozen (see `workflow_recs.md`).

---

## Current State Assessment

### What's Working

- Design tree with undo/redo (`useDesignTree`)
- Drawing tools (rectangle, ellipse, frame, text)
- Smart guides and snapping
- Properties panel (fills, strokes, effects, typography)
- Layer tree with visibility/lock toggles
- Sandpack live preview
- Extension messaging (`useOrbitMessaging`)
- Perception system for AI visual inspection

### Pain Points

1. **CanvasApp.tsx** is 3000+ LOC - needs extraction
2. **Mode switching logic** pollutes design-only code paths
3. **Component instance system** exists in types but no UI
4. **Perception** may be underutilized by AI agent

---

## Sprint 1: CanvasApp Extraction (Design-Only)

**Goal:** Break CanvasApp into focused modules without touching workflow code.

### Tasks

#### 1.1 Extract Design-Specific Effects

Create `useDesignEffects.ts` to handle:

- Design tree → ReactFlow node sync
- Selection sync between design tree and canvas
- Auto-layout recalculation triggers

```typescript
// src/hooks/useDesignEffects.ts
export function useDesignEffects(designTree: DesignTreeState, setNodes: SetNodes): void {
  // Effect: Sync design nodes to ReactFlow
  // Effect: Sync selection state
  // Effect: Trigger auto-layout on resize
}
```

#### 1.2 Extract Canvas Event Handlers

Create `useCanvasHandlers.ts` for:

- `onNodesChange` / `onEdgesChange`
- `onNodeDragStop`
- `onSelectionChange`
- `onConnect`

```typescript
// src/hooks/useCanvasHandlers.ts
export function useCanvasHandlers(
  designTree: DesignTreeState,
  dispatch: DesignTreeDispatch
): ReactFlowHandlers;
```

#### 1.3 Extract Drawing Mode Logic

Consolidate into `useDrawingMode.ts`:

- Active tool state
- Mouse event handlers for drawing
- Preview rectangle rendering
- Shape creation on mouse up

#### 1.4 Isolate Mode Switching

Create `useCanvasMode.ts`:

- `mode: 'design' | 'workflow'`
- Mode-specific rendering logic
- Keyboard shortcut for mode toggle

This isolates workflow awareness to one hook. CanvasApp just renders based on mode.

### Deliverables

- [ ] `useDesignEffects.ts` - Design tree sync effects
- [ ] `useCanvasHandlers.ts` - ReactFlow event handlers
- [ ] `useDrawingMode.ts` - Drawing tool orchestration
- [ ] `useCanvasMode.ts` - Mode isolation
- [ ] CanvasApp.tsx reduced to <500 LOC

---

## Sprint 2: Perception Hardening

**Goal:** Make perception reliable for AI agent use.

### Tasks

#### 2.1 Audit Perception Coverage

Review `usePerception.ts` for:

- All perception request types handled
- Error cases properly caught
- Timeout handling for unresponsive previews

#### 2.2 Add Missing Perception Tools

Ensure these work reliably:

- `get_aria_snapshot` - Accessibility tree extraction
- `get_computed_styles` - CSS computed values
- `get_element_bounds` - DOMRect for elements
- `verify_component` - Check expected elements exist

#### 2.3 Perception Testing Harness

Create test utilities to verify perception:

```typescript
// For dev mode: manually trigger perception and log results
window.__testPerception = async (selector: string) => {
  const result = await perception.getElementBounds(selector);
  console.log('[Perception Test]', result);
};
```

#### 2.4 Document Perception Protocol

Add to README or create `PERCEPTION.md`:

- How AI requests perception
- Message format for requests/responses
- Error handling expectations

### Deliverables

- [ ] Perception audit report
- [ ] Missing tool implementations
- [ ] Dev testing harness
- [ ] Documentation

---

## Sprint 3: Properties Panel Polish

**Goal:** Ensure properties panel is complete and reliable.

### Tasks

#### 3.1 Audit Property Sections

Verify each section works correctly:

- [ ] Fill section (solid, gradient)
- [ ] Stroke section (width, color, style)
- [ ] Effects section (shadow, blur)
- [ ] Typography section (font, size, weight, alignment)
- [ ] Layout section (constraints, auto-layout)
- [ ] Transform section (rotation, opacity)

#### 3.2 Fix Input Edge Cases

- Number inputs: Handle empty, negative, decimal
- Color inputs: Validate hex, handle transparency
- Gradient inputs: Multiple stop support

#### 3.3 Auto-Layout Controls

Ensure auto-layout panel properly:

- Toggles auto-layout on/off
- Direction (horizontal/vertical)
- Padding and gap
- Alignment options
- Sizing modes (hug/fill/fixed)

### Deliverables

- [ ] Property section audit
- [ ] Input validation fixes
- [ ] Auto-layout control verification

---

## Sprint 4: AI Integration Points

**Goal:** Ensure AI agent can effectively manipulate design canvas.

### Tasks

#### 4.1 MCP Tool Audit

Review `useMcpToolExecution.ts` for design tools:

- `create_frame` - Create container
- `create_rectangle` / `create_ellipse` - Create shapes
- `create_text` - Create text layer
- `update_element` - Modify properties
- `delete_element` - Remove from canvas
- `select_element` - Change selection

#### 4.2 Code Generation Quality

Review `codeGenerator.ts` and `designToReact.ts`:

- Generated JSX is valid
- Tailwind classes are correct
- Component props are properly bound

#### 4.3 Canvas Context for AI

Review `aiContextBuilder.ts`:

- What context is sent to agent?
- Is selection included?
- Are design tokens sent?

#### 4.4 Bidirectional Code Sync

Verify `code-update` messages:

- Extension → Canvas code updates work
- Canvas → Extension exports work
- Error handling for invalid code

### Deliverables

- [ ] MCP tool audit and fixes
- [ ] Code generation quality check
- [ ] AI context review
- [ ] Bidirectional sync verification

---

## Sprint 5: Component Library Foundation

**Goal:** Enable AI to use component library effectively.

### Tasks

#### 5.1 Audit Existing Library

Review `componentLibrary.ts`:

- How many components defined?
- Are they categorized?
- Do they have proper metadata for AI?

#### 5.2 Component Search API

Ensure AI can query components:

```typescript
// MCP tool: search_components
searchComponents({ query: 'button', category: 'form' });
// Returns: [{ id, name, preview, props }]
```

#### 5.3 Component Insertion

Verify drag-and-drop works:

- Library → Canvas creates node
- Code preview shows component
- Props panel shows component props

#### 5.4 AI Component Suggestions

Enable AI to suggest components based on context:

- User describes need → AI searches library
- AI returns top matches with reasoning

### Deliverables

- [ ] Library audit
- [ ] Search API verification
- [ ] Insertion flow testing
- [ ] AI suggestion capability

---

## File Reference

### Core Design Mode Files

```
src/hooks/useDesignTree.ts      # Design state management
src/hooks/useDrawingTools.ts    # Drawing tool logic
src/hooks/useElementSelection.ts # Selection management
src/hooks/useSmartGuides.ts     # Alignment snapping
src/hooks/usePerception.ts      # AI visual inspection
src/hooks/useMcpToolExecution.ts # AI tool handling

src/components/properties/      # Property editing UI
src/components/DesignLeftSidebar.tsx # Layer tree
src/components/SelectionOverlay.tsx  # Multi-select UI
src/components/SmartGuidesOverlay.tsx # Alignment guides
src/components/DrawingToolsPanel.tsx  # Tool selector

src/lib/designTokens.ts         # Design system
src/lib/codeGenerator.ts        # JSX generation
src/lib/autoLayoutEngine.ts     # Flex layout
src/lib/constraintResolver.ts   # Constraint system

src/types/designNodeTypes.ts    # Design types
src/types/ipcProtocol.ts        # Message types
```

### Leave Untouched (Workflow)

```
src/stores/workflowStore.ts
src/components/workflow/*
src/types/workflowTypes.ts
src/hooks/useBackendSync.ts
```

---

## Success Criteria

After completing these sprints:

1. **CanvasApp.tsx < 500 LOC** - Clean orchestration only
2. **Perception reliable** - AI can "see" canvas consistently
3. **Properties complete** - All design properties editable
4. **AI tools working** - Agent can create/modify/delete elements
5. **Component library usable** - AI can search and insert components

---

## Notes

- Do not modify workflow-related files
- All workflow recommendations are in `workflow_recs.md`
- Focus on making design mode production-ready first
- AI integration is the priority differentiator
