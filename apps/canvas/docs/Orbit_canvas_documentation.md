# Orbit Canvas Documentation

> **AI-Native Visual Design for the Universal Development Environment**

Orbit Canvas is an infinite workspace where ideas become interfaces through natural conversation. Built for visual thinkers who describe what they want and watch designs evolve in real-time.

---

## Table of Contents

1. [Introduction](#introduction)
2. [Core Philosophy](#core-philosophy)
3. [Architecture Overview](#architecture-overview)
4. [Features](#features)
5. [Input Modalities](#input-modalities)
6. [Canvas Modes](#canvas-modes)
7. [Integration with Orbit IDE](#integration-with-orbit-ide)
8. [Technical Implementation](#technical-implementation)
9. [Quick Start Guide](#quick-start-guide)
10. [Prompting Guide](#prompting-guide)
11. [Roadmap](#roadmap)
12. [Appendix A: Glossary](#appendix-a-glossary)
13. [Appendix B: Keyboard Shortcuts](#appendix-b-keyboard-shortcuts)

---

## Introduction

### What is Orbit Canvas?

Orbit Canvas is the visual design layer of Orbit's Universal Development Environment (UDE). Unlike traditional design tools that require manual manipulation or code editors that demand syntax knowledge, Canvas lets you **describe what you want** and **watch it materialize**.

```
Thought → Description → Design → Code → Files
```

All in one continuous flow, without context switching.

### Who is it for?

**Vibe Coders** — Visual thinkers who:

- Reason spatially and need to see ideas take shape
- Want to describe intent rather than write implementation
- Iterate through conversation, not code edits
- Value speed of expression over technical precision

### What Makes Canvas Different?

| Traditional Tools   | Orbit Canvas                             |
| ------------------- | ---------------------------------------- |
| Design OR code      | Design AND code unified                  |
| Manual manipulation | Conversational iteration                 |
| ZIP downloads       | Direct file tree export                  |
| Standalone apps     | Embedded in your IDE                     |
| Text-only context   | Visual context reduces AI hallucinations |

---

## Core Philosophy

### 1. Visual Context Reduces Hallucinations

When AI can see what exists on your canvas—nodes, connections, layouts, styles—it generates more accurate code. The visual state serves as grounding truth that text-only prompts lack.

### 2. Describe, Don't Implement

You shouldn't need to know React to build a React component. Describe the experience you want. Canvas handles the translation.

### 3. Watch It Evolve

Design isn't a single action—it's iteration. Canvas renders changes as AI processes them, letting you course-correct in real-time rather than waiting for batch results.

### 4. Your Files, Your Project

Unlike web-based design tools that live in their own ecosystem, Canvas writes directly to your project's file tree. No export step. No copy-paste. The component you design IS the component in your codebase.

---

## Architecture Overview

### System Context

```
┌─────────────────────────────────────────────────────────────────┐
│                        Orbit UDE (VS Code Fork)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │   Ask    │  │  Agent   │  │  Canvas  │  │ Browser  │        │
│  │  (Chat)  │  │  (Code)  │  │ (Design) │  │  (Test)  │        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
│       │             │             │             │               │
│       └─────────────┼─────────────┼─────────────┘               │
│                     │             │                              │
│              ┌──────┴─────────────┴──────┐                      │
│              │     Extension Host        │                      │
│              │   (Context Orchestration) │                      │
│              └──────────────┬────────────┘                      │
│                             │                                    │
│              ┌──────────────┴────────────┐                      │
│              │   VS Code APIs            │                      │
│              │ • Filesystem              │                      │
│              │ • Terminals               │                      │
│              │ • Language Services       │                      │
│              └───────────────────────────┘                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Canvas ↔ Extension Communication

Canvas operates as a webview that communicates with the extension host via typed message protocols:

**Canvas → Extension:**

```typescript
interface CanvasToExtension {
  type: 'canvas-state';
  nodes: CanvasNode[];
  edges: Edge[];
  selectedNodeId: string | null;
}

interface ExportRequest {
  type: 'export-component';
  code: string;
  filename: string;
}
```

**Extension → Canvas:**

```typescript
interface McpToolRequest {
  type: 'mcp-tool-request';
  tool: 'create-node' | 'update-node' | 'delete-node' | 'move-node';
  params: ToolParams;
}

interface ExportResult {
  type: 'export-result';
  success: boolean;
  path?: string;
}
```

### MCP Tool System

Canvas exposes tools to AI agents via the Model Context Protocol:

| Tool               | Purpose                            |
| ------------------ | ---------------------------------- |
| `create-node`      | Add new design element to canvas   |
| `update-node`      | Modify existing element properties |
| `delete-node`      | Remove element from canvas         |
| `move-node`        | Reposition element                 |
| `code-update`      | Update code for selected node      |
| `get-canvas-state` | Read current canvas context        |

---

## Features

### Current Capabilities

#### Infinite Canvas

- Pan, zoom, navigate with ReactFlow
- Multiple design elements coexist
- Spatial organization of components

#### Design Primitives (via Drawing Tools)

- Shapes: rectangles, circles, lines
- Text elements
- Freeform sketching
- Smart guides for alignment

#### Live Code Preview

- Real-time React component rendering via Sandpack
- Hot reload as code changes
- Visual output synchronized with code

#### AI-Powered Generation

- Natural language → React components
- MCP tools for canvas manipulation (create, update, move, delete)
- Perception tools let AI "see" what's rendered
- Context-aware: AI sees canvas state, not just text

#### Direct File Export

- Components export directly to project file tree
- No ZIP downloads or copy-paste
- Writes `.tsx` files ready to import

### Planned Capabilities

| Feature             | Status      | Description                            |
| ------------------- | ----------- | -------------------------------------- |
| Voice Input         | Planned     | Speak your design intent               |
| Web Capture         | Planned     | Capture elements from embedded browser |
| Theme System        | Partial     | `designTokens.ts` exists               |
| Component Libraries | Partial     | `componentLibrary.ts` exists           |
| Visual Editing      | In Progress | Direct manipulation editing            |
| Animation Support   | Planned     | Define transitions and motion          |

---

## Input Modalities

### Text Description (Current)

The primary input method. Describe what you want in natural language.

**Examples:**

```
"Create a card component with an image, title, and description"

"Add a navigation bar with logo on left, links in center, and CTA button on right"

"Make this look more modern - increase whitespace and use a sans-serif font"
```

### Sketch/Drawing → Code (Current)

Use drawing tools to sketch rough layouts, then let AI interpret and generate code.

**Workflow:**

1. Select drawing tool from toolbar
2. Sketch wireframe or rough layout
3. Add text labels to indicate element purposes
4. Prompt: "Turn this sketch into a React component"
5. AI interprets spatial relationships and generates code

**ReactFlow Implementation Notes:**

Since Canvas uses ReactFlow, sketch-to-code involves:

```typescript
// Drawing tools create temporary overlay elements
interface DrawingState {
  tool: 'rectangle' | 'ellipse' | 'line' | 'freehand' | 'text';
  elements: DrawingElement[];
  isDrawing: boolean;
}

// On "generate", drawing elements are analyzed
interface SketchAnalysis {
  // Bounding boxes of drawn shapes
  regions: BoundingBox[];

  // Text labels and their positions
  labels: { text: string; position: Point }[];

  // Inferred hierarchy from spatial relationships
  hierarchy: HierarchyNode[];
}

// AI receives analysis + visual screenshot
// Generates ReactFlow nodes + code
```

**Best Practices:**

- Label important elements ("nav", "hero", "footer")
- Use rectangles for containers, circles for icons/avatars
- Spatial hierarchy matters: larger outer shapes = parent containers
- Don't worry about pixel perfection—AI infers intent

### Screenshot Upload → Recreate (Current)

Upload an image of existing UI to recreate or use as inspiration.

**Use Cases:**

1. **Exact recreation**: "Recreate this exactly in React"
2. **Inspired variation**: "Make something like this but with our brand colors"
3. **Component extraction**: "Create just the card component from this screenshot"
4. **Style reference**: "Use this screenshot as style inspiration for the dashboard"

**How it works:**

1. Upload image to canvas (drag-drop or file picker)
2. Reference in prompt: "Make a component that looks like this image"
3. AI analyzes visual structure, spacing, colors
4. Generates equivalent React code

### Web Capture (Planned)

Capture elements directly from the embedded Browser tab.

**Planned Workflow:**

1. Navigate to target page in Browser tab
2. Enter "capture mode"
3. Click element to capture
4. Element appears on Canvas as editable component
5. Modify via conversation or visual editing

**Advantages over Chrome Extension:**

- No separate installation
- Works within IDE context
- Captured elements have immediate access to project context

### Voice Input (Future)

Speak design intent naturally.

**Envisioned Experience:**

```
User: "Add a header with our logo and three navigation links"
[Canvas updates in real-time]

User: "Make the logo bigger and move it to the center"
[Canvas animates changes]

User: "Actually, put it back on the left"
[Canvas reverts]
```

**Technical Requirements:**

- Speech-to-text integration
- Real-time streaming to AI
- Disambiguation for spatial references ("this", "that", "here")

---

## Canvas Modes

### Design Mode

Primary mode for visual creation and manipulation.

**Capabilities:**

- Create and edit design primitives (rectangles, text, shapes)
- Arrange elements spatially on infinite canvas
- Apply styles and properties via property panel
- Sketch wireframes with drawing tools
- View live component previews via Sandpack

**When to use:**

- Starting new components from scratch
- Visual exploration and iteration
- Sketching rough ideas before code generation
- Arranging layout structure

### Code Mode

Live React code synchronized with canvas elements.

**Capabilities:**

- Real-time React component rendering via Sandpack
- Hot reload as code changes
- Syntax highlighting in preview
- Direct code editing in SandpackNode

**Integration:**

- Select element on canvas → corresponding code highlighted
- AI updates code → canvas preview updates instantly
- Export button writes `.tsx` directly to project file tree
- No ZIP downloads—components go straight into your codebase

---

## Integration with Orbit IDE

### Architecture Overview

Canvas operates as a webview within the Orbit IDE (VS Code fork), communicating through the Extension Host:

```
┌─────────────────────────────────────────────────────────────┐
│                    Orbit IDE (VS Code Fork)                  │
│                     Extension Host (C++)                     │
├─────────────────────────────────────────────────────────────┤
│  ▲                                                       ▲  │
│  │ postMessage                               postMessage │  │
│  │ (typed protocol)                     (typed protocol) │  │
└──┼───────────────────────────────────────────────────────┼──┘
   │                                                       │
   ▼                                                       ▼
┌──────────────────────┐                 ┌──────────────────────┐
│    Orbit Canvas      │                 │     Orbit Agent      │
│    (Webview 1)       │                 │     (Webview 2)      │
├──────────────────────┤                 ├──────────────────────┤
│ ReactFlow Canvas     │                 │ Chat Interface       │
│ Design/Code Modes    │                 │ Terminal             │
│ + Floating AI Chat   │                 │ File Explorer        │
│ + Sandpack Preview   │                 │ Browser Panel        │
└──────────────────────┘                 └──────────────────────┘
```

### How Agent-Generated UI Appears on Canvas

The MCP (Model Context Protocol) tool system enables bidirectional AI ↔ Canvas communication:

1. **Canvas → Agent**: Canvas sends state (nodes, edges, selection) via `canvas-state` message
2. **Agent → Canvas**: Agent sends `mcp-tool-request` to create/update/move nodes
3. **Canvas Execution**: `useMcpToolExecution()` hook dispatches to appropriate handler
4. **Response**: Canvas sends `mcp-tool-response` back with results

```typescript
// Example: AI creates a component on canvas
{ type: 'mcp-tool-request', tool: 'create_component', params: { name: 'Button', code: '...' } }

// Canvas executes and responds
{ type: 'mcp-tool-response', toolId: '123', success: true, result: { nodeId: 'node-456' } }
```

### Context Flow

Unlike standalone design tools, Canvas has full project context:

| Context Source   | What Canvas Sees                                |
| ---------------- | ----------------------------------------------- |
| Canvas State     | Nodes, edges, selection, layout                 |
| File System      | Project structure, existing components          |
| Agent Chat       | Conversation history, user intent               |
| Perception Tools | ARIA snapshots, computed styles, element bounds |

**Perception Tools** let AI "see" what's rendered:

- `get_aria_snapshot` - Accessibility tree for semantic understanding
- `get_computed_styles` - Actual CSS applied to elements
- `get_element_bounds` - Precise positioning information
- `verify_component` - Check if component matches expectations

### Canvas → Files (Direct Export)

No ZIP downloads. Components write directly to your project:

```typescript
// Canvas sends export request
{ type: 'export-component', code: '...', filename: 'Button.tsx' }

// Extension writes via VS Code API, responds with path
{ type: 'export-result', success: true, path: '/src/components/Button.tsx' }
```

### Browser Tab (In Orbit Agent)

The Browser panel lives in Orbit Agent (not Canvas), providing:

- Embedded browser for testing
- Navigation state management
- Hot reload when files change

**Note:** Orbit's browser is currently for testing, not element capture. Web capture is a planned feature.

---

## Technical Implementation

### Core Stack

| Layer            | Technology                                          |
| ---------------- | --------------------------------------------------- |
| Canvas Rendering | @xyflow/react (ReactFlow)                           |
| Drawing Tools    | Custom hooks (`useDrawingTools.ts`)                 |
| Code Preview     | Sandpack (`@codesandbox/sandpack-react`)            |
| State Management | Zustand stores                                      |
| UI Primitives    | Radix UI                                            |
| Communication    | postMessage with typed protocols (`ipcProtocol.ts`) |
| Code Generation  | `codeGenerator.ts`, `htmlRenderer.ts`               |

### Node Types

```typescript
// Canvas node types in ReactFlow
type CanvasNodeType =
  | 'sandpack' // Live code preview with Sandpack
  | 'page' // Page-level container
  | 'design-canvas'; // Design primitives (shapes, text)

interface CanvasNode {
  id: string;
  type: CanvasNodeType;
  position: { x: number; y: number };
  data: {
    code?: string; // React code for sandpack nodes
    styles?: CSSProperties; // Applied styles
    children?: DesignObject[]; // For design-canvas nodes
  };
}
```

**Key Components:**

- `SandpackNode.tsx` - Renders live React components with hot reload
- `PageNode.tsx` - Container for page-level composition
- `DesignCanvasNode.tsx` - Design primitives

### Rendering Pipeline

```
User Input (text/sketch/image)
         │
         ▼
┌─────────────────┐
│   AI Processing │
│   (Generate     │
│    React code)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Code Generator │
│  (codeGenerator │
│   .ts)          │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Canvas Render  │
│  (ReactFlow     │
│   Node)         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Live Preview   │
│  (Component     │
│   rendered)     │
└─────────────────┘
```

### Visual Editing

Moving toward direct canvas manipulation:

```typescript
interface VisualEditingState {
  // Currently selected element
  selectedElement: string | null;

  // Edit mode (select, resize, move, text)
  editMode: EditMode;

  // Property panel bindings
  boundProperties: PropertyBinding[];
}

interface PropertyBinding {
  property: 'width' | 'height' | 'color' | 'text' | 'spacing';
  source: 'direct' | 'computed' | 'theme';
  value: any;
  onUpdate: (newValue: any) => void;
}
```

**Editing Capabilities:**

- Click to select elements
- Drag handles to resize
- Direct text editing (double-click)
- Property panel for precise values
- Style inheritance from themes

---

## Quick Start Guide

### 1. Open Canvas

Navigate to the Canvas tab in Orbit's sidebar.

### 2. Create Your First Component

Double-click on empty canvas space to create a new frame.

Type in the chat panel:

```
Create a user profile card with avatar, name, title, and a follow button
```

### 3. Watch It Generate

The AI processes your request and renders the component live on canvas.

### 4. Iterate

Continue the conversation:

```
Make the avatar circular and add a subtle shadow to the card
```

### 5. Edit Visually

Double-click the component to enter edit mode:

- Click text to edit directly
- Drag elements to reposition
- Use property panel for precise control

### 6. Export

Click "Export" or use keyboard shortcut:

- Choose destination in project file tree
- Component is written as `.tsx` file
- Import and use immediately

---

## Prompting Guide

### General Principles

1. **Be Specific**: More detail = better results
2. **Use Visual References**: Attach screenshots when possible
3. **Iterate in Steps**: Break complex designs into stages
4. **Name Things**: "the blue button" is clearer than "that button"

### Effective Prompt Patterns

**Starting a new component:**

```
Create a [component type] with [list of elements].
It should [describe behavior/style].
```

Example:

```
Create a pricing card with a plan name, price, feature list, and CTA button.
It should have a highlighted "popular" variant with a badge.
```

**Iterating on existing:**

```
[Change type] the [specific element] to [desired state].
```

Examples:

```
Change the background color to a light gradient
Make the button larger and more prominent
Add a hover effect to the card
```

**Using references:**

```
Make this look like [reference] but with [modifications]
```

Example:

```
Make this look like the Stripe pricing page but with our purple brand color
```

### What to Avoid

| Don't            | Do Instead                                                 |
| ---------------- | ---------------------------------------------------------- |
| "Make it better" | "Increase contrast and add more whitespace"                |
| "Fix the layout" | "Align the cards to a 3-column grid"                       |
| "Add some style" | "Use Inter font, rounded corners, and subtle shadows"      |
| "Make it pop"    | "Increase the button size and use a brighter accent color" |

### Working with Sketches

When using sketch-to-code:

1. Draw rough shapes for major areas
2. Add text labels: "nav", "hero", "features", etc.
3. Prompt: "Turn this wireframe into a landing page component"
4. Iterate: "Make the hero section taller"

### Working with Screenshots

When uploading references:

1. Describe what you want: recreation vs. inspiration
2. Specify modifications upfront
3. Reference specific parts: "Use just the nav style from this"

---

## Roadmap

### Phase 1: Foundation (Current)

- [x] ReactFlow-based infinite canvas
- [x] Drawing tools for sketching (`useDrawingTools.ts`)
- [x] AI-powered code generation via MCP tools
- [x] Live component preview with Sandpack
- [x] Direct file export to project tree
- [x] Typed IPC protocol (`ipcProtocol.ts`)
- [x] Perception tools (ARIA, styles, bounds)
- [ ] Visual editing (in progress)

### Phase 2: Enhanced Input

- [ ] Screenshot recreation with modifications
- [ ] Web capture from embedded browser
- [ ] Improved sketch interpretation
- [ ] Voice input integration

### Phase 3: Intelligence

- [ ] Sub-agent architecture (see `subagent_orchestrator.md`)
- [ ] Theme system with design tokens
- [ ] Component library integration
- [ ] Context-aware suggestions

### Phase 4: Collaboration

- [ ] Real-time multi-user canvas
- [ ] Comment and feedback system
- [ ] Version history
- [ ] Shared component libraries

---

## Appendix A: Glossary

| Term                  | Definition                                                              |
| --------------------- | ----------------------------------------------------------------------- |
| **Canvas**            | Infinite workspace for visual design (ReactFlow-based)                  |
| **Node**              | Individual element on canvas (SandpackNode, PageNode, DesignCanvasNode) |
| **Sandpack**          | CodeSandbox's in-browser React runtime for live preview                 |
| **MCP**               | Model Context Protocol - typed interface for AI ↔ Canvas tool calls     |
| **Perception Tools**  | AI tools that inspect rendered output (ARIA, styles, bounds)            |
| **Hot Reload**        | Instant update of preview when code changes                             |
| **postMessage**       | IPC mechanism between webview and extension host                        |
| **Extension Host**    | VS Code's backend that coordinates webviews and filesystem              |
| **Design Primitives** | Basic shapes (rectangles, text, lines) for sketching                    |

---

## Appendix B: Keyboard Shortcuts

| Action            | Shortcut             |
| ----------------- | -------------------- |
| Pan canvas        | Space + drag         |
| Zoom in           | Cmd/Ctrl + =         |
| Zoom out          | Cmd/Ctrl + -         |
| Fit to view       | Cmd/Ctrl + 0         |
| New frame         | Double-click         |
| Delete            | Backspace/Delete     |
| Undo              | Cmd/Ctrl + Z         |
| Redo              | Cmd/Ctrl + Shift + Z |
| Export            | Cmd/Ctrl + E         |
| Toggle code panel | Cmd/Ctrl + .         |

---

_Last updated: December 25, 2025_
_Version: 0.2.0_
