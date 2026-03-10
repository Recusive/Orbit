# Canvas UI Builder: End-to-End Style Editing System

> **Status:** Ready for Implementation (v3.2 - Final Audit Complete)
> **Last Updated:** January 2026
> **Author:** Architecture Review

## Overview

Build a design tool where:

1. User changes styles in the Inspector (right sidebar)
2. Changes reflect **instantly** in the preview (CSS injection)
3. Changes are **persisted** to component source files (AST parsing with Babel)
4. Works with **any** component (shadcn, custom npm, user-created)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  User changes borderRadius in Inspector                             │
└─────────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────────────────┐
│  INSTANT PREVIEW        │     │  PERSISTENT CHANGE                  │
│  (CSS Injection)        │     │  (AST Modification via Babel)       │
│                         │     │                                     │
│  1. Generate CSS with   │     │  1. Convert CSS → Tailwind class    │
│     CSS custom props    │     │  2. Read file via Tauri             │
│  2. Inject <style> tag  │     │  3. Parse TSX with Babel (frontend) │
│  3. Preview updates     │     │  4. Transform AST (replace classes) │
│     immediately         │     │  5. Generate code with Babel        │
│                         │     │  6. Write file via Tauri (atomic)   │
│                         │     │  7. Vite hot-reloads automatically  │
└─────────────────────────┘     └─────────────────────────────────────┘
              │                               │
              └───────────────┬───────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STATE SYNCHRONIZATION                                              │
│  ─────────────────────                                              │
│  After successful AST write:                                        │
│  1. Mark CSS properties as "persisted"                              │
│  2. Clear CSS injection for persisted properties                    │
│  3. Vite HMR reloads with permanent Tailwind classes                │
└─────────────────────────────────────────────────────────────────────┘
```

### Why Babel Instead of Rust SWC

The original plan proposed using SWC in Rust. However:

| Factor                | SWC (Rust)              | Babel (TypeScript)                  |
| --------------------- | ----------------------- | ----------------------------------- |
| **Already installed** | ❌ No                   | ✅ Yes (`@babel/*` in package.json) |
| **Team expertise**    | Rust learning curve     | TypeScript native                   |
| **Binary size**       | +15MB to Tauri app      | No change                           |
| **Testing**           | Separate test setup     | Use existing `bun test`             |
| **Debugging**         | Harder in compiled Rust | Browser DevTools                    |

**Decision:** Use Babel in the frontend. Rust backend only handles file I/O (read/write).

---

## Critical Safety Measures

These safeguards address race conditions, data loss, and edge cases identified during architecture review.

### 1. Race Condition Prevention

**Problem:** User clicks Apply → AST transform begins → User changes another property → HMR fires → Second property in limbo.

**Solution:** Lock Inspector inputs during persistence + mutex guard on persist function.

```typescript
// In PropertiesPanel.tsx
const { isPersisting } = useStylePersistence();

// Disable ALL style inputs during persist
<SizeInput
  disabled={isPersisting}
  value={cssOverrides.get('borderRadius') ?? ''}
  onChange={(value) => setCssOverride('borderRadius', value)}
/>

// Show visual feedback
{isPersisting && (
  <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
    <Loader2 className="h-6 w-6 animate-spin" />
  </div>
)}
```

**CRITICAL: Mutex guard in hook** (prevents rapid-click issues):

```typescript
// In use-style-persistence.ts
import { useRef } from 'react';

export function useStylePersistence(): UsePersistenceReturn {
  // ... existing state

  // Mutex to prevent concurrent persist calls (rapid clicks)
  const persistingRef = useRef(false);

  const persistStyles = useCallback(
    async (componentName: string, componentType: 'ui' | 'custom'): Promise<boolean> => {
      // Guard: If already persisting, reject immediately
      if (persistingRef.current) {
        logger.warn('Persist already in progress, ignoring duplicate call');
        return false;
      }

      // Acquire mutex
      persistingRef.current = true;

      try {
        setState((prev) => ({ ...prev, isPersisting: true, error: null }));

        // ... rest of persist logic (validation, read, transform, write)

        return true;
      } catch (err) {
        // ... error handling
        return false;
      } finally {
        // ALWAYS release mutex, even on error
        persistingRef.current = false;
        setState((prev) => ({ ...prev, isPersisting: false }));
      }
    },
    [cssOverrides, markPropertyPersisted]
  );

  // ... rest of hook
}
```

This double-guard (UI disabled + ref mutex) prevents:

- UI clicks while `isPersisting` state is true (normal case)
- Rapid clicks before React state updates (edge case)

### 2. Multi-Level Undo Stack

**Problem:** Single backup file → Click Apply twice → First backup lost.

**Solution:** Timestamped backups with configurable retention.

```rust
// In persist.rs
use chrono::Utc;

const MAX_BACKUPS: usize = 10;

pub async fn canvas_write_component_source(
    component_name: String,
    component_type: String,
    content: String,
    create_backup: bool,
) -> FileWriteResult {
    let home = dirs::home_dir().unwrap_or_default();
    let base_path = home
        .join(".orbit")
        .join("canvas")
        .join("components")
        .join(&component_type);

    let target_path = base_path.join(format!("{}.tsx", component_name));
    let backup_dir = base_path.join(".backups").join(&component_name);

    // Create backup with timestamp
    let mut backup_created: Option<String> = None;
    if create_backup && target_path.exists() {
        // Ensure backup directory exists
        let _ = fs::create_dir_all(&backup_dir);

        let timestamp = Utc::now().timestamp();
        let backup_path = backup_dir.join(format!("{}.tsx", timestamp));

        if let Ok(original) = fs::read_to_string(&target_path) {
            if fs::write(&backup_path, &original).is_ok() {
                backup_created = Some(backup_path.to_string_lossy().to_string());

                // Prune old backups (keep MAX_BACKUPS most recent)
                prune_old_backups(&backup_dir, MAX_BACKUPS);
            }
        }
    }

    let temp_path = base_path.join(format!(".{}.tsx.tmp", component_name));

    // Write to temp file first (atomic write pattern)
    if let Err(e) = fs::write(&temp_path, &content) {
        return FileWriteResult {
            success: false,
            backup_path: backup_created,
            error: Some(format!("Failed to write temp file: {}", e)),
        };
    }

    // Atomic rename
    if let Err(e) = fs::rename(&temp_path, &target_path) {
        let _ = fs::remove_file(&temp_path);
        return FileWriteResult {
            success: false,
            backup_path: backup_created,
            error: Some(format!("Failed to rename temp file: {}", e)),
        };
    }

    FileWriteResult {
        success: true,
        backup_path: backup_created,
        error: None,
    }
}

fn prune_old_backups(backup_dir: &Path, max_keep: usize) {
    if let Ok(entries) = fs::read_dir(backup_dir) {
        let mut backups: Vec<_> = entries
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().map_or(false, |ext| ext == "tsx"))
            .collect();

        // Sort by filename (timestamp) descending
        backups.sort_by(|a, b| b.file_name().cmp(&a.file_name()));

        // Remove excess backups
        for backup in backups.into_iter().skip(max_keep) {
            let _ = fs::remove_file(backup.path());
        }
    }
}
```

**Frontend undo stack:**

```typescript
// In css-customization-store.ts
interface UndoEntry {
  componentName: string;
  componentType: 'ui' | 'custom';
  previousContent: string;
  changes: StyleChange[];
  timestamp: number;
  backupPath: string;
}

interface CSSCustomizationStore {
  // ... existing properties

  // Undo stack (max 10 entries)
  undoStack: UndoEntry[];

  // Push to undo stack before persist
  pushUndo: (entry: Omit<UndoEntry, 'timestamp'>) => void;

  // Pop and restore
  popUndo: () => UndoEntry | undefined;

  // Check if undo available
  canUndo: () => boolean;
}
```

### 3. External File Modification Detection

**Problem:** User edits file in VS Code → Inspector state stale → Apply overwrites VS Code changes.

**Solution:** Watch file and detect external modifications.

```typescript
// In use-file-watcher.ts
import { watch, UnwatchFn } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import { createLogger } from '@canvas/lib/logger';

const logger = createLogger('FileWatcher');

interface FileWatchState {
  isStale: boolean;
  externallyModified: boolean;
  lastKnownHash: string | null;
}

export function useFileWatcher(
  componentName: string | null,
  componentType: 'ui' | 'custom' | null
) {
  const [state, setState] = useState<FileWatchState>({
    isStale: false,
    externallyModified: false,
    lastKnownHash: null,
  });

  // IMPORTANT: Use ref to avoid race condition on cleanup.
  // Without this, cleanup runs before async setupWatch assigns unwatch,
  // causing memory leak if component switches quickly.
  const unwatchRef = useRef<UnwatchFn | null>(null);
  const isMountedRef = useRef(true);

  // Debounced hash check - file watchers can fire multiple events for single save
  // Using 100ms debounce to batch rapid events into single check
  const checkHashDebounced = useDebouncedCallback(
    async (path: string) => {
      if (!isMountedRef.current) return;

      try {
        const newHash = await invoke<string>('canvas_get_file_hash', { path });

        if (!isMountedRef.current) return;

        setState((prev) => {
          if (prev.lastKnownHash && newHash !== prev.lastKnownHash) {
            return { ...prev, isStale: true, externallyModified: true };
          }
          return prev;
        });
      } catch {
        // File may have been deleted or moved - ignore
      }
    },
    100 // 100ms debounce prevents rapid-fire events
  );

  useEffect(() => {
    if (!componentName || !componentType) {
      // Reset state when no component selected
      setState({
        isStale: false,
        externallyModified: false,
        lastKnownHash: null,
      });
      return;
    }

    // Reset mounted ref at start of effect
    isMountedRef.current = true;

    const setupWatch = async () => {
      try {
        const path = await invoke<string>('canvas_get_component_path', {
          componentName,
          componentType,
        });

        // Get initial hash
        const initialHash = await invoke<string>('canvas_get_file_hash', { path });

        // Don't update state if unmounted during async operation
        if (!isMountedRef.current) return;

        setState((prev) => ({ ...prev, lastKnownHash: initialHash }));

        // Watch for changes - use debounced handler to batch rapid events
        const unwatch = await watch(path, (event) => {
          // Don't process events if unmounted
          if (!isMountedRef.current) return;

          if (event.type === 'modify' || event.type === 'write') {
            // Debounced to handle rapid multiple events from single save
            checkHashDebounced(path);
          }
        });

        // Store in ref for cleanup (not local variable!)
        unwatchRef.current = unwatch;
      } catch (err) {
        logger.error('Failed to setup file watcher', {
          error: err instanceof Error ? err.message : String(err),
          componentName,
          componentType,
        });
      }
    };

    setupWatch();

    return () => {
      isMountedRef.current = false;
      // Cancel any pending debounced calls
      checkHashDebounced.cancel();
      // Use ref for cleanup - guaranteed to have correct value
      unwatchRef.current?.();
      unwatchRef.current = null;
    };
  }, [componentName, componentType, checkHashDebounced]);

  const acknowledgeChange = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isStale: false,
      externallyModified: false,
    }));
  }, []);

  const refreshHash = useCallback(async () => {
    if (!componentName || !componentType) return;

    const path = await invoke<string>('canvas_get_component_path', {
      componentName,
      componentType,
    });
    const newHash = await invoke<string>('canvas_get_file_hash', { path });

    setState((prev) => ({
      ...prev,
      lastKnownHash: newHash,
      isStale: false,
      externallyModified: false,
    }));
  }, [componentName, componentType]);

  return { ...state, acknowledgeChange, refreshHash };
}
```

**Rust helpers (add to persist.rs):**

```rust
// At top of persist.rs - add imports
use sha2::{Sha256, Digest};
use std::path::Path;

#[command]
pub async fn canvas_get_file_hash(path: String) -> Result<String, String> {
    let content = fs::read(&path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    hasher.update(&content);
    Ok(format!("{:x}", hasher.finalize()))
}

#[command]
pub async fn canvas_get_component_path(
    component_name: String,
    component_type: String,
) -> String {
    let home = dirs::home_dir().unwrap_or_default();
    home.join(".orbit")
        .join("canvas")
        .join("components")
        .join(&component_type)
        .join(format!("{}.tsx", component_name))
        .to_string_lossy()
        .to_string()
}
```

**UI warning:**

```tsx
// In PropertiesPanel.tsx
const { isStale, externallyModified, acknowledgeChange, refreshHash } = useFileWatcher(
  componentName,
  componentType
);

{
  externallyModified && (
    <Alert variant="warning" className="mb-4">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>File Modified Externally</AlertTitle>
      <AlertDescription>
        This component was modified outside the Canvas UI Builder. Your pending changes may
        conflict.
      </AlertDescription>
      <div className="flex gap-2 mt-2">
        <Button size="sm" variant="outline" onClick={refreshHash}>
          Reload & Discard My Changes
        </Button>
        <Button size="sm" variant="outline" onClick={acknowledgeChange}>
          Keep My Changes
        </Button>
      </div>
    </Alert>
  );
}
```

### 4. Input Debouncing for Sliders

**Problem:** Dragging slider → 30+ updates/sec → expensive re-renders.

**Solution:** Debounce store updates, throttle CSS injection.

```typescript
// In css-customization-store.ts
import { debounce } from '@canvas/lib/utils';

// Store action (debounced for expensive operations)
setCssOverrideDebounced: debounce((property: string, value: string) => {
  set((state) => {
    state.cssOverrides.set(property, value);
  });
}, 16), // ~60fps

// Immediate update for CSS injection (preview needs instant feedback)
setCssOverrideImmediate: (property: string, value: string) => {
  set((state) => {
    state.cssOverrides.set(property, value);
  });
},
```

```typescript
// In SizeInput.tsx - use immediate for dragging, debounced for typing
const handleSliderChange = (value: number[]) => {
  // Immediate for visual feedback
  setCssOverrideImmediate(property, `${value[0]}px`);
};

const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  // Debounced for typing
  setCssOverrideDebounced(property, e.target.value);
};
```

### 5. Component Name Validation

**Problem:** Malicious component names could cause path traversal or injection.

**Solution:** Strict validation before any file operation.

```typescript
// In lib/validation.ts
import { z } from 'zod';

export const ComponentNameSchema = z
  .string()
  .min(1, 'Component name required')
  .max(64, 'Component name too long')
  .regex(
    /^[a-zA-Z][a-zA-Z0-9-]*$/,
    'Component name must start with letter and contain only letters, numbers, hyphens'
  );

export const ComponentTypeSchema = z.enum(['ui', 'custom']);

export function validateComponentIdentifier(
  name: string,
  type: string
): { valid: true } | { valid: false; error: string } {
  const nameResult = ComponentNameSchema.safeParse(name);
  if (!nameResult.success) {
    return { valid: false, error: nameResult.error.errors[0].message };
  }

  const typeResult = ComponentTypeSchema.safeParse(type);
  if (!typeResult.success) {
    return { valid: false, error: 'Invalid component type' };
  }

  return { valid: true };
}
```

```typescript
// In use-style-persistence.ts - validate before invoke
const persistStyles = useCallback(
  async (componentName: string, componentType: 'ui' | 'custom'): Promise<boolean> => {
    // Validate inputs
    const validation = validateComponentIdentifier(componentName, componentType);
    if (!validation.valid) {
      setState((prev) => ({ ...prev, error: validation.error }));
      return false;
    }

    // ... rest of persist logic
  },
  []
);
```

---

## Phase 1: Instant Preview (CSS Injection)

### Goal

Make preview update immediately when user changes any CSS property.

### File to Modify

`src-tauri/src/commands/canvas/preview.rs` (Preview.tsx template)

### Current Problem

The existing approach passes `style={styles}` directly to the component, but:

- Tailwind classes have higher specificity than inline styles
- Nested elements don't inherit inline styles
- Pseudo-classes (`:hover`, `:focus`) can't be expressed inline

### Solution: CSS Custom Properties + Style Tag

```tsx
// In Preview.tsx template (preview.rs)

const generateInjectedCSS = (styles: Record<string, string>) => {
  if (!Object.keys(styles).length) return '';

  // Convert camelCase to kebab-case and create CSS custom properties
  const cssVars = Object.entries(styles)
    .map(([prop, value]) => {
      const kebabProp = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
      return `--preview-${kebabProp}: ${value};`;
    })
    .join('\n      ');

  // Generate rules that use the custom properties
  const cssRules = Object.entries(styles)
    .map(([prop, value]) => {
      const kebabProp = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
      return `${kebabProp}: var(--preview-${kebabProp}) !important;`;
    })
    .join('\n        ');

  // SVG elements to exclude (comprehensive list)
  const svgElements = [
    'svg',
    'path',
    'circle',
    'rect',
    'line',
    'polygon',
    'polyline',
    'ellipse',
    'g',
    'text',
    'tspan',
    'defs',
    'use',
    'symbol',
    'clipPath',
    'mask',
    'filter',
    'foreignObject',
    'marker',
    'linearGradient',
    'radialGradient',
    'stop',
    'pattern',
  ].join(', ');

  return `
    /* CSS Custom Properties for debugging */
    :root {
      ${cssVars}
    }

    /*
     * Target component's CHILDREN only, not the wrapper itself.
     * Uses "> *" to select direct children, then descendants.
     * Uses :where() for lower specificity so existing component styles can win.
     * SVG elements are naturally excluded by not being in the selector list.
     */
    #preview-component-wrapper > *,
    #preview-component-wrapper > * :where(
      div, span, p, section, article, aside, header, footer, main, nav,
      button, a, input, textarea, select, option, label, form, fieldset,
      table, thead, tbody, tr, td, th,
      ul, ol, li, dl, dt, dd,
      h1, h2, h3, h4, h5, h6,
      img, figure, figcaption,
      details, summary, dialog,
      [role="button"], [role="link"], [role="checkbox"], [role="radio"],
      [role="tab"], [role="tabpanel"], [role="menu"], [role="menuitem"]
    ) {
      ${cssRules}
    }

    /* Typography specifically targets text-containing elements */
    #preview-component-wrapper > * :where(
      p, span, label, h1, h2, h3, h4, h5, h6,
      button, a, input, textarea, select, option,
      td, th, li, dt, dd, figcaption, summary
    ) {
      font-size: var(--preview-font-size, inherit) !important;
      font-weight: var(--preview-font-weight, inherit) !important;
      font-family: var(--preview-font-family, inherit) !important;
      letter-spacing: var(--preview-letter-spacing, inherit) !important;
      line-height: var(--preview-line-height, inherit) !important;
      color: var(--preview-color, inherit) !important;
    }

    /*
     * SVG elements are excluded by NOT being in the selector lists above.
     * This is safer than "all: revert" which can break intentional icon styling.
     * Icons using currentColor will inherit from their parent element naturally.
     */

    /* Hover states - auto-generate darker shade */
    #preview-component-wrapper > * button:hover,
    #preview-component-wrapper > * [role="button"]:hover,
    #preview-component-wrapper > * a:hover {
      filter: brightness(0.9);
    }

    /* Focus states */
    #preview-component-wrapper > * :focus-visible {
      outline: 2px solid var(--preview-border-color, currentColor);
      outline-offset: 2px;
    }
  `;
};

// In render:
export default function Preview() {
  // ... existing code ...

  return (
    <>
      {/* Style tag with generated CSS - no dangerouslySetInnerHTML needed */}
      {Object.keys(styles).length > 0 && <style>{generateInjectedCSS(styles)}</style>}
      <div id="preview-component-wrapper" className="contents">
        <Component {...props} />
      </div>
    </>
  );
}
```

### Why CSS Custom Properties

1. **Debugging** - Properties visible in DevTools under `:root`
2. **Fallbacks** - `var(--preview-font-size, inherit)` gracefully degrades
3. **Selective application** - Typography rules only apply to text elements
4. **Performance** - Browser optimizes custom property updates

### Known CSS Injection Limitations

#### SVG Fill/Stroke Colors

The `all: revert` rule on SVG elements protects icon rendering but has a trade-off:

| CSS Property        | Behavior         | Reason                                 |
| ------------------- | ---------------- | -------------------------------------- |
| `fill`              | **NOT AFFECTED** | SVG uses `fill` not `background-color` |
| `stroke`            | **NOT AFFECTED** | SVG uses `stroke` not `border-color`   |
| `color` on `<text>` | **NOT AFFECTED** | Reverted to original                   |

**Why this is intentional:**

- Most SVG icons (lucide, heroicons) use `currentColor` for fill/stroke
- Applying arbitrary colors could break icon visual consistency
- Icon libraries often encode semantic meaning in their colors

**Workaround for intentional SVG styling:**

If users need to customize SVG colors specifically, expose dedicated controls:

```tsx
// Future enhancement: SVG-specific color controls
interface SVGColorOverrides {
  svgFill?: string;    // Applied to SVG fill attribute
  svgStroke?: string;  // Applied to SVG stroke attribute
}

// In CSS injection (future):
#preview-component-wrapper svg {
  fill: var(--preview-svg-fill, currentColor);
  stroke: var(--preview-svg-stroke, currentColor);
}
```

> **Note:** This is documented as a known limitation. Implementing SVG-specific controls is out of scope for Phase 1 but can be added later if user feedback demands it.

#### CSS-in-JS Libraries

Components using CSS-in-JS (styled-components, Emotion, vanilla-extract) have **limited support**:

| Library              | Preview (CSS Injection) | Persist (AST Transform)       |
| -------------------- | ----------------------- | ----------------------------- |
| Tailwind (className) | ✅ Full support         | ✅ Full support               |
| CVA (className)      | ✅ Full support         | ✅ Full support               |
| cn() utility         | ✅ Full support         | ✅ Full support               |
| styled-components    | ⚠️ Visual only          | ❌ Not supported              |
| Emotion              | ⚠️ Visual only          | ❌ Not supported              |
| vanilla-extract      | ⚠️ Visual only          | ❌ Not supported              |
| Inline `style` prop  | ⚠️ May conflict         | ⚠️ Partial (loses reactivity) |

**Why CSS-in-JS isn't fully supported:**

1. Styles are generated at runtime, not in source files
2. No standard AST pattern to transform
3. Would require library-specific transformers

**User guidance:**

When selecting a component that uses CSS-in-JS, show an informational message:

```tsx
// In component inspector
{
  componentUsesCSSInJS && (
    <Alert variant="info">
      <Info className="h-4 w-4" />
      <AlertDescription>
        This component uses CSS-in-JS styling. Visual changes will preview but cannot be persisted
        to source. Consider refactoring to Tailwind classes.
      </AlertDescription>
    </Alert>
  );
}
```

### Error Boundary for Preview

The preview iframe may fail to load or encounter runtime errors. Wrap the preview with an error boundary to prevent crashes from propagating:

```tsx
// apps/Canvas-UI-Builder/src/components/preview/PreviewErrorBoundary.tsx

import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@canvas/components/ui/button';
import { createLogger } from '@canvas/lib/logger';

const logger = createLogger('PreviewErrorBoundary');

interface Props {
  children: ReactNode;
  onRetry?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class PreviewErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    logger.error('Preview render failed', {
      error: error.message,
      componentStack: errorInfo.componentStack,
    });
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
    this.props.onRetry?.();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
          <AlertTriangle className="h-12 w-12 text-yellow-500" />
          <div>
            <h3 className="font-semibold text-lg">Preview Failed to Load</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
          </div>
          <Button variant="outline" onClick={this.handleRetry}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry Preview
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

**Usage in Preview Panel:**

```tsx
// In PreviewPanel.tsx or equivalent
import { PreviewErrorBoundary } from './PreviewErrorBoundary';

function PreviewPanel({ componentUrl, onReload }: Props) {
  return (
    <PreviewErrorBoundary onRetry={onReload}>
      <iframe src={componentUrl} className="w-full h-full border-0" title="Component Preview" />
    </PreviewErrorBoundary>
  );
}
```

---

## Phase 2: CSS to Tailwind Mapping

### Goal

Convert CSS property/value pairs to equivalent Tailwind classes.

### New Files

#### `apps/Canvas-UI-Builder/src/lib/tailwind/tokens.ts`

**Single Source of Truth for Tailwind Scales**

This file defines all Tailwind scale mappings. It MUST match your `tailwind.config.ts`.
When using custom Tailwind config, update this file or generate it from config.

```typescript
// ─────────────────────────────────────────────────────────────────────────────
// Tailwind Design Tokens
// IMPORTANT: Keep in sync with tailwind.config.ts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Border radius scale.
 * Keys are CSS values, values are Tailwind class suffixes.
 */
export const BORDER_RADIUS_TOKENS = {
  '0px': 'none',
  '0': 'none',
  '0.125rem': 'sm', // 2px
  '2px': 'sm',
  '0.25rem': '', // 4px (DEFAULT)
  '4px': '', // DEFAULT
  '0.375rem': 'md', // 6px
  '6px': 'md',
  '0.5rem': 'lg', // 8px
  '8px': 'lg',
  '0.75rem': 'xl', // 12px
  '12px': 'xl',
  '1rem': '2xl', // 16px
  '16px': '2xl',
  '1.5rem': '3xl', // 24px
  '24px': '3xl',
  '9999px': 'full',
  full: 'full',
} as const;

/**
 * Font size scale with line height.
 */
export const FONT_SIZE_TOKENS = {
  '0.75rem': 'xs', // 12px
  '12px': 'xs',
  '0.875rem': 'sm', // 14px
  '14px': 'sm',
  '1rem': 'base', // 16px
  '16px': 'base',
  '1.125rem': 'lg', // 18px
  '18px': 'lg',
  '1.25rem': 'xl', // 20px
  '20px': 'xl',
  '1.5rem': '2xl', // 24px
  '24px': '2xl',
  '1.875rem': '3xl', // 30px
  '30px': '3xl',
  '2.25rem': '4xl', // 36px
  '36px': '4xl',
  '3rem': '5xl', // 48px
  '48px': '5xl',
  '3.75rem': '6xl', // 60px
  '60px': '6xl',
  '4.5rem': '7xl', // 72px
  '72px': '7xl',
  '6rem': '8xl', // 96px
  '96px': '8xl',
  '8rem': '9xl', // 128px
  '128px': '9xl',
} as const;

/**
 * Font weight scale.
 */
export const FONT_WEIGHT_TOKENS = {
  '100': 'thin',
  '200': 'extralight',
  '300': 'light',
  '400': 'normal',
  '500': 'medium',
  '600': 'semibold',
  '700': 'bold',
  '800': 'extrabold',
  '900': 'black',
} as const;

/**
 * Spacing scale (used for padding, margin, gap, etc.)
 */
export const SPACING_TOKENS = {
  '0px': '0',
  '0': '0',
  '1px': 'px',
  '0.125rem': '0.5', // 2px
  '2px': '0.5',
  '0.25rem': '1', // 4px
  '4px': '1',
  '0.375rem': '1.5', // 6px
  '6px': '1.5',
  '0.5rem': '2', // 8px
  '8px': '2',
  '0.625rem': '2.5', // 10px
  '10px': '2.5',
  '0.75rem': '3', // 12px
  '12px': '3',
  '0.875rem': '3.5', // 14px
  '14px': '3.5',
  '1rem': '4', // 16px
  '16px': '4',
  '1.25rem': '5', // 20px
  '20px': '5',
  '1.5rem': '6', // 24px
  '24px': '6',
  '1.75rem': '7', // 28px
  '28px': '7',
  '2rem': '8', // 32px
  '32px': '8',
  '2.25rem': '9', // 36px
  '36px': '9',
  '2.5rem': '10', // 40px
  '40px': '10',
  '2.75rem': '11', // 44px
  '44px': '11',
  '3rem': '12', // 48px
  '48px': '12',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Build Maps from Tokens (generates the lookup tables mapper.ts uses)
// ─────────────────────────────────────────────────────────────────────────────

function buildClassMap(tokens: Record<string, string>, prefix: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tokens).map(([value, suffix]) => [
      value,
      suffix === '' ? prefix : `${prefix}-${suffix}`,
    ])
  );
}

export const BORDER_RADIUS_MAP = buildClassMap(BORDER_RADIUS_TOKENS, 'rounded');
export const FONT_SIZE_MAP = buildClassMap(FONT_SIZE_TOKENS, 'text');
export const FONT_WEIGHT_MAP = buildClassMap(FONT_WEIGHT_TOKENS, 'font');
export const SPACING_MAP = buildClassMap(SPACING_TOKENS, ''); // Prefix added by caller (p-, m-, gap-)
```

> **Custom Tailwind Config:** If your project uses custom scales in `tailwind.config.ts`,
> you can either:
>
> 1. Manually update `tokens.ts` to match, or
> 2. Generate it at build time using `scripts/extract-tailwind-tokens.ts` (see Appendix)

#### `apps/Canvas-UI-Builder/src/lib/tailwind/mapper.ts`

```typescript
import { z } from 'zod';
import { BORDER_RADIUS_MAP, FONT_SIZE_MAP, FONT_WEIGHT_MAP, SPACING_MAP } from './tokens';

// ─────────────────────────────────────────────────────────────────────────────
// Types & Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const TailwindMappingResultSchema = z.object({
  tailwindClass: z.string(),
  isArbitrary: z.boolean(),
  conflictPrefix: z.string().optional(), // e.g., "rounded" for rounded-* classes
});

export type TailwindMappingResult = z.infer<typeof TailwindMappingResultSchema>;

// Maps are imported from tokens.ts (see above) to maintain a single source of truth

const OPACITY_MAP: Record<string, string> = {
  '0': 'opacity-0',
  '0.05': 'opacity-5',
  '0.1': 'opacity-10',
  '0.2': 'opacity-20',
  '0.25': 'opacity-25',
  '0.3': 'opacity-30',
  '0.4': 'opacity-40',
  '0.5': 'opacity-50',
  '0.6': 'opacity-60',
  '0.7': 'opacity-70',
  '0.75': 'opacity-75',
  '0.8': 'opacity-80',
  '0.9': 'opacity-90',
  '0.95': 'opacity-95',
  '1': 'opacity-100',
};

// ─────────────────────────────────────────────────────────────────────────────
// Mapping Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps a CSS property/value pair to a Tailwind class.
 * Returns the class name and whether it uses arbitrary value syntax.
 */
export function cssToTailwind(property: string, value: string): TailwindMappingResult | null {
  const normalizedValue = value.trim().toLowerCase();

  switch (property) {
    case 'borderRadius': {
      const mapped = BORDER_RADIUS_MAP[normalizedValue];
      if (mapped) {
        return { tailwindClass: mapped, isArbitrary: false, conflictPrefix: 'rounded' };
      }
      // Arbitrary value
      return {
        tailwindClass: `rounded-[${value}]`,
        isArbitrary: true,
        conflictPrefix: 'rounded',
      };
    }

    case 'fontSize': {
      const mapped = FONT_SIZE_MAP[normalizedValue];
      if (mapped) {
        return { tailwindClass: mapped, isArbitrary: false, conflictPrefix: 'text' };
      }
      return {
        tailwindClass: `text-[${value}]`,
        isArbitrary: true,
        conflictPrefix: 'text',
      };
    }

    case 'fontWeight': {
      const mapped = FONT_WEIGHT_MAP[normalizedValue];
      if (mapped) {
        return { tailwindClass: mapped, isArbitrary: false, conflictPrefix: 'font' };
      }
      return {
        tailwindClass: `font-[${value}]`,
        isArbitrary: true,
        conflictPrefix: 'font',
      };
    }

    case 'padding': {
      const spacingValue = SPACING_MAP[normalizedValue];
      if (spacingValue) {
        return { tailwindClass: `p-${spacingValue}`, isArbitrary: false, conflictPrefix: 'p' };
      }
      return {
        tailwindClass: `p-[${value}]`,
        isArbitrary: true,
        conflictPrefix: 'p',
      };
    }

    case 'paddingTop':
    case 'paddingRight':
    case 'paddingBottom':
    case 'paddingLeft': {
      const direction = property.replace('padding', '').toLowerCase()[0]; // t, r, b, l
      const spacingValue = SPACING_MAP[normalizedValue];
      if (spacingValue) {
        return {
          tailwindClass: `p${direction}-${spacingValue}`,
          isArbitrary: false,
          conflictPrefix: `p${direction}`,
        };
      }
      return {
        tailwindClass: `p${direction}-[${value}]`,
        isArbitrary: true,
        conflictPrefix: `p${direction}`,
      };
    }

    case 'margin': {
      const spacingValue = SPACING_MAP[normalizedValue];
      // Handle negative values
      if (normalizedValue.startsWith('-')) {
        const positiveValue = normalizedValue.slice(1);
        const mapped = SPACING_MAP[positiveValue];
        if (mapped) {
          return { tailwindClass: `-m-${mapped}`, isArbitrary: false, conflictPrefix: 'm' };
        }
        return { tailwindClass: `-m-[${value.slice(1)}]`, isArbitrary: true, conflictPrefix: 'm' };
      }
      if (spacingValue) {
        return { tailwindClass: `m-${spacingValue}`, isArbitrary: false, conflictPrefix: 'm' };
      }
      return { tailwindClass: `m-[${value}]`, isArbitrary: true, conflictPrefix: 'm' };
    }

    case 'gap': {
      const spacingValue = SPACING_MAP[normalizedValue];
      if (spacingValue) {
        return { tailwindClass: `gap-${spacingValue}`, isArbitrary: false, conflictPrefix: 'gap' };
      }
      return { tailwindClass: `gap-[${value}]`, isArbitrary: true, conflictPrefix: 'gap' };
    }

    case 'opacity': {
      const mapped = OPACITY_MAP[normalizedValue];
      if (mapped) {
        return { tailwindClass: mapped, isArbitrary: false, conflictPrefix: 'opacity' };
      }
      // Convert decimal to percentage for arbitrary
      const percentage = Math.round(parseFloat(normalizedValue) * 100);
      return {
        tailwindClass: `opacity-[${percentage}%]`,
        isArbitrary: true,
        conflictPrefix: 'opacity',
      };
    }

    case 'borderWidth': {
      if (normalizedValue === '0' || normalizedValue === '0px') {
        return { tailwindClass: 'border-0', isArbitrary: false, conflictPrefix: 'border' };
      }
      if (normalizedValue === '1px') {
        return { tailwindClass: 'border', isArbitrary: false, conflictPrefix: 'border' };
      }
      if (normalizedValue === '2px') {
        return { tailwindClass: 'border-2', isArbitrary: false, conflictPrefix: 'border' };
      }
      if (normalizedValue === '4px') {
        return { tailwindClass: 'border-4', isArbitrary: false, conflictPrefix: 'border' };
      }
      if (normalizedValue === '8px') {
        return { tailwindClass: 'border-8', isArbitrary: false, conflictPrefix: 'border' };
      }
      return {
        tailwindClass: `border-[${value}]`,
        isArbitrary: true,
        conflictPrefix: 'border',
      };
    }

    // Colors require special handling - return null, handle separately
    case 'color':
    case 'backgroundColor':
    case 'borderColor':
      return null; // Handled by color mapping (see below)

    default:
      return null;
  }
}

/**
 * Maps a CSS color value to Tailwind.
 * Handles oklch, hex, rgb, and named colors.
 */
export function colorToTailwind(
  property: 'color' | 'backgroundColor' | 'borderColor',
  value: string
): TailwindMappingResult | null {
  const prefix = {
    color: 'text',
    backgroundColor: 'bg',
    borderColor: 'border',
  }[property];

  // For arbitrary colors, use the value directly
  // Tailwind v4 supports oklch natively
  if (value.startsWith('oklch') || value.startsWith('rgb') || value.startsWith('hsl')) {
    return {
      tailwindClass: `${prefix}-[${value.replace(/\s+/g, '_')}]`,
      isArbitrary: true,
      conflictPrefix: prefix,
    };
  }

  // Hex colors
  if (value.startsWith('#')) {
    return {
      tailwindClass: `${prefix}-[${value}]`,
      isArbitrary: true,
      conflictPrefix: prefix,
    };
  }

  // Named colors or CSS variables - pass through
  return {
    tailwindClass: `${prefix}-[${value}]`,
    isArbitrary: true,
    conflictPrefix: prefix,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Conflict Groups - Scalable approach to class conflict resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PROPERTY-AWARE Conflict Groups using regex patterns.
 *
 * IMPORTANT: Uses CSS property names as keys (not arbitrary group names).
 * This allows us to match based on what CSS property is being changed,
 * avoiding the "text-*" ambiguity problem.
 *
 * Pattern rules:
 * - Use regex to precisely match classes
 * - fontSize pattern: text-{size} where size is xs|sm|base|lg|xl|2xl-9xl or [...]
 * - color pattern: text-{color} where color is named color or hex/rgb
 */
const CONFLICT_PATTERNS: Record<string, RegExp> = {
  // Font size: text-xs, text-sm, text-base, text-lg, text-xl, text-2xl...9xl, text-[...]
  fontSize: /^text-(xs|sm|base|lg|xl|[2-9]xl|\[[\d.]+(?:px|rem|em)\])$/,

  // Text color: text-{color}-{shade}, text-[#...], text-[rgb(...)]
  // Does NOT match text-xs, text-sm, etc (those are font sizes)
  color:
    /^text-(transparent|current|inherit|black|white|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(-\d+)?(\/\d+)?$|^text-\[(?![\d.]+(?:px|rem|em)).+\]$/,

  // Background color
  backgroundColor:
    /^bg-(transparent|current|inherit|black|white|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(-\d+)?(\/\d+)?$|^bg-\[.+\]$/,

  // Border radius
  borderRadius: /^rounded(-none|-sm|-md|-lg|-xl|-2xl|-3xl|-full|\[.+\])?$/,

  // Font weight
  fontWeight: /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black|\[\d+\])$/,

  // Border width
  borderWidth: /^border(-[0248])?$/,

  // Border color
  borderColor:
    /^border-(transparent|current|inherit|black|white|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(-\d+)?(\/\d+)?$|^border-\[.+\]$/,

  // Padding (all sides)
  padding: /^p-(\d+(\.\d+)?|px|\[.+\])$/,
  paddingX: /^px-(\d+(\.\d+)?|px|\[.+\])$/,
  paddingY: /^py-(\d+(\.\d+)?|px|\[.+\])$/,
  paddingTop: /^pt-(\d+(\.\d+)?|px|\[.+\])$/,
  paddingRight: /^pr-(\d+(\.\d+)?|px|\[.+\])$/,
  paddingBottom: /^pb-(\d+(\.\d+)?|px|\[.+\])$/,
  paddingLeft: /^pl-(\d+(\.\d+)?|px|\[.+\])$/,

  // Margin (all sides, including negative)
  margin: /^-?m-(\d+(\.\d+)?|px|auto|\[.+\])$/,
  marginX: /^-?mx-(\d+(\.\d+)?|px|auto|\[.+\])$/,
  marginY: /^-?my-(\d+(\.\d+)?|px|auto|\[.+\])$/,
  marginTop: /^-?mt-(\d+(\.\d+)?|px|auto|\[.+\])$/,
  marginRight: /^-?mr-(\d+(\.\d+)?|px|auto|\[.+\])$/,
  marginBottom: /^-?mb-(\d+(\.\d+)?|px|auto|\[.+\])$/,
  marginLeft: /^-?ml-(\d+(\.\d+)?|px|auto|\[.+\])$/,

  // Gap
  gap: /^gap-(\d+(\.\d+)?|px|\[.+\])$/,
  gapX: /^gap-x-(\d+(\.\d+)?|px|\[.+\])$/,
  gapY: /^gap-y-(\d+(\.\d+)?|px|\[.+\])$/,

  // Opacity
  opacity: /^opacity-(\d+|\[.+\])$/,
};

/**
 * Get the conflict pattern for a CSS property.
 * Returns the regex pattern to match conflicting Tailwind classes.
 */
export function getConflictPattern(cssProperty: string): RegExp | null {
  return CONFLICT_PATTERNS[cssProperty] ?? null;
}

/**
 * Get the CSS property name for a given Tailwind class.
 * Used to determine which classes conflict.
 */
export function getCssPropertyForClass(tailwindClass: string): string | null {
  // Strip variant prefixes for matching
  const baseClass = tailwindClass.includes(':') ? tailwindClass.split(':').pop()! : tailwindClass;

  for (const [property, pattern] of Object.entries(CONFLICT_PATTERNS)) {
    if (pattern.test(baseClass)) {
      return property;
    }
  }

  return null;
}

/**
 * Check if two Tailwind classes conflict (target the same CSS property).
 */
export function classesConflict(class1: string, class2: string): boolean {
  const prop1 = getCssPropertyForClass(class1);
  const prop2 = getCssPropertyForClass(class2);

  return prop1 !== null && prop1 === prop2;
}
```

#### `apps/Canvas-UI-Builder/src/lib/tailwind/parser.ts`

```typescript
/**
 * Parses Tailwind classes from a class string and extracts CSS values.
 * Inverse of mapper.ts - used to populate Inspector from existing component.
 */

export interface ParsedTailwindClass {
  original: string;
  property: string; // CSS property name
  value: string; // CSS value
  variant?: string; // 'hover', 'dark', 'md', etc.
  isArbitrary: boolean;
}

/**
 * Parse a single Tailwind class into its CSS equivalent.
 */
export function parseTailwindClass(className: string): ParsedTailwindClass | null {
  // Handle variants (hover:, dark:, md:, etc.)
  let variant: string | undefined;
  let baseClass = className;

  if (className.includes(':')) {
    const parts = className.split(':');
    variant = parts.slice(0, -1).join(':');
    baseClass = parts[parts.length - 1];
  }

  // Use context-aware parsing for ambiguous prefixes
  const parsed = parseClassByContext(baseClass);
  if (parsed) {
    return {
      original: className,
      property: parsed.property,
      value: parsed.value,
      variant,
      isArbitrary: parsed.isArbitrary,
    };
  }

  return null;
}

/**
 * Context-aware class parsing.
 * Handles ambiguous prefixes like `text-*` which could be fontSize, color, or textAlign.
 */
function parseClassByContext(className: string): {
  property: string;
  value: string;
  isArbitrary: boolean;
} | null {
  // ─────────────────────────────────────────────────────────────────────────
  // TEXT CLASSES - Most ambiguous, handle first
  // ─────────────────────────────────────────────────────────────────────────

  // text-{size}: text-xs, text-sm, text-base, text-lg, text-xl, text-2xl, etc.
  const textSizeMatch = className.match(/^text-(xs|sm|base|lg|xl|[2-9]xl)$/);
  if (textSizeMatch) {
    const sizeMap: Record<string, string> = {
      xs: '12px',
      sm: '14px',
      base: '16px',
      lg: '18px',
      xl: '20px',
      '2xl': '24px',
      '3xl': '30px',
      '4xl': '36px',
      '5xl': '48px',
      '6xl': '60px',
      '7xl': '72px',
      '8xl': '96px',
      '9xl': '128px',
    };
    return { property: 'fontSize', value: sizeMap[textSizeMatch[1]], isArbitrary: false };
  }

  // text-{alignment}: text-left, text-center, text-right, text-justify
  const textAlignMatch = className.match(/^text-(left|center|right|justify|start|end)$/);
  if (textAlignMatch) {
    return { property: 'textAlign', value: textAlignMatch[1], isArbitrary: false };
  }

  // text-[arbitrary] - could be color or fontSize
  const textArbitraryMatch = className.match(/^text-\[(.+)\]$/);
  if (textArbitraryMatch) {
    const value = textArbitraryMatch[1].replace(/_/g, ' ');
    // Color indicators: #, rgb, hsl, oklch, named colors
    if (
      value.startsWith('#') ||
      value.startsWith('rgb') ||
      value.startsWith('hsl') ||
      value.startsWith('oklch') ||
      value.startsWith('var(')
    ) {
      return { property: 'color', value, isArbitrary: true };
    }
    // Size indicators: px, rem, em, %
    if (/^\d+(\.\d+)?(px|rem|em|%)$/.test(value)) {
      return { property: 'fontSize', value, isArbitrary: true };
    }
    // Default to color for text-[value]
    return { property: 'color', value, isArbitrary: true };
  }

  // text-{color}: text-red-500, text-blue-600, text-primary, etc.
  // This is the fallback for text-* that didn't match above
  if (className.startsWith('text-')) {
    const colorPart = className.slice(5);
    // Named semantic colors or color palette
    return { property: 'color', value: `var(--${colorPart}, ${colorPart})`, isArbitrary: false };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FONT CLASSES - Could be weight or family
  // ─────────────────────────────────────────────────────────────────────────

  const fontWeightMatch = className.match(
    /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/
  );
  if (fontWeightMatch) {
    const weightMap: Record<string, string> = {
      thin: '100',
      extralight: '200',
      light: '300',
      normal: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
      extrabold: '800',
      black: '900',
    };
    return { property: 'fontWeight', value: weightMap[fontWeightMatch[1]], isArbitrary: false };
  }

  // font-[arbitrary] - could be weight or family
  const fontArbitraryMatch = className.match(/^font-\[(.+)\]$/);
  if (fontArbitraryMatch) {
    const value = fontArbitraryMatch[1].replace(/_/g, ' ');
    // Numeric = weight
    if (/^\d+$/.test(value)) {
      return { property: 'fontWeight', value, isArbitrary: true };
    }
    // String = family
    return { property: 'fontFamily', value, isArbitrary: true };
  }

  // font-{family}: font-sans, font-serif, font-mono
  if (className.match(/^font-(sans|serif|mono)$/)) {
    const familyMap: Record<string, string> = {
      sans: 'ui-sans-serif, system-ui, sans-serif',
      serif: 'ui-serif, Georgia, serif',
      mono: 'ui-monospace, monospace',
    };
    return { property: 'fontFamily', value: familyMap[className.slice(5)], isArbitrary: false };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BORDER CLASSES - Could be width, color, radius, or style
  // ─────────────────────────────────────────────────────────────────────────

  // border-{width}: border, border-0, border-2, border-4, border-8
  const borderWidthMatch = className.match(/^border(-[0248])?$/);
  if (borderWidthMatch) {
    const widthMap: Record<string, string> = {
      '': '1px',
      '-0': '0px',
      '-2': '2px',
      '-4': '4px',
      '-8': '8px',
    };
    return {
      property: 'borderWidth',
      value: widthMap[borderWidthMatch[1] ?? ''],
      isArbitrary: false,
    };
  }

  // border-{style}: border-solid, border-dashed, border-dotted, border-none
  const borderStyleMatch = className.match(/^border-(solid|dashed|dotted|double|hidden|none)$/);
  if (borderStyleMatch) {
    return { property: 'borderStyle', value: borderStyleMatch[1], isArbitrary: false };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // UNAMBIGUOUS CLASSES
  // ─────────────────────────────────────────────────────────────────────────

  // rounded-*
  const roundedMatch = className.match(/^rounded(-none|-sm|-md|-lg|-xl|-2xl|-3xl|-full)?$/);
  if (roundedMatch) {
    const radiusMap: Record<string, string> = {
      '': '4px',
      '-none': '0px',
      '-sm': '2px',
      '-md': '6px',
      '-lg': '8px',
      '-xl': '12px',
      '-2xl': '16px',
      '-3xl': '24px',
      '-full': '9999px',
    };
    return {
      property: 'borderRadius',
      value: radiusMap[roundedMatch[1] ?? ''],
      isArbitrary: false,
    };
  }

  // rounded-[arbitrary]
  const roundedArbitraryMatch = className.match(/^rounded-\[(.+)\]$/);
  if (roundedArbitraryMatch) {
    return { property: 'borderRadius', value: roundedArbitraryMatch[1], isArbitrary: true };
  }

  // p-*, m-*, gap-* (spacing)
  const spacingMatch = className.match(/^(p|m|gap)([trblxy]?)-(.+)$/);
  if (spacingMatch) {
    const [, type, direction, value] = spacingMatch;
    const baseProperty = type === 'p' ? 'padding' : type === 'm' ? 'margin' : 'gap';

    // Handle arbitrary values
    if (value.startsWith('[') && value.endsWith(']')) {
      const arbitraryValue = value.slice(1, -1).replace(/_/g, ' ');
      return {
        property: direction ? `${baseProperty}${directionToSuffix(direction)}` : baseProperty,
        value: arbitraryValue,
        isArbitrary: true,
      };
    }

    // Handle standard spacing scale
    const spacingValue = spacingScaleToValue(value);
    if (spacingValue) {
      return {
        property: direction ? `${baseProperty}${directionToSuffix(direction)}` : baseProperty,
        value: spacingValue,
        isArbitrary: false,
      };
    }
  }

  // bg-* (background color)
  if (className.startsWith('bg-')) {
    const colorPart = className.slice(3);
    if (colorPart.startsWith('[') && colorPart.endsWith(']')) {
      return {
        property: 'backgroundColor',
        value: colorPart.slice(1, -1).replace(/_/g, ' '),
        isArbitrary: true,
      };
    }
    return {
      property: 'backgroundColor',
      value: `var(--${colorPart}, ${colorPart})`,
      isArbitrary: false,
    };
  }

  // opacity-*
  const opacityMatch = className.match(/^opacity-(\d+)$/);
  if (opacityMatch) {
    const percentage = parseInt(opacityMatch[1], 10);
    return { property: 'opacity', value: (percentage / 100).toString(), isArbitrary: false };
  }

  return null;
}

function directionToSuffix(dir: string): string {
  const map: Record<string, string> = {
    t: 'Top',
    r: 'Right',
    b: 'Bottom',
    l: 'Left',
    x: 'Inline',
    y: 'Block',
  };
  return map[dir] ?? '';
}

function spacingScaleToValue(scale: string): string | null {
  // Handle negative values
  const isNegative = scale.startsWith('-');
  const positiveScale = isNegative ? scale.slice(1) : scale;

  const map: Record<string, string> = {
    '0': '0px',
    px: '1px',
    '0.5': '2px',
    '1': '4px',
    '1.5': '6px',
    '2': '8px',
    '2.5': '10px',
    '3': '12px',
    '3.5': '14px',
    '4': '16px',
    '5': '20px',
    '6': '24px',
    '7': '28px',
    '8': '32px',
    '9': '36px',
    '10': '40px',
    '11': '44px',
    '12': '48px',
    '14': '56px',
    '16': '64px',
    '20': '80px',
    '24': '96px',
    '28': '112px',
    '32': '128px',
    '36': '144px',
    '40': '160px',
    '44': '176px',
    '48': '192px',
    '52': '208px',
    '56': '224px',
    '60': '240px',
    '64': '256px',
    '72': '288px',
    '80': '320px',
    '96': '384px',
  };

  const value = map[positiveScale];
  if (value) {
    return isNegative ? `-${value}` : value;
  }
  return null;
}
```

#### `apps/Canvas-UI-Builder/src/lib/tailwind/index.ts`

```typescript
export * from './mapper';
export * from './parser';
```

---

## Phase 3: AST-Based Persistent Changes (Frontend + Rust)

### Architecture Decision

**Frontend (TypeScript + Babel):** Handles all AST operations
**Backend (Rust):** Handles file I/O only (read, write with atomic operations)

This keeps AST logic in TypeScript where the team has expertise, while Rust provides safe file operations.

### New Files

#### `apps/Canvas-UI-Builder/src/lib/ast/transform.ts`

```typescript
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';
import { z } from 'zod';
import { getConflictingClassPrefixes } from '../tailwind/mapper';

// ─────────────────────────────────────────────────────────────────────────────
// Types & Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const StyleChangeSchema = z.object({
  property: z.string().min(1),
  value: z.string(),
  tailwindClass: z.string().min(1),
});

export type StyleChange = z.infer<typeof StyleChangeSchema>;

export const TransformResultSchema = z.object({
  success: z.boolean(),
  code: z.string().optional(),
  addedClasses: z.array(z.string()),
  removedClasses: z.array(z.string()),
  warnings: z.array(z.string()),
  error: z
    .object({
      code: z.enum(['PARSE_ERROR', 'TRANSFORM_ERROR', 'VALIDATION_ERROR']),
      message: z.string(),
    })
    .optional(),
});

export type TransformResult = z.infer<typeof TransformResultSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Transform Options - handles components without className
// ─────────────────────────────────────────────────────────────────────────────

export const TransformOptionsSchema = z.object({
  /**
   * What to do when no className, cva(), or cn() is found:
   * - 'warn': Add warning but don't modify (default)
   * - 'inject-wrapper': Wrap JSX return in a styled div
   * - 'add-classname-prop': Add className prop to component and apply to root element
   */
  fallbackStrategy: z.enum(['warn', 'inject-wrapper', 'add-classname-prop']).default('warn'),
});

export type TransformOptions = z.infer<typeof TransformOptionsSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// AST Transform
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transform component source code by replacing Tailwind classes.
 *
 * Handles:
 * - Plain className="..." strings
 * - CVA base classes (first argument to cva())
 * - cn() utility string literals
 * - Components with no className (uses fallbackStrategy)
 *
 * Does NOT modify:
 * - CVA variant definitions
 * - Dynamic expressions/variables
 * - Template literals (warns user)
 *
 * @param options.fallbackStrategy - What to do when no className target found:
 *   - 'warn': Just add a warning (default, safest)
 *   - 'inject-wrapper': Wrap the return JSX in a styled div
 *   - 'add-classname-prop': Add className prop to component signature
 */
export function transformTailwindClasses(
  sourceCode: string,
  changes: StyleChange[],
  options: TransformOptions = { fallbackStrategy: 'warn' }
): TransformResult {
  const addedClasses: string[] = [];
  const removedClasses: string[] = [];
  const warnings: string[] = [];

  // Track if we found any className to modify
  let foundClassNameAttribute = false;
  let foundCvaCall = false;
  let foundCnCall = false;

  // Build a map of classes to add and prefixes to remove
  const classesToAdd = new Map<string, string>(); // prefix -> new class
  const prefixesToRemove = new Set<string>();

  for (const change of changes) {
    const conflictPrefixes = getConflictingClassPrefixes(change.tailwindClass);
    conflictPrefixes.forEach((p) => prefixesToRemove.add(p));

    // Use the first conflict prefix as the key
    if (conflictPrefixes.length > 0) {
      classesToAdd.set(conflictPrefixes[0], change.tailwindClass);
    }
  }

  let ast: t.File;
  try {
    ast = parse(sourceCode, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
    });
  } catch (err) {
    return {
      success: false,
      addedClasses: [],
      removedClasses: [],
      warnings: [],
      error: {
        code: 'PARSE_ERROR',
        message: err instanceof Error ? err.message : 'Failed to parse source code',
      },
    };
  }

  try {
    traverse(ast, {
      // Handle className="..." and className={...}
      JSXAttribute(path) {
        if (!t.isJSXIdentifier(path.node.name, { name: 'className' })) {
          return;
        }

        foundClassNameAttribute = true;
        const value = path.node.value;

        // className="static string"
        if (t.isStringLiteral(value)) {
          const result = replaceClasses(value.value, classesToAdd, prefixesToRemove);
          value.value = result.newValue;
          addedClasses.push(...result.added);
          removedClasses.push(...result.removed);
        }
        // className={expression}
        else if (t.isJSXExpressionContainer(value)) {
          processExpression(
            value.expression,
            classesToAdd,
            prefixesToRemove,
            addedClasses,
            removedClasses,
            warnings
          );
        }
      },

      // Handle cva() calls
      CallExpression(path) {
        const callee = path.node.callee;

        // Check if this is a cva() call
        if (t.isIdentifier(callee, { name: 'cva' })) {
          foundCvaCall = true;
          const firstArg = path.node.arguments[0];

          // Only modify the first argument (base classes)
          if (t.isStringLiteral(firstArg)) {
            const result = replaceClasses(firstArg.value, classesToAdd, prefixesToRemove);
            firstArg.value = result.newValue;
            addedClasses.push(...result.added);
            removedClasses.push(...result.removed);
          } else if (t.isTemplateLiteral(firstArg)) {
            warnings.push('CVA base classes use template literal - cannot auto-modify');
          }
        }

        // Check if this is a cn() or clsx() call
        if (
          t.isIdentifier(callee) &&
          ['cn', 'clsx', 'classNames', 'twMerge'].includes(callee.name)
        ) {
          foundCnCall = true;
          for (const arg of path.node.arguments) {
            processExpression(
              arg,
              classesToAdd,
              prefixesToRemove,
              addedClasses,
              removedClasses,
              warnings
            );
          }
        }
      },
    });

    // Check if we found any targets for modification
    if (!foundClassNameAttribute && !foundCvaCall && !foundCnCall) {
      // Apply fallback strategy based on options
      if (options.fallbackStrategy === 'warn') {
        warnings.push(
          'No className attribute, cva(), or cn() found in component. ' +
            'Styles cannot be automatically applied. Consider adding a className prop.'
        );
      } else if (options.fallbackStrategy === 'inject-wrapper') {
        // Wrap JSX return in a styled div
        const wrapperResult = injectStyleWrapper(ast, changes);
        if (wrapperResult.success) {
          addedClasses.push(...wrapperResult.addedClasses);
          warnings.push('Wrapped component JSX in styled div (no existing className found)');
        } else {
          warnings.push('Could not inject wrapper: ' + (wrapperResult.error || 'unknown error'));
        }
      } else if (options.fallbackStrategy === 'add-classname-prop') {
        // Add className prop to component signature and apply to root element
        const propResult = addClassNamePropToComponent(ast, changes);
        if (propResult.success) {
          addedClasses.push(...propResult.addedClasses);
          warnings.push('Added className prop to component (no existing className found)');
        } else {
          warnings.push('Could not add className prop: ' + (propResult.error || 'unknown error'));
        }
      }
    }
  } catch (err) {
    return {
      success: false,
      addedClasses: [],
      removedClasses: [],
      warnings,
      error: {
        code: 'TRANSFORM_ERROR',
        message: err instanceof Error ? err.message : 'Failed to transform AST',
      },
    };
  }

  // Generate code
  const output = generate(ast, {
    retainLines: true,
    compact: false,
  });

  // Validate the output parses correctly
  try {
    parse(output.code, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
    });
  } catch (err) {
    return {
      success: false,
      addedClasses: [],
      removedClasses: [],
      warnings,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Generated code has syntax errors - original file not modified',
      },
    };
  }

  return {
    success: true,
    code: output.code,
    addedClasses: [...new Set(addedClasses)],
    removedClasses: [...new Set(removedClasses)],
    warnings,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

function processExpression(
  expr: t.Expression | t.SpreadElement | t.JSXEmptyExpression | t.ArgumentPlaceholder,
  classesToAdd: Map<string, string>,
  prefixesToRemove: Set<string>,
  addedClasses: string[],
  removedClasses: string[],
  warnings: string[]
): void {
  // String literal - can modify
  if (t.isStringLiteral(expr)) {
    const result = replaceClasses(expr.value, classesToAdd, prefixesToRemove);
    expr.value = result.newValue;
    addedClasses.push(...result.added);
    removedClasses.push(...result.removed);
  }
  // Template literal - warn and skip
  else if (t.isTemplateLiteral(expr)) {
    warnings.push('Template literal in className - cannot auto-modify');
  }
  // Conditional expression: condition ? 'a' : 'b'
  else if (t.isConditionalExpression(expr)) {
    processExpression(
      expr.consequent,
      classesToAdd,
      prefixesToRemove,
      addedClasses,
      removedClasses,
      warnings
    );
    processExpression(
      expr.alternate,
      classesToAdd,
      prefixesToRemove,
      addedClasses,
      removedClasses,
      warnings
    );
  }
  // Logical expression: condition && 'class'
  else if (t.isLogicalExpression(expr)) {
    processExpression(
      expr.right,
      classesToAdd,
      prefixesToRemove,
      addedClasses,
      removedClasses,
      warnings
    );
  }
  // Identifier or other expression - skip (dynamic)
  else if (t.isIdentifier(expr) || t.isMemberExpression(expr) || t.isCallExpression(expr)) {
    // Dynamic expression - can't modify
  }
}

/**
 * Replace Tailwind classes while preserving variants (hover:, dark:, md:, etc.)
 *
 * IMPORTANT: Only removes BASE classes, not variant-prefixed versions.
 * Example: When adding `rounded-full`, removes `rounded-md` but keeps `hover:rounded-md`
 */
function replaceClasses(
  classString: string,
  classesToAdd: Map<string, string>,
  prefixesToRemove: Set<string>
): { newValue: string; added: string[]; removed: string[] } {
  const classes = classString.split(/\s+/).filter(Boolean);
  const added: string[] = [];
  const removed: string[] = [];

  // Remove conflicting BASE classes (preserve variants)
  const filteredClasses = classes.filter((cls) => {
    // Extract base class by stripping variant prefixes
    // Examples: "hover:rounded-md" → "rounded-md", "dark:md:bg-slate-900" → "bg-slate-900"
    const hasVariant = cls.includes(':');
    const baseClass = hasVariant ? cls.split(':').pop()! : cls;

    for (const prefix of prefixesToRemove) {
      if (baseClass.startsWith(prefix) || baseClass === prefix) {
        // Only remove if it's a BASE class (no variant prefix)
        // This preserves hover:rounded-md, dark:rounded-lg, md:rounded-xl, etc.
        if (!hasVariant) {
          removed.push(cls);
          return false;
        }
        // Has variant prefix - keep it but log for debugging
        // (User explicitly set hover:rounded-md, we shouldn't remove it)
      }
    }
    return true;
  });

  // Add new classes (always as base, not with variants)
  for (const newClass of classesToAdd.values()) {
    if (!filteredClasses.includes(newClass)) {
      filteredClasses.push(newClass);
      added.push(newClass);
    }
  }

  return {
    newValue: filteredClasses.join(' '),
    added,
    removed,
  };
}

/**
 * Extract the base class from a potentially variant-prefixed Tailwind class.
 * @example extractBaseClass("hover:dark:rounded-md") → "rounded-md"
 * @example extractBaseClass("rounded-md") → "rounded-md"
 */
function extractBaseClass(className: string): string {
  if (!className.includes(':')) return className;
  return className.split(':').pop()!;
}

/**
 * Check if a class has any variant prefixes.
 * @example hasVariantPrefix("hover:rounded-md") → true
 * @example hasVariantPrefix("rounded-md") → false
 */
function hasVariantPrefix(className: string): boolean {
  return className.includes(':');
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback Strategies for Components Without className
// ─────────────────────────────────────────────────────────────────────────────

interface FallbackResult {
  success: boolean;
  addedClasses: string[];
  error?: string;
}

/**
 * Fallback strategy: Wrap the component's JSX return in a styled div.
 *
 * Before:
 *   return <Button onClick={...}>Click</Button>;
 *
 * After:
 *   return <div className="rounded-full p-4"><Button onClick={...}>Click</Button></div>;
 *
 * Use case: Quick styling without modifying component internals.
 * Limitation: Adds extra DOM node, may affect layout.
 */
function injectStyleWrapper(ast: t.File, changes: StyleChange[]): FallbackResult {
  const tailwindClasses = changes.map((c) => c.tailwindClass).join(' ');
  let modified = false;

  traverse(ast, {
    ReturnStatement(path) {
      const arg = path.node.argument;

      // Only wrap JSX elements/fragments
      if (!t.isJSXElement(arg) && !t.isJSXFragment(arg)) {
        return;
      }

      // Already wrapped? Don't double-wrap
      if (
        t.isJSXElement(arg) &&
        t.isJSXIdentifier(arg.openingElement.name, { name: 'div' }) &&
        arg.openingElement.attributes.some(
          (attr) =>
            t.isJSXAttribute(attr) &&
            t.isJSXIdentifier(attr.name, { name: 'className' }) &&
            t.isStringLiteral(attr.value) &&
            attr.value.value.includes('--canvas-injected')
        )
      ) {
        return;
      }

      // Wrap: return <div className="... --canvas-injected">...</div>
      path.node.argument = t.jsxElement(
        t.jsxOpeningElement(t.jsxIdentifier('div'), [
          t.jsxAttribute(
            t.jsxIdentifier('className'),
            t.stringLiteral(`${tailwindClasses} --canvas-injected`)
          ),
        ]),
        t.jsxClosingElement(t.jsxIdentifier('div')),
        [arg],
        false
      );

      modified = true;
    },
  });

  return {
    success: modified,
    addedClasses: modified ? changes.map((c) => c.tailwindClass) : [],
    error: modified ? undefined : 'No return statement with JSX found',
  };
}

/**
 * Fallback strategy: Add className prop to component and apply to root element.
 *
 * Before:
 *   export function MyComponent({ onClick }) {
 *     return <div onClick={onClick}>Content</div>;
 *   }
 *
 * After:
 *   export function MyComponent({ onClick, className }) {
 *     return <div onClick={onClick} className="rounded-full p-4">Content</div>;
 *   }
 *
 * Use case: Make component styleable while preserving structure.
 * Limitation: More invasive, changes component API.
 */
function addClassNamePropToComponent(ast: t.File, changes: StyleChange[]): FallbackResult {
  const tailwindClasses = changes.map((c) => c.tailwindClass).join(' ');
  let modified = false;

  traverse(ast, {
    FunctionDeclaration(path) {
      if (!path.node.id || path.node.params.length === 0) return;

      const firstParam = path.node.params[0];

      // Handle destructured props: function Comp({ prop1, prop2 })
      if (t.isObjectPattern(firstParam)) {
        // Check if className already exists
        const hasClassName = firstParam.properties.some(
          (prop) => t.isObjectProperty(prop) && t.isIdentifier(prop.key, { name: 'className' })
        );

        if (!hasClassName) {
          // Add className to destructured props
          firstParam.properties.push(
            t.objectProperty(
              t.identifier('className'),
              t.identifier('className'),
              false,
              true // shorthand
            )
          );
        }

        // Now find the first JSX element in the return and add className
        path.traverse({
          ReturnStatement(returnPath) {
            const arg = returnPath.node.argument;
            if (!t.isJSXElement(arg)) return;

            const openingElement = arg.openingElement;

            // Check if className already exists on root element
            const existingClassName = openingElement.attributes.find(
              (attr) =>
                t.isJSXAttribute(attr) && t.isJSXIdentifier(attr.name, { name: 'className' })
            );

            if (!existingClassName) {
              // Add new className attribute
              openingElement.attributes.push(
                t.jsxAttribute(t.jsxIdentifier('className'), t.stringLiteral(tailwindClasses))
              );
              modified = true;
            }
          },
        });
      }
    },
  });

  return {
    success: modified,
    addedClasses: modified ? changes.map((c) => c.tailwindClass) : [],
    error: modified ? undefined : 'Could not modify component props',
  };
}
```

#### `apps/Canvas-UI-Builder/src/lib/ast/index.ts`

```typescript
export * from './transform';
```

### Backend Commands (Rust - File I/O Only)

#### `src-tauri/src/utils/paths.rs`

**Centralized path helpers and validation:**

```rust
use std::path::PathBuf;
use once_cell::sync::Lazy;
use regex::Regex;

/// Regex pattern for valid component names
static COMPONENT_NAME_PATTERN: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"^[a-zA-Z][a-zA-Z0-9-]*$").unwrap());

/// Get the base canvas directory path
pub fn get_orbit_canvas_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".orbit")
        .join("canvas")
}

/// Get the test canvas directory path (for integration tests)
pub fn get_orbit_canvas_path_test() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".orbit-test")
        .join("canvas")
}

/// Get the path for a specific component
pub fn get_component_path(
    component_name: &str,
    component_type: &str,
    test_mode: bool,
) -> PathBuf {
    let base = if test_mode {
        get_orbit_canvas_path_test()
    } else {
        get_orbit_canvas_path()
    };

    base.join("components")
        .join(component_type)
        .join(format!("{}.tsx", component_name))
}

/// Validate component name (defense in depth - also validated on frontend)
pub fn validate_component_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Component name cannot be empty".to_string());
    }
    if name.len() > 64 {
        return Err("Component name too long (max 64 chars)".to_string());
    }
    if !COMPONENT_NAME_PATTERN.is_match(name) {
        return Err(
            "Component name must start with letter, contain only alphanumeric and hyphens"
                .to_string(),
        );
    }
    // Prevent path traversal
    if name.contains("..") || name.contains('/') || name.contains('\\') {
        return Err("Invalid characters in component name".to_string());
    }
    Ok(())
}

/// Validate component type
pub fn validate_component_type(component_type: &str) -> Result<(), String> {
    match component_type {
        "ui" | "custom" => Ok(()),
        _ => Err(format!("Invalid component type: {}", component_type)),
    }
}
```

#### `src-tauri/src/commands/canvas/persist.rs`

```rust
use std::fs;
use tauri::command;
use serde::Serialize;
use crate::utils::paths::{
    get_component_path,
    validate_component_name,
    validate_component_type,
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileReadResult {
    pub success: bool,
    pub content: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileWriteResult {
    pub success: bool,
    pub backup_path: Option<String>,
    pub error: Option<String>,
}

/// Read component source file
#[command]
pub async fn canvas_read_component_source(
    component_name: String,
    component_type: String,
    test_mode: Option<bool>,
) -> FileReadResult {
    // Server-side validation (defense in depth)
    if let Err(e) = validate_component_name(&component_name) {
        return FileReadResult {
            success: false,
            content: None,
            error: Some(e),
        };
    }
    if let Err(e) = validate_component_type(&component_type) {
        return FileReadResult {
            success: false,
            content: None,
            error: Some(e),
        };
    }

    let path = get_component_path(&component_name, &component_type, test_mode.unwrap_or(false));

    match fs::read_to_string(&path) {
        Ok(content) => FileReadResult {
            success: true,
            content: Some(content),
            error: None,
        },
        Err(e) => FileReadResult {
            success: false,
            content: None,
            error: Some(format!("Failed to read {}: {}", path.display(), e)),
        },
    }
}

/// Write component source file with atomic operation and backup
#[command]
pub async fn canvas_write_component_source(
    component_name: String,
    component_type: String,
    content: String,
    create_backup: bool,
) -> FileWriteResult {
    let home = dirs::home_dir().unwrap_or_default();
    let base_path = home
        .join(".orbit")
        .join("canvas")
        .join("components")
        .join(&component_type);

    let target_path = base_path.join(format!("{}.tsx", component_name));
    let temp_path = base_path.join(format!(".{}.tsx.tmp", component_name));
    let backup_path = base_path.join(format!("{}.tsx.backup", component_name));

    // Create backup if requested and file exists
    let mut backup_created: Option<String> = None;
    if create_backup && target_path.exists() {
        if let Ok(original) = fs::read_to_string(&target_path) {
            if fs::write(&backup_path, &original).is_ok() {
                backup_created = Some(backup_path.to_string_lossy().to_string());
            }
        }
    }

    // Write to temp file first
    if let Err(e) = fs::write(&temp_path, &content) {
        return FileWriteResult {
            success: false,
            backup_path: backup_created,
            error: Some(format!("Failed to write temp file: {}", e)),
        };
    }

    // Atomic rename
    if let Err(e) = fs::rename(&temp_path, &target_path) {
        // Clean up temp file
        let _ = fs::remove_file(&temp_path);
        return FileWriteResult {
            success: false,
            backup_path: backup_created,
            error: Some(format!("Failed to rename temp file: {}", e)),
        };
    }

    FileWriteResult {
        success: true,
        backup_path: backup_created,
        error: None,
    }
}

/// Restore from backup
#[command]
pub async fn canvas_restore_backup(
    component_name: String,
    component_type: String,
) -> FileWriteResult {
    let home = dirs::home_dir().unwrap_or_default();
    let base_path = home
        .join(".orbit")
        .join("canvas")
        .join("components")
        .join(&component_type);

    let target_path = base_path.join(format!("{}.tsx", component_name));
    let backup_path = base_path.join(format!("{}.tsx.backup", component_name));

    if !backup_path.exists() {
        return FileWriteResult {
            success: false,
            backup_path: None,
            error: Some("No backup file found".to_string()),
        };
    }

    match fs::copy(&backup_path, &target_path) {
        Ok(_) => {
            // Remove backup after successful restore
            let _ = fs::remove_file(&backup_path);
            FileWriteResult {
                success: true,
                backup_path: None,
                error: None,
            }
        }
        Err(e) => FileWriteResult {
            success: false,
            backup_path: Some(backup_path.to_string_lossy().to_string()),
            error: Some(format!("Failed to restore backup: {}", e)),
        },
    }
}
```

### Update `src-tauri/src/commands/canvas/mod.rs`

```rust
// Add to existing exports
pub mod persist;

pub use persist::*;
```

### Register Commands in `src-tauri/src/lib.rs`

```rust
// Add to the invoke_handler
canvas_read_component_source,
canvas_write_component_source,
canvas_restore_backup,
```

---

## Phase 4: Frontend Integration

### Update CSS Customization Store

`apps/Canvas-UI-Builder/src/stores/css-customization-store.ts`

Add persistence tracking:

```typescript
// Add to the store interface
interface CSSCustomizationStore {
  // ... existing properties

  // Track which properties have been persisted to file
  persistedProperties: Set<string>;

  // Mark a property as persisted (clear from CSS injection)
  markPropertyPersisted: (property: string) => void;

  // Clear all persisted properties after HMR reload
  clearPersistedOverrides: () => void;

  // Check if there are unsaved changes
  hasUnsavedChanges: () => boolean;
}

// Add to the store implementation
persistedProperties: new Set<string>(),

markPropertyPersisted: (property) =>
  set((state) => {
    state.persistedProperties.add(property);
    // Remove from active overrides
    state.cssOverrides.delete(property);
  }),

clearPersistedOverrides: () =>
  set((state) => {
    state.persistedProperties.clear();
  }),

hasUnsavedChanges: () => {
  const state = get();
  return state.cssOverrides.size > 0;
},
```

### New Hook: `use-style-persistence.ts`

`apps/Canvas-UI-Builder/src/hooks/use-style-persistence.ts`

```typescript
import { useState, useCallback, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { transformTailwindClasses, StyleChange, TransformResult } from '@canvas/lib/ast';
import { cssToTailwind, colorToTailwind } from '@canvas/lib/tailwind';
import { useCSSCustomizationStore } from '@canvas/stores/css-customization-store';
import { createLogger } from '@canvas/lib/logger';

const logger = createLogger('StylePersistence');

/**
 * Persist flow state machine:
 *
 * IDLE → VALIDATING → READING → TRANSFORMING → WRITING → WAITING_HMR → SUCCESS → IDLE
 *           ↓            ↓           ↓            ↓           ↓
 *         ERROR        ERROR      ERROR        ERROR    HMR_FAILED
 *           ↓            ↓           ↓            ↓           ↓
 *         IDLE         IDLE       IDLE         IDLE    ERROR_RECOVERY
 */
type PersistState =
  | 'idle'
  | 'validating'
  | 'reading'
  | 'transforming'
  | 'writing'
  | 'waiting_hmr'
  | 'success'
  | 'hmr_failed';

interface PersistenceState {
  isPersisting: boolean;
  persistState: PersistState;
  lastResult: TransformResult | null;
  error: string | null;
  hmrFailed: boolean;
  lastModifiedComponent: string | null;
}

interface UsePersistenceReturn extends PersistenceState {
  persistStyles: (componentName: string, componentType: 'ui' | 'custom') => Promise<boolean>;
  restoreBackup: (componentName: string, componentType: 'ui' | 'custom') => Promise<boolean>;
}

export function useStylePersistence(): UsePersistenceReturn {
  const [state, setState] = useState<PersistenceState>({
    isPersisting: false,
    persistState: 'idle',
    lastResult: null,
    error: null,
    hmrFailed: false,
    lastModifiedComponent: null,
  });

  const { cssOverrides, markPropertyPersisted } = useCSSCustomizationStore();

  // Mutex to prevent concurrent persist calls
  const persistingRef = useRef(false);

  // ─────────────────────────────────────────────────────────────────────────
  // HMR Error Recovery
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    // Listen for Vite HMR errors
    const handleHMRError = (event: CustomEvent<{ file?: string; err?: Error }>) => {
      // Check if error is in our recently modified component
      if (
        state.lastModifiedComponent &&
        event.detail?.file?.includes(state.lastModifiedComponent)
      ) {
        logger.error('HMR failed for modified component', {
          component: state.lastModifiedComponent,
          error: event.detail.err?.message,
        });

        setState((prev) => ({
          ...prev,
          persistState: 'hmr_failed',
          hmrFailed: true,
          error:
            'Hot reload failed. The component may have syntax errors. ' +
            'Click "Restore Backup" to revert your changes.',
        }));
      }
    };

    // Listen for successful HMR to clear waiting state
    const handleHMRSuccess = () => {
      if (state.persistState === 'waiting_hmr') {
        setState((prev) => ({
          ...prev,
          persistState: 'success',
          isPersisting: false,
        }));

        // Auto-transition to idle after success
        setTimeout(() => {
          setState((prev) => ({
            ...prev,
            persistState: 'idle',
            lastModifiedComponent: null,
          }));
        }, 1000);
      }
    };

    // Vite emits these events
    window.addEventListener('vite:error', handleHMRError as EventListener);
    window.addEventListener('vite:afterUpdate', handleHMRSuccess);

    return () => {
      window.removeEventListener('vite:error', handleHMRError as EventListener);
      window.removeEventListener('vite:afterUpdate', handleHMRSuccess);
    };
  }, [state.lastModifiedComponent, state.persistState]);

  const persistStyles = useCallback(
    async (componentName: string, componentType: 'ui' | 'custom'): Promise<boolean> => {
      setState((prev) => ({ ...prev, isPersisting: true, error: null }));

      try {
        // 1. Convert CSS overrides to Tailwind changes
        const changes: StyleChange[] = [];

        for (const [property, value] of cssOverrides.entries()) {
          let mapping;

          if (['color', 'backgroundColor', 'borderColor'].includes(property)) {
            mapping = colorToTailwind(
              property as 'color' | 'backgroundColor' | 'borderColor',
              value
            );
          } else {
            mapping = cssToTailwind(property, value);
          }

          if (mapping) {
            changes.push({
              property,
              value,
              tailwindClass: mapping.tailwindClass,
            });
          } else {
            logger.warn(`No Tailwind mapping for ${property}: ${value}`);
          }
        }

        if (changes.length === 0) {
          setState((prev) => ({ ...prev, isPersisting: false, error: 'No changes to persist' }));
          return false;
        }

        // 2. Read current file
        const readResult = await invoke<{ success: boolean; content?: string; error?: string }>(
          'canvas_read_component_source',
          { componentName, componentType }
        );

        if (!readResult.success || !readResult.content) {
          throw new Error(readResult.error ?? 'Failed to read component file');
        }

        // 3. Transform AST
        const transformResult = transformTailwindClasses(readResult.content, changes);

        if (!transformResult.success || !transformResult.code) {
          throw new Error(transformResult.error?.message ?? 'Transform failed');
        }

        // 4. Write back with backup
        const writeResult = await invoke<{ success: boolean; backupPath?: string; error?: string }>(
          'canvas_write_component_source',
          {
            componentName,
            componentType,
            content: transformResult.code,
            createBackup: true,
          }
        );

        if (!writeResult.success) {
          throw new Error(writeResult.error ?? 'Failed to write component file');
        }

        // 5. Mark properties as persisted (clears CSS injection)
        for (const change of changes) {
          markPropertyPersisted(change.property);
        }

        logger.info('Styles persisted successfully', {
          component: componentName,
          added: transformResult.addedClasses,
          removed: transformResult.removedClasses,
        });

        setState({
          isPersisting: false,
          lastResult: transformResult,
          error: null,
        });

        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        logger.error('Failed to persist styles', err);
        setState({
          isPersisting: false,
          lastResult: null,
          error: message,
        });
        return false;
      }
    },
    [cssOverrides, markPropertyPersisted]
  );

  const restoreBackup = useCallback(
    async (componentName: string, componentType: 'ui' | 'custom'): Promise<boolean> => {
      try {
        const result = await invoke<{ success: boolean; error?: string }>('canvas_restore_backup', {
          componentName,
          componentType,
        });
        return result.success;
      } catch (err) {
        logger.error('Failed to restore backup', err);
        return false;
      }
    },
    []
  );

  return {
    ...state,
    persistStyles,
    restoreBackup,
  };
}
```

### Update PropertiesPanel

`apps/Canvas-UI-Builder/src/components/inspector/PropertiesPanel.tsx`

Add "Apply to Component" button:

```tsx
// In the export actions section, add:

import { useStylePersistence } from '@canvas/hooks/use-style-persistence';

// Inside component:
const { persistStyles, isPersisting, lastResult, error } = useStylePersistence();
const { hasUnsavedChanges } = useCSSCustomizationStore();

// In the JSX, add button:
<Button
  variant="default"
  size="sm"
  onClick={() => persistStyles(componentName, componentType)}
  disabled={isPersisting || !hasUnsavedChanges()}
  className="w-full"
>
  {isPersisting ? (
    <>
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Applying...
    </>
  ) : (
    <>
      <Save className="mr-2 h-4 w-4" />
      Apply to Component
    </>
  )}
</Button>;

{
  error && <p className="text-xs text-destructive mt-1">{error}</p>;
}

{
  lastResult?.warnings.length > 0 && (
    <div className="text-xs text-muted-foreground mt-1">
      <p className="font-medium">Warnings:</p>
      <ul className="list-disc pl-4">
        {lastResult.warnings.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </div>
  );
}
```

---

## Phase 5: Handling CSS Variables (Design Tokens)

### Problem

shadcn components use CSS variables extensively:

```tsx
className = 'bg-primary text-primary-foreground';
// Resolves to: var(--primary), var(--primary-foreground)
```

When a user changes background color, should we:

1. Change `bg-primary` → `bg-[#ff0000]` (this component only)
2. Update `--primary` in globals.css (affects all components)

### Solution: Semantic Color Detection + User Choice

#### New File: `apps/Canvas-UI-Builder/src/lib/semantic-colors.ts`

```typescript
import { z } from 'zod';

// Semantic color tokens used in shadcn/ui
export const SEMANTIC_COLORS = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'destructive-foreground',
  'border',
  'input',
  'ring',
] as const;

export type SemanticColor = (typeof SEMANTIC_COLORS)[number];

export const SemanticColorSchema = z.enum(SEMANTIC_COLORS);

/**
 * Tailwind classes that reference semantic CSS variables.
 * Maps className prefix → CSS variable it references.
 */
export const SEMANTIC_CLASS_MAP: Record<string, SemanticColor> = {
  'bg-background': 'background',
  'bg-foreground': 'foreground',
  'bg-card': 'card',
  'bg-popover': 'popover',
  'bg-primary': 'primary',
  'bg-secondary': 'secondary',
  'bg-muted': 'muted',
  'bg-accent': 'accent',
  'bg-destructive': 'destructive',
  'text-foreground': 'foreground',
  'text-card-foreground': 'card-foreground',
  'text-popover-foreground': 'popover-foreground',
  'text-primary-foreground': 'primary-foreground',
  'text-secondary-foreground': 'secondary-foreground',
  'text-muted-foreground': 'muted-foreground',
  'text-accent-foreground': 'accent-foreground',
  'text-destructive-foreground': 'destructive-foreground',
  'text-primary': 'primary',
  'text-secondary': 'secondary',
  'text-muted': 'muted',
  'text-accent': 'accent',
  'text-destructive': 'destructive',
  'border-border': 'border',
  'border-input': 'input',
  'ring-ring': 'ring',
};

export interface SemanticColorUsage {
  className: string;
  semanticToken: SemanticColor;
  cssVariable: string;
  property: 'color' | 'backgroundColor' | 'borderColor';
}

/**
 * Detect if a component's current classes use semantic colors.
 * Used to prompt user about design token vs component-only changes.
 */
export function detectSemanticColorUsage(
  currentClasses: string[],
  propertyBeingChanged: 'color' | 'backgroundColor' | 'borderColor'
): SemanticColorUsage | null {
  // Map CSS property to Tailwind prefix
  const prefixMap = {
    color: 'text-',
    backgroundColor: 'bg-',
    borderColor: 'border-',
  };
  const relevantPrefix = prefixMap[propertyBeingChanged];

  for (const className of currentClasses) {
    if (className.startsWith(relevantPrefix)) {
      const semanticToken = SEMANTIC_CLASS_MAP[className];
      if (semanticToken) {
        return {
          className,
          semanticToken,
          cssVariable: `--${semanticToken}`,
          property: propertyBeingChanged,
        };
      }
    }
  }

  return null;
}

/**
 * Get the current classes from a component file.
 * Parses the file and extracts all className values.
 *
 * NOTE: Uses static imports (not dynamic) to avoid bundle issues and
 * ensure modules are loaded at startup, not in the hot path.
 */

// Static imports at module level (not dynamic)
import { invoke } from '@tauri-apps/api/core';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';

export async function extractClassesFromComponent(
  componentName: string,
  componentType: 'ui' | 'custom'
): Promise<string[]> {
  // Use already-imported modules (no dynamic import overhead)

  const result = await invoke<{ success: boolean; content?: string }>(
    'canvas_read_component_source',
    {
      componentName,
      componentType,
    }
  );

  if (!result.success || !result.content) {
    return [];
  }

  const classes: string[] = [];

  try {
    const ast = parse(result.content, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
    });

    traverse(ast, {
      StringLiteral(path) {
        // Check if this is inside a className context
        const parent = path.parentPath;
        if (
          parent?.isJSXAttribute() &&
          t.isJSXIdentifier(parent.node.name, { name: 'className' })
        ) {
          classes.push(...path.node.value.split(/\s+/).filter(Boolean));
        }
        // Check if inside cva() or cn() call
        if (parent?.isCallExpression()) {
          const callee = parent.node.callee;
          if (
            t.isIdentifier(callee) &&
            ['cva', 'cn', 'clsx', 'classNames', 'twMerge'].includes(callee.name)
          ) {
            classes.push(...path.node.value.split(/\s+/).filter(Boolean));
          }
        }
      },
    });
  } catch {
    // Parse error - return empty
  }

  return [...new Set(classes)]; // Dedupe
}
```

#### Hook for Semantic Detection: `use-semantic-colors.ts`

```typescript
import { useState, useEffect, useCallback } from 'react';
import {
  detectSemanticColorUsage,
  extractClassesFromComponent,
  SemanticColorUsage,
} from '@canvas/lib/semantic-colors';

interface UseSemanticColorsReturn {
  currentClasses: string[];
  checkSemanticUsage: (
    property: 'color' | 'backgroundColor' | 'borderColor'
  ) => SemanticColorUsage | null;
  loading: boolean;
}

export function useSemanticColors(
  componentName: string | null,
  componentType: 'ui' | 'custom' | null
): UseSemanticColorsReturn {
  const [currentClasses, setCurrentClasses] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!componentName || !componentType) {
      setCurrentClasses([]);
      return;
    }

    setLoading(true);
    extractClassesFromComponent(componentName, componentType)
      .then(setCurrentClasses)
      .finally(() => setLoading(false));
  }, [componentName, componentType]);

  const checkSemanticUsage = useCallback(
    (property: 'color' | 'backgroundColor' | 'borderColor') => {
      return detectSemanticColorUsage(currentClasses, property);
    },
    [currentClasses]
  );

  return { currentClasses, checkSemanticUsage, loading };
}
```

#### UI Dialog Component

```tsx
// In PropertiesPanel.tsx
import { useState } from 'react';
import { useSemanticColors } from '@canvas/hooks/use-semantic-colors';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@canvas/components/ui/alert-dialog';

// Inside component:
const { checkSemanticUsage } = useSemanticColors(componentName, componentType);
const [semanticDialog, setSemanticDialog] = useState<{
  open: boolean;
  usage: SemanticColorUsage | null;
  pendingValue: string;
}>({ open: false, usage: null, pendingValue: '' });

// Before persisting color changes, check for semantic usage
const handlePersistWithSemanticCheck = async () => {
  // Check if any color properties are being changed
  const colorProperties = ['color', 'backgroundColor', 'borderColor'] as const;

  for (const prop of colorProperties) {
    if (cssOverrides.has(prop)) {
      const usage = checkSemanticUsage(prop);
      if (usage) {
        // Show dialog
        setSemanticDialog({
          open: true,
          usage,
          pendingValue: cssOverrides.get(prop)!,
        });
        return; // Wait for user choice
      }
    }
  }

  // No semantic colors affected, proceed normally
  await persistStyles(componentName, componentType);
};

// Dialog JSX:
<AlertDialog
  open={semanticDialog.open}
  onOpenChange={(open) => setSemanticDialog((prev) => ({ ...prev, open }))}
>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Design Token Detected</AlertDialogTitle>
      <AlertDialogDescription>
        This component uses the design token{' '}
        <code className="bg-muted px-1 rounded">{semanticDialog.usage?.cssVariable}</code> via the
        class <code className="bg-muted px-1 rounded">{semanticDialog.usage?.className}</code>.
        <br />
        <br />
        How would you like to apply your color change?
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction
        onClick={async () => {
          // Component only - replace semantic class with arbitrary color
          setSemanticDialog((prev) => ({ ...prev, open: false }));
          await persistStyles(componentName, componentType);
        }}
      >
        This component only
      </AlertDialogAction>
      <AlertDialogAction
        onClick={async () => {
          // Update design token globally
          setSemanticDialog((prev) => ({ ...prev, open: false }));
          await updateDesignToken(semanticDialog.usage!.semanticToken, semanticDialog.pendingValue);
        }}
        className="bg-primary"
      >
        Update token globally
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>;
```

#### Global Token Update Function

```typescript
// In use-style-persistence.ts
import { invoke } from '@tauri-apps/api/core';
import { createLogger } from '@canvas/lib/logger';

const logger = createLogger('StylePersistence');

async function updateDesignToken(tokenName: SemanticColor, newValue: string): Promise<boolean> {
  try {
    // Get resolved path (Tauri handles ~ expansion)
    const globalsPath = await invoke<string>('canvas_get_globals_path');

    // Read globals.css
    const result = await invoke<{ success: boolean; content?: string }>('canvas_read_file', {
      path: globalsPath,
    });

    if (!result.success || !result.content) {
      throw new Error('Failed to read globals.css');
    }

    // Replace the CSS variable value
    // Pattern: --primary: oklch(0.56 0.24 25);
    const varPattern = new RegExp(`(--${tokenName}\\s*:\\s*)([^;]+)(;)`, 'g');

    const updatedContent = result.content.replace(varPattern, `$1${newValue}$3`);

    // Write back
    await invoke('canvas_write_file', {
      path: globalsPath,
      content: updatedContent,
      createBackup: true,
    });

    return true;
  } catch (err) {
    logger.error('Failed to update design token', {
      tokenName,
      newValue,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
```

#### Generic File Commands (persist.rs)

These commands handle arbitrary files within the canvas directory:

```rust
// In persist.rs

/// Get resolved path to globals.css
#[command]
pub async fn canvas_get_globals_path() -> String {
    let home = dirs::home_dir().unwrap_or_default();
    home.join(".orbit")
        .join("canvas")
        .join("globals.css")
        .to_string_lossy()
        .to_string()
}

/// Generic file read (validates path is within canvas directory)
#[command]
pub async fn canvas_read_file(path: String) -> FileReadResult {
    // Security: Validate path is within canvas directory
    let home = dirs::home_dir().unwrap_or_default();
    let canvas_root = home.join(".orbit").join("canvas");
    let resolved_path = Path::new(&path);

    // Canonicalize and check it's under canvas root
    let canonical = match resolved_path.canonicalize() {
        Ok(p) => p,
        Err(e) => {
            return FileReadResult {
                success: false,
                content: None,
                error: Some(format!("Invalid path: {}", e)),
            };
        }
    };

    if !canonical.starts_with(&canvas_root) {
        return FileReadResult {
            success: false,
            content: None,
            error: Some("Path traversal not allowed".to_string()),
        };
    }

    match fs::read_to_string(&canonical) {
        Ok(content) => FileReadResult {
            success: true,
            content: Some(content),
            error: None,
        },
        Err(e) => FileReadResult {
            success: false,
            content: None,
            error: Some(format!("Failed to read: {}", e)),
        },
    }
}

/// Generic file write (validates path is within canvas directory)
#[command]
pub async fn canvas_write_file(
    path: String,
    content: String,
    create_backup: bool,
) -> FileWriteResult {
    let home = dirs::home_dir().unwrap_or_default();
    let canvas_root = home.join(".orbit").join("canvas");
    let target_path = Path::new(&path);

    // Security: Validate path is within canvas directory
    // For new files, check the parent directory
    let canonical = if target_path.exists() {
        match target_path.canonicalize() {
            Ok(p) => p,
            Err(e) => {
                return FileWriteResult {
                    success: false,
                    backup_path: None,
                    error: Some(format!("Invalid path: {}", e)),
                };
            }
        }
    } else {
        // For new files, resolve parent
        let parent = target_path.parent().unwrap_or(Path::new(""));
        match parent.canonicalize() {
            Ok(p) => p.join(target_path.file_name().unwrap_or_default()),
            Err(e) => {
                return FileWriteResult {
                    success: false,
                    backup_path: None,
                    error: Some(format!("Invalid parent path: {}", e)),
                };
            }
        }
    };

    if !canonical.starts_with(&canvas_root) {
        return FileWriteResult {
            success: false,
            backup_path: None,
            error: Some("Path traversal not allowed".to_string()),
        };
    }

    // Create backup if requested
    let mut backup_created: Option<String> = None;
    if create_backup && canonical.exists() {
        let backup_path = canonical.with_extension("backup");
        if let Ok(original) = fs::read_to_string(&canonical) {
            if fs::write(&backup_path, &original).is_ok() {
                backup_created = Some(backup_path.to_string_lossy().to_string());
            }
        }
    }

    // Atomic write
    let temp_path = canonical.with_extension("tmp");
    if let Err(e) = fs::write(&temp_path, &content) {
        return FileWriteResult {
            success: false,
            backup_path: backup_created,
            error: Some(format!("Failed to write temp file: {}", e)),
        };
    }

    if let Err(e) = fs::rename(&temp_path, &canonical) {
        let _ = fs::remove_file(&temp_path);
        return FileWriteResult {
            success: false,
            backup_path: backup_created,
            error: Some(format!("Failed to finalize write: {}", e)),
        };
    }

    FileWriteResult {
        success: true,
        backup_path: backup_created,
        error: None,
    }
}
```

---

## Phase 6: Testing Strategy

### Unit Tests for Tailwind Mapper

`apps/Canvas-UI-Builder/src/lib/tailwind/__tests__/mapper.test.ts`

```typescript
import { describe, it, expect } from 'bun:test';
import { cssToTailwind, colorToTailwind, getConflictingClassPrefixes } from '../mapper';

describe('cssToTailwind', () => {
  describe('borderRadius', () => {
    it('maps standard values', () => {
      expect(cssToTailwind('borderRadius', '0px')?.tailwindClass).toBe('rounded-none');
      expect(cssToTailwind('borderRadius', '4px')?.tailwindClass).toBe('rounded');
      expect(cssToTailwind('borderRadius', '9999px')?.tailwindClass).toBe('rounded-full');
    });

    it('creates arbitrary values for non-standard', () => {
      const result = cssToTailwind('borderRadius', '7px');
      expect(result?.tailwindClass).toBe('rounded-[7px]');
      expect(result?.isArbitrary).toBe(true);
    });
  });

  describe('negative values', () => {
    it('handles negative margin', () => {
      const result = cssToTailwind('margin', '-16px');
      expect(result?.tailwindClass).toBe('-m-4');
    });
  });
});

describe('getConflictingClassPrefixes', () => {
  it('returns rounded prefixes for rounded classes', () => {
    const prefixes = getConflictingClassPrefixes('rounded-full');
    expect(prefixes).toContain('rounded');
  });
});
```

### Unit Tests for AST Transform

`apps/Canvas-UI-Builder/src/lib/ast/__tests__/transform.test.ts`

```typescript
import { describe, it, expect } from 'bun:test';
import { transformTailwindClasses } from '../transform';

describe('transformTailwindClasses', () => {
  describe('plain className string', () => {
    it('replaces rounded-md with rounded-full', () => {
      const input = `<Button className="rounded-md bg-blue-500" />`;
      const result = transformTailwindClasses(input, [
        { property: 'borderRadius', value: '9999px', tailwindClass: 'rounded-full' },
      ]);

      expect(result.success).toBe(true);
      expect(result.code).toContain('rounded-full');
      expect(result.code).not.toContain('rounded-md');
      expect(result.addedClasses).toContain('rounded-full');
      expect(result.removedClasses).toContain('rounded-md');
    });
  });

  describe('CVA base classes', () => {
    it('only modifies first argument of cva()', () => {
      const input = `
        const buttonVariants = cva(
          "rounded-md text-sm",
          { variants: { size: { lg: "rounded-lg" } } }
        );
      `;
      const result = transformTailwindClasses(input, [
        { property: 'borderRadius', value: '9999px', tailwindClass: 'rounded-full' },
      ]);

      expect(result.success).toBe(true);
      expect(result.code).toContain('"rounded-full text-sm"');
      expect(result.code).toContain('rounded-lg'); // Variant unchanged
    });
  });

  describe('cn() utility', () => {
    it('modifies string literals inside cn()', () => {
      const input = `className={cn("rounded-md", someVariable)}`;
      const result = transformTailwindClasses(input, [
        { property: 'borderRadius', value: '9999px', tailwindClass: 'rounded-full' },
      ]);

      expect(result.success).toBe(true);
      expect(result.code).toContain('rounded-full');
      expect(result.code).toContain('someVariable'); // Dynamic unchanged
    });

    it('warns about template literals', () => {
      const input = 'const x = cn(`base ${variant}`)';
      const result = transformTailwindClasses(input, [
        { property: 'borderRadius', value: '9999px', tailwindClass: 'rounded-full' },
      ]);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('template literal');
    });
  });

  describe('error handling', () => {
    it('returns parse error for invalid syntax', () => {
      const input = `const x = {{{ invalid`;
      const result = transformTailwindClasses(input, []);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('PARSE_ERROR');
    });

    it('validates output syntax', () => {
      // This shouldn't happen, but if transform creates invalid code:
      // The validation step catches it
    });
  });
});
```

### Integration Tests

`apps/Canvas-UI-Builder/src/__tests__/style-persistence.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdir, writeFile, readFile, rm } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const TEST_DIR = join(homedir(), '.orbit', 'canvas', 'components', 'ui');
const TEST_COMPONENT = 'test-button';

describe('Style Persistence Integration', () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
    await writeFile(
      join(TEST_DIR, `${TEST_COMPONENT}.tsx`),
      `export function TestButton() {
        return <button className="rounded-md p-2">Click</button>;
      }`
    );
  });

  afterEach(async () => {
    await rm(join(TEST_DIR, `${TEST_COMPONENT}.tsx`), { force: true });
    await rm(join(TEST_DIR, `${TEST_COMPONENT}.tsx.backup`), { force: true });
  });

  it('creates backup before modifying', async () => {
    // Test via Tauri invoke (requires running app)
    // Or mock the invoke function
  });

  it('atomic write prevents corruption', async () => {
    // Simulate interruption during write
  });

  it('restore backup reverts changes', async () => {
    // Modify, then restore
  });
});
```

### Real Integration Tests (No Mocks)

**IMPORTANT:** This repo follows a "no mocks / real integration tests only" policy. Tests must use real Tauri commands with a test directory.

#### Test Directory Setup

Tests use `~/.orbit-test/canvas/` instead of `~/.orbit/canvas/` to avoid affecting real data:

`apps/Canvas-UI-Builder/src/__tests__/integration/test-utils.ts`

```typescript
import { mkdir, rm, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';

// Test directory - separate from real .orbit data
export const TEST_BASE_DIR = join(homedir(), '.orbit-test', 'canvas');
export const TEST_COMPONENTS_DIR = join(TEST_BASE_DIR, 'components');

export async function setupTestDirectory(): Promise<void> {
  // Clean and recreate test directory
  if (existsSync(TEST_BASE_DIR)) {
    await rm(TEST_BASE_DIR, { recursive: true, force: true });
  }
  await mkdir(join(TEST_COMPONENTS_DIR, 'ui'), { recursive: true });
  await mkdir(join(TEST_COMPONENTS_DIR, 'custom'), { recursive: true });
}

export async function cleanupTestDirectory(): Promise<void> {
  if (existsSync(TEST_BASE_DIR)) {
    await rm(TEST_BASE_DIR, { recursive: true, force: true });
  }
}

export async function writeTestComponent(
  componentName: string,
  componentType: 'ui' | 'custom',
  content: string
): Promise<string> {
  const filePath = join(TEST_COMPONENTS_DIR, componentType, `${componentName}.tsx`);
  await writeFile(filePath, content, 'utf-8');
  return filePath;
}

export async function readTestComponent(
  componentName: string,
  componentType: 'ui' | 'custom'
): Promise<string> {
  const filePath = join(TEST_COMPONENTS_DIR, componentType, `${componentName}.tsx`);
  return readFile(filePath, 'utf-8');
}
```

#### Rust Backend - Test Mode Support

Add `test_mode` parameter to Rust commands to use test directory:

`src-tauri/src/commands/canvas/persist.rs`

```rust
use crate::utils::paths::{get_orbit_canvas_path, get_orbit_canvas_path_test};

#[command]
pub async fn canvas_read_component_source(
    component_name: String,
    component_type: String,
    test_mode: Option<bool>,
) -> FileReadResult {
    // Use test directory when test_mode is true
    let base = if test_mode.unwrap_or(false) {
        get_orbit_canvas_path_test() // ~/.orbit-test/canvas
    } else {
        get_orbit_canvas_path()      // ~/.orbit/canvas
    };

    let path = base
        .join("components")
        .join(&component_type)
        .join(format!("{}.tsx", component_name));

    // ... rest of implementation
}

// In utils/paths.rs
pub fn get_orbit_canvas_path_test() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".orbit-test")
        .join("canvas")
}
```

#### Integration Test Example

`apps/Canvas-UI-Builder/src/__tests__/integration/style-persistence.integration.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { transformTailwindClasses } from '@canvas/lib/ast/transform';
import {
  setupTestDirectory,
  cleanupTestDirectory,
  writeTestComponent,
  readTestComponent,
} from './test-utils';

// Skip if not running in Tauri context
const describeTauri = process.env.TAURI_ENV ? describe : describe.skip;

describeTauri('Style Persistence Integration', () => {
  beforeEach(async () => {
    await setupTestDirectory();

    // Create test button component
    await writeTestComponent(
      'test-button',
      'ui',
      `
import { cva } from 'class-variance-authority';
import { cn } from '@canvas/lib/utils';

const buttonVariants = cva(
  'rounded-md text-sm font-medium',
  { variants: { size: { lg: 'rounded-lg' } } }
);

export function Button({ className, ...props }) {
  return <button className={cn(buttonVariants(), className)} {...props} />;
}
    `
    );
  });

  afterEach(async () => {
    await cleanupTestDirectory();
  });

  it('reads component source from real file system', async () => {
    const result = await invoke<{ success: boolean; content?: string }>(
      'canvas_read_component_source',
      {
        componentName: 'test-button',
        componentType: 'ui',
        testMode: true,
      }
    );

    expect(result.success).toBe(true);
    expect(result.content).toContain('rounded-md');
    expect(result.content).toContain('buttonVariants');
  });

  it('persists style changes to real file', async () => {
    // Read original
    const readResult = await invoke<{ success: boolean; content?: string }>(
      'canvas_read_component_source',
      {
        componentName: 'test-button',
        componentType: 'ui',
        testMode: true,
      }
    );
    expect(readResult.success).toBe(true);

    // Transform
    const transformResult = transformTailwindClasses(readResult.content!, [
      { property: 'borderRadius', value: '9999px', tailwindClass: 'rounded-full' },
    ]);
    expect(transformResult.success).toBe(true);
    expect(transformResult.code).toContain('rounded-full');
    expect(transformResult.code).not.toContain('rounded-md');
    // Variant should be preserved
    expect(transformResult.code).toContain('rounded-lg');

    // Write back
    const writeResult = await invoke<{ success: boolean }>('canvas_write_component_source', {
      componentName: 'test-button',
      componentType: 'ui',
      content: transformResult.code,
      testMode: true,
    });
    expect(writeResult.success).toBe(true);

    // Verify file on disk
    const fileContent = await readTestComponent('test-button', 'ui');
    expect(fileContent).toContain('rounded-full');
    expect(fileContent).not.toContain('rounded-md');
    expect(fileContent).toContain('rounded-lg'); // Variant preserved
  });

  it('creates backup before writing', async () => {
    // Write first
    await invoke('canvas_write_component_source', {
      componentName: 'test-button',
      componentType: 'ui',
      content: 'modified content',
      createBackup: true,
      testMode: true,
    });

    // Verify backup exists
    const backups = await invoke<Array<{ timestamp: number; path: string }>>(
      'canvas_list_backups',
      {
        componentName: 'test-button',
        componentType: 'ui',
        testMode: true,
      }
    );

    expect(backups.length).toBeGreaterThan(0);
  });

  it('restores from backup', async () => {
    const originalContent = await readTestComponent('test-button', 'ui');

    // Modify with backup
    await invoke('canvas_write_component_source', {
      componentName: 'test-button',
      componentType: 'ui',
      content: 'MODIFIED CONTENT',
      createBackup: true,
      testMode: true,
    });

    // Get backup path
    const backups = await invoke<Array<{ timestamp: number; path: string }>>(
      'canvas_list_backups',
      {
        componentName: 'test-button',
        componentType: 'ui',
        testMode: true,
      }
    );

    // Restore
    await invoke('canvas_restore_backup', {
      backupPath: backups[0].path,
      testMode: true,
    });

    // Verify original content restored
    const restoredContent = await readTestComponent('test-button', 'ui');
    expect(restoredContent).toBe(originalContent);
  });
});
```

#### Running Integration Tests

Integration tests require the Tauri app to be running:

```bash
# Terminal 1: Start Tauri dev server
bunx tauri dev

# Terminal 2: Run integration tests
TAURI_ENV=1 bun test --filter integration
```

For CI, tests that require Tauri are automatically skipped via `describeTauri`.

### Vitest Configuration

`apps/Canvas-UI-Builder/vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Integration tests require running Tauri - skip in standard CI
    exclude: process.env.TAURI_ENV ? [] : ['src/__tests__/integration/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/lib/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/__tests__/**'],
    },
  },
  resolve: {
    alias: {
      // Use @canvas alias for Canvas app
      '@canvas': path.resolve(__dirname, './src'),
    },
  },
});
```

---

## Files Summary

### New Files to Create

| File                                                                                     | Purpose                                 |
| ---------------------------------------------------------------------------------------- | --------------------------------------- |
| **Tailwind**                                                                             |                                         |
| `apps/Canvas-UI-Builder/src/lib/tailwind/mapper.ts`                                      | CSS → Tailwind conversion               |
| `apps/Canvas-UI-Builder/src/lib/tailwind/parser.ts`                                      | Tailwind → CSS parsing (context-aware)  |
| `apps/Canvas-UI-Builder/src/lib/tailwind/index.ts`                                       | Barrel export                           |
| **AST**                                                                                  |                                         |
| `apps/Canvas-UI-Builder/src/lib/ast/transform.ts`                                        | Babel-based AST manipulation            |
| `apps/Canvas-UI-Builder/src/lib/ast/index.ts`                                            | Barrel export                           |
| **Hooks**                                                                                |                                         |
| `apps/Canvas-UI-Builder/src/hooks/use-style-persistence.ts`                              | Persistence hook                        |
| `apps/Canvas-UI-Builder/src/hooks/use-file-watcher.ts`                                   | External modification detection         |
| `apps/Canvas-UI-Builder/src/hooks/use-semantic-colors.ts`                                | Design token detection                  |
| **Lib**                                                                                  |                                         |
| `apps/Canvas-UI-Builder/src/lib/validation.ts`                                           | Component name/type validation          |
| `apps/Canvas-UI-Builder/src/lib/semantic-colors.ts`                                      | Semantic color constants & detection    |
| **Backend**                                                                              |                                         |
| `src-tauri/src/commands/canvas/persist.rs`                                               | File I/O commands with backup           |
| **Tests**                                                                                |                                         |
| `apps/Canvas-UI-Builder/src/lib/tailwind/__tests__/mapper.test.ts`                       | Mapper unit tests                       |
| `apps/Canvas-UI-Builder/src/lib/ast/__tests__/transform.test.ts`                         | AST unit tests                          |
| `apps/Canvas-UI-Builder/src/__tests__/integration/test-utils.ts`                         | Integration test utilities              |
| `apps/Canvas-UI-Builder/src/__tests__/integration/style-persistence.integration.test.ts` | Real file system integration tests      |
| `apps/Canvas-UI-Builder/vitest.config.ts`                                                | Vitest configuration                    |
| `src-tauri/src/utils/paths.rs`                                                           | Centralized path helpers with test mode |

### Files to Modify

| File                                                                  | Changes                                                    |
| --------------------------------------------------------------------- | ---------------------------------------------------------- |
| `src-tauri/src/commands/canvas/preview.rs`                            | Update CSS injection with custom properties, SVG exclusion |
| `src-tauri/src/commands/canvas/mod.rs`                                | Export persist module                                      |
| `src-tauri/src/lib.rs`                                                | Register new commands                                      |
| `src-tauri/Cargo.toml`                                                | Add sha2, chrono dependencies                              |
| `apps/Canvas-UI-Builder/src/stores/css-customization-store.ts`        | Add persistence tracking, undo stack, debounce             |
| `apps/Canvas-UI-Builder/src/components/inspector/PropertiesPanel.tsx` | Add "Apply" button, semantic dialog, lock during persist   |
| `apps/Canvas-UI-Builder/src/components/inspector/SizeInput.tsx`       | Split immediate vs debounced updates                       |

### Cargo.toml Changes Required

```toml
# In src-tauri/Cargo.toml
[dependencies]
sha2 = "0.10"                               # For file hash detection
chrono = { version = "0.4", features = ["serde"] }  # For timestamped backups
once_cell = "1.19"                          # For lazy regex patterns
regex = "1"                                 # For component name validation

# Use workspace version of dirs to avoid conflicts
dirs.workspace = true                       # Already defined in workspace root
```

**Note:** The `serde` feature on `chrono` is required if you serialize timestamps.
Use workspace dependencies (`.workspace = true`) for packages already defined in
the workspace `[workspace.dependencies]` to avoid version conflicts.

---

## Verification Checklist

### Phase 1: Instant Preview

- [ ] Run `bunx tauri dev`
- [ ] Select Button component
- [ ] Change fontSize in Styles tab
- [ ] Verify preview updates immediately
- [ ] Verify hover states work (`:hover` brightness change)
- [ ] Verify nested text elements receive typography styles
- [ ] Verify SVG icons inside buttons are NOT affected (lucide icons)
- [ ] Verify focus ring appears on focus-visible

### Phase 2: Tailwind Mapping

- [ ] Run `bun test` in Canvas-UI-Builder
- [ ] Verify standard values map correctly
- [ ] Verify arbitrary values are generated for non-standard
- [ ] Verify negative values work (`-16px` → `-m-4`)
- [ ] Verify `text-*` disambiguation:
  - [ ] `text-sm` → fontSize
  - [ ] `text-center` → textAlign
  - [ ] `text-red-500` → color
  - [ ] `text-[#ff0000]` → color

### Phase 3: AST Transform

- [ ] Test plain className strings
- [ ] Test CVA base classes (variants unchanged)
- [ ] Test cn() with mixed static/dynamic
- [ ] Test template literal warning
- [ ] Test parse error handling
- [ ] Test validation catches bad output
- [ ] Test component with NO className (warning shown)

### Phase 4: Frontend Integration

- [ ] Click "Apply to Component"
- [ ] Verify backup created in `~/.orbit/canvas/components/ui/.backups/`
- [ ] Verify component file modified
- [ ] Verify CSS injection cleared for persisted properties
- [ ] Verify Vite HMR reloads
- [ ] Verify inputs are disabled during persist (no race condition)

### Phase 5: Semantic Colors

- [ ] Test component using `bg-primary` → dialog appears
- [ ] Select "This component only" → `bg-[#newcolor]` written
- [ ] Select "Update token globally" → globals.css modified
- [ ] Test component NOT using semantic colors → no dialog

### Phase 6: Safety Features

- [ ] **Race Condition**: Click Apply, try to change property → inputs disabled
- [ ] **Concurrent Persist**: Double-click Apply rapidly → only one persist runs (check console logs)
- [ ] **Multi-level Undo**: Apply 3 times → 3 backups exist → restore works
- [ ] **External Modification**: Edit file in VS Code → warning banner appears
- [ ] **File Watcher Debounce**: Save file rapidly in external editor → single warning (not multiple)
- [ ] **Debouncing**: Drag slider rapidly → no UI jank
- [ ] **Input Validation**: Try malicious component name → rejected
- [ ] **HMR Failure Recovery**: Introduce syntax error → error message shown → fix error → recovery message

### Phase 7: Edge Cases

- [ ] Test custom component (not shadcn)
- [ ] Test component with dark: variants (preserved after persist)
- [ ] Test component with hover: variants (preserved after persist)
- [ ] Test component with focus: variants (preserved after persist)
- [ ] Test component with responsive variants (md:, lg: preserved)
- [ ] Test component mixing variants: `hover:bg-red-500 md:p-4` → only base class replaced
- [ ] Test restore from backup (multiple levels)
- [ ] Test with component file open in external editor
- [ ] Test preview error boundary: kill preview server → error UI shown → restart → retry works
- [ ] Test CSS-in-JS detection: styled-components component → info message shown

### Phase 8: Tests Pass

- [ ] `bun test` passes all unit tests
- [ ] `bun test --coverage` shows >80% on lib/
- [ ] `TAURI_ENV=1 bun test --filter integration` passes (requires `bunx tauri dev` running)

### Phase 9: Accessibility

- [ ] **Keyboard Navigation**: Tab through all inspector controls
- [ ] **Keyboard Shortcuts**: Cmd+Z undoes, Cmd+S persists
- [ ] **Screen Reader**: Persist status announced via live region
- [ ] **Focus Management**: Focus returns to Apply button after persist
- [ ] **Color Contrast**: All text meets WCAG 2.1 AA (4.5:1 ratio)
- [ ] **ARIA Labels**: All icon-only buttons have aria-label

---

## Appendix A: Implementation Order

Recommended execution order based on dependencies:

```
Week 1: Foundation
├── Day 1-2: Rust file I/O commands (persist.rs)
│   └── canvas_read_component_source
│   └── canvas_write_component_source
│   └── canvas_get_file_hash
│   └── canvas_read_file / canvas_write_file
├── Day 3-4: Tailwind mapper + parser with tests
│   └── apps/Canvas-UI-Builder/src/lib/tailwind/*
│   └── Unit tests for mapping accuracy
└── Day 5: CSS injection in preview.rs
    └── generateInjectedCSS with CSS custom properties
    └── Positive HTML element selection
    └── SVG exclusion

Week 2: Core Features
├── Day 1-2: AST transform with tests
│   └── apps/Canvas-UI-Builder/src/lib/ast/*
│   └── CVA, cn(), plain className handling
│   └── Unit tests for all patterns
├── Day 3: css-customization-store updates
│   └── persistedProperties tracking
│   └── Undo stack
│   └── Debounced setters
├── Day 4: use-style-persistence hook
│   └── Full persist flow
│   └── Error handling
└── Day 5: PropertiesPanel integration
    └── Apply button
    └── Input locking during persist
    └── Error display

Week 3: Safety & Polish
├── Day 1: File watcher + external modification
│   └── use-file-watcher hook
│   └── Warning banner UI
├── Day 2: Semantic color detection + dialog
│   └── semantic-colors.ts
│   └── use-semantic-colors hook
│   └── AlertDialog component
├── Day 3: Input debouncing + validation
│   └── SizeInput immediate vs debounced
│   └── validation.ts with Zod
├── Day 4: Multi-level undo UI
│   └── Backup browser (optional)
│   └── Undo button
└── Day 5: Integration testing + edge cases
    └── Real file system integration tests (requires bunx tauri dev)
    └── Full flow tests with test directory (~/.orbit-test/canvas)
```

**Parallelization opportunity:** Phase 1 (CSS injection) and Phase 2 (Tailwind mapper) have no dependencies on each other. Start both in Week 1 to validate the preview UX while building the persistence layer.

---

## Appendix B: Future Enhancements

These are optional improvements to consider after the initial implementation is stable.

### 1. Telemetry / Metrics Hook

Track which properties users change most often to inform UX decisions:

```typescript
// In use-style-persistence.ts
interface StyleMetric {
  property: string;
  wasArbitrary: boolean;
  componentType: 'ui' | 'custom';
  timestamp: number;
}

const trackStyleChange = (metric: StyleMetric) => {
  // Option 1: Log for analysis
  logger.info('style_applied', metric);

  // Option 2: Send to analytics service
  // analytics.track('canvas_style_change', metric);

  // Option 3: Store locally for in-app insights
  // localStorage append to 'canvas_metrics'
};

// Call after successful persist:
trackStyleChange({
  property: change.property,
  wasArbitrary: mapping.isArbitrary,
  componentType,
  timestamp: Date.now(),
});
```

**Use cases:**

- Identify most-used properties → prioritize in Inspector UI
- Track arbitrary value usage → identify missing Tailwind mappings
- Component type distribution → guide shadcn vs custom UX

### 2. Optimistic Locking

For high-conflict scenarios (multiple editors, team use), add content hash comparison:

```typescript
// In use-style-persistence.ts
interface LockState {
  hash: string;
  acquiredAt: number;
}

const locks = new Map<string, LockState>();

async function acquireLock(
  componentName: string,
  componentType: 'ui' | 'custom'
): Promise<{ success: boolean; currentHash: string }> {
  const key = `${componentType}/${componentName}`;
  const currentHash = await invoke<string>('canvas_get_file_hash', {
    path: await invoke('canvas_get_component_path', { componentName, componentType }),
  });

  const existing = locks.get(key);
  if (existing && existing.hash !== currentHash) {
    return { success: false, currentHash };
  }

  locks.set(key, { hash: currentHash, acquiredAt: Date.now() });
  return { success: true, currentHash };
}

async function releaseLock(
  componentName: string,
  componentType: 'ui' | 'custom',
  newHash: string
): void {
  const key = `${componentType}/${componentName}`;
  locks.set(key, { hash: newHash, acquiredAt: Date.now() });
}

// Before persist:
const lock = await acquireLock(componentName, componentType);
if (!lock.success) {
  // Show conflict dialog:
  // "File was modified. Your hash: X, Current: Y. Merge or overwrite?"
}
```

### 3. Backup Manifest with Metadata

Rich undo UI with timestamps, change descriptions, and diffs:

```json
// ~/.orbit/canvas/components/ui/.backups/button/manifest.json
{
  "component": "button",
  "backups": [
    {
      "timestamp": 1706123456789,
      "filename": "1706123456789.tsx",
      "changes": [{ "property": "borderRadius", "from": "rounded-md", "to": "rounded-full" }],
      "description": "Changed border radius to pill shape"
    },
    {
      "timestamp": 1706123400000,
      "filename": "1706123400000.tsx",
      "changes": [{ "property": "fontSize", "from": "text-sm", "to": "text-base" }],
      "description": "Increased font size"
    }
  ]
}
```

**Rust additions:**

```rust
#[derive(Debug, Serialize, Deserialize)]
struct BackupEntry {
    timestamp: i64,
    filename: String,
    changes: Vec<StyleChange>,
    description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct BackupManifest {
    component: String,
    backups: Vec<BackupEntry>,
}

#[command]
pub async fn canvas_get_backup_history(
    component_name: String,
    component_type: String,
) -> Result<BackupManifest, String> {
    // Read and parse manifest.json
}

#[command]
pub async fn canvas_restore_specific_backup(
    component_name: String,
    component_type: String,
    timestamp: i64,
) -> FileWriteResult {
    // Restore specific backup by timestamp
}
```

**UI component:**

```tsx
// BackupBrowser.tsx - could be a Sheet or Dialog
function BackupBrowser({ componentName, componentType }) {
  const { data: history } = useBackupHistory(componentName, componentType);

  return (
    <div className="space-y-2">
      {history?.backups.map((backup) => (
        <div
          key={backup.timestamp}
          className="flex items-center justify-between p-2 border rounded"
        >
          <div>
            <p className="text-sm font-medium">{formatDistanceToNow(backup.timestamp)} ago</p>
            <p className="text-xs text-muted-foreground">
              {backup.changes.map((c) => c.property).join(', ')}
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => previewBackup(backup)}>
              Preview
            </Button>
            <Button size="sm" onClick={() => restoreBackup(backup.timestamp)}>
              Restore
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

### 4. Diff Preview Before Restore

Show side-by-side comparison before restoring a backup:

```typescript
// Use a diff library like diff-match-patch or jsdiff
import { diffLines } from 'diff';

function generateDiff(oldContent: string, newContent: string) {
  const changes = diffLines(oldContent, newContent);

  return changes.map((part) => ({
    type: part.added ? 'added' : part.removed ? 'removed' : 'unchanged',
    content: part.value,
  }));
}
```

---

## Appendix C: Reference Implementation

### Existing Tailwind Utils

`_canvas-archive/lib/canvas/tailwindUtils.ts` contains reference implementations that can be adapted:

- `tailwindToCSS()` - Parse Tailwind to CSS values
- `cssToTailwind()` - Convert CSS to Tailwind classes
- Class conflict resolution

Review this file before implementing Phase 2.

---

## Appendix D: Developer Experience & Accessibility

### Type-Safe Tauri Command Wrapper

Prevent command name typos with a typed wrapper:

```typescript
// apps/Canvas-UI-Builder/src/lib/tauri-commands.ts

import { invoke } from '@tauri-apps/api/core';

// ─────────────────────────────────────────────────────────────────────────────
// Canvas Command Types (keep in sync with src-tauri/src/commands/canvas/*.rs)
// ─────────────────────────────────────────────────────────────────────────────

interface CanvasCommands {
  // File operations
  canvas_get_component_path: {
    params: { componentName: string; componentType: 'ui' | 'custom' };
    result: string;
  };
  canvas_get_file_hash: {
    params: { path: string };
    result: string;
  };
  canvas_read_file: {
    params: { path: string };
    result: string;
  };
  canvas_write_file: {
    params: { path: string; content: string };
    result: void;
  };
  canvas_read_component_source: {
    params: { componentName: string; componentType: 'ui' | 'custom' };
    result: { success: boolean; content?: string; error?: string };
  };
  canvas_write_component_source: {
    params: {
      componentName: string;
      componentType: 'ui' | 'custom';
      content: string;
    };
    result: { success: boolean; error?: string };
  };
  canvas_get_globals_path: {
    params: Record<string, never>; // No parameters
    result: string;
  };
  // Backup operations
  canvas_create_backup: {
    params: { componentName: string; componentType: 'ui' | 'custom'; reason: string };
    result: { success: boolean; backup_path?: string };
  };
  canvas_restore_backup: {
    params: { backupPath: string };
    result: { success: boolean };
  };
  canvas_list_backups: {
    params: { componentName: string; componentType: 'ui' | 'custom' };
    result: Array<{ timestamp: number; reason: string; path: string }>;
  };
  canvas_prune_old_backups: {
    params: { componentName: string; componentType: 'ui' | 'custom'; keepCount: number };
    result: { pruned: number };
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Type-Safe Invoke Wrapper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Type-safe wrapper for Tauri invoke.
 * Provides compile-time checking for command names and parameter shapes.
 *
 * @example
 * // ✅ Type-safe - will error if command or params are wrong
 * const hash = await canvasInvoke('canvas_get_file_hash', { path: '/some/path' });
 *
 * // ❌ Compile error - typo in command name
 * const hash = await canvasInvoke('canvas_get_flie_hash', { path: '/some/path' });
 *
 * // ❌ Compile error - missing required param
 * const hash = await canvasInvoke('canvas_get_file_hash', {});
 */
export async function canvasInvoke<K extends keyof CanvasCommands>(
  command: K,
  params: CanvasCommands[K]['params']
): Promise<CanvasCommands[K]['result']> {
  return invoke<CanvasCommands[K]['result']>(command, params);
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience Functions (optional - for common operations)
// ─────────────────────────────────────────────────────────────────────────────

export const canvasFiles = {
  getComponentPath: (componentName: string, componentType: 'ui' | 'custom') =>
    canvasInvoke('canvas_get_component_path', { componentName, componentType }),

  getFileHash: (path: string) => canvasInvoke('canvas_get_file_hash', { path }),

  readSource: (componentName: string, componentType: 'ui' | 'custom') =>
    canvasInvoke('canvas_read_component_source', { componentName, componentType }),

  writeSource: (componentName: string, componentType: 'ui' | 'custom', content: string) =>
    canvasInvoke('canvas_write_component_source', { componentName, componentType, content }),
};

export const canvasBackups = {
  create: (componentName: string, componentType: 'ui' | 'custom', reason: string) =>
    canvasInvoke('canvas_create_backup', { componentName, componentType, reason }),

  restore: (backupPath: string) => canvasInvoke('canvas_restore_backup', { backupPath }),

  list: (componentName: string, componentType: 'ui' | 'custom') =>
    canvasInvoke('canvas_list_backups', { componentName, componentType }),

  prune: (componentName: string, componentType: 'ui' | 'custom', keepCount: number) =>
    canvasInvoke('canvas_prune_old_backups', { componentName, componentType, keepCount }),
};
```

**Usage in hooks:**

```typescript
// Before (typo-prone):
const hash = await invoke<string>('canvas_get_flie_hash', { path }); // Typo! Runtime error

// After (type-safe):
const hash = await canvasFiles.getFileHash(path); // Compile-time checked
```

### Accessibility Considerations

The Canvas UI Builder should be keyboard-accessible and screen reader friendly:

#### Inspector Panel Accessibility

```tsx
// In PropertiesPanel.tsx - ensure all controls are accessible

<div role="form" aria-label="Component style properties">
  {/* Color inputs */}
  <label htmlFor="background-color" className="sr-only">
    Background color
  </label>
  <input
    id="background-color"
    type="color"
    aria-describedby="background-color-desc"
    value={styles.backgroundColor}
    onChange={(e) => updateStyle('backgroundColor', e.target.value)}
  />
  <span id="background-color-desc" className="sr-only">
    Currently {styles.backgroundColor}
  </span>

  {/* Sliders with ARIA */}
  <label htmlFor="border-radius" className="block text-sm font-medium">
    Border Radius
  </label>
  <input
    id="border-radius"
    type="range"
    role="slider"
    aria-valuemin={0}
    aria-valuemax={24}
    aria-valuenow={parseInt(styles.borderRadius) || 0}
    aria-valuetext={`${styles.borderRadius} pixels`}
    value={parseInt(styles.borderRadius) || 0}
    onChange={(e) => updateStyle('borderRadius', `${e.target.value}px`)}
  />
</div>
```

#### Live Region for Status Updates

```tsx
// Announce persist status to screen readers
<div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
  {persistState === 'persisting' && 'Saving changes...'}
  {persistState === 'success' && 'Changes saved successfully'}
  {persistState === 'error' && `Error saving changes: ${error}`}
  {persistState === 'hmr_failed' && 'Hot reload failed. Changes saved but preview may be outdated.'}
</div>
```

#### Keyboard Navigation

| Key                | Action                          |
| ------------------ | ------------------------------- |
| `Tab`              | Move between controls           |
| `Arrow Up/Down`    | Adjust numeric values           |
| `Enter`            | Apply changes / Confirm dialog  |
| `Escape`           | Cancel dialog / Discard changes |
| `Ctrl+Z` / `Cmd+Z` | Undo last change                |
| `Ctrl+S` / `Cmd+S` | Persist changes to file         |

```tsx
// Global keyboard shortcuts in CanvasApp.tsx
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    const isMac = navigator.platform.includes('Mac');
    const modifier = isMac ? e.metaKey : e.ctrlKey;

    if (modifier && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undoLastChange();
    }

    if (modifier && e.key === 's') {
      e.preventDefault();
      persistStyles();
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [undoLastChange, persistStyles]);
```

#### Focus Management

After persist operations, return focus to a logical location:

```tsx
const applyButtonRef = useRef<HTMLButtonElement>(null);

const handlePersist = async () => {
  await persistStyles();
  // Return focus to Apply button after operation completes
  applyButtonRef.current?.focus();
};
```

#### Color Contrast

Ensure all UI elements meet WCAG 2.1 AA standards (4.5:1 for text, 3:1 for UI components):

- Use `text-foreground` for text on `background`
- Error states: red-500 (#ef4444) on white/dark backgrounds
- Success states: green-500 (#22c55e) on white/dark backgrounds
- Warnings: amber-500 (#f59e0b) on white backgrounds only
