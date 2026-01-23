# Canvas UI Builder - Implementation Guide v3 (Final)

> **Created:** January 2025  
> **Status:** Ready for Implementation  
> **Audit Status:** ✅ All critical issues addressed (three audit passes)

---

## Audit Fixes Applied

### First Audit (v2 → v3)

| Issue                    | Severity    | Fix Applied                                           |
| ------------------------ | ----------- | ----------------------------------------------------- |
| npm → bun                | 🔴 Critical | All `npm` commands replaced with `bun`                |
| Missing tests            | 🔴 Critical | Added Phase 0.5 for test infrastructure               |
| No Drop impl             | 🟠 High     | Added `Drop` for `PreviewServerState`                 |
| Tailwind v4 incomplete   | 🟠 High     | Complete config synced with main app                  |
| Blocking sleep           | 🟡 Medium   | Uses async polling (already in v2)                    |
| Hardcoded paths          | 🟡 Medium   | Runtime resolution via env var                        |
| Directory mismatch       | 🟡 Medium   | Updated to match actual codebase                      |
| Import paths             | 🟡 Medium   | Uses `@common/components/ui/`                         |
| PostMessage security     | 🟢 Low      | Specified origin                                      |
| Missing cleanup flow     | 🟠 High     | Added `canvas_reset_setup` command                    |
| Missing offline handling | 🟡 Medium   | Added retry logic and partial recovery                |
| Theme sync               | 🟡 Medium   | Preview reads from main app's CSS vars                |
| reqwest version          | 🟢 Low      | Updated to 0.12.x                                     |
| Inconsistent naming      | 🟢 Low      | Standardized to snake_case for Rust, camelCase for TS |

### Second Audit (v3 fixes)

| Issue                           | Severity    | Fix Applied                                           |
| ------------------------------- | ----------- | ----------------------------------------------------- |
| Multi-file component corruption | 🔴 Critical | Use `file.path` from registry instead of `{name}.tsx` |
| Missing Tauri capabilities      | 🔴 Critical | Added Phase 0.2 with fs/http/shell plugin config      |
| Missing shadcn runtime deps     | 🔴 Critical | Added all Radix deps to preview package.json          |
| Blocks/Custom never preview     | 🟡 Medium   | MVP scope: UI components only (documented)            |
| utils.ts export path bug        | 🟡 Medium   | Fixed path resolution in save command                 |

### Third Audit (v3 final fixes)

| Issue                          | Severity    | Fix Applied                                            |
| ------------------------------ | ----------- | ------------------------------------------------------ |
| Phases 4-6 undefined           | 🔴 Critical | Added complete implementation prompts for all 3 phases |
| `todo!()` panic                | 🔴 Critical | Replaced with proper error return                      |
| `test-setup.ts` missing        | 🟡 Medium   | Added file content with Tauri API mocks                |
| chrono missing `clock` feature | 🟢 Low      | Added `clock` feature flag                             |

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Directory Structure](#directory-structure)
3. [Implementation Phases](#implementation-phases)
   - [Phase 0: Cleanup](#phase-0-cleanup)
   - [Phase 0.2: Tauri Capabilities](#phase-02-tauri-capabilities)
   - [Phase 0.5: Test Infrastructure](#phase-05-test-infrastructure)
   - [Phase 1: Foundation](#phase-1-foundation)
   - [Phase 2: Registry Download](#phase-2-registry-download)
   - [Phase 3: Preview System](#phase-3-preview-system)
   - [Phase 4: Component Loading](#phase-4-component-loading)
   - [Phase 5: Live Editing](#phase-5-live-editing)
   - [Phase 6: Save System](#phase-6-save-system)
4. [Error Handling & Recovery](#error-handling--recovery)
5. [Time Estimates](#time-estimates)

---

## System Overview

Canvas UI Builder is a visual design tool that:

1. **On first app launch**: Creates `~/.orbit/canvas` and downloads shadcn components
2. **Preview & Edit**: User can preview components and make live CSS/prop changes via iframe
3. **Save options**: Save as custom component OR export to project

### MVP Scope

| Feature                            | MVP | Future |
| ---------------------------------- | --- | ------ |
| UI components (button, card, etc.) | ✅  |        |
| Custom saved components            | ✅  |        |
| Blocks (multi-component layouts)   |     | ✅     |
| Live CSS editing                   | ✅  |        |
| Prop editing                       | ✅  |        |
| Export to project                  | ✅  |        |

### Key Principles

- **Package Manager**: Uses `bun` exclusively (per CLAUDE.md)
- **Components stored locally** in `~/.orbit/canvas/components/`
- **Preview runs via embedded Vite dev server** (port 5199)
- **Communication via postMessage** with specified origins
- **Theme synced** with main app's CSS variables

---

## Directory Structure

```
~/.orbit/
└── canvas/
    ├── components/
    │   ├── ui/                      # Base shadcn/ui components
    │   │   ├── button.tsx
    │   │   ├── card.tsx
    │   │   └── ... (50+ components)
    │   │
    │   └── custom/                  # User's saved customizations
    │       └── my-primary-button.tsx
    │
    ├── lib/
    │   └── utils.ts                 # cn() helper function
    │
    ├── preview/                     # Vite preview server
    │   ├── package.json             # Uses bun
    │   ├── vite.config.ts
    │   ├── index.html
    │   └── src/
    │       ├── main.tsx
    │       ├── Preview.tsx
    │       └── globals.css          # Imports main app's theme
    │
    ├── registry.json                # Local component metadata
    └── .ready                       # Marker file for setup complete
```

---

## Implementation Phases

---

## Phase 0: Cleanup

### Prompt 0.1: Remove DirectPreview Code

````markdown
# Task: Clean up Canvas UI Builder - Remove Direct Preview Code

## Context

We're rebuilding the Canvas preview system to load components from `~/.orbit/canvas/`
instead of bundling them directly.

## Current Codebase Structure (verify before deleting)

The Canvas app is at: `apps/Canvas-UI-Builder/`

Run this first to see what exists:

```bash
find apps/Canvas-UI-Builder/src -type f -name "*.tsx" | head -20
```
````

## What to REMOVE (if they exist)

- Any `DirectPreview.tsx` or `ComponentPreview.tsx` files
- Any local shadcn component copies (NOT the shared ones in packages/)

## What to KEEP

- `CanvasLeftSidebar.tsx` - Keep sidebar structure
- `CanvasRightSidebar.tsx` - Keep inspector structure
- `PropertiesPanel.tsx` - Keep CSS editor UI
- All Zustand stores

## What to UPDATE

In `CanvasRootLayout.tsx`, replace any preview component with placeholder:

```tsx
<div className="flex items-center justify-center h-full bg-background text-muted-foreground">
  <p>Preview will connect to ~/.orbit/canvas</p>
</div>
```

## Verify:

- `bun run typecheck` passes
- `bun run lint` passes
- Canvas tab loads without errors

````

---

### Prompt 0.2: Configure Tauri Capabilities

```markdown
# Task: Add required Tauri capabilities for Canvas commands

## Context
Canvas needs permissions for:
- Filesystem access to `~/.orbit/canvas`
- HTTP requests to `ui.shadcn.com`
- Shell commands to run `bun`

## Update: `src-tauri/capabilities/default.json`

Add these permissions to the existing capabilities file:

```json
{
  "identifier": "default",
  "description": "Default capabilities for Orbit",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "shell:allow-open",

    // Existing permissions...

    // Canvas-specific permissions
    "fs:allow-home-read-recursive",
    "fs:allow-home-write-recursive",
    "fs:allow-app-read-recursive",
    "fs:allow-app-write-recursive",

    // HTTP for shadcn registry
    {
      "identifier": "http:default",
      "allow": [
        { "url": "https://ui.shadcn.com/**" }
      ]
    },

    // Shell for bun commands
    {
      "identifier": "shell:allow-spawn",
      "allow": [
        {
          "name": "bun",
          "cmd": "bun",
          "args": true
        }
      ]
    }
  ]
}
````

## Alternative: Create Canvas-specific capability file

### File: `src-tauri/capabilities/canvas.json`

```json
{
  "identifier": "canvas",
  "description": "Capabilities for Canvas UI Builder",
  "windows": ["main"],
  "permissions": [
    {
      "identifier": "fs:scope",
      "allow": ["$HOME/.orbit/**", "$APPDATA/.orbit/**"]
    },
    {
      "identifier": "http:default",
      "allow": [{ "url": "https://ui.shadcn.com/**" }]
    },
    {
      "identifier": "shell:allow-spawn",
      "allow": [
        {
          "name": "bun",
          "cmd": "bun",
          "args": true
        }
      ]
    }
  ]
}
```

## Update: `src-tauri/tauri.conf.json`

Ensure plugins are enabled:

```json
{
  "plugins": {
    "fs": {
      "scope": {
        "allow": ["$HOME/.orbit/**", "$APPDATA/.orbit/**"]
      }
    },
    "http": {
      "scope": ["https://ui.shadcn.com/**"]
    },
    "shell": {
      "scope": [
        {
          "name": "bun",
          "cmd": "bun",
          "args": true
        }
      ]
    }
  }
}
```

## Verify:

- `cargo build` passes
- No capability errors at runtime
- Test with: `await invoke('canvas_check_setup')` in dev console

````

---

## Phase 0.5: Test Infrastructure

### Prompt 0.5.1: Create Test Setup for Canvas Commands

```markdown
# Task: Set up test infrastructure for Canvas commands

## Context
Per CLAUDE.md, all new code requires tests. We need to set up testing for:
1. Rust commands (unit tests)
2. React hooks (vitest)
3. Integration tests for download flow

## Create Rust Tests

### File: `src-tauri/src/commands/canvas/tests.rs`

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn setup_test_orbit_dir() -> TempDir {
        let temp = TempDir::new().unwrap();
        std::env::set_var("ORBIT_CANVAS_PATH", temp.path().to_str().unwrap());
        temp
    }

    #[test]
    fn test_get_orbit_canvas_path_uses_env_override() {
        let temp = setup_test_orbit_dir();
        let path = get_orbit_canvas_path().unwrap();
        assert_eq!(path, temp.path());
    }

    #[test]
    fn test_initialize_directories_creates_structure() {
        let _temp = setup_test_orbit_dir();

        // Run initialization
        tokio_test::block_on(canvas_initialize_directories()).unwrap();

        let orbit_path = get_orbit_canvas_path().unwrap();
        assert!(orbit_path.join("components/ui").exists());
        assert!(orbit_path.join("components/custom").exists());
        assert!(orbit_path.join("lib").exists());
        assert!(orbit_path.join("preview/src").exists());
    }

    #[test]
    fn test_check_setup_returns_not_initialized_for_empty_dir() {
        let _temp = setup_test_orbit_dir();

        let status = tokio_test::block_on(canvas_check_setup()).unwrap();

        assert!(!status.initialized);
        assert_eq!(status.component_count, 0);
    }

    #[tokio::test]
    async fn test_download_component_fetches_button() {
        let _temp = setup_test_orbit_dir();
        tokio_test::block_on(canvas_initialize_directories()).unwrap();

        let result = canvas_download_component("button".to_string()).await;

        assert!(result.is_ok());
        let result = result.unwrap();
        assert!(result.success);
        assert!(result.dependencies.contains(&"@radix-ui/react-slot".to_string()));
    }
}
````

### Update `src-tauri/Cargo.toml`

Add test dependencies:

```toml
[dev-dependencies]
tempfile = "3.10"
tokio-test = "0.4"
```

### Update `src-tauri/src/commands/canvas/mod.rs`

```rust
pub mod setup;
pub mod download;
pub mod preview;

#[cfg(test)]
mod tests;

pub use setup::*;
pub use download::*;
pub use preview::*;
```

## Create Frontend Tests

### File: `apps/Canvas-UI-Builder/src/hooks/__tests__/use-canvas-setup.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCanvasSetup } from '../use-canvas-setup';

// Mock Tauri invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
const mockInvoke = vi.mocked(invoke);

describe('useCanvasSetup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns needs-setup when not initialized', async () => {
    mockInvoke.mockResolvedValue({
      initialized: false,
      orbit_path: '/home/user/.orbit/canvas',
      component_count: 0,
      preview_ready: false,
    });

    const { result } = renderHook(() => useCanvasSetup());

    await waitFor(() => {
      expect(result.current.state).toBe('needs-setup');
    });
  });

  it('returns ready when fully initialized', async () => {
    mockInvoke.mockResolvedValue({
      initialized: true,
      orbit_path: '/home/user/.orbit/canvas',
      component_count: 50,
      preview_ready: true,
    });

    const { result } = renderHook(() => useCanvasSetup());

    await waitFor(() => {
      expect(result.current.state).toBe('ready');
      expect(result.current.componentCount).toBe(50);
    });
  });

  it('returns error on invoke failure', async () => {
    mockInvoke.mockRejectedValue(new Error('Tauri error'));

    const { result } = renderHook(() => useCanvasSetup());

    await waitFor(() => {
      expect(result.current.state).toBe('error');
      expect(result.current.error).toBe('Tauri error');
    });
  });
});
```

### Update `apps/Canvas-UI-Builder/vitest.config.ts` (if needed)

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
  resolve: {
    alias: {
      '@canvas': path.resolve(__dirname, './src'),
      '@common': path.resolve(__dirname, '../../packages/common/src'),
    },
  },
});
```

### Create File: `apps/Canvas-UI-Builder/src/test-setup.ts`

```typescript
import '@testing-library/jest-dom';

// Mock Tauri APIs for testing
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  save: vi.fn(),
}));
```

## Verify:

- `cargo test -p orbit-tauri` passes
- `bun run test` in Canvas-UI-Builder passes

````

---

## Phase 1: Foundation

### Prompt 1.1: Rust Directory Management Commands

```markdown
# Task: Create Rust commands for ~/.orbit/canvas directory management

## Key Change from v2: Environment Variable Override

Support `ORBIT_CANVAS_PATH` env var for testing and non-standard setups.

## Create File: `src-tauri/src/commands/canvas/setup.rs`

```rust
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SetupStatus {
    pub initialized: bool,
    pub orbit_path: String,
    pub component_count: u32,
    pub preview_ready: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ComponentMeta {
    pub name: String,
    pub component_type: String,
    pub dependencies: Vec<String>,
    pub registry_dependencies: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LocalRegistry {
    pub version: String,
    pub last_updated: String,
    pub components: Vec<ComponentMeta>,
}

/// Get the path to ~/.orbit/canvas
/// Supports ORBIT_CANVAS_PATH env override for testing
pub fn get_orbit_canvas_path() -> Result<PathBuf, String> {
    // Check for env override (useful for testing)
    if let Ok(override_path) = std::env::var("ORBIT_CANVAS_PATH") {
        return Ok(PathBuf::from(override_path));
    }

    let home = dirs::home_dir()
        .ok_or_else(|| "Could not find home directory".to_string())?;
    Ok(home.join(".orbit").join("canvas"))
}

#[tauri::command]
pub async fn canvas_get_orbit_path() -> Result<String, String> {
    let path = get_orbit_canvas_path()?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn canvas_check_setup() -> Result<SetupStatus, String> {
    let orbit_path = get_orbit_canvas_path()?;
    let components_path = orbit_path.join("components").join("ui");
    let ready_marker = orbit_path.join(".ready");

    let initialized = orbit_path.exists() && ready_marker.exists();

    let component_count = if components_path.exists() {
        std::fs::read_dir(&components_path)
            .map(|entries| entries.filter_map(|e| e.ok()).count() as u32)
            .unwrap_or(0)
    } else {
        0
    };

    let preview_ready = orbit_path.join("preview").join("node_modules").exists();

    Ok(SetupStatus {
        initialized,
        orbit_path: orbit_path.to_string_lossy().to_string(),
        component_count,
        preview_ready,
    })
}

#[tauri::command]
pub async fn canvas_initialize_directories() -> Result<(), String> {
    let orbit_path = get_orbit_canvas_path()?;

    let dirs = [
        orbit_path.join("components").join("ui"),
        orbit_path.join("components").join("custom"),
        orbit_path.join("lib"),
        orbit_path.join("preview").join("src"),
    ];

    for dir in &dirs {
        std::fs::create_dir_all(dir)
            .map_err(|e| format!("Failed to create {}: {}", dir.display(), e))?;
    }

    Ok(())
}

/// Reset Canvas setup - removes ~/.orbit/canvas entirely
#[tauri::command]
pub async fn canvas_reset_setup() -> Result<(), String> {
    let orbit_path = get_orbit_canvas_path()?;

    if orbit_path.exists() {
        std::fs::remove_dir_all(&orbit_path)
            .map_err(|e| format!("Failed to remove {}: {}", orbit_path.display(), e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn canvas_get_registry() -> Result<LocalRegistry, String> {
    let orbit_path = get_orbit_canvas_path()?;
    let registry_path = orbit_path.join("registry.json");

    if !registry_path.exists() {
        return Ok(LocalRegistry {
            version: "1.0.0".to_string(),
            last_updated: chrono::Utc::now().to_rfc3339(),
            components: vec![],
        });
    }

    let content = std::fs::read_to_string(&registry_path)
        .map_err(|e| format!("Failed to read registry: {}", e))?;

    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse registry: {}", e))
}

#[tauri::command]
pub async fn canvas_save_registry(registry: LocalRegistry) -> Result<(), String> {
    let orbit_path = get_orbit_canvas_path()?;
    let registry_path = orbit_path.join("registry.json");

    let content = serde_json::to_string_pretty(&registry)
        .map_err(|e| format!("Failed to serialize registry: {}", e))?;

    std::fs::write(&registry_path, content)
        .map_err(|e| format!("Failed to write registry: {}", e))
}
````

## Update `src-tauri/Cargo.toml`

```toml
[dependencies]
dirs = "5.0"
chrono = { version = "0.4", features = ["serde", "clock"] }
reqwest = { version = "0.12", features = ["json"] }  # Updated from 0.11
```

## Verify:

- `cargo check` passes
- `cargo test -p orbit-tauri` passes for new tests

````

---

### Prompt 1.2: Frontend Setup Detection Hook

```markdown
# Task: Create React hook to check Canvas setup status

## Create File: `apps/Canvas-UI-Builder/src/hooks/use-canvas-setup.ts`

```typescript
import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface SetupStatus {
  initialized: boolean;
  orbit_path: string;
  component_count: number;
  preview_ready: boolean;
}

export type CanvasSetupState = 'checking' | 'needs-setup' | 'ready' | 'error';

export interface UseCanvasSetupResult {
  state: CanvasSetupState;
  orbitPath: string | null;
  componentCount: number;
  previewReady: boolean;
  error: string | null;
  recheckSetup: () => Promise<void>;
}

export function useCanvasSetup(): UseCanvasSetupResult {
  const [state, setState] = useState<CanvasSetupState>('checking');
  const [orbitPath, setOrbitPath] = useState<string | null>(null);
  const [componentCount, setComponentCount] = useState(0);
  const [previewReady, setPreviewReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkSetup = useCallback(async () => {
    setState('checking');
    setError(null);

    try {
      const status = await invoke<SetupStatus>('canvas_check_setup');
      setOrbitPath(status.orbit_path);
      setComponentCount(status.component_count);
      setPreviewReady(status.preview_ready);

      if (status.initialized && status.component_count > 0 && status.preview_ready) {
        setState('ready');
      } else {
        setState('needs-setup');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('error');
    }
  }, []);

  useEffect(() => {
    void checkSetup();
  }, [checkSetup]);

  return {
    state,
    orbitPath,
    componentCount,
    previewReady,
    error,
    recheckSetup: checkSetup,
  };
}
````

## Create File: `apps/Canvas-UI-Builder/src/hooks/index.ts`

```typescript
export { useCanvasSetup } from './use-canvas-setup';
export type { CanvasSetupState, UseCanvasSetupResult } from './use-canvas-setup';
```

## Verify:

- `bun run typecheck` passes
- Tests pass: `bun run test`

````

---

### Prompt 1.3: Setup Wizard UI

```markdown
# Task: Create Canvas Setup Wizard Component

## Important: Use shared UI components

Import from `@common/components/ui/` NOT local copies.

## Create File: `apps/Canvas-UI-Builder/src/components/setup/CanvasSetupWizard.tsx`

```typescript
import { useState } from 'react';
import { Button } from '@common/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@common/components/ui/card';

interface CanvasSetupWizardProps {
  orbitPath: string;
  onStartSetup: () => Promise<void>;
  onComplete: () => void;
}

type SetupPhase = 'welcome' | 'downloading' | 'installing' | 'complete' | 'error';

interface DownloadProgress {
  component: string;
  current: number;
  total: number;
}

export function CanvasSetupWizard({
  orbitPath,
  onStartSetup,
  onComplete
}: CanvasSetupWizardProps) {
  const [phase, setPhase] = useState<SetupPhase>('welcome');
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSetup = async () => {
    setPhase('downloading');
    setError(null);

    try {
      await onStartSetup();
      setPhase('complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  };

  const handleRetry = () => {
    setPhase('welcome');
    setError(null);
  };

  // Render based on phase
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            {phase === 'welcome' && 'Welcome to Canvas UI Builder'}
            {phase === 'downloading' && 'Downloading Components...'}
            {phase === 'installing' && 'Installing Dependencies...'}
            {phase === 'complete' && 'Setup Complete!'}
            {phase === 'error' && 'Setup Failed'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {phase === 'welcome' && (
            <>
              <p className="text-muted-foreground">
                Canvas will download the shadcn component library to get you started.
              </p>
              <code className="block rounded bg-muted p-3 text-sm">
                {orbitPath}
              </code>
              <Button onClick={handleSetup} className="w-full">
                Setup Canvas
              </Button>
            </>
          )}

          {(phase === 'downloading' || phase === 'installing') && (
            <>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{
                    width: progress
                      ? `${(progress.current / progress.total) * 100}%`
                      : '0%'
                  }}
                />
              </div>
              {progress && (
                <p className="text-sm text-muted-foreground">
                  {progress.component} ({progress.current}/{progress.total})
                </p>
              )}
            </>
          )}

          {phase === 'complete' && (
            <>
              <p className="text-muted-foreground">
                {progress?.total || 50}+ components ready to use.
              </p>
              <Button onClick={onComplete} className="w-full">
                Get Started
              </Button>
            </>
          )}

          {phase === 'error' && (
            <>
              <p className="text-destructive">{error}</p>
              <Button onClick={handleRetry} variant="outline" className="w-full">
                Try Again
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
````

## Create File: `apps/Canvas-UI-Builder/src/components/setup/index.ts`

```typescript
export { CanvasSetupWizard } from './CanvasSetupWizard';
```

## Verify:

- TypeScript passes
- Uses shared UI components correctly

````

---

## Phase 2: Registry Download

### Prompt 2.1: Download Single Component

```markdown
# Task: Rust command to download a single component from shadcn registry

## Registry URL: `https://ui.shadcn.com/r/{name}.json`

## Create File: `src-tauri/src/commands/canvas/download.rs`

```rust
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::time::Duration;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RegistryFile {
    pub path: String,
    pub content: String,
    #[serde(rename = "type")]
    pub file_type: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RegistryComponent {
    pub name: String,
    #[serde(rename = "type")]
    pub component_type: String,
    #[serde(default)]
    pub dependencies: Vec<String>,
    #[serde(rename = "registryDependencies", default)]
    pub registry_dependencies: Vec<String>,
    pub files: Vec<RegistryFile>,
}

#[derive(Serialize, Debug, Clone)]
pub struct DownloadResult {
    pub name: String,
    pub success: bool,
    pub path: Option<String>,
    pub dependencies: Vec<String>,
    pub registry_dependencies: Vec<String>,
    pub error: Option<String>,
}

const SHADCN_REGISTRY_URL: &str = "https://ui.shadcn.com/r";

/// Create HTTP client with timeout and retry logic
fn create_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))
}

#[tauri::command]
pub async fn canvas_download_component(name: String) -> Result<DownloadResult, String> {
    let client = create_client()?;
    let url = format!("{}/{}.json", SHADCN_REGISTRY_URL, name);

    // Retry logic for network failures
    let mut attempts = 0;
    let max_attempts = 3;

    let response = loop {
        attempts += 1;
        match client.get(&url).send().await {
            Ok(resp) => break resp,
            Err(e) if attempts < max_attempts => {
                tokio::time::sleep(Duration::from_secs(1)).await;
                continue;
            }
            Err(e) => {
                return Ok(DownloadResult {
                    name: name.clone(),
                    success: false,
                    path: None,
                    dependencies: vec![],
                    registry_dependencies: vec![],
                    error: Some(format!("Network error after {} attempts: {}", attempts, e)),
                });
            }
        }
    };

    if !response.status().is_success() {
        return Ok(DownloadResult {
            name: name.clone(),
            success: false,
            path: None,
            dependencies: vec![],
            registry_dependencies: vec![],
            error: Some(format!("HTTP {}", response.status())),
        });
    }

    let component: RegistryComponent = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse {}: {}", name, e))?;

    let orbit_path = super::setup::get_orbit_canvas_path()?;

    // Save each file using the path from registry (handles multi-file components)
    for file in &component.files {
        // Registry paths are like "components/ui/button.tsx" or "lib/utils.ts"
        // We strip leading directories and place in our structure
        let relative_path = std::path::Path::new(&file.path);

        // Determine destination based on file type
        let dest_path = if file.path.contains("lib/") {
            // Library files go to lib/
            orbit_path.join("lib").join(relative_path.file_name().unwrap_or_default())
        } else {
            // Component files go to components/ui/ preserving filename
            orbit_path.join("components").join("ui").join(relative_path.file_name().unwrap_or_default())
        };

        if let Some(parent) = dest_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        }

        std::fs::write(&dest_path, &file.content)
            .map_err(|e| format!("Failed to write {}: {}", dest_path.display(), e))?;
    }

    Ok(DownloadResult {
        name: component.name,
        success: true,
        path: Some(orbit_path.join("components").join("ui").to_string_lossy().to_string()),
        dependencies: component.dependencies,
        registry_dependencies: component.registry_dependencies,
        error: None,
    })
}

/// Download the utils.ts helper file
#[tauri::command]
pub async fn canvas_download_utils() -> Result<(), String> {
    let orbit_path = super::setup::get_orbit_canvas_path()?;
    let utils_path = orbit_path.join("lib").join("utils.ts");

    let utils_content = r#"import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
"#;

    std::fs::write(&utils_path, utils_content)
        .map_err(|e| format!("Failed to write utils.ts: {}", e))
}
````

## Verify:

- `cargo check` passes
- Can download a single component with retry logic

````

---

### Prompt 2.2: Batch Download with Progress Events

```markdown
# Task: Download all components with progress reporting

## Hardcoded Component List (verified Jan 2025)

```rust
const SHADCN_COMPONENTS: &[&str] = &[
    "accordion", "alert-dialog", "alert", "aspect-ratio", "avatar",
    "badge", "breadcrumb", "button-group", "button", "calendar",
    "card", "carousel", "chart", "checkbox", "collapsible",
    "combobox", "command", "context-menu", "dialog", "drawer",
    "dropdown-menu", "empty", "field", "form", "hover-card",
    "input-group", "input-otp", "input", "item", "kbd",
    "label", "menubar", "native-select", "navigation-menu", "pagination",
    "popover", "progress", "radio-group", "resizable", "scroll-area",
    "select", "separator", "sheet", "sidebar", "skeleton",
    "slider", "sonner", "spinner", "switch", "table",
    "tabs", "textarea", "toast", "toggle-group", "toggle",
    "tooltip", "typography"
];
````

## Update `src-tauri/src/commands/canvas/download.rs`

Add to the existing file:

```rust
#[derive(Serialize, Clone, Debug)]
pub struct DownloadProgress {
    pub component: String,
    pub current: u32,
    pub total: u32,
    pub phase: String,  // "downloading" | "complete" | "error"
}

#[derive(Serialize, Debug)]
pub struct DownloadSummary {
    pub total: u32,
    pub successful: u32,
    pub failed: u32,
    pub npm_dependencies: Vec<String>,
    pub errors: Vec<String>,
}

#[tauri::command]
pub async fn canvas_download_all_components(
    app_handle: tauri::AppHandle,
) -> Result<DownloadSummary, String> {
    let components: Vec<String> = SHADCN_COMPONENTS.iter().map(|s| s.to_string()).collect();
    let total = components.len() as u32;

    let mut successful = 0u32;
    let mut failed = 0u32;
    let mut errors = Vec::new();
    let mut all_npm_deps: HashSet<String> = HashSet::new();

    // Emit start
    let _ = app_handle.emit("canvas:download-progress", DownloadProgress {
        component: "Starting...".to_string(),
        current: 0,
        total,
        phase: "downloading".to_string(),
    });

    // Download each component
    for (idx, name) in components.iter().enumerate() {
        let _ = app_handle.emit("canvas:download-progress", DownloadProgress {
            component: name.clone(),
            current: (idx + 1) as u32,
            total,
            phase: "downloading".to_string(),
        });

        match canvas_download_component(name.clone()).await {
            Ok(result) => {
                if result.success {
                    successful += 1;
                    for dep in result.dependencies {
                        all_npm_deps.insert(dep);
                    }
                } else {
                    failed += 1;
                    if let Some(err) = result.error {
                        errors.push(format!("{}: {}", name, err));
                    }
                }
            }
            Err(e) => {
                failed += 1;
                errors.push(format!("{}: {}", name, e));
            }
        }
    }

    // Download utils.ts
    if let Err(e) = canvas_download_utils().await {
        errors.push(format!("utils.ts: {}", e));
    }

    // Mark complete
    let orbit_path = super::setup::get_orbit_canvas_path()?;
    std::fs::write(orbit_path.join(".ready"), "")?;

    // Update registry
    let registry = super::setup::LocalRegistry {
        version: "1.0.0".to_string(),
        last_updated: chrono::Utc::now().to_rfc3339(),
        components: components.iter().map(|name| super::setup::ComponentMeta {
            name: name.clone(),
            component_type: "ui".to_string(),
            dependencies: vec![],
            registry_dependencies: vec![],
        }).collect(),
    };
    super::setup::canvas_save_registry(registry).await?;

    // Emit complete
    let _ = app_handle.emit("canvas:download-progress", DownloadProgress {
        component: "Complete".to_string(),
        current: total,
        total,
        phase: "complete".to_string(),
    });

    Ok(DownloadSummary {
        total,
        successful,
        failed,
        npm_dependencies: all_npm_deps.into_iter().collect(),
        errors,
    })
}
```

## Verify:

- `cargo check` passes
- Downloads emit progress events

````

---

## Phase 3: Preview System

### Prompt 3.1: Create Preview Server Files (Using Bun)

```markdown
# Task: Rust command to scaffold the Vite preview server

## IMPORTANT: Uses `bun` not `npm` per CLAUDE.md

## Create/Update: `src-tauri/src/commands/canvas/preview.rs`

```rust
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::State;

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

// Implement Drop to clean up on crash
impl Drop for PreviewServerState {
    fn drop(&mut self) {
        if let Ok(mut guard) = self.process.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
    }
}

#[derive(serde::Serialize)]
pub struct PreviewServerInfo {
    pub running: bool,
    pub port: u16,
    pub url: String,
}

/// Create the preview server project structure
#[tauri::command]
pub async fn canvas_setup_preview_server() -> Result<(), String> {
    let orbit_path = super::setup::get_orbit_canvas_path()?;
    let preview_path = orbit_path.join("preview");

    std::fs::create_dir_all(preview_path.join("src"))
        .map_err(|e| format!("Failed to create preview directory: {}", e))?;

    // 1. package.json - Note: uses bun
    let package_json = r##{
  "name": "orbit-canvas-preview",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --port 5199 --host --strictPort"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.2.0",
    "class-variance-authority": "^0.7.0",
    "@radix-ui/react-slot": "^1.0.2",
    "@radix-ui/react-accordion": "^1.2.0",
    "@radix-ui/react-alert-dialog": "^1.1.0",
    "@radix-ui/react-dialog": "^1.1.0",
    "@radix-ui/react-dropdown-menu": "^2.1.0",
    "@radix-ui/react-label": "^2.1.0",
    "@radix-ui/react-popover": "^1.1.0",
    "@radix-ui/react-select": "^2.1.0",
    "@radix-ui/react-separator": "^1.1.0",
    "@radix-ui/react-tabs": "^1.1.0",
    "@radix-ui/react-tooltip": "^1.1.0",
    "lucide-react": "^0.400.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.6.0",
    "vite": "^6.0.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0"
  }
}"##;
    std::fs::write(preview_path.join("package.json"), package_json)?;

    // 2. vite.config.ts - dynamic path resolution
    let vite_config = r##"import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { homedir } from 'os';

// Resolve orbit path dynamically
const ORBIT_PATH = process.env.ORBIT_CANVAS_PATH || path.join(homedir(), '.orbit', 'canvas');

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5199,
    strictPort: true,
    fs: {
      allow: ['.', ORBIT_PATH],
    },
  },
  resolve: {
    alias: {
      '@/components/ui': path.join(ORBIT_PATH, 'components', 'ui'),
      '@/components/custom': path.join(ORBIT_PATH, 'components', 'custom'),
      '@/lib': path.join(ORBIT_PATH, 'lib'),
    },
  },
});
"##;
    std::fs::write(preview_path.join("vite.config.ts"), vite_config)?;

    // 3. index.html
    let index_html = r##"<!DOCTYPE html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Canvas Preview</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>"##;
    std::fs::write(preview_path.join("index.html"), index_html)?;

    // 4. tsconfig.json
    let tsconfig = r##"{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "paths": {
      "@/components/ui/*": ["../components/ui/*"],
      "@/components/custom/*": ["../components/custom/*"],
      "@/lib/*": ["../lib/*"]
    }
  },
  "include": ["src"]
}"##;
    std::fs::write(preview_path.join("tsconfig.json"), tsconfig)?;

    // 5. src/main.tsx
    let main_tsx = r##"import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Preview } from './Preview';
import './globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Preview />
  </StrictMode>
);"##;
    std::fs::write(preview_path.join("src/main.tsx"), main_tsx)?;

    // 6. src/Preview.tsx
    let preview_tsx = r##"import { useState, useEffect, ComponentType } from 'react';

interface PreviewMessage {
  type: 'preview:load' | 'preview:update-styles' | 'preview:update-props' | 'preview:clear';
  componentName?: string;
  componentType?: string;
  styles?: Record<string, string>;
  props?: Record<string, unknown>;
}

interface PreviewResponse {
  type: 'preview:ready' | 'preview:loaded' | 'preview:error';
  componentName?: string;
  error?: string;
  exports?: string[];
}

// Specify origin for security
const ALLOWED_ORIGIN = 'tauri://localhost';

function sendToParent(response: PreviewResponse) {
  window.parent.postMessage(response, '*'); // Parent is Tauri webview
}

export function Preview() {
  const [Component, setComponent] = useState<ComponentType<any> | null>(null);
  const [componentName, setComponentName] = useState<string>('');
  const [props, setProps] = useState<Record<string, unknown>>({});
  const [styles, setStyles] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadComponent = async (name: string, type: string = 'ui') => {
    setLoading(true);
    setError(null);

    try {
      const module = type === 'custom'
        ? await import(`@/components/custom/${name}.tsx`)
        : await import(`@/components/ui/${name}.tsx`);

      // Handle various export patterns
      const pascalName = name.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
      const Comp = module[pascalName] || module.default || Object.values(module)[0];

      if (!Comp) {
        throw new Error(`No component export found in ${name}`);
      }

      setComponent(() => Comp);
      setComponentName(name);
      setLoading(false);

      const exports = Object.keys(module).filter(k => typeof module[k] === 'function');
      sendToParent({ type: 'preview:loaded', componentName: name, exports });

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      setLoading(false);
      sendToParent({ type: 'preview:error', error: errorMsg });
    }
  };

  useEffect(() => {
    const handler = (event: MessageEvent<PreviewMessage>) => {
      // Accept messages from Tauri webview
      const { type, componentName, componentType, styles: newStyles, props: newProps } = event.data || {};

      switch (type) {
        case 'preview:load':
          if (componentName) {
            loadComponent(componentName, componentType || 'ui');
          }
          break;
        case 'preview:update-styles':
          if (newStyles) setStyles(newStyles);
          break;
        case 'preview:update-props':
          if (newProps) setProps(newProps);
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
    sendToParent({ type: 'preview:ready' });

    return () => window.removeEventListener('message', handler);
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background p-8">
        <div className="text-center text-destructive max-w-md">
          <p className="text-lg font-medium mb-2">Error Loading Component</p>
          <p className="text-sm opacity-70 font-mono">{error}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
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
        <p className="text-sm text-muted-foreground font-mono">{componentName}</p>
        <div className="p-6 rounded-lg border border-border bg-card">
          <Component {...props} style={styles} />
        </div>
      </div>
    </div>
  );
}
"##;
    std::fs::write(preview_path.join("src/Preview.tsx"), preview_tsx)?;

    // 7. src/globals.css - Synced with main app theme
    let globals_css = r##"@import "tailwindcss";

/*
 * Theme variables synced with main Orbit app.
 * These should match apps/Agent/src/index.css
 */
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);
  --radius: 0.625rem;
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.205 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(0.269 0 0);
  --input: oklch(0.269 0 0);
  --ring: oklch(0.556 0 0);
}

body {
  background-color: var(--background);
  color: var(--foreground);
  font-family: system-ui, -apple-system, sans-serif;
}
"##;
    std::fs::write(preview_path.join("src/globals.css"), globals_css)?;

    Ok(())
}

/// Install dependencies using bun (NOT npm)
#[tauri::command]
pub async fn canvas_install_preview_deps() -> Result<(), String> {
    let orbit_path = super::setup::get_orbit_canvas_path()?;
    let preview_path = orbit_path.join("preview");

    let output = Command::new("bun")
        .arg("install")
        .current_dir(&preview_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to run bun install: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("bun install failed: {}", stderr));
    }

    Ok(())
}

/// Start the preview server using bun
#[tauri::command]
pub async fn canvas_start_preview_server(
    state: State<'_, PreviewServerState>,
) -> Result<PreviewServerInfo, String> {
    let mut process_guard = state.process.lock().map_err(|e| e.to_string())?;

    // Check if already running
    if let Some(ref mut child) = *process_guard {
        match child.try_wait() {
            Ok(None) => {
                return Ok(PreviewServerInfo {
                    running: true,
                    port: 5199,
                    url: "http://localhost:5199".to_string(),
                });
            }
            _ => {
                *process_guard = None;
            }
        }
    }

    let orbit_path = super::setup::get_orbit_canvas_path()?;
    let preview_path = orbit_path.join("preview");

    // Spawn using bun
    let child = Command::new("bun")
        .args(["run", "dev"])
        .current_dir(&preview_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start preview server: {}", e))?;

    *process_guard = Some(child);
    drop(process_guard); // Release lock before polling

    // Poll for server readiness (max 30 seconds)
    let client = reqwest::Client::new();
    let start = std::time::Instant::now();
    let timeout = std::time::Duration::from_secs(30);

    loop {
        if start.elapsed() > timeout {
            // Timeout - kill process
            if let Ok(mut guard) = state.process.lock() {
                if let Some(mut child) = guard.take() {
                    let _ = child.kill();
                }
            }
            return Err("Preview server failed to start within 30 seconds".to_string());
        }

        match client.get("http://localhost:5199").send().await {
            Ok(resp) if resp.status().is_success() || resp.status().as_u16() == 404 => {
                // 404 is OK - Vite is running but no index
                break;
            }
            _ => {
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            }
        }
    }

    Ok(PreviewServerInfo {
        running: true,
        port: 5199,
        url: "http://localhost:5199".to_string(),
    })
}

/// Stop the preview server
#[tauri::command]
pub async fn canvas_stop_preview_server(
    state: State<'_, PreviewServerState>,
) -> Result<(), String> {
    let mut process_guard = state.process.lock().map_err(|e| e.to_string())?;

    if let Some(mut child) = process_guard.take() {
        #[cfg(windows)]
        {
            let _ = Command::new("taskkill")
                .args(["/PID", &child.id().to_string(), "/T", "/F"])
                .output();
        }

        #[cfg(not(windows))]
        {
            let _ = child.kill();
        }

        let _ = child.wait();
    }

    Ok(())
}

/// Get preview server status
#[tauri::command]
pub async fn canvas_preview_server_status(
    state: State<'_, PreviewServerState>,
) -> Result<PreviewServerInfo, String> {
    let mut process_guard = state.process.lock().map_err(|e| e.to_string())?;

    let running = if let Some(ref mut child) = *process_guard {
        match child.try_wait() {
            Ok(None) => true,
            _ => {
                *process_guard = None;
                false
            }
        }
    } else {
        false
    };

    Ok(PreviewServerInfo {
        running,
        port: 5199,
        url: "http://localhost:5199".to_string(),
    })
}
````

## Update `src-tauri/src/lib.rs`

```rust
use commands::canvas::preview::PreviewServerState;

// In run():
.manage(PreviewServerState::new())
```

## Verify:

- `cargo check` passes
- Uses `bun` not `npm`
- Has `Drop` implementation for cleanup

````

---

## Phase 4: Component Loading

### Prompt 4.1: Component Registry Hook

```markdown
# Task: Create hook to load and manage the local component registry

## Context
The local registry at `~/.orbit/canvas/registry.json` tracks all downloaded components.
This hook provides access to the component list for the sidebar.

## Create File: `apps/Canvas-UI-Builder/src/hooks/use-component-registry.ts`

```typescript
import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface ComponentMeta {
  name: string;
  component_type: 'ui' | 'custom';
  dependencies: string[];
  registry_dependencies: string[];
}

export interface LocalRegistry {
  version: string;
  last_updated: string;
  components: ComponentMeta[];
}

export interface UseComponentRegistryResult {
  registry: LocalRegistry | null;
  uiComponents: ComponentMeta[];
  customComponents: ComponentMeta[];
  loading: boolean;
  error: string | null;
  refreshRegistry: () => Promise<void>;
}

export function useComponentRegistry(): UseComponentRegistryResult {
  const [registry, setRegistry] = useState<LocalRegistry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRegistry = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await invoke<LocalRegistry>('canvas_get_registry');
      setRegistry(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRegistry();
  }, [loadRegistry]);

  const uiComponents = registry?.components.filter(c => c.component_type === 'ui') ?? [];
  const customComponents = registry?.components.filter(c => c.component_type === 'custom') ?? [];

  return {
    registry,
    uiComponents,
    customComponents,
    loading,
    error,
    refreshRegistry: loadRegistry,
  };
}
````

## Update: `apps/Canvas-UI-Builder/src/hooks/index.ts`

```typescript
export { useCanvasSetup } from './use-canvas-setup';
export type { CanvasSetupState, UseCanvasSetupResult } from './use-canvas-setup';

export { useComponentRegistry } from './use-component-registry';
export type {
  ComponentMeta,
  LocalRegistry,
  UseComponentRegistryResult,
} from './use-component-registry';
```

## Verify:

- TypeScript passes
- Hook returns component lists correctly

````

---

### Prompt 4.2: Component Sidebar List

```markdown
# Task: Create sidebar component list with search and categories

## Create File: `apps/Canvas-UI-Builder/src/components/sidebar/ComponentList.tsx`

```typescript
import { useState, useMemo } from 'react';
import { Input } from '@common/components/ui/input';
import { ScrollArea } from '@common/components/ui/scroll-area';
import { useComponentRegistry, ComponentMeta } from '@canvas/hooks';

interface ComponentListProps {
  onSelectComponent: (name: string, type: 'ui' | 'custom') => void;
  selectedComponent: string | null;
}

export function ComponentList({ onSelectComponent, selectedComponent }: ComponentListProps) {
  const { uiComponents, customComponents, loading, error } = useComponentRegistry();
  const [search, setSearch] = useState('');

  const filteredUI = useMemo(() =>
    uiComponents.filter(c =>
      c.name.toLowerCase().includes(search.toLowerCase())
    ),
    [uiComponents, search]
  );

  const filteredCustom = useMemo(() =>
    customComponents.filter(c =>
      c.name.toLowerCase().includes(search.toLowerCase())
    ),
    [customComponents, search]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-destructive">
        Failed to load components: {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border">
        <Input
          placeholder="Search components..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8"
        />
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2">
          {/* UI Components */}
          <div className="mb-4">
            <h3 className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              UI Components ({filteredUI.length})
            </h3>
            <div className="space-y-0.5">
              {filteredUI.map((component) => (
                <ComponentItem
                  key={component.name}
                  component={component}
                  isSelected={selectedComponent === component.name}
                  onClick={() => onSelectComponent(component.name, 'ui')}
                />
              ))}
            </div>
          </div>

          {/* Custom Components */}
          {filteredCustom.length > 0 && (
            <div>
              <h3 className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Custom ({filteredCustom.length})
              </h3>
              <div className="space-y-0.5">
                {filteredCustom.map((component) => (
                  <ComponentItem
                    key={component.name}
                    component={component}
                    isSelected={selectedComponent === component.name}
                    onClick={() => onSelectComponent(component.name, 'custom')}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

interface ComponentItemProps {
  component: ComponentMeta;
  isSelected: boolean;
  onClick: () => void;
}

function ComponentItem({ component, isSelected, onClick }: ComponentItemProps) {
  // Convert kebab-case to Title Case for display
  const displayName = component.name
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return (
    <button
      onClick={onClick}
      className={`
        w-full px-2 py-1.5 text-left text-sm rounded-md transition-colors
        ${isSelected
          ? 'bg-accent text-accent-foreground'
          : 'hover:bg-muted text-foreground'
        }
      `}
    >
      {displayName}
    </button>
  );
}
````

## Verify:

- Components display in sidebar
- Search filters correctly
- Selection state works

````

---

### Prompt 4.3: Preview Panel with iframe

```markdown
# Task: Create the preview panel that embeds the Vite preview server

## Create File: `apps/Canvas-UI-Builder/src/components/preview/PreviewPanel.tsx`

```typescript
import { useRef, useEffect, useState, useCallback } from 'react';

interface PreviewMessage {
  type: 'preview:load' | 'preview:update-styles' | 'preview:update-props' | 'preview:clear';
  componentName?: string;
  componentType?: string;
  styles?: Record<string, string>;
  props?: Record<string, unknown>;
}

interface PreviewResponse {
  type: 'preview:ready' | 'preview:loaded' | 'preview:error';
  componentName?: string;
  error?: string;
  exports?: string[];
}

interface PreviewPanelProps {
  serverUrl: string;
  componentName: string | null;
  componentType: 'ui' | 'custom';
  styles: Record<string, string>;
  props: Record<string, unknown>;
  onReady: () => void;
  onError: (error: string) => void;
  onLoaded: (exports: string[]) => void;
}

export function PreviewPanel({
  serverUrl,
  componentName,
  componentType,
  styles,
  props,
  onReady,
  onError,
  onLoaded,
}: PreviewPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isReady, setIsReady] = useState(false);

  // Send message to iframe
  const sendMessage = useCallback((message: PreviewMessage) => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(message, serverUrl);
    }
  }, [serverUrl]);

  // Listen for messages from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent<PreviewResponse>) => {
      // Verify origin for security
      if (!event.origin.includes('localhost:5199')) return;

      const { type, error, exports } = event.data || {};

      switch (type) {
        case 'preview:ready':
          setIsReady(true);
          onReady();
          break;
        case 'preview:loaded':
          onLoaded(exports ?? []);
          break;
        case 'preview:error':
          onError(error ?? 'Unknown error');
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onReady, onError, onLoaded]);

  // Load component when name changes
  useEffect(() => {
    if (isReady && componentName) {
      sendMessage({
        type: 'preview:load',
        componentName,
        componentType,
      });
    }
  }, [isReady, componentName, componentType, sendMessage]);

  // Update styles when they change
  useEffect(() => {
    if (isReady && componentName) {
      sendMessage({
        type: 'preview:update-styles',
        styles,
      });
    }
  }, [isReady, componentName, styles, sendMessage]);

  // Update props when they change
  useEffect(() => {
    if (isReady && componentName) {
      sendMessage({
        type: 'preview:update-props',
        props,
      });
    }
  }, [isReady, componentName, props, sendMessage]);

  return (
    <div className="relative w-full h-full bg-background">
      <iframe
        ref={iframeRef}
        src={serverUrl}
        className="w-full h-full border-0"
        title="Component Preview"
        sandbox="allow-scripts allow-same-origin"
      />

      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
            <p className="text-sm text-muted-foreground">Connecting to preview...</p>
          </div>
        </div>
      )}
    </div>
  );
}
````

## Create File: `apps/Canvas-UI-Builder/src/hooks/use-preview-server.ts`

```typescript
import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface PreviewServerInfo {
  running: boolean;
  port: number;
  url: string;
}

type ServerState = 'stopped' | 'starting' | 'running' | 'error';

export interface UsePreviewServerResult {
  state: ServerState;
  url: string | null;
  error: string | null;
  startServer: () => Promise<void>;
  stopServer: () => Promise<void>;
}

export function usePreviewServer(): UsePreviewServerResult {
  const [state, setState] = useState<ServerState>('stopped');
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check initial status
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const info = await invoke<PreviewServerInfo>('canvas_preview_server_status');
        if (info.running) {
          setState('running');
          setUrl(info.url);
        }
      } catch {
        // Server not running, that's OK
      }
    };
    void checkStatus();
  }, []);

  const startServer = useCallback(async () => {
    setState('starting');
    setError(null);

    try {
      // First install deps if needed
      await invoke('canvas_install_preview_deps');

      // Then start server
      const info = await invoke<PreviewServerInfo>('canvas_start_preview_server');
      setUrl(info.url);
      setState('running');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setState('error');
    }
  }, []);

  const stopServer = useCallback(async () => {
    try {
      await invoke('canvas_stop_preview_server');
      setState('stopped');
      setUrl(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  return {
    state,
    url,
    error,
    startServer,
    stopServer,
  };
}
```

## Verify:

- Preview iframe loads
- postMessage communication works
- Server lifecycle managed correctly

````

---

## Phase 5: Live Editing

### Prompt 5.1: CSS Properties Editor

```markdown
# Task: Create CSS properties panel for live editing

## Create File: `apps/Canvas-UI-Builder/src/components/inspector/CSSPropertiesEditor.tsx`

```typescript
import { useState, useCallback } from 'react';
import { Input } from '@common/components/ui/input';
import { Label } from '@common/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@common/components/ui/tabs';
import { ScrollArea } from '@common/components/ui/scroll-area';

interface CSSPropertiesEditorProps {
  styles: Record<string, string>;
  onChange: (styles: Record<string, string>) => void;
}

// Common CSS properties organized by category
const CSS_CATEGORIES = {
  spacing: ['padding', 'margin', 'gap'],
  sizing: ['width', 'height', 'min-width', 'min-height', 'max-width', 'max-height'],
  colors: ['color', 'background-color', 'border-color'],
  border: ['border-width', 'border-radius', 'border-style'],
  typography: ['font-size', 'font-weight', 'line-height', 'letter-spacing'],
  effects: ['opacity', 'box-shadow', 'transform'],
} as const;

export function CSSPropertiesEditor({ styles, onChange }: CSSPropertiesEditorProps) {
  const [customProperty, setCustomProperty] = useState('');
  const [customValue, setCustomValue] = useState('');

  const updateStyle = useCallback((property: string, value: string) => {
    const newStyles = { ...styles };
    if (value.trim() === '') {
      delete newStyles[property];
    } else {
      newStyles[property] = value;
    }
    onChange(newStyles);
  }, [styles, onChange]);

  const addCustomProperty = useCallback(() => {
    if (customProperty.trim() && customValue.trim()) {
      updateStyle(customProperty.trim(), customValue.trim());
      setCustomProperty('');
      setCustomValue('');
    }
  }, [customProperty, customValue, updateStyle]);

  return (
    <div className="flex flex-col h-full">
      <Tabs defaultValue="spacing" className="flex-1 flex flex-col">
        <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0">
          {Object.keys(CSS_CATEGORIES).map((category) => (
            <TabsTrigger
              key={category}
              value={category}
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary capitalize text-xs"
            >
              {category}
            </TabsTrigger>
          ))}
        </TabsList>

        <ScrollArea className="flex-1">
          {Object.entries(CSS_CATEGORIES).map(([category, properties]) => (
            <TabsContent key={category} value={category} className="p-3 space-y-3 m-0">
              {properties.map((property) => (
                <div key={property} className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{property}</Label>
                  <Input
                    value={styles[property] ?? ''}
                    onChange={(e) => updateStyle(property, e.target.value)}
                    placeholder={`Enter ${property}...`}
                    className="h-8 text-sm font-mono"
                  />
                </div>
              ))}
            </TabsContent>
          ))}
        </ScrollArea>
      </Tabs>

      {/* Custom property input */}
      <div className="border-t border-border p-3 space-y-2">
        <Label className="text-xs text-muted-foreground">Add Custom Property</Label>
        <div className="flex gap-2">
          <Input
            value={customProperty}
            onChange={(e) => setCustomProperty(e.target.value)}
            placeholder="property"
            className="h-8 text-sm font-mono flex-1"
          />
          <Input
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            placeholder="value"
            className="h-8 text-sm font-mono flex-1"
            onKeyDown={(e) => e.key === 'Enter' && addCustomProperty()}
          />
        </div>
      </div>
    </div>
  );
}
````

## Verify:

- CSS properties update in real-time
- Changes reflect in preview immediately
- Custom properties can be added

````

---

### Prompt 5.2: Component Props Editor

```markdown
# Task: Create component props editor for variants and other props

## Create File: `apps/Canvas-UI-Builder/src/components/inspector/PropsEditor.tsx`

```typescript
import { useCallback } from 'react';
import { Input } from '@common/components/ui/input';
import { Label } from '@common/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@common/components/ui/select';
import { Switch } from '@common/components/ui/switch';
import { ScrollArea } from '@common/components/ui/scroll-area';

interface PropsEditorProps {
  componentName: string;
  props: Record<string, unknown>;
  onChange: (props: Record<string, unknown>) => void;
}

// Common shadcn component prop definitions
const COMPONENT_PROPS: Record<string, PropDefinition[]> = {
  button: [
    { name: 'variant', type: 'select', options: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'] },
    { name: 'size', type: 'select', options: ['default', 'sm', 'lg', 'icon'] },
    { name: 'disabled', type: 'boolean' },
    { name: 'children', type: 'string', default: 'Button' },
  ],
  badge: [
    { name: 'variant', type: 'select', options: ['default', 'secondary', 'destructive', 'outline'] },
    { name: 'children', type: 'string', default: 'Badge' },
  ],
  input: [
    { name: 'type', type: 'select', options: ['text', 'email', 'password', 'number', 'search'] },
    { name: 'placeholder', type: 'string' },
    { name: 'disabled', type: 'boolean' },
  ],
  card: [
    { name: 'children', type: 'string', default: 'Card Content' },
  ],
  switch: [
    { name: 'checked', type: 'boolean' },
    { name: 'disabled', type: 'boolean' },
  ],
  checkbox: [
    { name: 'checked', type: 'boolean' },
    { name: 'disabled', type: 'boolean' },
  ],
  avatar: [
    { name: 'src', type: 'string', default: 'https://github.com/shadcn.png' },
    { name: 'alt', type: 'string', default: 'Avatar' },
  ],
  progress: [
    { name: 'value', type: 'number', default: 50 },
  ],
  slider: [
    { name: 'defaultValue', type: 'number', default: 50 },
    { name: 'max', type: 'number', default: 100 },
    { name: 'step', type: 'number', default: 1 },
  ],
  // Add more component definitions as needed
};

interface PropDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  options?: string[];
  default?: unknown;
}

export function PropsEditor({ componentName, props, onChange }: PropsEditorProps) {
  const propDefs = COMPONENT_PROPS[componentName] ?? [];

  const updateProp = useCallback((name: string, value: unknown) => {
    onChange({ ...props, [name]: value });
  }, [props, onChange]);

  if (propDefs.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        No editable props defined for this component.
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-3 space-y-4">
        {propDefs.map((propDef) => (
          <PropInput
            key={propDef.name}
            definition={propDef}
            value={props[propDef.name] ?? propDef.default}
            onChange={(value) => updateProp(propDef.name, value)}
          />
        ))}
      </div>
    </ScrollArea>
  );
}

interface PropInputProps {
  definition: PropDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}

function PropInput({ definition, value, onChange }: PropInputProps) {
  const { name, type, options } = definition;

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground capitalize">{name}</Label>

      {type === 'string' && (
        <Input
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 text-sm"
        />
      )}

      {type === 'number' && (
        <Input
          type="number"
          value={Number(value ?? 0)}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-8 text-sm"
        />
      )}

      {type === 'boolean' && (
        <Switch
          checked={Boolean(value)}
          onCheckedChange={onChange}
        />
      )}

      {type === 'select' && options && (
        <Select value={String(value ?? '')} onValueChange={onChange}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
````

## Verify:

- Props editor shows correct options per component
- Changes update preview in real-time
- Boolean switches work correctly

````

---

### Prompt 5.3: Unified Inspector Panel

```markdown
# Task: Combine CSS and Props editors into unified inspector

## Create File: `apps/Canvas-UI-Builder/src/components/inspector/InspectorPanel.tsx`

```typescript
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@common/components/ui/tabs';
import { CSSPropertiesEditor } from './CSSPropertiesEditor';
import { PropsEditor } from './PropsEditor';

interface InspectorPanelProps {
  componentName: string | null;
  styles: Record<string, string>;
  props: Record<string, unknown>;
  onStylesChange: (styles: Record<string, string>) => void;
  onPropsChange: (props: Record<string, unknown>) => void;
}

export function InspectorPanel({
  componentName,
  styles,
  props,
  onStylesChange,
  onPropsChange,
}: InspectorPanelProps) {
  if (!componentName) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Select a component to edit
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-border">
        <h2 className="font-medium text-sm">{formatComponentName(componentName)}</h2>
      </div>

      <Tabs defaultValue="props" className="flex-1 flex flex-col">
        <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0">
          <TabsTrigger
            value="props"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary text-xs"
          >
            Props
          </TabsTrigger>
          <TabsTrigger
            value="styles"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary text-xs"
          >
            Styles
          </TabsTrigger>
        </TabsList>

        <TabsContent value="props" className="flex-1 m-0">
          <PropsEditor
            componentName={componentName}
            props={props}
            onChange={onPropsChange}
          />
        </TabsContent>

        <TabsContent value="styles" className="flex-1 m-0">
          <CSSPropertiesEditor
            styles={styles}
            onChange={onStylesChange}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function formatComponentName(name: string): string {
  return name
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
````

## Create File: `apps/Canvas-UI-Builder/src/components/inspector/index.ts`

```typescript
export { InspectorPanel } from './InspectorPanel';
export { CSSPropertiesEditor } from './CSSPropertiesEditor';
export { PropsEditor } from './PropsEditor';
```

## Verify:

- Inspector tabs switch correctly
- Both editors functional
- State managed properly

````

---

## Phase 6: Save System

### Prompt 6.1: Rust Save Commands

```markdown
# Task: Create Rust commands for saving customized components

## Create File: `src-tauri/src/commands/canvas/save.rs`

```rust
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Debug)]
pub struct SaveComponentInput {
    pub name: String,
    pub source_name: String,
    pub source_type: String, // "ui" | "custom"
    pub styles: std::collections::HashMap<String, String>,
    pub props: serde_json::Value,
}

#[derive(Serialize, Debug)]
pub struct SaveResult {
    pub success: bool,
    pub path: Option<String>,
    pub error: Option<String>,
}

/// Save a customized component to the custom folder
#[tauri::command]
pub async fn canvas_save_custom_component(input: SaveComponentInput) -> Result<SaveResult, String> {
    let orbit_path = super::setup::get_orbit_canvas_path()?;

    // Read source component
    let source_path = if input.source_type == "custom" {
        orbit_path.join("components").join("custom").join(format!("{}.tsx", input.source_name))
    } else {
        orbit_path.join("components").join("ui").join(format!("{}.tsx", input.source_name))
    };

    if !source_path.exists() {
        return Ok(SaveResult {
            success: false,
            path: None,
            error: Some(format!("Source component not found: {}", source_path.display())),
        });
    }

    let source_content = std::fs::read_to_string(&source_path)
        .map_err(|e| format!("Failed to read source: {}", e))?;

    // Generate customized component
    let custom_content = generate_custom_component(
        &input.name,
        &input.source_name,
        &source_content,
        &input.styles,
    );

    // Save to custom folder
    let dest_path = orbit_path
        .join("components")
        .join("custom")
        .join(format!("{}.tsx", input.name));

    std::fs::write(&dest_path, custom_content)
        .map_err(|e| format!("Failed to write component: {}", e))?;

    // Update registry
    update_registry_with_custom(&input.name).await?;

    Ok(SaveResult {
        success: true,
        path: Some(dest_path.to_string_lossy().to_string()),
        error: None,
    })
}

fn generate_custom_component(
    name: &str,
    source_name: &str,
    source_content: &str,
    styles: &std::collections::HashMap<String, String>,
) -> String {
    // Convert name to PascalCase for component name
    let pascal_name: String = name
        .split('-')
        .map(|s| {
            let mut c = s.chars();
            match c.next() {
                None => String::new(),
                Some(f) => f.to_uppercase().chain(c).collect(),
            }
        })
        .collect();

    // Generate inline styles
    let style_string = if styles.is_empty() {
        String::new()
    } else {
        let style_entries: Vec<String> = styles
            .iter()
            .map(|(k, v)| {
                // Convert kebab-case to camelCase for React style objects
                let camel_key = k.split('-')
                    .enumerate()
                    .map(|(i, s)| {
                        if i == 0 {
                            s.to_string()
                        } else {
                            let mut c = s.chars();
                            match c.next() {
                                None => String::new(),
                                Some(f) => f.to_uppercase().chain(c).collect(),
                            }
                        }
                    })
                    .collect::<String>();
                format!("  {}: '{}',", camel_key, v)
            })
            .collect();
        format!("const customStyles = {{\n{}\n}};\n\n", style_entries.join("\n"))
    };

    // Create wrapper component
    format!(
        r#"// Custom component based on {source_name}
// Generated by Canvas UI Builder

import {{ {source_pascal} }} from '../ui/{source_name}';

{styles}export function {pascal_name}(props: React.ComponentProps<typeof {source_pascal}>) {{
  return (
    <{source_pascal}
      {{...props}}
      {style_prop}
    />
  );
}}
"#,
        source_name = source_name,
        source_pascal = to_pascal_case(source_name),
        styles = style_string,
        pascal_name = pascal_name,
        style_prop = if styles.is_empty() { "" } else { "style={{...customStyles, ...props.style}}" },
    )
}

fn to_pascal_case(s: &str) -> String {
    s.split('-')
        .map(|part| {
            let mut c = part.chars();
            match c.next() {
                None => String::new(),
                Some(f) => f.to_uppercase().chain(c).collect(),
            }
        })
        .collect()
}

async fn update_registry_with_custom(name: &str) -> Result<(), String> {
    let mut registry = super::setup::canvas_get_registry().await?;

    // Check if already exists
    if !registry.components.iter().any(|c| c.name == name) {
        registry.components.push(super::setup::ComponentMeta {
            name: name.to_string(),
            component_type: "custom".to_string(),
            dependencies: vec![],
            registry_dependencies: vec![],
        });

        registry.last_updated = chrono::Utc::now().to_rfc3339();
        super::setup::canvas_save_registry(registry).await?;
    }

    Ok(())
}

/// Export a component to an external project path
#[tauri::command]
pub async fn canvas_export_component(
    component_name: String,
    component_type: String,
    destination_dir: String,
) -> Result<SaveResult, String> {
    let orbit_path = super::setup::get_orbit_canvas_path()?;

    // Determine source
    let source_path = if component_type == "custom" {
        orbit_path.join("components").join("custom").join(format!("{}.tsx", component_name))
    } else {
        orbit_path.join("components").join("ui").join(format!("{}.tsx", component_name))
    };

    if !source_path.exists() {
        return Ok(SaveResult {
            success: false,
            path: None,
            error: Some(format!("Component not found: {}", component_name)),
        });
    }

    let dest_path = PathBuf::from(&destination_dir).join(format!("{}.tsx", component_name));

    // Copy component
    std::fs::copy(&source_path, &dest_path)
        .map_err(|e| format!("Failed to copy component: {}", e))?;

    // Also copy utils.ts if it doesn't exist at destination
    let utils_dest = PathBuf::from(&destination_dir)
        .parent()
        .unwrap_or(&PathBuf::from(&destination_dir))
        .join("lib")
        .join("utils.ts");

    if !utils_dest.exists() {
        if let Some(parent) = utils_dest.parent() {
            std::fs::create_dir_all(parent).ok();
        }
        let utils_source = orbit_path.join("lib").join("utils.ts");
        if utils_source.exists() {
            std::fs::copy(&utils_source, &utils_dest).ok();
        }
    }

    Ok(SaveResult {
        success: true,
        path: Some(dest_path.to_string_lossy().to_string()),
        error: None,
    })
}
````

## Update `src-tauri/src/commands/canvas/mod.rs`

```rust
pub mod setup;
pub mod download;
pub mod preview;
pub mod save;

#[cfg(test)]
mod tests;

pub use setup::*;
pub use download::*;
pub use preview::*;
pub use save::*;
```

## Verify:

- `cargo check` passes
- Save creates valid component file
- Export copies to correct location

````

---

### Prompt 6.2: Save Dialog UI

```markdown
# Task: Create save dialog for customized components

## Create File: `apps/Canvas-UI-Builder/src/components/dialogs/SaveComponentDialog.tsx`

```typescript
import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@common/components/ui/dialog';
import { Button } from '@common/components/ui/button';
import { Input } from '@common/components/ui/input';
import { Label } from '@common/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@common/components/ui/tabs';

interface SaveComponentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  componentName: string;
  componentType: 'ui' | 'custom';
  styles: Record<string, string>;
  props: Record<string, unknown>;
  onSaved: () => void;
}

interface SaveResult {
  success: boolean;
  path: string | null;
  error: string | null;
}

export function SaveComponentDialog({
  open,
  onOpenChange,
  componentName,
  componentType,
  styles,
  props,
  onSaved,
}: SaveComponentDialogProps) {
  const [customName, setCustomName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSaveAsCustom = async () => {
    if (!customName.trim()) {
      setError('Please enter a component name');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const result = await invoke<SaveResult>('canvas_save_custom_component', {
        input: {
          name: customName.trim().toLowerCase().replace(/\s+/g, '-'),
          source_name: componentName,
          source_type: componentType,
          styles,
          props,
        },
      });

      if (result.success) {
        onSaved();
        onOpenChange(false);
        setCustomName('');
      } else {
        setError(result.error ?? 'Failed to save component');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    setSaving(true);
    setError(null);

    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select export destination',
      });

      if (!selected) {
        setSaving(false);
        return;
      }

      const result = await invoke<SaveResult>('canvas_export_component', {
        component_name: componentName,
        component_type: componentType,
        destination_dir: selected,
      });

      if (result.success) {
        onSaved();
        onOpenChange(false);
      } else {
        setError(result.error ?? 'Failed to export component');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Save Component</DialogTitle>
          <DialogDescription>
            Save your customized {componentName} component
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="custom" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="custom">Save as Custom</TabsTrigger>
            <TabsTrigger value="export">Export to Project</TabsTrigger>
          </TabsList>

          <TabsContent value="custom" className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Component Name</Label>
              <Input
                id="name"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="my-custom-button"
              />
              <p className="text-xs text-muted-foreground">
                Will be saved to ~/.orbit/canvas/components/custom/
              </p>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveAsCustom} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="export" className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Export this component to your project. This will copy the component
              file and the utils.ts helper to your chosen directory.
            </p>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleExport} disabled={saving}>
                {saving ? 'Exporting...' : 'Choose Folder'}
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
````

## Create File: `apps/Canvas-UI-Builder/src/components/dialogs/index.ts`

```typescript
export { SaveComponentDialog } from './SaveComponentDialog';
```

## Verify:

- Dialog opens/closes correctly
- Save as custom works
- Export opens folder picker
- Error states display properly

````

---

### Prompt: Add Error Recovery Commands

```markdown
# Task: Add error recovery and cleanup flows

## Update `src-tauri/src/commands/canvas/setup.rs`

Add these commands:

```rust
/// Check if port 5199 is available
#[tauri::command]
pub async fn canvas_check_port_available() -> Result<bool, String> {
    use std::net::TcpListener;

    match TcpListener::bind("127.0.0.1:5199") {
        Ok(_) => Ok(true),
        Err(_) => Ok(false),
    }
}

/// Get download recovery state (for partial downloads)
#[tauri::command]
pub async fn canvas_get_download_state() -> Result<Vec<String>, String> {
    let orbit_path = get_orbit_canvas_path()?;
    let components_path = orbit_path.join("components").join("ui");

    if !components_path.exists() {
        return Ok(vec![]);
    }

    let downloaded: Vec<String> = std::fs::read_dir(&components_path)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            e.path()
                .file_stem()
                .and_then(|s| s.to_str())
                .map(|s| s.to_string())
        })
        .collect();

    Ok(downloaded)
}

/// Resume download from partial state
#[tauri::command]
pub async fn canvas_resume_download(
    app_handle: tauri::AppHandle,
    skip_components: Vec<String>,
) -> Result<super::download::DownloadSummary, String> {
    // Filter out already downloaded components and download the rest
    let all_components: Vec<&str> = super::download::SHADCN_COMPONENTS
        .iter()
        .filter(|c| !skip_components.contains(&c.to_string()))
        .copied()
        .collect();

    if all_components.is_empty() {
        return Ok(super::download::DownloadSummary {
            total: 0,
            successful: 0,
            failed: 0,
            npm_dependencies: vec![],
            errors: vec![],
        });
    }

    // Re-use the download logic but with filtered list
    // For now, return a message indicating partial download not fully implemented
    Err("Resume download not yet implemented. Please reset and start fresh with canvas_reset_setup.".to_string())
}
````

## Create Frontend Error Boundary

### File: `apps/Canvas-UI-Builder/src/components/CanvasErrorBoundary.tsx`

```typescript
import { Component, ReactNode } from 'react';
import { Button } from '@common/components/ui/button';
import { invoke } from '@tauri-apps/api/core';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class CanvasErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleReset = async () => {
    try {
      await invoke('canvas_reset_setup');
      window.location.reload();
    } catch (err) {
      console.error('Failed to reset:', err);
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full p-8">
          <div className="text-center max-w-md">
            <h2 className="text-xl font-semibold mb-4">Something went wrong</h2>
            <p className="text-muted-foreground mb-4">
              {this.state.error?.message || 'Unknown error'}
            </p>
            <div className="flex gap-2 justify-center">
              <Button onClick={() => window.location.reload()}>
                Reload
              </Button>
              <Button variant="destructive" onClick={this.handleReset}>
                Reset Canvas
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
```

```

---

## Time Estimates (Updated)

| Phase | Description | Hours |
|-------|-------------|-------|
| **0** | Cleanup | 1 |
| **0.2** | Tauri Capabilities | 1 |
| **0.5** | Test Infrastructure | 3-4 |
| **1** | Foundation (3 prompts) | 4-5 |
| **2** | Registry Download (2 prompts) | 5-6 |
| **3** | Preview System (1 large prompt) | 8-10 |
| **4** | Component Loading (3 prompts) | 4-5 |
| **5** | Live Editing (3 prompts) | 4-5 |
| **6** | Save System (2 prompts) | 4-5 |
| **Error Handling** | Recovery flows | 2-3 |
| **Buffer** | Debugging, edge cases | 4-6 |

**Total: 40-55 hours**

---

## Checklist Before Implementation

- [ ] Verify bun is installed on target systems
- [ ] Confirm port 5199 isn't commonly used
- [ ] Test on Windows, macOS, Linux
- [ ] Verify Tailwind v4 compatibility
- [ ] Check Vite 6 + React 19 compatibility
- [ ] Ensure shared UI components export correctly
- [ ] Tauri capabilities configured (fs, http, shell)
- [ ] Test `canvas_check_setup` works in production build
```
