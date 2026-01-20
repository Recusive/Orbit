# Canvas UI Builder - Implementation Guide

> **Created:** January 2025
> **Status:** Planning / Implementation Guide
> **Purpose:** Step-by-step prompts for building the Canvas UI Builder with ~/.orbit component library

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Directory Structure](#directory-structure)
3. [Architecture Diagrams](#architecture-diagrams)
4. [Implementation Prompts](#implementation-prompts)
   - [Phase 0: Cleanup](#phase-0-cleanup-current-direct-approach)
   - [Phase 1: Foundation](#phase-1-foundation---orbit-directory-setup)
   - [Phase 2: Registry Download](#phase-2-registry-download)
   - [Phase 3: Preview System](#phase-3-preview-system-setup)
   - [Phase 4: Component Loading](#phase-4-component-loading)
   - [Phase 5: Live Editing](#phase-5-live-editing)
   - [Phase 6: Save System](#phase-6-save-system)
   - [Phase 7: Custom Download](#phase-7-custom-component-download)
5. [Summary](#summary)

---

## System Overview

Canvas UI Builder is a visual design tool that:

1. **On first app launch**: Creates a `~/.orbit/canvas` folder and downloads the full shadcn component registry
2. **For custom components**: Users can download them manually or ask the agent
3. **Preview & Edit**: User can preview components and make live CSS/prop changes
4. **Save options**: Save as new custom component OR update base component OR export to project

### Key Principles

- Components are stored locally in `~/.orbit/canvas/components/`
- Preview runs via a local Vite dev server (port 5199)
- Changes are live via postMessage communication
- User's own browser/dev server is NOT required

---

## Directory Structure

```
~/.orbit/
└── canvas/
    ├── components/
    │   ├── ui/                      # Base shadcn/ui components (downloaded)
    │   │   ├── button.tsx
    │   │   ├── card.tsx
    │   │   ├── dialog.tsx
    │   │   ├── input.tsx
    │   │   ├── select.tsx
    │   │   ├── switch.tsx
    │   │   ├── textarea.tsx
    │   │   ├── tooltip.tsx
    │   │   └── ... (40+ components)
    │   │
    │   ├── blocks/                  # shadcn blocks (downloaded)
    │   │   ├── authentication/
    │   │   │   ├── login-01.tsx
    │   │   │   └── login-02.tsx
    │   │   ├── dashboard/
    │   │   │   └── ...
    │   │   └── ...
    │   │
    │   └── custom/                  # User's saved customizations
    │       ├── my-primary-button.tsx
    │       ├── dark-card.tsx
    │       └── ...
    │
    ├── lib/
    │   └── utils.ts                 # cn() helper function
    │
    ├── styles/
    │   ├── globals.css              # Base Tailwind + CSS variables
    │   └── themes/                  # Saved theme configurations
    │       ├── default.json
    │       └── user-dark.json
    │
    ├── preview/                     # Vite preview server
    │   ├── package.json
    │   ├── vite.config.ts
    │   ├── index.html
    │   ├── tailwind.config.ts
    │   └── src/
    │       ├── main.tsx
    │       ├── Preview.tsx          # Dynamic component renderer
    │       └── globals.css
    │
    └── registry.json                # Component metadata
```

---

## Architecture Diagrams

### First Launch Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────────────┐
│  App Launch  │────▶│ Check ~/.orbit│────▶│ Exists?                  │
└──────────────┘     └──────────────┘     └──────────────────────────┘
                                                    │
                           ┌────────────────────────┴────────────────┐
                           ▼                                         ▼
                    ┌─────────────┐                          ┌─────────────┐
                    │   NO        │                          │   YES       │
                    │ Show Setup  │                          │ Load Canvas │
                    │ Wizard      │                          │             │
                    └──────┬──────┘                          └─────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     DOWNLOAD WIZARD                                  │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  "Setting up Orbit Canvas..."                                 │  │
│  │                                                               │  │
│  │  ████████████████░░░░░░░░░░░░░░░░  45%                       │  │
│  │                                                               │  │
│  │  ✓ Created ~/.orbit directory                                │  │
│  │  ✓ Downloaded 42 UI components                               │  │
│  │  ◐ Downloading blocks (23/67)...                             │  │
│  │  ○ Setting up preview system                                 │  │
│  │  ○ Installing dependencies                                   │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Preview Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│  Canvas UI (Tauri Window)                                           │
│                                                                     │
│  ┌─────────────┐    ┌──────────────────────────┐    ┌───────────┐  │
│  │ Components  │    │     Preview Panel        │    │ Inspector │  │
│  │             │    │  ┌────────────────────┐  │    │           │  │
│  │ [button]    │    │  │                    │  │    │ Props     │  │
│  │ [card]      │───▶│  │  <webview>         │  │◀───│ Styles    │  │
│  │ [dialog]    │    │  │  localhost:5199    │  │    │ Variants  │  │
│  │             │    │  │                    │  │    │           │  │
│  └─────────────┘    │  └────────────────────┘  │    └───────────┘  │
│                     └──────────────────────────┘                    │
└────────────────────────────────────────────────────────────────────┘
                                   │
                                   │ Tauri spawns & manages
                                   ▼
┌────────────────────────────────────────────────────────────────────┐
│  Preview Server (Vite - Background Process)                         │
│  Running at: http://localhost:5199                                  │
│                                                                     │
│  ~/.orbit/canvas/preview/                                           │
│  ├── src/Preview.tsx    ◀── Dynamically imports selected component │
│  └── vite.config.ts     ◀── Aliases point to ~/.orbit/components/  │
└────────────────────────────────────────────────────────────────────┘
                                   │
                                   │ Imports from
                                   ▼
┌────────────────────────────────────────────────────────────────────┐
│  ~/.orbit/canvas/components/                                        │
│  ├── ui/button.tsx                                                  │
│  ├── ui/card.tsx                                                    │
│  └── custom/my-button.tsx                                           │
└────────────────────────────────────────────────────────────────────┘
```

### Edit & Save Flow

```
User selects "Button" from sidebar
            │
            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  1. LOAD COMPONENT                                                   │
│                                                                      │
│  Canvas reads: ~/.orbit/canvas/components/ui/button.tsx              │
│  Parses AST to extract: props, variants, className, styles           │
│  Sends to preview: postMessage({ type: 'preview:load', ... })        │
└─────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  2. USER EDITS IN INSPECTOR                                          │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Properties Panel                                            │    │
│  │                                                              │    │
│  │  variant:  [default] [destructive] [outline] [ghost]        │    │
│  │  size:     [sm] [default] [lg]                              │    │
│  │                                                              │    │
│  │  ─────────────── Custom Styles ───────────────              │    │
│  │  background:    [#3b82f6]  ████                             │    │
│  │  padding:       [12px]    ━━━━━━━●━━━                       │    │
│  │  border-radius: [8px]     ━━━━●━━━━━━                       │    │
│  │  font-weight:   [600]     ━━━━━━●━━━                        │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Each change → postMessage to preview → instant update               │
└─────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  3. SAVE OPTIONS                                                     │
│                                                                      │
│  User clicks "Save" button → Modal appears:                          │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    Save Component                            │    │
│  │                                                              │    │
│  │  ○ Save as new custom component                             │    │
│  │    Name: [my-primary-button    ]                            │    │
│  │    → Saves to: ~/.orbit/canvas/components/custom/           │    │
│  │                                                              │    │
│  │  ○ Update base component                                    │    │
│  │    ⚠️  This will modify the original button.tsx             │    │
│  │    → Saves to: ~/.orbit/canvas/components/ui/               │    │
│  │                                                              │    │
│  │  ○ Export to project                                        │    │
│  │    Path: [/Users/dev/my-app/src/components/ui/]            │    │
│  │    → Copies component to user's project                     │    │
│  │                                                              │    │
│  │                      [Cancel]  [Save]                       │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### Full System Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ORBIT CANVAS SYSTEM                                │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌───────────────────┐
                              │    App Launch     │
                              └─────────┬─────────┘
                                        │
                                        ▼
                              ┌───────────────────┐
                              │ Check ~/.orbit/   │
                              │ canvas exists?    │
                              └─────────┬─────────┘
                                        │
                    ┌───────────────────┴───────────────────┐
                    ▼                                       ▼
            ┌───────────────┐                       ┌───────────────┐
            │     NO        │                       │     YES       │
            │ Run Setup     │                       │ Load Canvas   │
            └───────┬───────┘                       └───────┬───────┘
                    │                                       │
                    ▼                                       │
            ┌───────────────┐                               │
            │ Download      │                               │
            │ shadcn        │                               │
            │ Registry      │                               │
            └───────┬───────┘                               │
                    │                                       │
                    ▼                                       │
            ┌───────────────┐                               │
            │ Setup Preview │                               │
            │ Server        │                               │
            └───────┬───────┘                               │
                    │                                       │
                    └───────────────────┬───────────────────┘
                                        │
                                        ▼
                              ┌───────────────────┐
                              │ Start Preview     │
                              │ Server (Vite)     │
                              │ Port 5199         │
                              └─────────┬─────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CANVAS UI                                         │
│                                                                              │
│  ┌────────────────┐  ┌─────────────────────────┐  ┌───────────────────────┐ │
│  │   Sidebar      │  │      Preview Panel      │  │     Inspector         │ │
│  │                │  │                         │  │                       │ │
│  │ ┌────────────┐ │  │  ┌───────────────────┐  │  │  Props                │ │
│  │ │ UI         │ │  │  │                   │  │  │  ├─ variant           │ │
│  │ │ ├─ button  │─┼──┼─▶│    <webview>      │◀─┼──┼──├─ size              │ │
│  │ │ ├─ card    │ │  │  │    localhost:5199 │  │  │  └─ disabled          │ │
│  │ │ └─ dialog  │ │  │  │                   │  │  │                       │ │
│  │ └────────────┘ │  │  └───────────────────┘  │  │  Styles               │ │
│  │                │  │                         │  │  ├─ background         │ │
│  │ ┌────────────┐ │  │  ┌───────────────────┐  │  │  ├─ padding           │ │
│  │ │ Blocks     │ │  │  │  [Save] [Export]  │  │  │  └─ border-radius     │ │
│  │ │ ├─ login   │ │  │  │  [Reset]          │  │  │                       │ │
│  │ │ └─ dash    │ │  │  └───────────────────┘  │  │  [Save Changes]       │ │
│  │ └────────────┘ │  │                         │  │                       │ │
│  │                │  │                         │  │                       │ │
│  │ ┌────────────┐ │  │                         │  │                       │ │
│  │ │ Custom     │ │  │                         │  │                       │ │
│  │ │ └─ my-btn  │ │  │                         │  │                       │ │
│  │ └────────────┘ │  │                         │  │                       │ │
│  │                │  │                         │  │                       │ │
│  │ [+ Download]  │  │                         │  │                       │ │
│  └────────────────┘  └─────────────────────────┘  └───────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │ File Operations
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  ~/.orbit/canvas/                                                            │
│                                                                              │
│  components/                                                                 │
│  ├── ui/           ◀── Base shadcn components                               │
│  ├── blocks/       ◀── shadcn blocks                                        │
│  └── custom/       ◀── User's saved customizations                          │
│                                                                              │
│  preview/          ◀── Vite preview server                                  │
│  registry.json     ◀── Component metadata                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Prompts

---

## Phase 0: Cleanup Current Direct Approach

### Prompt 0.1: Remove DirectPreview Code

```markdown
# Task: Clean up Canvas UI Builder - Remove Direct Preview Code

## Context

We're rebuilding the Canvas preview system to load components from `~/.orbit/canvas/`
instead of bundling them directly. The current DirectPreview approach needs to be
removed, but we want to KEEP the sidebar UI structure and properties panel.

## What to REMOVE

### Files to DELETE:

- `apps/Canvas-UI-Builder/src/components/layout/canvas-preview/DirectPreview.tsx`
- `apps/Canvas-UI-Builder/src/components/layout/canvas-preview/ComponentPreview.tsx`
- `apps/Canvas-UI-Builder/src/components/ui/` (entire folder - button.tsx, input.tsx, etc.)
- `apps/Canvas-UI-Builder/src/registry/` (if exists)

### Code to REMOVE:

- In `CanvasRootLayout.tsx`: Remove the `<ComponentPreview>` usage
- Replace with a placeholder div that says "Preview will connect to ~/.orbit"
- Remove any imports from `@canvas/components/ui/*`

## What to KEEP (DO NOT MODIFY these files)

- `CanvasLeftSidebar.tsx` - Keep entire sidebar structure, tabs, component list UI
- `CanvasRightSidebar.tsx` - Keep entire inspector structure
- `PropertiesPanel.tsx` - Keep the CSS editor UI
- `CanvasInputArea.tsx` - Keep as is
- `css-customization-store.ts` - Keep as is
- `design-tokens-store.ts` - Keep as is
- All resize handles and layout components

## Expected Result

After cleanup:

1. Canvas tab loads without errors
2. Left sidebar shows (with static placeholder component list)
3. Right sidebar shows with properties panel
4. Center area shows placeholder text: "Preview will load from ~/.orbit/canvas"
5. No TypeScript errors
6. Lint passes

## Steps

1. Delete the files listed above
2. Update CanvasRootLayout.tsx to remove ComponentPreview
3. Update any barrel exports (index.ts files) that reference deleted files
4. Run `bun run typecheck` and `bun run lint` to verify
5. List all files that were deleted and modified
```

---

## Phase 1: Foundation - Orbit Directory Setup

### Prompt 1.1: Rust Commands for Directory Management

```markdown
# Task: Create Rust commands for ~/.orbit/canvas directory management

## Context

Canvas UI Builder needs to store downloaded shadcn components in `~/.orbit/canvas/`.
We need Rust commands to manage this directory structure.

## Directory Structure to Support
```

~/.orbit/
└── canvas/
├── components/
│ ├── ui/ # Base shadcn components
│ ├── blocks/ # shadcn blocks
│ └── custom/ # User customizations
├── lib/
│ └── utils.ts # cn() helper
├── preview/ # Vite preview server (Phase 3)
└── registry.json # Component metadata

````

## Create These Files

### 1. `src-tauri/src/commands/canvas/setup.rs`

Commands needed:
- `canvas_get_orbit_path()` → Returns path to ~/.orbit/canvas
- `canvas_check_setup()` → Returns SetupStatus { initialized: bool, component_count: u32 }
- `canvas_initialize_directories()` → Creates the full directory structure
- `canvas_get_registry()` → Reads and returns registry.json contents
- `canvas_save_registry(registry: Registry)` → Saves registry.json

### 2. Types needed:

```rust
#[derive(Serialize, Deserialize)]
pub struct SetupStatus {
    pub initialized: bool,
    pub orbit_path: String,
    pub component_count: u32,
}

#[derive(Serialize, Deserialize)]
pub struct Registry {
    pub version: String,
    pub last_updated: String,
    pub components: ComponentRegistry,
}

#[derive(Serialize, Deserialize)]
pub struct ComponentRegistry {
    pub ui: Vec<ComponentMeta>,
    pub blocks: Vec<ComponentMeta>,
    pub custom: Vec<ComponentMeta>,
}

#[derive(Serialize, Deserialize)]
pub struct ComponentMeta {
    pub name: String,
    pub path: String,
    pub component_type: String,  // "ui" | "block" | "custom"
    pub dependencies: Vec<String>,
    pub modified: bool,
}
````

### 3. Update `src-tauri/src/commands/canvas/mod.rs`

Add the new setup module

### 4. Update `src-tauri/src/lib.rs`

Register the new commands in invoke_handler

## Do NOT:

- Create any frontend code
- Download any components
- Set up the preview server

## Verify:

- `cargo check` passes
- Commands are registered in invoke_handler

````

---

### Prompt 1.2: Frontend Setup Detection Hook

```markdown
# Task: Create React hook to check Canvas setup status

## Context
We need a React hook that checks if ~/.orbit/canvas is set up when the Canvas tab loads.

## Create These Files

### 1. `apps/Canvas-UI-Builder/src/hooks/use-canvas-setup.ts`

```typescript
/**
 * Hook to check and manage Canvas setup status
 *
 * Returns:
 * - status: 'checking' | 'needs-setup' | 'ready' | 'error'
 * - orbitPath: string | null
 * - componentCount: number
 * - error: string | null
 * - recheckSetup: () => Promise<void>
 */

import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface SetupStatus {
  initialized: boolean;
  orbit_path: string;
  component_count: number;
}

type CanvasSetupStatus = 'checking' | 'needs-setup' | 'ready' | 'error';

export function useCanvasSetup() {
  const [status, setStatus] = useState<CanvasSetupStatus>('checking');
  const [orbitPath, setOrbitPath] = useState<string | null>(null);
  const [componentCount, setComponentCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const checkSetup = useCallback(async () => {
    setStatus('checking');
    setError(null);

    try {
      const result = await invoke<SetupStatus>('canvas_check_setup');
      setOrbitPath(result.orbit_path);
      setComponentCount(result.component_count);

      if (result.initialized && result.component_count > 0) {
        setStatus('ready');
      } else {
        setStatus('needs-setup');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void checkSetup();
  }, [checkSetup]);

  return {
    status,
    orbitPath,
    componentCount,
    error,
    recheckSetup: checkSetup,
  };
}
````

### 2. `apps/Canvas-UI-Builder/src/hooks/index.ts`

Create barrel export for hooks

```typescript
export { useCanvasSetup } from './use-canvas-setup';
```

## Update:

### `apps/Canvas-UI-Builder/src/components/layout/CanvasRootLayout.tsx`

- Import and use `useCanvasSetup` hook
- If status is 'needs-setup', show a simple message: "Canvas needs setup. Component count: 0"
- If status is 'ready', show: "Canvas ready. {componentCount} components loaded."
- Keep the existing sidebar structure

## Do NOT:

- Create the setup wizard UI yet
- Modify any sidebar components
- Add download functionality

## Verify:

- `bun run typecheck` passes
- `bun run lint` passes
- Canvas tab shows setup status message

````

---

### Prompt 1.3: Setup Wizard UI

```markdown
# Task: Create Canvas Setup Wizard Component

## Context
When Canvas detects it needs setup (no ~/.orbit/canvas), show a setup wizard overlay.

## Create These Files

### 1. `apps/Canvas-UI-Builder/src/components/setup/CanvasSetupWizard.tsx`

A modal/overlay component that shows:
- Welcome message: "Welcome to Canvas UI Builder"
- Explanation: "Canvas will download the shadcn component library to ~/.orbit/canvas"
- Path display showing where files will be stored
- "Setup Canvas" button
- The button should call a prop `onStartSetup()` (we'll wire download logic later)

Props:
```typescript
interface CanvasSetupWizardProps {
  orbitPath: string;
  onStartSetup: () => void;
  onSkip?: () => void;  // Optional skip for dev/testing
}
````

Style guidelines:

- Use existing Tailwind classes
- Match the app's dark theme aesthetic
- Center the modal in the viewport
- Semi-transparent backdrop

### 2. `apps/Canvas-UI-Builder/src/components/setup/index.ts`

Barrel export

```typescript
export { CanvasSetupWizard } from './CanvasSetupWizard';
```

## Update:

### `CanvasRootLayout.tsx`

- If `useCanvasSetup` returns 'needs-setup', render `<CanvasSetupWizard>`
- Pass orbitPath from the hook
- For now, `onStartSetup` just logs "Setup started" to console
- We'll add actual download logic in Phase 2

## Do NOT:

- Implement actual download logic
- Create progress UI
- Modify sidebar components

## Verify:

- TypeScript passes
- Lint passes
- When ~/.orbit/canvas doesn't exist, wizard overlay appears
- Clicking "Setup Canvas" logs to console

````

---

## Phase 2: Registry Download

### Prompt 2.1: Fetch shadcn Registry Index

```markdown
# Task: Rust command to fetch shadcn component registry

## Context
shadcn provides a registry API that lists all available components. We need to fetch this.

## Registry URLs
- Base: `https://ui.shadcn.com/registry`
- Index: `https://ui.shadcn.com/registry/index.json`
- Style: `https://ui.shadcn.com/registry/styles/new-york/{component}.json`

## Create/Update Files

### 1. `src-tauri/src/commands/canvas/download.rs`

Commands:
- `canvas_fetch_registry_index()` → Fetches and returns the component list from shadcn

```rust
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct RegistryIndex {
    pub items: Vec<RegistryItem>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RegistryItem {
    pub name: String,
    #[serde(rename = "type")]
    pub item_type: String,           // "registry:ui" or "registry:block"
    pub dependencies: Option<Vec<String>>,
    #[serde(rename = "registryDependencies")]
    pub registry_dependencies: Option<Vec<String>>,
}

#[tauri::command]
pub async fn canvas_fetch_registry_index() -> Result<RegistryIndex, String> {
    let client = reqwest::Client::new();

    let response = client
        .get("https://ui.shadcn.com/registry/index.json")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch registry: {}", e))?;

    let index: RegistryIndex = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse registry: {}", e))?;

    Ok(index)
}
````

### 2. Update `src-tauri/src/commands/canvas/mod.rs`

Add download module:

```rust
pub mod download;
```

### 3. Update `src-tauri/src/lib.rs`

Register new command in invoke_handler

### 4. Update `src-tauri/Cargo.toml`

Add reqwest dependency if not already present:

```toml
[dependencies]
reqwest = { version = "0.11", features = ["json"] }
```

## Do NOT:

- Download actual component files yet
- Create frontend UI for this
- Modify any existing components

## Verify:

- `cargo check` passes
- Can manually test command returns component list

````

---

### Prompt 2.2: Download Individual Component

```markdown
# Task: Rust command to download a single shadcn component

## Context
We need to download individual component source files from the shadcn registry.

## Component URL Pattern
`https://ui.shadcn.com/registry/styles/new-york/{component-name}.json`

The JSON response contains:
```json
{
  "name": "button",
  "type": "registry:ui",
  "files": [
    {
      "path": "ui/button.tsx",
      "content": "// actual source code here...",
      "type": "registry:ui"
    }
  ],
  "dependencies": ["@radix-ui/react-slot", "class-variance-authority"]
}
````

## Update File

### `src-tauri/src/commands/canvas/download.rs`

Add types and command:

```rust
#[derive(Serialize, Deserialize, Debug)]
pub struct ComponentResponse {
    pub name: String,
    #[serde(rename = "type")]
    pub component_type: String,
    pub files: Vec<ComponentFile>,
    pub dependencies: Option<Vec<String>>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ComponentFile {
    pub path: String,
    pub content: String,
    #[serde(rename = "type")]
    pub file_type: String,
}

#[derive(Serialize, Debug)]
pub struct DownloadResult {
    pub name: String,
    pub path: String,
    pub dependencies: Vec<String>,
    pub success: bool,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn canvas_download_component(
    name: String,
    component_type: String,  // "ui" or "block"
) -> Result<DownloadResult, String> {
    let client = reqwest::Client::new();

    // 1. Fetch component JSON from registry
    let url = format!(
        "https://ui.shadcn.com/registry/styles/new-york/{}.json",
        name
    );

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch component: {}", e))?;

    let component: ComponentResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse component: {}", e))?;

    // 2. Get orbit path
    let orbit_path = get_orbit_canvas_path()?;

    // 3. Save each file
    for file in &component.files {
        let file_path = orbit_path
            .join("components")
            .join(&component_type)
            .join(format!("{}.tsx", name));

        // Ensure directory exists
        if let Some(parent) = file_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        }

        // Write file
        std::fs::write(&file_path, &file.content)
            .map_err(|e| format!("Failed to write file: {}", e))?;
    }

    // 4. Return result
    Ok(DownloadResult {
        name: name.clone(),
        path: orbit_path.join("components").join(&component_type).join(format!("{}.tsx", name))
            .to_string_lossy().to_string(),
        dependencies: component.dependencies.unwrap_or_default(),
        success: true,
        error: None,
    })
}
```

Also add:

- `canvas_download_utils()` → Downloads the lib/utils.ts file (cn helper)

## Update `src-tauri/src/lib.rs`

Register new commands

## Do NOT:

- Create batch download logic yet
- Create frontend progress UI
- Emit events yet

## Verify:

- `cargo check` passes
- Can manually invoke to download a single component

````

---

### Prompt 2.3: Download Progress Events & Batch Download

```markdown
# Task: Add batch download with progress events

## Context
We need to download all components with progress reporting to the frontend.

## Update File

### `src-tauri/src/commands/canvas/download.rs`

Add types and command:

```rust
#[derive(Serialize, Clone, Debug)]
pub struct DownloadProgress {
    pub component: String,
    pub current: u32,
    pub total: u32,
    pub status: String,  // "downloading" | "complete" | "error"
    pub error: Option<String>,
}

#[derive(Serialize, Debug)]
pub struct DownloadSummary {
    pub total: u32,
    pub successful: u32,
    pub failed: u32,
    pub errors: Vec<String>,
}

#[tauri::command]
pub async fn canvas_download_all_components(
    app_handle: tauri::AppHandle,
) -> Result<DownloadSummary, String> {
    // 1. Fetch registry index
    let index = canvas_fetch_registry_index().await?;

    let total = index.items.len() as u32;
    let mut successful = 0u32;
    let mut failed = 0u32;
    let mut errors = Vec::new();

    // 2. Filter to UI components only for now
    let ui_components: Vec<_> = index.items.iter()
        .filter(|item| item.item_type == "registry:ui")
        .collect();

    let ui_total = ui_components.len() as u32;

    // 3. Download each component
    for (idx, item) in ui_components.iter().enumerate() {
        // Emit progress event
        let progress = DownloadProgress {
            component: item.name.clone(),
            current: (idx + 1) as u32,
            total: ui_total,
            status: "downloading".to_string(),
            error: None,
        };

        let _ = app_handle.emit("canvas:download-progress", &progress);

        // Download component
        match canvas_download_component(item.name.clone(), "ui".to_string()).await {
            Ok(_) => {
                successful += 1;
            }
            Err(e) => {
                failed += 1;
                errors.push(format!("{}: {}", item.name, e));
            }
        }
    }

    // 4. Download utils.ts
    let _ = canvas_download_utils().await;

    // 5. Update registry.json
    // ... create and save registry

    // 6. Emit complete event
    let complete = DownloadProgress {
        component: "complete".to_string(),
        current: ui_total,
        total: ui_total,
        status: "complete".to_string(),
        error: None,
    };
    let _ = app_handle.emit("canvas:download-progress", &complete);

    Ok(DownloadSummary {
        total: ui_total,
        successful,
        failed,
        errors,
    })
}
````

## Update `src-tauri/src/lib.rs`

Register new command

## Do NOT:

- Create frontend progress UI yet
- Handle blocks separately (treat all as same download flow for now)

## Verify:

- `cargo check` passes
- Command downloads all components
- Events are emitted during download

````

---

### Prompt 2.4: Frontend Download Progress UI

```markdown
# Task: Create download progress UI in setup wizard

## Context
Show download progress when user clicks "Setup Canvas" in the wizard.

## Create Files

### 1. `apps/Canvas-UI-Builder/src/hooks/use-canvas-download.ts`

```typescript
/**
 * Hook to manage component download process
 */
import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

interface DownloadProgress {
  component: string;
  current: number;
  total: number;
  status: 'downloading' | 'complete' | 'error';
  error: string | null;
}

interface DownloadSummary {
  total: number;
  successful: number;
  failed: number;
  errors: string[];
}

export function useCanvasDownload() {
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [summary, setSummary] = useState<DownloadSummary | null>(null);

  useEffect(() => {
    // Listen for progress events
    const unlisten = listen<DownloadProgress>('canvas:download-progress', (event) => {
      setProgress(event.payload);

      if (event.payload.status === 'complete') {
        setIsComplete(true);
        setIsDownloading(false);
      }
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  const startDownload = useCallback(async () => {
    setIsDownloading(true);
    setError(null);
    setIsComplete(false);
    setProgress(null);

    try {
      // First initialize directories
      await invoke('canvas_initialize_directories');

      // Then download all components
      const result = await invoke<DownloadSummary>('canvas_download_all_components');
      setSummary(result);
      setIsComplete(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsDownloading(false);
    }
  }, []);

  return {
    startDownload,
    isDownloading,
    progress,
    error,
    isComplete,
    summary,
  };
}
````

### 2. Update `apps/Canvas-UI-Builder/src/hooks/index.ts`

Add export:

```typescript
export { useCanvasDownload } from './use-canvas-download';
```

## Update Files

### `apps/Canvas-UI-Builder/src/components/setup/CanvasSetupWizard.tsx`

Update to show download progress:

```typescript
import { useCanvasDownload } from '@canvas/hooks';

export function CanvasSetupWizard({ orbitPath, onStartSetup, onComplete }) {
  const { startDownload, isDownloading, progress, error, isComplete } = useCanvasDownload();

  const handleSetup = async () => {
    await startDownload();
  };

  // Show different states:
  // 1. Initial: Welcome message + "Setup Canvas" button
  // 2. Downloading: Progress bar + current component name
  // 3. Complete: Success message + "Get Started" button
  // 4. Error: Error message + "Retry" button

  if (isComplete) {
    return (
      <div className="...">
        <h2>Setup Complete!</h2>
        <p>{progress?.total} components downloaded</p>
        <button onClick={onComplete}>Get Started</button>
      </div>
    );
  }

  if (isDownloading && progress) {
    return (
      <div className="...">
        <h2>Downloading Components...</h2>
        <div className="progress-bar">
          <div style={{ width: `${(progress.current / progress.total) * 100}%` }} />
        </div>
        <p>Downloading {progress.component}... ({progress.current}/{progress.total})</p>
      </div>
    );
  }

  // Initial state
  return (
    <div className="...">
      <h2>Welcome to Canvas UI Builder</h2>
      <p>Canvas will download the shadcn component library to:</p>
      <code>{orbitPath}</code>
      <button onClick={handleSetup}>Setup Canvas</button>
    </div>
  );
}
```

## Verify:

- TypeScript passes
- Lint passes
- Clicking "Setup Canvas" starts download with progress UI
- Progress bar updates as components download
- On complete, can click "Get Started"

````

---

## Phase 3: Preview System Setup

### Prompt 3.1: Create Preview Server Scaffolding

```markdown
# Task: Create Vite preview server scaffolding in ~/.orbit/canvas/preview

## Context
We need a minimal Vite + React project in ~/.orbit/canvas/preview that will serve
component previews.

## Create File

### `src-tauri/src/commands/canvas/preview.rs` (new file)

Command to create preview project structure:

```rust
#[tauri::command]
pub async fn canvas_setup_preview_server() -> Result<(), String> {
    let orbit_path = get_orbit_canvas_path()?;
    let preview_path = orbit_path.join("preview");

    // Create directory
    std::fs::create_dir_all(&preview_path)
        .map_err(|e| format!("Failed to create preview directory: {}", e))?;

    // Write package.json
    let package_json = r#"{
  "name": "orbit-canvas-preview",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --port 5199 --host"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "@tailwindcss/vite": "^4.0.0",
    "tailwindcss": "^4.0.0",
    "vite": "^6.0.0"
  }
}"#;
    std::fs::write(preview_path.join("package.json"), package_json)?;

    // Write vite.config.ts
    let vite_config = format!(r#"import {{ defineConfig }} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

const ORBIT_PATH = '{}';

export default defineConfig({{
  plugins: [react(), tailwindcss()],
  server: {{
    port: 5199,
    strictPort: true,
  }},
  resolve: {{
    alias: {{
      '@ui': path.join(ORBIT_PATH, 'components', 'ui'),
      '@blocks': path.join(ORBIT_PATH, 'components', 'blocks'),
      '@custom': path.join(ORBIT_PATH, 'components', 'custom'),
      '@lib': path.join(ORBIT_PATH, 'lib'),
    }},
  }},
}});"#, orbit_path.to_string_lossy().replace("\\", "\\\\"));
    std::fs::write(preview_path.join("vite.config.ts"), vite_config)?;

    // Write index.html
    let index_html = r#"<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Canvas Preview</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>"#;
    std::fs::write(preview_path.join("index.html"), index_html)?;

    // Create src directory
    std::fs::create_dir_all(preview_path.join("src"))?;

    // Write main.tsx
    let main_tsx = r#"import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Preview } from './Preview';
import './globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Preview />
  </StrictMode>
);"#;
    std::fs::write(preview_path.join("src/main.tsx"), main_tsx)?;

    // Write Preview.tsx
    let preview_tsx = r#"import { useState, useEffect, ComponentType } from 'react';

// Dynamic component imports
const componentModules = import.meta.glob<{ default: ComponentType }>([
  '../../components/ui/*.tsx',
  '../../components/blocks/**/*.tsx',
  '../../components/custom/*.tsx',
]);

interface PreviewMessage {
  type: 'preview:load' | 'preview:update-styles' | 'preview:update-props' | 'preview:clear';
  componentPath?: string;
  componentName?: string;
  styles?: Record<string, string>;
  props?: Record<string, unknown>;
}

export function Preview() {
  const [Component, setComponent] = useState<ComponentType | null>(null);
  const [componentName, setComponentName] = useState<string>('');
  const [props, setProps] = useState<Record<string, unknown>>({});
  const [styles, setStyles] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (event: MessageEvent<PreviewMessage>) => {
      const { type } = event.data;

      switch (type) {
        case 'preview:load':
          if (event.data.componentPath) {
            loadComponent(event.data.componentPath, event.data.componentName || '');
          }
          break;
        case 'preview:update-styles':
          if (event.data.styles) {
            setStyles(event.data.styles);
          }
          break;
        case 'preview:update-props':
          if (event.data.props) {
            setProps(event.data.props);
          }
          break;
        case 'preview:clear':
          setComponent(null);
          setComponentName('');
          setProps({});
          setStyles({});
          break;
      }
    };

    window.addEventListener('message', handler);

    // Notify parent we're ready
    window.parent.postMessage({ type: 'preview:ready' }, '*');

    return () => window.removeEventListener('message', handler);
  }, []);

  const loadComponent = async (path: string, name: string) => {
    setError(null);

    const loader = componentModules[path];
    if (!loader) {
      setError(`Component not found: ${path}`);
      return;
    }

    try {
      const module = await loader();
      setComponent(() => module.default);
      setComponentName(name);
      window.parent.postMessage({ type: 'preview:loaded', componentName: name }, '*');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load component');
      window.parent.postMessage({ type: 'preview:error', error: String(err) }, '*');
    }
  };

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background text-destructive p-8">
        <div className="text-center">
          <p className="text-lg font-medium">Error</p>
          <p className="text-sm opacity-70">{error}</p>
        </div>
      </div>
    );
  }

  if (!Component) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background text-muted-foreground">
        <p>Select a component to preview</p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-8">
      <div className="flex flex-col items-center gap-4">
        <p className="text-sm text-muted-foreground">{componentName}</p>
        <div className="p-6 rounded-lg border border-border bg-card">
          <Component {...props} style={styles} />
        </div>
      </div>
    </div>
  );
}"#;
    std::fs::write(preview_path.join("src/Preview.tsx"), preview_tsx)?;

    // Write globals.css
    let globals_css = r#"@import "tailwindcss";

:root {
  --background: oklch(0.16 0.012 60);
  --foreground: oklch(0.95 0.01 75);
  --card: oklch(0.20 0.012 60);
  --border: oklch(0.30 0.01 60);
  --muted-foreground: oklch(0.65 0.01 75);
  --destructive: oklch(0.65 0.2 25);
}

body {
  background-color: var(--background);
  color: var(--foreground);
}

.bg-background { background-color: var(--background); }
.bg-card { background-color: var(--card); }
.text-muted-foreground { color: var(--muted-foreground); }
.text-destructive { color: var(--destructive); }
.border-border { border-color: var(--border); }
"#;
    std::fs::write(preview_path.join("src/globals.css"), globals_css)?;

    Ok(())
}
````

### Update `src-tauri/src/commands/canvas/mod.rs`

Add preview module

### Update `src-tauri/src/lib.rs`

Register new command

## Do NOT:

- Spawn the server yet
- Create frontend integration
- Install npm dependencies yet

## Verify:

- `cargo check` passes
- Command creates all files in ~/.orbit/canvas/preview/

````

---

### Prompt 3.2: Preview Server Spawn & Management

```markdown
# Task: Rust commands to spawn and manage the Vite preview server

## Context
We need to spawn the Vite dev server as a background process and manage its lifecycle.

## Update File

### `src-tauri/src/commands/canvas/preview.rs`

Add state and commands:

```rust
use std::sync::Mutex;
use std::process::{Child, Command};
use tauri::State;

// State to track the preview server process
pub struct PreviewServerState {
    pub process: Mutex<Option<Child>>,
}

impl PreviewServerState {
    pub fn new() -> Self {
        Self {
            process: Mutex::new(None),
        }
    }
}

#[derive(Serialize)]
pub struct PreviewServerInfo {
    pub running: bool,
    pub port: u16,
    pub url: String,
}

#[tauri::command]
pub async fn canvas_install_preview_deps() -> Result<(), String> {
    let orbit_path = get_orbit_canvas_path()?;
    let preview_path = orbit_path.join("preview");

    // Run npm install
    let output = Command::new("npm")
        .arg("install")
        .current_dir(&preview_path)
        .output()
        .map_err(|e| format!("Failed to run npm install: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "npm install failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(())
}

#[tauri::command]
pub async fn canvas_start_preview_server(
    state: State<'_, PreviewServerState>,
) -> Result<PreviewServerInfo, String> {
    let mut process_guard = state.process.lock().unwrap();

    // Check if already running
    if process_guard.is_some() {
        return Ok(PreviewServerInfo {
            running: true,
            port: 5199,
            url: "http://localhost:5199".to_string(),
        });
    }

    let orbit_path = get_orbit_canvas_path()?;
    let preview_path = orbit_path.join("preview");

    // Spawn npm run dev
    let child = Command::new("npm")
        .args(["run", "dev"])
        .current_dir(&preview_path)
        .spawn()
        .map_err(|e| format!("Failed to start preview server: {}", e))?;

    *process_guard = Some(child);

    // Wait a moment for server to start
    std::thread::sleep(std::time::Duration::from_secs(2));

    Ok(PreviewServerInfo {
        running: true,
        port: 5199,
        url: "http://localhost:5199".to_string(),
    })
}

#[tauri::command]
pub async fn canvas_stop_preview_server(
    state: State<'_, PreviewServerState>,
) -> Result<(), String> {
    let mut process_guard = state.process.lock().unwrap();

    if let Some(mut child) = process_guard.take() {
        child.kill().map_err(|e| format!("Failed to stop server: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn canvas_preview_server_status(
    state: State<'_, PreviewServerState>,
) -> Result<PreviewServerInfo, String> {
    let process_guard = state.process.lock().unwrap();

    let running = process_guard.is_some();

    Ok(PreviewServerInfo {
        running,
        port: 5199,
        url: "http://localhost:5199".to_string(),
    })
}
````

### Update `src-tauri/src/lib.rs`

Add state management and register commands:

```rust
// In the run() function, add:
.manage(PreviewServerState::new())

// In invoke_handler, add:
canvas_cmd::canvas_install_preview_deps,
canvas_cmd::canvas_start_preview_server,
canvas_cmd::canvas_stop_preview_server,
canvas_cmd::canvas_preview_server_status,
```

## Do NOT:

- Create frontend UI for this
- Integrate with Canvas layout yet

## Verify:

- `cargo check` passes
- Can start/stop preview server via commands
- Server runs on port 5199

````

---

### Prompt 3.3: Frontend Preview Integration

```markdown
# Task: Integrate preview server with Canvas UI

## Context
Add a webview/iframe in the Canvas center panel that connects to the preview server.

## Create Files

### 1. `apps/Canvas-UI-Builder/src/hooks/use-preview-server.ts`

```typescript
/**
 * Hook to manage preview server lifecycle
 */
import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface PreviewServerInfo {
  running: boolean;
  port: number;
  url: string;
}

export function usePreviewServer() {
  const [isReady, setIsReady] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState<string | null>(null);

  const startServer = useCallback(async () => {
    setIsStarting(true);
    setError(null);

    try {
      // Check if already running
      const status = await invoke<PreviewServerInfo>('canvas_preview_server_status');

      if (status.running) {
        setServerUrl(status.url);
        setIsReady(true);
        setIsStarting(false);
        return;
      }

      // Start the server
      const info = await invoke<PreviewServerInfo>('canvas_start_preview_server');
      setServerUrl(info.url);
      setIsReady(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsStarting(false);
    }
  }, []);

  const stopServer = useCallback(async () => {
    try {
      await invoke('canvas_stop_preview_server');
      setIsReady(false);
      setServerUrl(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  // Auto-start server when hook is used
  useEffect(() => {
    void startServer();

    // Cleanup on unmount
    return () => {
      // Note: Don't stop server on unmount, let it run
    };
  }, [startServer]);

  return {
    isReady,
    isStarting,
    error,
    serverUrl,
    startServer,
    stopServer,
  };
}
````

### 2. `apps/Canvas-UI-Builder/src/components/preview/PreviewPanel.tsx`

```typescript
import { useRef, useEffect, useCallback } from 'react';
import { usePreviewServer } from '@canvas/hooks';

interface PreviewPanelProps {
  selectedComponent: string | null;
  cssOverrides: Record<string, string>;
}

export function PreviewPanel({ selectedComponent, cssOverrides }: PreviewPanelProps) {
  const { isReady, isStarting, error, serverUrl } = usePreviewServer();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Send message to preview iframe
  const sendToPreview = useCallback((message: unknown) => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(message, '*');
    }
  }, []);

  // Load component when selection changes
  useEffect(() => {
    if (!isReady || !selectedComponent) return;

    sendToPreview({
      type: 'preview:load',
      componentPath: `../../components/ui/${selectedComponent}.tsx`,
      componentName: selectedComponent,
    });
  }, [isReady, selectedComponent, sendToPreview]);

  // Update styles when cssOverrides change
  useEffect(() => {
    if (!isReady) return;

    sendToPreview({
      type: 'preview:update-styles',
      styles: cssOverrides,
    });
  }, [isReady, cssOverrides, sendToPreview]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-chat-area">
        <div className="text-center text-destructive">
          <p className="font-medium">Preview Error</p>
          <p className="text-sm opacity-70">{error}</p>
        </div>
      </div>
    );
  }

  if (isStarting) {
    return (
      <div className="flex items-center justify-center h-full bg-chat-area">
        <div className="text-center text-muted-foreground">
          <div className="animate-spin w-8 h-8 border-2 border-current border-t-transparent rounded-full mx-auto mb-4" />
          <p>Starting preview server...</p>
        </div>
      </div>
    );
  }

  if (!isReady || !serverUrl) {
    return (
      <div className="flex items-center justify-center h-full bg-chat-area">
        <p className="text-muted-foreground">Preview server not ready</p>
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      src={serverUrl}
      className="w-full h-full border-0"
      title="Component Preview"
    />
  );
}
```

### 3. `apps/Canvas-UI-Builder/src/components/preview/index.ts`

```typescript
export { PreviewPanel } from './PreviewPanel';
```

### 4. Update `apps/Canvas-UI-Builder/src/hooks/index.ts`

```typescript
export { useCanvasSetup } from './use-canvas-setup';
export { useCanvasDownload } from './use-canvas-download';
export { usePreviewServer } from './use-preview-server';
```

## Update:

### `CanvasRootLayout.tsx`

Replace placeholder div with PreviewPanel:

```typescript
import { PreviewPanel } from './preview';
import { useCSSOverrides } from '@canvas/stores';

// In the component:
const cssOverrides = useCSSOverrides();

// In the JSX, replace the placeholder with:
<PreviewPanel
  selectedComponent={selectedComponentName}
  cssOverrides={cssOverrides}
/>
```

## Verify:

- TypeScript passes
- Lint passes
- Canvas shows iframe connected to preview server
- Preview server starts automatically when Canvas loads

````

---

### Prompt 3.4: Preview PostMessage Communication

```markdown
# Task: Implement postMessage communication between Canvas and Preview

## Context
Canvas needs to tell the preview which component to render and with what styles.

## Create File

### `apps/Canvas-UI-Builder/src/lib/preview-bridge.ts`

```typescript
/**
 * Message types for Canvas ↔ Preview communication
 */

// Messages sent from Canvas to Preview
export type PreviewMessage =
  | { type: 'preview:load'; componentPath: string; componentName: string }
  | { type: 'preview:update-styles'; styles: Record<string, string> }
  | { type: 'preview:update-props'; props: Record<string, unknown> }
  | { type: 'preview:clear' };

// Messages sent from Preview to Canvas
export type PreviewResponse =
  | { type: 'preview:ready' }
  | { type: 'preview:loaded'; componentName: string }
  | { type: 'preview:error'; error: string };

/**
 * Send message to preview iframe
 */
export function sendToPreview(
  iframe: HTMLIFrameElement | null,
  message: PreviewMessage
): void {
  if (iframe?.contentWindow) {
    iframe.contentWindow.postMessage(message, '*');
  }
}

/**
 * Create listener for preview responses
 */
export function createPreviewListener(
  callback: (response: PreviewResponse) => void
): () => void {
  const handler = (event: MessageEvent) => {
    // Validate message is from preview
    if (
      event.data &&
      typeof event.data === 'object' &&
      'type' in event.data &&
      typeof event.data.type === 'string' &&
      event.data.type.startsWith('preview:')
    ) {
      callback(event.data as PreviewResponse);
    }
  };

  window.addEventListener('message', handler);

  return () => {
    window.removeEventListener('message', handler);
  };
}
````

## Update:

### `PreviewPanel.tsx`

Use the preview-bridge utilities:

```typescript
import {
  sendToPreview,
  createPreviewListener,
  type PreviewResponse,
} from '@canvas/lib/preview-bridge';

// Add state for preview status
const [previewReady, setPreviewReady] = useState(false);
const [loadedComponent, setLoadedComponent] = useState<string | null>(null);

// Listen for preview responses
useEffect(() => {
  const unlisten = createPreviewListener((response: PreviewResponse) => {
    switch (response.type) {
      case 'preview:ready':
        setPreviewReady(true);
        break;
      case 'preview:loaded':
        setLoadedComponent(response.componentName);
        break;
      case 'preview:error':
        console.error('Preview error:', response.error);
        break;
    }
  });

  return unlisten;
}, []);

// Update the sendToPreview calls to use the utility
useEffect(() => {
  if (!previewReady || !selectedComponent) return;

  sendToPreview(iframeRef.current, {
    type: 'preview:load',
    componentPath: `../../components/ui/${selectedComponent}.tsx`,
    componentName: selectedComponent,
  });
}, [previewReady, selectedComponent]);
```

## Verify:

- TypeScript passes
- Selecting a component in sidebar sends message to preview
- Style changes send updates to preview
- Preview responds with ready/loaded messages

````

---

## Phase 4: Component Loading

### Prompt 4.1: Load Component List from Registry

```markdown
# Task: Load component list from ~/.orbit/canvas/registry.json

## Context
The sidebar should show components from the downloaded registry, not a static list.

## Create File

### `apps/Canvas-UI-Builder/src/hooks/use-component-registry.ts`

```typescript
/**
 * Hook to load and manage component registry
 */
import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface ComponentMeta {
  name: string;
  path: string;
  component_type: string;
  dependencies: string[];
  modified: boolean;
}

interface Registry {
  version: string;
  last_updated: string;
  components: {
    ui: ComponentMeta[];
    blocks: ComponentMeta[];
    custom: ComponentMeta[];
  };
}

export function useComponentRegistry() {
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRegistry = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await invoke<Registry>('canvas_get_registry');
      setRegistry(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRegistry();
  }, [loadRegistry]);

  return {
    components: registry?.components ?? { ui: [], blocks: [], custom: [] },
    isLoading,
    error,
    refresh: loadRegistry,
  };
}
````

### Update `apps/Canvas-UI-Builder/src/hooks/index.ts`

Add export:

```typescript
export { useComponentRegistry } from './use-component-registry';
```

## Update:

### `CanvasLeftSidebar.tsx`

Replace static `UI_COMPONENTS` with data from registry:

```typescript
import { useComponentRegistry } from '@canvas/hooks';

// In the component:
const { components, isLoading } = useComponentRegistry();

// Replace the static list with:
{isLoading ? (
  <div className="p-4 text-center text-muted-foreground text-sm">
    Loading components...
  </div>
) : (
  <>
    <CollapsibleGroup label="UI Components" defaultOpen={true}>
      {components.ui.map((component, index) => (
        <SidebarMenuItem
          key={component.name}
          label={component.name.split('-').map(w =>
            w.charAt(0).toUpperCase() + w.slice(1)
          ).join(' ')}
          active={selectedComponent === component.name}
          isLast={index === components.ui.length - 1}
          onClick={() => handleComponentSelect(component.name)}
        />
      ))}
    </CollapsibleGroup>

    {components.blocks.length > 0 && (
      <CollapsibleGroup label="Blocks" defaultOpen={false}>
        {components.blocks.map((component, index) => (
          <SidebarMenuItem
            key={component.name}
            label={component.name}
            active={selectedComponent === component.name}
            isLast={index === components.blocks.length - 1}
            onClick={() => handleComponentSelect(component.name)}
          />
        ))}
      </CollapsibleGroup>
    )}

    {components.custom.length > 0 && (
      <CollapsibleGroup label="Custom" defaultOpen={true}>
        {components.custom.map((component, index) => (
          <SidebarMenuItem
            key={component.name}
            label={component.name}
            active={selectedComponent === component.name}
            isLast={index === components.custom.length - 1}
            onClick={() => handleComponentSelect(component.name)}
          />
        ))}
      </CollapsibleGroup>
    )}
  </>
)}
```

## Do NOT:

- Modify the preview system
- Change properties panel
- Add download functionality to sidebar

## Verify:

- TypeScript passes
- Lint passes
- Sidebar shows components from registry.json
- Components grouped by category (UI, Blocks, Custom)

````

---

### Prompt 4.2: Wire Component Selection to Preview

```markdown
# Task: Wire component selection to preview loading

## Context
When user clicks a component in the sidebar, it should load in the preview.

## Update Files

### `CanvasRootLayout.tsx`

Ensure selectedComponent flows correctly:

```typescript
// State is already defined:
const [selectedComponentName, setSelectedComponentName] = useState<string | null>(null);

// Pass to PreviewPanel:
<PreviewPanel
  selectedComponent={selectedComponentName}
  cssOverrides={cssOverrides}
/>
````

### `PreviewPanel.tsx`

Update to construct correct component path based on type:

```typescript
// Update the load effect to handle different component types:
useEffect(() => {
  if (!previewReady || !selectedComponent) return;

  // Determine component path based on name pattern
  // (In a more complete implementation, you'd look this up in the registry)
  let componentPath = `../../components/ui/${selectedComponent}.tsx`;

  sendToPreview(iframeRef.current, {
    type: 'preview:load',
    componentPath,
    componentName: selectedComponent,
  });
}, [previewReady, selectedComponent]);
```

## Verify:

- Clicking component in sidebar loads it in preview
- Preview shows the actual component
- Different components load correctly
- Errors are handled gracefully

````

---

## Phase 5: Live Editing

### Prompt 5.1: Wire Properties Panel to Preview

```markdown
# Task: Connect properties panel CSS changes to live preview

## Context
When user changes styles in the properties panel, preview should update immediately.

## Files Already Set Up:
- `css-customization-store.ts` - Already tracks CSS overrides
- `useCSSOverrides()` - Already provides current overrides
- `PreviewPanel` - Already receives cssOverrides prop

## Update:

### `PreviewPanel.tsx`

Ensure style updates are sent on every change:

```typescript
// This effect should already exist, but verify it works:
useEffect(() => {
  if (!previewReady || !iframeRef.current) return;

  // Only send if there are actual overrides
  if (Object.keys(cssOverrides).length > 0) {
    sendToPreview(iframeRef.current, {
      type: 'preview:update-styles',
      styles: cssOverrides,
    });
  }
}, [previewReady, cssOverrides]);
````

### Verify Preview.tsx handles styles

The Preview.tsx in ~/.orbit/canvas/preview should apply styles:

```typescript
// In the render:
<Component {...props} style={styles} />
```

## Test Flow:

1. Select "button" component
2. In Properties panel, change background color
3. Preview should update immediately
4. Change padding - preview updates
5. Click "Reset" - preview resets to defaults

## Verify:

- Changing a style in properties panel updates preview instantly
- Multiple style changes work correctly
- Resetting styles updates preview
- No lag or flickering in updates

````

---

## Phase 6: Save System

### Prompt 6.1: Save as Custom Component

```markdown
# Task: Implement "Save as Custom" functionality

## Context
User should be able to save their customized component as a new custom component.

## Create Files

### 1. `src-tauri/src/commands/canvas/save.rs`

```rust
use std::collections::HashMap;
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
pub struct SaveResult {
    pub success: bool,
    pub path: String,
    pub name: String,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn canvas_save_custom_component(
    base_component: String,
    custom_name: String,
    customizations: HashMap<String, String>,
) -> Result<SaveResult, String> {
    let orbit_path = get_orbit_canvas_path()?;

    // 1. Read base component source
    let base_path = orbit_path
        .join("components")
        .join("ui")
        .join(format!("{}.tsx", base_component));

    let source = std::fs::read_to_string(&base_path)
        .map_err(|e| format!("Failed to read base component: {}", e))?;

    // 2. Apply customizations (add style prop with overrides)
    // For now, just add a comment with the customizations
    let customization_comment = format!(
        "// Custom styles: {:?}\n",
        customizations
    );
    let modified_source = format!("{}{}", customization_comment, source);

    // 3. Save to custom directory
    let custom_path = orbit_path
        .join("components")
        .join("custom")
        .join(format!("{}.tsx", custom_name));

    // Ensure directory exists
    if let Some(parent) = custom_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    std::fs::write(&custom_path, modified_source)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    // 4. Update registry.json
    // ... add to custom components list

    Ok(SaveResult {
        success: true,
        path: custom_path.to_string_lossy().to_string(),
        name: custom_name,
        error: None,
    })
}
````

### 2. Update mod.rs and lib.rs

Add save module and register command

### 3. `apps/Canvas-UI-Builder/src/components/modals/SaveComponentModal.tsx`

```typescript
import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface SaveComponentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  componentName: string;
  customizations: Record<string, string>;
  onSaved: () => void;
}

export function SaveComponentModal({
  open,
  onOpenChange,
  componentName,
  customizations,
  onSaved,
}: SaveComponentModalProps) {
  const [customName, setCustomName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!customName.trim()) return;

    setIsSaving(true);
    setError(null);

    try {
      await invoke('canvas_save_custom_component', {
        baseComponent: componentName,
        customName: customName.trim(),
        customizations,
      });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save Custom Component</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground">
              Component Name
            </label>
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="my-custom-button"
              className="w-full mt-1 px-3 py-2 bg-muted border border-border rounded"
            />
          </div>

          <div className="text-xs text-muted-foreground">
            Will be saved to: ~/.orbit/canvas/components/custom/{customName || '...'}.tsx
          </div>

          {error && (
            <div className="text-sm text-destructive">{error}</div>
          )}

          <div className="flex justify-end gap-2">
            <button
              onClick={() => onOpenChange(false)}
              className="px-4 py-2 text-sm bg-muted rounded"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!customName.trim() || isSaving}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

### 4. Update PropertiesPanel.tsx or CanvasRightSidebar.tsx

Add Save button that opens the modal:

```typescript
// Add state
const [showSaveModal, setShowSaveModal] = useState(false);

// Add button (only show when there are changes)
{hasChanges && (
  <button
    onClick={() => setShowSaveModal(true)}
    className="..."
  >
    Save as Custom
  </button>
)}

// Add modal
<SaveComponentModal
  open={showSaveModal}
  onOpenChange={setShowSaveModal}
  componentName={selectedComponentName}
  customizations={overrides}
  onSaved={() => {
    // Refresh component list
  }}
/>
```

## Verify:

- Can save customized component with new name
- Saved component appears in Custom section of sidebar
- Can load and preview saved custom component

````

---

### Prompt 6.2: Export to User Project

```markdown
# Task: Implement "Export to Project" functionality

## Context
User should be able to export a component to their own project folder.

## Update Files

### 1. Add Rust command in `src-tauri/src/commands/canvas/save.rs`

```rust
#[derive(Serialize)]
pub struct ExportResult {
    pub success: bool,
    pub files: Vec<String>,
    pub error: Option<String>,
}

#[tauri::command]
pub async fn canvas_export_component(
    component_name: String,
    component_type: String,  // "ui" | "block" | "custom"
    destination_path: String,
    include_utils: bool,
) -> Result<ExportResult, String> {
    let orbit_path = get_orbit_canvas_path()?;

    // 1. Read component source
    let source_path = orbit_path
        .join("components")
        .join(&component_type)
        .join(format!("{}.tsx", component_name));

    let source = std::fs::read_to_string(&source_path)
        .map_err(|e| format!("Failed to read component: {}", e))?;

    // 2. Copy to destination
    let dest_path = std::path::PathBuf::from(&destination_path)
        .join(format!("{}.tsx", component_name));

    // Ensure directory exists
    if let Some(parent) = dest_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    std::fs::write(&dest_path, source)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    let mut files = vec![dest_path.to_string_lossy().to_string()];

    // 3. Optionally copy utils.ts
    if include_utils {
        let utils_source = orbit_path.join("lib").join("utils.ts");
        let utils_dest = std::path::PathBuf::from(&destination_path)
            .parent()
            .unwrap_or(std::path::Path::new(&destination_path))
            .join("lib")
            .join("utils.ts");

        if utils_source.exists() {
            if let Some(parent) = utils_dest.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::copy(&utils_source, &utils_dest)?;
            files.push(utils_dest.to_string_lossy().to_string());
        }
    }

    Ok(ExportResult {
        success: true,
        files,
        error: None,
    })
}
````

### 2. Update SaveComponentModal.tsx

Add export option with folder picker:

```typescript
import { open } from '@tauri-apps/plugin-dialog';

// Add state for export mode
const [saveMode, setSaveMode] = useState<'custom' | 'export'>('custom');
const [exportPath, setExportPath] = useState('');

// Add folder picker
const handleBrowse = async () => {
  const selected = await open({
    directory: true,
    title: 'Select export destination',
  });
  if (selected) {
    setExportPath(selected as string);
  }
};

// Update save handler to support export
const handleSave = async () => {
  if (saveMode === 'export') {
    await invoke('canvas_export_component', {
      componentName,
      componentType: 'ui', // or get from registry
      destinationPath: exportPath,
      includeUtils: true,
    });
  } else {
    // existing custom save logic
  }
};
```

## Verify:

- Can export component to a chosen folder
- Exported file is valid and complete
- Dependencies (utils.ts) are optionally included

````

---

## Phase 7: Custom Component Download

### Prompt 7.1: Agent Tool for Component Download

```markdown
# Task: Create agent tool for downloading additional components

## Context
User should be able to ask the agent to download specific components.

## Update Files

### 1. In agent-bridge tool definitions

Add tool definition for canvas download:

```typescript
// In the tool registry
{
  name: 'canvas_download_component',
  description: 'Download a shadcn component to the Canvas component library. Use this when the user asks to download or add a specific component.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Component name (e.g., "accordion", "alert", "sidebar-01")',
      },
      component_type: {
        type: 'string',
        enum: ['ui', 'block'],
        description: 'Component type - "ui" for base components, "block" for larger templates',
      },
    },
    required: ['name', 'component_type'],
  },
}
````

### 2. Implement tool handler

```typescript
async function handleCanvasDownloadComponent(input: {
  name: string;
  component_type: string;
}): Promise<string> {
  try {
    const result = await invoke('canvas_download_component', {
      name: input.name,
      componentType: input.component_type,
    });

    return `Successfully downloaded ${input.name} component to ~/.orbit/canvas/components/${input.component_type}/`;
  } catch (error) {
    return `Failed to download component: ${error}`;
  }
}
```

## Do NOT:

- Create UI for this
- Modify Canvas components

## Verify:

- Agent can respond to "download the accordion component"
- Component is downloaded and appears in sidebar after refresh

````

---

### Prompt 7.2: Manual Download Dialog

```markdown
# Task: Create UI for manually downloading components

## Context
User should be able to manually download additional components via UI.

## Create Files

### 1. `apps/Canvas-UI-Builder/src/hooks/use-available-components.ts`

```typescript
/**
 * Hook to get components available for download (not yet in local registry)
 */
import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface AvailableComponent {
  name: string;
  type: string;
  description?: string;
}

export function useAvailableComponents() {
  const [available, setAvailable] = useState<AvailableComponent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAvailable = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch remote registry
      const remoteIndex = await invoke<{ items: AvailableComponent[] }>(
        'canvas_fetch_registry_index'
      );

      // Fetch local registry
      const localRegistry = await invoke<{ components: { ui: { name: string }[] } }>(
        'canvas_get_registry'
      );

      // Filter out already downloaded
      const localNames = new Set(localRegistry.components.ui.map(c => c.name));
      const notDownloaded = remoteIndex.items.filter(
        item => !localNames.has(item.name)
      );

      setAvailable(notDownloaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAvailable();
  }, [loadAvailable]);

  return {
    available,
    isLoading,
    error,
    refresh: loadAvailable,
  };
}
````

### 2. `apps/Canvas-UI-Builder/src/components/modals/DownloadComponentModal.tsx`

```typescript
import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAvailableComponents } from '@canvas/hooks';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface DownloadComponentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDownloaded: () => void;
}

export function DownloadComponentModal({
  open,
  onOpenChange,
  onDownloaded,
}: DownloadComponentModalProps) {
  const { available, isLoading } = useAvailableComponents();
  const [downloading, setDownloading] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredComponents = available.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleDownload = async (name: string, type: string) => {
    setDownloading(name);
    try {
      await invoke('canvas_download_component', {
        name,
        componentType: type === 'registry:ui' ? 'ui' : 'block',
      });
      onDownloaded();
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Download Components</DialogTitle>
        </DialogHeader>

        <input
          type="text"
          placeholder="Search components..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 bg-muted border border-border rounded mb-4"
        />

        <div className="overflow-y-auto max-h-96 space-y-2">
          {isLoading ? (
            <p className="text-center text-muted-foreground py-4">
              Loading available components...
            </p>
          ) : filteredComponents.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">
              All components downloaded!
            </p>
          ) : (
            filteredComponents.map((component) => (
              <div
                key={component.name}
                className="flex items-center justify-between p-3 bg-muted/50 rounded"
              >
                <div>
                  <p className="font-medium">{component.name}</p>
                  <p className="text-xs text-muted-foreground">{component.type}</p>
                </div>
                <button
                  onClick={() => handleDownload(component.name, component.type)}
                  disabled={downloading === component.name}
                  className="px-3 py-1 text-sm bg-primary text-primary-foreground rounded disabled:opacity-50"
                >
                  {downloading === component.name ? 'Downloading...' : 'Download'}
                </button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

## Update:

### `CanvasLeftSidebar.tsx`

Add download button:

```typescript
import { DownloadComponentModal } from '@canvas/components/modals/DownloadComponentModal';

// Add state
const [showDownloadModal, setShowDownloadModal] = useState(false);

// Add button at bottom of sidebar
<button
  onClick={() => setShowDownloadModal(true)}
  className="flex items-center gap-2 w-full p-2 text-sm text-muted-foreground hover:text-foreground"
>
  <Plus className="h-4 w-4" />
  Download More
</button>

// Add modal
<DownloadComponentModal
  open={showDownloadModal}
  onOpenChange={setShowDownloadModal}
  onDownloaded={() => {
    // Refresh component list
    refresh();
  }}
/>
```

## Verify:

- Can open download modal from sidebar
- Shows available components not yet downloaded
- Can download individual components
- Downloaded component appears in sidebar

```

---

## Summary

| Phase | Parts | Description | Estimated Effort |
|-------|-------|-------------|------------------|
| **0** | 1 | Cleanup current DirectPreview code | 30 min |
| **1** | 3 | Foundation - ~/.orbit directory setup | 2-3 hours |
| **2** | 4 | Registry download system | 3-4 hours |
| **3** | 4 | Preview server setup | 4-5 hours |
| **4** | 2 | Component loading | 1-2 hours |
| **5** | 1 | Live editing | 1 hour |
| **6** | 2 | Save system | 2-3 hours |
| **7** | 2 | Custom download | 2 hours |

**Total: 19 focused prompts, ~16-20 hours of implementation**

---

## Design Principles

1. **Small, Focused Prompts**: Each prompt does ONE thing well
2. **Incremental Building**: Each phase builds on the previous
3. **Verifiable Results**: Each prompt has clear success criteria
4. **Separation of Concerns**: Rust backend / React frontend clearly separated
5. **Minimal Hallucination Risk**: Concrete code examples, no ambiguity

---

## Notes for Implementation

- Run prompts in order within each phase
- Complete one phase before moving to the next
- Test after each prompt before proceeding
- If a prompt fails, fix issues before continuing
- Keep the existing sidebar UI throughout - only wire in new data sources
```
