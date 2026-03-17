# Plan: Image Preview in CM6 File Viewer

> **Audited**: 2026-03-05 — see `reviews/audit-plan.md` for full audit report.
> **Revised**: 2026-03-05 — switched from `readFileBytes` blob URLs to `convertFileSrc` asset URLs (VS Code-style direct file loading). Applied second audit pass addressing asset protocol config, scope, tests, and edge cases. Applied third audit pass fixing Activity panel search button guard. Applied fourth audit pass fixing SVG source mode Cmd+F guard and unsaved-edits toggle lifecycle. Applied fifth audit pass: close search state when transitioning from SVG source back to image preview. Applied sixth audit pass: move SVG toggle to persistent UI in `file-viewer-content.tsx` via `useSvgSourceToggle` hook, handle View Source read failure. Applied seventh audit pass: guard stale SVG source read after tab closure, reuse existing CodeMirrorEditor prop contract. Applied eighth audit pass: add per-tab `instanceId` generation counter for identity-based stale-result guard. Final pass: address all remaining recommended improvements (snippet fidelity note, `file:content` invariant, large image decode limits, out-of-scope path handling).

## Context

When opening image files (PNG, JPG, GIF, etc.) in Orbit's file viewer, the editor shows a blank/garbled page because `readFile` reads binary data as UTF-8 text and feeds it to CodeMirror. The goal is to detect image files and display a proper image preview instead of CodeMirror.

**Key insight**: Tauri 2's `convertFileSrc()` converts a local file path to an `http://asset.localhost/...` URL that the WebView loads directly from disk — no IPC, no byte copying, no JSON serialization. This is the same approach VS Code uses (`vscode-resource:` URIs).

**Prerequisites** (not currently configured — changes required):

- `app.security.assetProtocol.enable` must be set to `true` in `tauri.conf.json`
- `app.security.assetProtocol.scope` must include allowed paths
- `img-src` CSP must include `asset:` and `http://asset.localhost`

---

## Approach: Asset URL via `convertFileSrc`

Detect image files by extension in `handleFileRead`, convert the path to an asset URL via `convertFileSrc()`, and route to a new `ImagePreview` component that renders `<img src={assetUrl} />`. The WebView's browser engine handles all file I/O natively. No image bytes cross the IPC boundary.

---

## Files to Modify/Create

| File                                                      | Action     | Purpose                                                                                       |
| --------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------- |
| `src-tauri/tauri.conf.json`                               | MODIFY     | Enable asset protocol, configure scope, update CSP `img-src`                                  |
| `apps/agent/src/lib/utils/image-utils.ts`                 | MODIFY     | Add `isImageFile()`, `isSvgFile()`, `getImageMimeType()` alongside existing compression utils |
| `apps/agent/src/lib/utils/utils.ts`                       | MODIFY     | Add `formatFileSize()` (not image-specific)                                                   |
| `apps/agent/src/lib/utils/index.ts`                       | MODIFY     | Export new functions from barrel                                                              |
| `apps/agent/src/stores/file/file-viewer-store.ts`         | MODIFY     | Add `fileType`, `ImageData` to `ViewedFile`, `setImageFile` action                            |
| `apps/agent/src/hooks/agent/handlers/file-handlers.ts`    | MODIFY     | Short-circuit image files → `convertFileSrc` + direct store update                            |
| `apps/agent/src/components/files/image-preview.tsx`       | **CREATE** | Image preview component (centered image, info bar, error handling)                            |
| `apps/agent/src/hooks/file/use-svg-source-toggle.ts`      | **CREATE** | Shared hook for SVG source/image toggle logic (used by `file-viewer-content.tsx`)             |
| `apps/agent/src/components/files/file-viewer-content.tsx` | MODIFY     | Route `fileType === 'image'` to lazy `ImagePreview`, render persistent SVG toggle toolbar     |
| `apps/agent/src/components/files/file-viewer.tsx`         | MODIFY     | Disable Cmd+F search for image files                                                          |
| `apps/agent/src/hooks/file/use-is-preview-rendered.ts`    | MODIFY     | Return `false` for image files                                                                |
| `apps/agent/src/components/panels/activity-panel.tsx`     | MODIFY     | Disable search button for image tabs (separate from `isPreviewRendered`)                      |
| `apps/agent/src/hooks/agent/use-tauri-mock.ts`            | MODIFY     | Handle image files in mock mode                                                               |

### Test files to create/modify

| File                                                                          | Action     | Purpose                                                                        |
| ----------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------ |
| `apps/agent/src/__tests__/unit/hooks/agent/file-handlers.test.ts`             | MODIFY     | Add image short-circuit tests                                                  |
| `apps/agent/src/__tests__/unit/stores/file/file-viewer-store.test.ts`         | MODIFY     | Add `setImageFile`, `fileType` transitions, cleanup tests                      |
| `apps/agent/src/__tests__/unit/components/files/file-viewer-content.test.tsx` | MODIFY     | Add image route rendering, SVG source toggle                                   |
| `apps/agent/src/__tests__/unit/components/files/file-viewer.test.tsx`         | MODIFY     | Add Cmd+F disabled for image tabs                                              |
| `apps/agent/src/__tests__/unit/lib/utils/image-utils.test.ts`                 | **CREATE** | Unit tests for `isImageFile`, `getImageMimeType`, etc.                         |
| `apps/agent/src/__tests__/unit/hooks/file/use-svg-source-toggle.test.ts`      | **CREATE** | SVG toggle hook: view source, view image, search close, read error, cache-bust |
| `apps/agent/src/__tests__/unit/components/panels/activity-panel.test.tsx`     | MODIFY     | Add search button disabled for image tabs                                      |

---

## Implementation Steps

> **Snippet fidelity note**: Code snippets in this plan fall into two categories. **State transitions and prop wiring** (store actions, hook logic, `CodeMirrorEditor` props, guard conditions) must match current component contracts exactly — they are implementation-ready. **Layout and UI details** (toolbar styling, icon choices, className strings, JSX structure) are schematic and should be adapted to match the codebase's existing component patterns during implementation.

### Step 0: Enable Asset Protocol (Tauri Config)

**Modify**: `src-tauri/tauri.conf.json`

The `convertFileSrc` API requires explicit opt-in. Three changes:

```jsonc
// src-tauri/tauri.conf.json → app.security
{
  "security": {
    "csp": {
      // Add asset: and http://asset.localhost to img-src
      "img-src": "'self' data: blob: asset: http://asset.localhost",
      // ... other CSP directives unchanged
    },
    "dangerousDisableAssetCspModification": false,
    "assetProtocol": {
      "enable": true,
      "scope": {
        "allow": [
          "$HOME/**",
          "$TEMP/**",
          "$DESKTOP/**",
          "$DOCUMENT/**",
          "$DOWNLOAD/**",
          "/Volumes/**",
          "/tmp/**",
          "/private/tmp/**",
        ],
        "deny": [],
        "requireLiteralLeadingDot": false,
      },
    },
  },
}
```

**Scope rationale:**

- `$HOME/**` — covers most developer workspaces
- `$TEMP/**`, `/tmp/**`, `/private/tmp/**` — CI mounts, temp files
- `/Volumes/**` — external drives on macOS
- `$DESKTOP/**`, `$DOCUMENT/**`, `$DOWNLOAD/**` — common project locations outside `~/Developer`
- `requireLiteralLeadingDot: false` — allows dotfiles (`.github/assets/logo.png`)

**Note**: This scope is separate from `fs:scope-*` capabilities. The `fs:scope-home-recursive` capability controls which files the FS plugin APIs can access; the `assetProtocol.scope` controls which files the WebView can load via `asset://` URLs.

### Step 1: Image Detection Utility

**Modify**: `apps/agent/src/lib/utils/image-utils.ts` (colocate with existing `compressImage`)

```typescript
const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'ico',
  'bmp',
  'avif',
]);

export function isImageFile(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_EXTENSIONS.has(ext);
}

export function isSvgFile(path: string): boolean {
  return (path.split('.').pop()?.toLowerCase() ?? '') === 'svg';
}

export function getImageMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const mimeMap: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
    bmp: 'image/bmp',
    avif: 'image/avif',
  };
  return mimeMap[ext] ?? 'application/octet-stream';
}
```

**Modify**: `apps/agent/src/lib/utils/utils.ts` (generic formatter, not image-specific)

```typescript
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
```

**Modify**: `apps/agent/src/lib/utils/index.ts` — export new functions from barrel.

### Step 2: Extend `ViewedFile` in Store

**Modify**: `apps/agent/src/stores/file/file-viewer-store.ts`

```typescript
// Monotonic counter for unique tab instance IDs (same pattern as gotoIdCounter/searchIdCounter)
let tabInstanceCounter = 0;

// New type for image tab data
export interface ImageData {
  assetUrl: string; // convertFileSrc(path) — WebView loads directly from disk
  mimeType: string;
  fileSize: number; // From getFileInfo, for info bar display
  /** SVG only: toggle between image render and XML source view */
  svgSourceView?: boolean;
}

// Extended ViewedFile
export interface ViewedFile {
  // ... existing fields ...
  /** Unique identity per tab lifecycle — used by async guards to detect stale results
   *  after close/reopen of the same path. Monotonic counter, not related to file content. */
  instanceId: number;
  fileType: 'text' | 'image'; // default 'text' everywhere
  imageData?: ImageData;
}
```

Changes:

- Add `instanceId: ++tabInstanceCounter` to ALL tab creation sites (`openFile`, `openFileWithDiff`, `setFileContent`). This uniquely identifies each tab lifecycle even for the same path — close tab #7, reopen same file → tab #8.
- Add `fileType: 'text'` default to ALL existing tab creation sites
- Add `setImageFile(path, imageData)` action
- Add `updateImageData(path, partial)` action for SVG toggle
- No blob URL cleanup needed — asset URLs are stateless

**Why `instanceId`**: Path-only guards (`openTabs.find(t => t.path === path)`) cannot distinguish between "the original tab that initiated an async read" and "a new tab for the same file opened after the original was closed". The monotonic counter follows the same pattern as `gotoIdCounter` and `searchIdCounter` already in this store (lines 62-63).

```typescript
// setImageFile action — finds existing tab (pre-created by openFile) and updates it.
// Caller must pass the instanceId captured before the async gap (getFileInfo).
setImageFile: (path: string, instanceId: number, imageData: ImageData): void => {
  set((state) => {
    // Guard: tab must still exist AND be the same instance that started the load.
    // If user closed the tab and reopened the same file, instanceId won't match.
    const tab = state.openTabs.find((t) => t.path === path);
    if (!tab || tab.instanceId !== instanceId) {
      // Tab was closed, or was closed-and-reopened (different instance) — drop stale result
      state.isLoading = false;
      state.loadingPath = null;
      return;
    }
    tab.fileType = 'image';
    tab.imageData = imageData;
    state.isLoading = false;
    state.loadingPath = null;
  });
},

// updateImageData action — for SVG source toggle without replacing the whole object
updateImageData: (path: string, partial: Partial<ImageData>): void => {
  set((state) => {
    const tab = state.openTabs.find((t) => t.path === path);
    if (tab?.imageData) {
      tab.imageData = { ...tab.imageData, ...partial };
    }
  });
},
```

**Important**: Existing test fixtures in `file-viewer-store.test.ts` and `file-viewer-content.test.tsx` use `resetStore()` with hardcoded state objects and create `ViewedFile` literals. All fixture helpers and `resetStore` must be updated to include `fileType: 'text'` and `instanceId` to avoid TS errors. Test factories should use a helper like `createTestTab({ path, ... })` that auto-assigns incrementing `instanceId` values.

### Step 3: Short-Circuit Image Files in `handleFileRead`

**Modify**: `apps/agent/src/hooks/agent/handlers/file-handlers.ts`

Before the existing `readFile(message.path)` call:

```typescript
import { convertFileSrc } from '@tauri-apps/api/core';

if (isImageFile(message.path)) {
  const viewerStore = useFileViewerStore.getState();

  // Capture the tab's instanceId BEFORE the async gap.
  // If user closes and reopens the same file during getFileInfo,
  // the new tab will have a different instanceId.
  const tab = viewerStore.openTabs.find((t) => t.path === message.path);
  if (!tab) return; // Tab already closed before we even started
  const expectedInstanceId = tab.instanceId;

  // Convert file path to asset URL — WebView loads directly from disk.
  // No IPC, no byte copying, no JSON serialization. Same approach as VS Code.
  // Requires assetProtocol.enable = true in tauri.conf.json.
  const assetUrl = convertFileSrc(message.path);
  const mimeType = getImageMimeType(message.path);

  // Get file size for info bar (lightweight metadata call, not file contents)
  const fileInfo = await getFileInfo(message.path);

  // Invariant: image opens bypass file:content and LSP didOpen.
  viewerStore.setImageFile(message.path, expectedInstanceId, {
    assetUrl,
    mimeType,
    fileSize: fileInfo.size,
  });
  return;
}
```

**Call-chain note**: `openFile()` in `use-file-tree.ts` (line 956) and `chat-actions.ts` (line 529) creates the tab with loading state BEFORE `handleFileRead` runs. The `instanceId` is captured before `getFileInfo` awaits. If the user closes and reopens the tab during the async gap, `setImageFile` rejects the stale result because the new tab has a different `instanceId`.

### Step 4: Image Preview Component

**New file**: `apps/agent/src/components/files/image-preview.tsx`

This is a **pure display component** — it does NOT own the SVG source/image toggle. The toggle lives in `file-viewer-content.tsx` (Step 5) which stays mounted in both modes.

Structure:

- **Info bar** (top): filename, dimensions (detected via `img.onLoad` → `naturalWidth/Height`), file size
- **Image area** (fill): centered `<img src={imageData.assetUrl}>` with `object-contain`, checkerboard background for transparency
- **Error state**: `img.onError` → friendly message with:
  - "View as text" fallback button (primary — always works)
  - "Open in default app" button (catch and surface failures — `openInDefaultApp` uses `resolve_workspace_path` which enforces workspace guard, so external/chat-opened files outside workspace will fail)

Error handling for "Open in default app":

```typescript
const handleOpenExternally = useCallback(async (): Promise<void> => {
  try {
    await openInDefaultApp(file.path);
  } catch {
    // openInDefaultApp enforces workspace guard — external files will fail.
    // Surface error in UI rather than silently failing.
    setExternalError('Cannot open: file is outside workspace');
  }
}, [file.path]);
```

**Note**: `ImagePreview` does NOT contain "View Source" or "View Image" buttons. Those live in the persistent SVG toggle toolbar rendered by `file-viewer-content.tsx` (see Step 5), which is always mounted regardless of `svgSourceView` state.

### Step 5: SVG Toggle Hook + Route Images in `FileViewerContent`

#### 5a: SVG Toggle Hook

**New file**: `apps/agent/src/hooks/file/use-svg-source-toggle.ts`

This hook owns all SVG source/image toggle logic. It is consumed by `file-viewer-content.tsx` which renders the persistent toggle toolbar.

```typescript
import { useCallback, useState } from 'react';

import { readFile } from '@/lib/api/files';
import { isSvgFile } from '@/lib/utils/image-utils';
import { useFileViewerStore } from '@/stores/file/file-viewer-store';

import type { ViewedFile } from '@/stores/file/file-viewer-store';

interface SvgSourceToggle {
  /** Whether this file is an SVG with toggle capability */
  isSvg: boolean;
  /** Whether source view is currently active */
  isSourceView: boolean;
  /** Switch to XML source view in CodeMirror */
  handleViewSource: () => Promise<void>;
  /** Switch back to image preview */
  handleViewImage: () => void;
  /** Error from first View Source disk read, null if no error */
  sourceReadError: string | null;
}

export function useSvgSourceToggle(file: ViewedFile): SvgSourceToggle {
  const [sourceReadError, setSourceReadError] = useState<string | null>(null);

  const isSvg = file.fileType === 'image' && isSvgFile(file.path);
  const isSourceView = file.imageData?.svgSourceView ?? false;

  // Clicking "View Source" for SVG files:
  // 1. Only read from disk on the FIRST toggle (when tab.content is empty/'')
  //    → calls readFile(path), then writes content to existing tab
  // 2. On subsequent toggles back to source, reuse existing tab.content
  //    → preserves unsaved edits in the CodeMirror buffer
  // 3. Sets imageData.svgSourceView = true via updateImageData
  // 4. FileViewerContent renders CodeMirror (XML source view)
  //
  // IMPORTANT: The post-await guard uses instanceId, not just path.
  // A path-only guard cannot distinguish the original tab from a new tab
  // for the same file opened after close-and-reopen. The instanceId is a
  // monotonic counter assigned at tab creation — unique per tab lifecycle.
  const handleViewSource = useCallback(async (): Promise<void> => {
    const viewerStore = useFileViewerStore.getState();
    const existingTab = viewerStore.openTabs.find((t) => t.path === file.path);
    if (!existingTab) return;

    // If content already loaded, skip read — reuse existing to preserve unsaved edits
    if (existingTab.content) {
      viewerStore.updateImageData(file.path, { svgSourceView: true });
      return;
    }

    // Capture instanceId BEFORE the async gap
    const expectedInstanceId = existingTab.instanceId;

    // First time: read from disk
    try {
      const content = await readFile(file.path);

      // Post-await guard: re-read store state and compare instanceId.
      // If user closed tab #7 and reopened the same file → tab #8 has a
      // different instanceId. The stale read from tab #7 is dropped.
      const currentTab = useFileViewerStore.getState().openTabs.find((t) => t.path === file.path);
      if (!currentTab || currentTab.instanceId !== expectedInstanceId) {
        // Tab closed, or closed-and-reopened (different instance) — drop stale result
        return;
      }

      // Safe to write: same tab instance that initiated the read.
      viewerStore.setFileContent(file.path, content, 'xml');
      viewerStore.updateImageData(file.path, { svgSourceView: true });
      setSourceReadError(null);
    } catch (error) {
      // First View Source read failed — stay in image mode, surface error
      setSourceReadError(error instanceof Error ? error.message : String(error));
    }
  }, [file.path]);

  // "View as Image" flips svgSourceView back to false
  //
  // Important: image preview always shows the ON-DISK version (asset URL loads from disk).
  // Unsaved edits in the CodeMirror source view are NOT reflected in the image preview.
  // This matches VS Code behavior — save the file first to see changes in preview.
  const handleViewImage = useCallback((): void => {
    const viewerStore = useFileViewerStore.getState();
    const tab = viewerStore.openTabs.find((t) => t.path === file.path);

    // Close any active search before switching to image preview.
    // The useEffect in file-viewer-content.tsx that closes search on preview entry
    // only fires when isPreviewRendered becomes true (markdown preview path).
    // Since useIsPreviewRendered returns false for image tabs, search state
    // (searchOpen, searchTrigger, searchQuery) would linger and reappear
    // unexpectedly if the user toggles back to source view later.
    viewerStore.closeSearch();

    // Cache-bust the asset URL if the file was saved (not modified = saved to disk)
    // Only apply cache-bust when tab.isModified === false (file was saved after markSaved)
    if (tab && !tab.isModified && file.imageData) {
      const bustUrl = `${file.imageData.assetUrl.split('?')[0]}?t=${String(Date.now())}`;
      viewerStore.updateImageData(file.path, { svgSourceView: false, assetUrl: bustUrl });
    } else {
      viewerStore.updateImageData(file.path, { svgSourceView: false });
    }
  }, [file.path, file.imageData]);

  return { isSvg, isSourceView, handleViewSource, handleViewImage, sourceReadError };
}
```

#### 5b: Route Images and Persistent SVG Toolbar in `FileViewerContent`

**Modify**: `apps/agent/src/components/files/file-viewer-content.tsx`

The key architectural change: `FileViewerContent` owns the SVG toggle toolbar, so it stays mounted in **both** image preview and source view modes. Previously the toggle was inside `ImagePreview` which gets unmounted when `svgSourceView` is true — leaving the user stuck in source mode with no way back.

```typescript
import { useSvgSourceToggle } from '@/hooks/file/use-svg-source-toggle';

const LazyImagePreview = lazy(() =>
  import('./image-preview').then((m) => ({ default: m.ImagePreview }))
);

// Inside FileViewerContent component body:
const { isSvg, isSourceView, handleViewSource, handleViewImage, sourceReadError } =
  useSvgSourceToggle(file);

// Before existing markdown/CM6 logic — handles ALL image file rendering:
if (file.fileType === 'image' && file.imageData) {
  return (
    <div className="h-full w-full flex flex-col">
      <EditorBreadcrumbs filePath={file.path} outline={isSourceView ? outline : []} />

      {/* Persistent SVG toggle toolbar — always mounted for SVG files */}
      {isSvg ? (
        <div className="flex items-center gap-2 px-3 py-1 border-b border-divider bg-background text-sm">
          <button
            onClick={isSourceView ? handleViewImage : handleViewSource}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label={isSourceView ? 'View as image' : 'View source'}
          >
            {isSourceView ? (
              <>
                <ImageIcon className="h-4 w-4 inline mr-1" />
                View Image
              </>
            ) : (
              <>
                <Code className="h-4 w-4 inline mr-1" />
                View Source
              </>
            )}
          </button>
          {sourceReadError !== null ? (
            <span className="text-destructive text-xs">
              Failed to read source: {sourceReadError}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Content area: ImagePreview or CodeMirror depending on svgSourceView */}
      <div className="flex-1 relative min-h-0">
        {isSourceView ? (
          // SVG source mode: reuse the SAME LazyCodeMirrorEditor and prop
          // contract as the text file path. Do NOT invent a new prop API —
          // use the existing props from CodeMirrorEditorProps (line 697):
          //   value, language, filePath, onChange, onSave, theme,
          //   gotoPosition, onGotoComplete, searchTrigger, wordWrap
          <Suspense fallback={<EditorSkeleton />}>
            <LazyCodeMirrorEditor
              value={file.content}
              language={file.language}
              filePath={file.path}
              onChange={handleChange}
              onSave={handleSave}
              theme={theme}
              gotoPosition={gotoForThisFile}
              onGotoComplete={clearPendingGoto}
              searchTrigger={searchTrigger}
              wordWrap={wordWrap}
            />
          </Suspense>
        ) : (
          <Suspense fallback={<EditorSkeleton />}>
            <LazyImagePreview file={file} />
          </Suspense>
        )}
      </div>
    </div>
  );
}
// Text files and markdown continue to the existing CodeMirror/markdown logic below
```

**Why this layout works**: The `<div>` wrapper with breadcrumbs + toolbar + content area is always the same parent. Only the content area switches between `ImagePreview` and `LazyCodeMirrorEditor`. The SVG toggle button in the toolbar is always mounted, so the user can always navigate between image preview and source view.

**CodeMirror reuse**: SVG source mode reuses the exact same `LazyCodeMirrorEditor` component and prop contract as the text file path below. The props (`value`, `language`, `filePath`, `onChange`, `onSave`, `theme`, `gotoPosition`, `onGotoComplete`, `searchTrigger`, `wordWrap`) are already computed by `FileViewerContent` for the text path — the image branch just wires them identically. No new `file={file}` API is needed or introduced.

**Outline integration**: When `isSourceView` is true, the breadcrumbs show the outline (same as any text file). When in image preview mode, the outline is empty (no headings in an image).

### Step 6: Guard Fixes

Three separate search paths must be guarded for image tabs:

**`file-viewer.tsx`** (keyboard Cmd+F): Guard must account for SVG source mode — when `svgSourceView` is `true`, CodeMirror is active and search should work:

```typescript
const isImagePreview =
  activeFile?.fileType === 'image' && !(activeFile.imageData?.svgSourceView ?? false);

if (activeFile?.path && !isPreviewRendered && !isImagePreview) {
  toggleSearch(activeFile.path);
}
```

Note: a plain `fileType !== 'image'` check would be wrong — it would block Cmd+F during SVG source editing where CodeMirror is visible.

**`use-is-preview-rendered.ts`**: Return `false` when `file.fileType === 'image'`:

```typescript
if (file.fileType === 'image') return false;
```

This prevents image tabs from being treated as markdown preview — it does NOT disable search.

**`activity-panel.tsx`** (search button): The search button at line 333-348 uses `disabled={isPreviewRendered}`. Since `useIsPreviewRendered` returns `false` for image tabs, the button would remain **enabled** for images — wrong. Add an explicit image guard:

```typescript
// Derive whether search should be disabled for this tab
const isImageTab = activeFile?.fileType === 'image'
  && !(activeFile.imageData?.svgSourceView ?? false);
const isSearchDisabled = isPreviewRendered || isImageTab;

// Button:
<button
  onClick={() => {
    if (activeTabPath && !isSearchDisabled) {
      onToggleSearch(activeTabPath);
    }
  }}
  disabled={isSearchDisabled}
  className={cn(
    'h-6 w-6 flex items-center justify-center rounded transition-colors',
    isSearchDisabled
      ? 'cursor-not-allowed text-muted-foreground/40'
      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
  )}
  aria-label="Search in file"
  title={isSearchDisabled ? 'Search unavailable in preview' : 'Search (⌘F)'}
>
```

When SVG source view is active (`svgSourceView: true`), the file renders in CodeMirror, so search should remain enabled.

### Step 7: Mock Mode

**Modify**: `apps/agent/src/hooks/agent/use-tauri-mock.ts`

In the `file:read` case, detect image files and skip the image flow — `convertFileSrc` and `getFileInfo` are not available in browser-only mode. Image files in standalone dev mode (`bun run dev`) will show as text (garbled, but functional for development). This matches the existing behavior where mock mode is for chat UI development, not file viewer testing.

### Step 8: Tests

**New file**: `apps/agent/src/__tests__/unit/lib/utils/image-utils.test.ts`

```typescript
// isImageFile: true for png/jpg/gif/svg/webp/ico/bmp/avif, false for ts/md/txt
// isSvgFile: true only for .svg
// getImageMimeType: correct MIME for each extension, fallback for unknown
```

**Modify**: `apps/agent/src/__tests__/unit/hooks/agent/file-handlers.test.ts`

```typescript
// New tests:
// - 'short-circuits image files to setImageFile using convertFileSrc'
// - 'does not post file:content for image files'
// - 'falls through to readFile for non-image files'
// - 'handles getFileInfo failure gracefully (closes tab)'
```

**Modify**: `apps/agent/src/__tests__/unit/stores/file/file-viewer-store.test.ts`

```typescript
// Update resetStore() and all ViewedFile fixtures to include fileType: 'text' and instanceId
// New tests:
// - 'setImageFile updates existing tab with fileType image and imageData'
// - 'setImageFile drops result when tab was closed during in-flight read'
// - 'setImageFile drops result when instanceId does not match (close-reopen race)'
// - 'updateImageData toggles svgSourceView'
// - 'all existing tab creation methods default to fileType text and assign unique instanceId'
// - 'reopened tab for same path gets a different instanceId'
```

**Modify**: `apps/agent/src/__tests__/unit/components/files/file-viewer-content.test.tsx`

```typescript
// Update ViewedFile fixtures to include fileType: 'text'
// New tests:
// - 'renders ImagePreview when fileType is image and svgSourceView is false'
// - 'renders CodeMirror when fileType is image and svgSourceView is true'
// - 'renders CodeMirror for fileType text (existing behavior unchanged)'
// - 'renders persistent SVG toggle toolbar for SVG image files in both modes'
// - 'SVG toggle toolbar is NOT rendered for non-SVG image files (PNG, JPG, etc.)'
```

**New file**: `apps/agent/src/__tests__/unit/hooks/file/use-svg-source-toggle.test.ts`

```typescript
// Tests for the extracted toggle hook:
// - 'handleViewSource reads from disk on first toggle, sets svgSourceView true'
// - 'handleViewSource reuses existing tab.content on subsequent toggles'
// - 'handleViewSource catches readFile error, stays in image mode, sets sourceReadError'
// - 'handleViewSource drops stale result when tab is closed during read'
//   → Open SVG image tab, call handleViewSource, close tab during readFile await,
//     assert setFileContent is NOT called, no phantom tab created
// - 'handleViewSource drops stale result when tab is replaced during read'
//   → Open SVG image tab, call handleViewSource, replace tab with text file
//     during readFile await, assert stale SVG content is NOT written
// - 'handleViewSource drops stale result when same file is closed and reopened'
//   → Open SVG tab (instanceId=7), call handleViewSource, close tab,
//     reopen same file (instanceId=8), old read resolves → instanceId mismatch
//     → stale result dropped, reopened tab NOT flipped to source mode
// - 'handleViewSource drops stale result when reopened tab is still loading as text'
//   → Same as above but reopened tab hasn't finished setImageFile yet (still text)
//     → instanceId mismatch still catches it (doesn't rely on fileType check)
// - 'handleViewImage closes search state before toggling svgSourceView false'
// - 'handleViewImage applies cache-bust URL when file was saved (isModified=false)'
// - 'handleViewImage does NOT cache-bust when file has unsaved edits (isModified=true)'
// - 'isSvg returns false for non-SVG image files'
// - 'isSourceView reflects current svgSourceView state'
```

**Modify**: `apps/agent/src/__tests__/unit/components/files/file-viewer.test.tsx`

```typescript
// New tests:
// - 'disables Cmd+F for image preview tabs'
// - 're-enables Cmd+F when svgSourceView toggles to source mode'
```

**Modify**: `apps/agent/src/__tests__/unit/components/panels/activity-panel.test.tsx`

```typescript
// New tests:
// - 'disables search button when active tab is an image file'
// - 'enables search button when image tab is in SVG source view mode'
// - 'disables search button when markdown preview is active (existing behavior preserved)'
```

---

## Edge Cases

| Case                                                                            | Handling                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Corrupt image / misnamed file                                                   | `img.onError` → error UI + "View as text" (primary) + "Open externally" (secondary, may fail for external files)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Very large image (100MB+)                                                       | WebView loads from disk natively — no IPC size limit. Transport is not the bottleneck. However, the browser's image decoder has its own memory budget. Extremely large images (e.g., 200MP panoramas, 16K renders) can exhaust WebView decode memory and fail to render. When this happens, `img.onError` fires → error UI with "View as text" and "Open in default app" fallbacks. This is a browser-engine limitation, not an Orbit bug — VS Code has the same constraint. Info bar shows file size to set user expectations before decode starts                                                                                                                       |
| SVG with external refs                                                          | Asset URL loads from disk; external refs resolve if CSP allows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| File opened from chat/tool                                                      | Same `file:read` flow → `handleFileRead` detects automatically                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Tab closed during in-flight read                                                | `setImageFile` detects missing tab, drops stale result (no phantom tab)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| File modified on disk while viewing                                             | Browser may cache asset URL; SVG source toggle appends `?t=` for cache-bust                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| HMR/dev reset                                                                   | Asset URLs are stateless — no leak, no cleanup needed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Persisted state                                                                 | `openTabs` are NOT persisted (only `wordWrap` is) — no serialization issues                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Mock mode (bun run dev)                                                         | Image files fall through to text path — acceptable for dev                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Animated GIF                                                                    | Native `<img>` supports animation — works out of the box                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Extreme aspect ratio (50000x100)                                                | `object-contain` handles correctly; info bar shows actual dimensions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Symlinked image                                                                 | Asset URL follows symlinks (WebView resolves); broken symlink → `img.onError`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| File deleted while viewing                                                      | `img.onError` fires if browser re-requests; user sees error state                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `.ico` with multiple resolutions                                                | Browser picks one resolution — acceptable limitation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Path outside asset scope (removable drives, network mounts, non-standard paths) | The asset protocol scope covers `$HOME/**`, `/Volumes/**`, `/tmp/**`, and common user directories. Paths outside these patterns (e.g., `/mnt/nas/...` on Linux, custom mount points) will fail to load via `asset://` → `img.onError` fires → error UI with "View as text" (reads via Tauri FS APIs which have their own `fs:scope-home-recursive` scope) and "Open in default app" fallbacks. This is an intentional security trade-off: the scope is broad enough for typical development workflows without granting blanket filesystem access. If a user consistently works from paths outside scope, they can extend `assetProtocol.scope.allow` in `tauri.conf.json` |
| External file `openInDefaultApp`                                                | Workspace guard may reject → catch error, show message, offer "View as text"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| SVG edit then immediate image toggle (unsaved)                                  | Image preview shows on-disk version — unsaved CodeMirror edits are not reflected. Matches VS Code behavior (save first). Toggling back to source preserves unsaved edits (content is kept in `tab.content`, not re-read)                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| SVG edit, save, then image toggle                                               | Cache-bust URL param (`?t=timestamp`) applied only when `tab.isModified === false` (file was saved). Forces WebView to reload updated file from disk                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Repeated source/image toggling without save                                     | Content read from disk only on first "View Source". Subsequent toggles reuse `tab.content`, preserving any in-progress edits                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Activity panel search button on image tab                                       | Separate `isSearchDisabled` guard in `activity-panel.tsx` — `useIsPreviewRendered` only covers markdown preview, not images                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| SVG source with search open → view image                                        | `handleViewImage` calls `closeSearch()` before toggling `svgSourceView`. Prevents search state lingering invisibly during image preview and reappearing on next source toggle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| First "View Source" read fails                                                  | `handleViewSource` catches `readFile` error, sets `sourceReadError` state, stays in image mode. Error message shown in the persistent toolbar. User can retry or continue viewing the image                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Tab closed during SVG source read                                               | Post-await guard in `handleViewSource`: captures `instanceId` before `readFile`, re-reads store after await, compares `instanceId`. If tab is gone → guard fails. Drops stale result silently                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Tab closed and same file reopened during SVG source read                        | New tab has different `instanceId` (monotonic counter). Old read's `expectedInstanceId` won't match → stale result dropped. Path-only guard would incorrectly pass this case                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| User navigates away during SVG source read                                      | Same `instanceId` guard catches this: if tab was closed and different file opened at same position, `instanceId` mismatch rejects. `setFileContent` is never called on a stale or different tab                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| SVG toggle UI reachability                                                      | Toggle button lives in persistent toolbar in `file-viewer-content.tsx`, NOT inside `ImagePreview`. Toolbar is mounted for both image preview and source view modes — user can always switch directions                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Asset protocol not enabled                                                      | All image `<img>` tags fail → `img.onError` → "View as text" fallback works                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

---

## What Does NOT Change

- **Rust backend**: Zero Rust code changes
- **Protocol types**: No new message types (image data set directly on store)
- **Tab rendering**: `FileIcon` in tab bar already maps image extensions
- **File tree**: Already shows image files, no filtering changes

---

## What DOES Change (Backend Config)

- **`tauri.conf.json`**: Enable asset protocol, define scope, update `img-src` CSP

---

## Why `convertFileSrc` Instead of `readFileBytes`

| Aspect            | `readFileBytes` + blob URL                   | `convertFileSrc` asset URL                 |
| ----------------- | -------------------------------------------- | ------------------------------------------ |
| IPC overhead      | `Vec<u8>` → JSON `number[]` (~3x expansion)  | None — WebView loads from disk             |
| Memory            | 3 copies: `number[]` → `Uint8Array` → `Blob` | Zero app-side allocation                   |
| File size limit   | ~10MB practical (30MB JSON)                  | None (WebView handles natively)            |
| Cleanup needed    | `URL.revokeObjectURL()` in close/cleanup     | None — stateless URL                       |
| Complexity        | Blob lifecycle, leak prevention              | One function call                          |
| Config required   | None                                         | `assetProtocol` + CSP in `tauri.conf.json` |
| VS Code precedent | No                                           | Yes (`vscode-resource:` scheme)            |

---

## Future Improvements

Out of scope for the initial implementation:

- **Zoom/pan controls**: Scroll-to-zoom, drag-to-pan for large images (matches VS Code)
- **TIFF/HEIC support**: Conversion on the Rust side to expand supported formats
- **Configurable max decoded dimensions warning**: Protect UI against pathological images
- **Visual/snapshot tests**: For preview error states and SVG toggle transitions

---

## Verification

1. `bun run typecheck` — no type errors from new `fileType`/`imageData` fields
2. `bun run lint` — no lint warnings
3. `bun run test` — all new and existing tests pass
4. `bunx tauri dev` → open a PNG, JPG, GIF, SVG, WEBP from file tree → image displays centered
5. Open a large image (50MB+) → loads via asset protocol without IPC-size failure (browser decode/memory cost is renderer-bound, not transport-bound)
6. Verify SVG "View Source" toggle in persistent toolbar works (switches to CM6 XML view and back)
7. SVG source view: toggle toolbar still visible with "View Image" button; Cmd+F opens search (CodeMirror is active)
8. Edit SVG source without saving, toggle to image → image shows old disk version
9. Toggle back to source → unsaved edits are preserved (not re-read from disk)
10. Save SVG source, toggle to image → updated image shown (cache-bust)
11. Open a corrupt/truncated image → error state shown with "View as text" fallback
12. Open image from chat tool reference (click file path in Read/Write widget) → image displays
13. Cmd+F on image tab → search does NOT open
14. Activity panel search button on image tab → button is disabled (greyed out)
15. Close image tab while `getFileInfo` is in-flight → no phantom tab reappears
16. `bun run dev` (mock mode) → image files show garbled text (expected, no crash)
17. Image outside asset scope → `img.onError` fires, "View as text" fallback available
18. SVG source mode: open search (Cmd+F), then click "View Image" in toolbar → search closes, does NOT reappear on next source toggle
19. Open a PNG file → NO SVG toggle toolbar shown (toolbar is SVG-only)
20. SVG "View Source" with unreadable file (e.g., permissions revoked) → error message in toolbar, stays in image mode
21. Open SVG → click "View Source" → immediately close tab before read completes → no phantom tab reappears
22. Open SVG → click "View Source" → close tab → reopen same file → old read resolves → reopened tab stays in image mode (not flipped to source)
