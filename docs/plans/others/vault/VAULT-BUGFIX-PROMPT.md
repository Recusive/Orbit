# Vault Bugfix Prompt

Fix all issues below in the vault feature. These were identified by two independent code reviews (Claude + Codex). Follow the project's code style: no `any`, structured logging, granular Zustand selectors, `Result<T, String>` for Rust commands. Run `bun run check` after all fixes.

---

## Fix 1 — `updateActiveDocPath` leaves stale identity after rename

**File:** `apps/agent/src/features/vault/stores/vault-editor-store.ts` — `updateActiveDocPath` (line 158)

**Bug:** Only `absolutePath` is updated. `relativePath`, `name`, `id`, and `extension` remain stale. Autosave then uses the old `relativePath` → Rust returns `FileNotFound`.

**Fix:** Compute ALL derived fields from the new path. The `UnifiedDoc` interface has: `id`, `name`, `relativePath`, `absolutePath`, `source`, `isDir`, `sizeBytes`, `modifiedAt`, `extension`.

```ts
updateActiveDocPath: (oldAbsolutePath, newAbsolutePath): void => {
  const doc = get().activeDoc;
  if (!doc) return;
  if (doc.absolutePath !== oldAbsolutePath) return;

  // Derive new identity fields from the new absolute path
  const segments = newAbsolutePath.replace(/\\/g, '/').split('/');
  const newName = segments[segments.length - 1] ?? doc.name;
  const dotIndex = newName.lastIndexOf('.');
  const newExtension = dotIndex > 0 ? newName.slice(dotIndex + 1).toLowerCase() : null;

  // For vault docs, derive relativePath from the .orbit/Vault/ prefix
  let newRelativePath = doc.relativePath;
  const vaultMarker = '/.orbit/Vault/';
  const vaultIndex = newAbsolutePath.indexOf(vaultMarker);
  if (vaultIndex >= 0) {
    newRelativePath = newAbsolutePath.slice(vaultIndex + vaultMarker.length);
  }

  const newId = doc.source === 'vault' ? `vault:${newRelativePath}` : `project:${newAbsolutePath}`;

  set({
    activeDoc: {
      ...doc,
      id: newId,
      name: newName,
      relativePath: newRelativePath,
      absolutePath: newAbsolutePath,
      extension: newExtension,
    },
  });
},
```

**Also fix callers — rename/move should update AFTER the backend succeeds, not before:**

In `vault-store.ts`, `renameVaultEntry` (line 283):

```ts
// BEFORE (wrong — updates path before backend confirms):
useVaultEditorStore.getState().updateActiveDocPath(oldAbsolutePath, newAbsolutePath);
await vaultRename(workspacePath, oldRelativePath, newName);

// AFTER (correct — update path only after backend succeeds):
useVaultEditorStore.getState().markFlushPendingContent();
await vaultRename(workspacePath, oldRelativePath, newName);
useVaultEditorStore.getState().updateActiveDocPath(oldAbsolutePath, newAbsolutePath);
```

Apply the same pattern to `moveVaultEntry` (line 300).

---

## Fix 2 — `saveDocument` stale async snapshot can lose edits

**File:** `apps/agent/src/features/vault/stores/vault-editor-store.ts` — `saveDocument` (line 98)

**Bug:** `state.activeDocContent` is snapshot before the async write. After `await`, the code unconditionally sets `originalContent = state.activeDocContent` and `isDocModified = false`. If the user types during save, those edits are silently marked clean.

**Fix:** Capture content before save, then after await, re-read state and compare:

```ts
saveDocument: async (workspacePath, force = false): Promise<boolean> => {
  const state = get();
  const doc = state.activeDoc;
  if (doc === null || doc.isDir) return true;
  if (!state.isDocModified && !force) return true;

  const contentToSave = state.activeDocContent;
  if (!force && contentToSave === state.originalContent) {
    set({ isDocModified: false, saveState: 'idle' });
    return true;
  }

  const docId = doc.id;
  set({ isSaving: true, saveState: 'saving', errorMessage: null });

  try {
    if (doc.source === 'project') {
      await writeFile(doc.absolutePath, contentToSave);
    } else {
      await vaultWrite(workspacePath, doc.relativePath, contentToSave, {
        expectedModifiedAt: force ? undefined : (state.lastModifiedAt ?? undefined),
        force,
      });
    }

    // Re-read current state — doc or content may have changed during save
    const current = get();
    if (current.activeDoc?.id !== docId) {
      set({ isSaving: false });
      return true;
    }

    const modifiedAt = doc.source === 'project' ? Date.now() : /* result.modifiedAt */ Date.now();
    set({
      isSaving: false,
      originalContent: contentToSave,
      isDocModified: current.activeDocContent !== contentToSave,
      lastModifiedAt: modifiedAt,
      saveState: 'saved',
    });
    return true;
  } catch (error) {
    // ... existing error handling unchanged
  }
},
```

**Note:** For the vault branch, you need the `result.modifiedAt` from `vaultWrite`. Refactor to:

```ts
let modifiedAt = Date.now();
if (doc.source === 'project') {
  await writeFile(doc.absolutePath, contentToSave);
} else {
  const result = await vaultWrite(workspacePath, doc.relativePath, contentToSave, {
    expectedModifiedAt: force ? undefined : (state.lastModifiedAt ?? undefined),
    force,
  });
  modifiedAt = result.modifiedAt;
}
```

---

## Fix 3 — `initializeVault` retry permanently blocked after failure

**File:** `apps/agent/src/features/vault/stores/vault-store.ts` — `initializeVault` (line 162)

**Bug:** `initializedWorkspace` is set to `workspacePath` BEFORE async ops. If they fail, the catch only sets `vaultError` but `initializedWorkspace` stays set → the guard `if (current === workspacePath) return` permanently blocks retries.

**Fix:** Only set `initializedWorkspace` on success:

```ts
initializeVault: async (workspacePath): Promise<void> => {
  if (workspacePath.trim().length === 0) return;
  const current = get().initializedWorkspace;
  if (current === workspacePath) return;

  set({
    workspacePath,
    currentPath: '',
    vaultError: null,
    // DO NOT set initializedWorkspace here
  });

  try {
    const initialized = await vaultCheckInitialized(workspacePath);
    if (!initialized) {
      await vaultInitialize(workspacePath);
    }
    await Promise.all([
      get().loadVaultDirectory(workspacePath, ''),
      get().loadProjectDocs(workspacePath),
      get().loadContextConfig(workspacePath),
    ]);
    // Only mark initialized on success
    set({ initializedWorkspace: workspacePath });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to initialize vault';
    logger.error('Failed to initialize vault', error);
    set({ vaultError: message, initializedWorkspace: null });
  }
},
```

---

## Fix 4 — Conflict state not actionable (no Reload/Overwrite buttons)

**File:** `apps/agent/src/components/layout/content-top-bar.tsx` — `VaultActions` component (line 106)

**Bug:** We removed `VaultDocHeader` which had Reload and Overwrite buttons for conflict resolution. `VaultActions` shows "Conflict" label but no way to resolve it. Users are stuck.

**Fix:** Add Reload and Overwrite buttons that appear when `saveState === 'conflicted'`. Read `reloadDocument` from `useVaultEditorStore` and call `saveDocument` with `force: true` for overwrite.

```tsx
const VaultActions: FC = () => {
  const workspacePath = useUIStore((s) => s.workspacePath);
  const activeDoc = useVaultEditorStore((s) => s.activeDoc);
  const activeDocEncoding = useVaultEditorStore((s) => s.activeDocEncoding);
  const isDocModified = useVaultEditorStore((s) => s.isDocModified);
  const saveState = useVaultEditorStore((s) => s.saveState);
  const { sendActiveDocToAgent } = useVaultContextManager();

  // ... existing canSave, canSend, isUtf8Doc ...

  const handleReload = useCallback((): void => {
    if (!workspacePath) return;
    void useVaultEditorStore.getState().reloadDocument(workspacePath);
  }, [workspacePath]);

  const handleOverwrite = useCallback((): void => {
    if (!workspacePath) return;
    void useVaultEditorStore.getState().saveDocument(workspacePath, true);
  }, [workspacePath]);

  // In the JSX, when saveState === 'conflicted', show Reload + Overwrite instead of Save:
  // {saveState === 'conflicted' ? (
  //   <>
  //     <button onClick={handleReload} className="...bg-muted...">Reload</button>
  //     <button onClick={handleOverwrite} className="...bg-destructive...">Overwrite</button>
  //   </>
  // ) : (
  //   <button onClick={handleSave} disabled={!canSave} className="...">Save</button>
  // )}
```

Keep the same button size/style classes (`!h-[22px] !rounded-[9px] ...`). Reload gets `bg-muted` style, Overwrite gets `bg-destructive` style. The "Conflict" status label stays.

---

## Fix 5 — Open-document error leaves stale content

**File:** `apps/agent/src/features/vault/stores/vault-editor-store.ts` — `openDocument` catch block (line 79)

**Bug:** On error, `activeDocContent` and `originalContent` are not cleared. Stale content from a previously opened file remains displayed under the new file's name.

**Fix:** Clear content and reset doc in the catch:

```ts
catch (error) {
  const message = error instanceof Error ? error.message : 'Failed to open document';
  logger.error('Failed to open vault document', error);
  set({
    activeDoc: null,
    activeDocContent: '',
    originalContent: '',
    activeDocEncoding: 'utf8',
    isDocLoading: false,
    isDocModified: false,
    errorMessage: message,
    saveState: 'error',
  });
}
```

---

## Fix 6 — CSS table `overflow: hidden` clobbers `overflow-x: auto`

**File:** `apps/agent/src/globals.css` — `.vault-editor-shell .milkdown .table-wrapper` (around line 1235)

**Bug:** The shorthand `overflow: hidden` overrides the preceding `overflow-x: auto`. Tables can't scroll horizontally.

**Current:**

```css
.vault-editor-shell .milkdown .table-wrapper {
  overflow-x: auto;
  overflow: hidden;       /* ← clobbers overflow-x */
  border-radius: 9px;
```

**Fix:** Replace with explicit axes:

```css
.vault-editor-shell .milkdown .table-wrapper {
  overflow-x: auto;
  overflow-y: hidden;
  border-radius: 9px;
```

---

## Fix 7 — `deleteVaultEntry` uses stale state snapshot after await

**File:** `apps/agent/src/features/vault/stores/vault-store.ts` — `deleteVaultEntry` (line 313)

**Bug:** `editorState` is captured before `await vaultDelete()`. If user switches docs during delete, the stale snapshot's `activeDoc` may not match current state.

**Fix:** Re-read state after the await. Also close doc if it's inside a deleted directory:

```ts
deleteVaultEntry: async (workspacePath, relativePath): Promise<void> => {
  const absolutePath = buildVaultAbsolutePath(workspacePath, relativePath);
  useVaultEditorStore.getState().markFlushPendingContent();

  await vaultDelete(workspacePath, relativePath);

  // Re-read state after async op
  const currentDoc = useVaultEditorStore.getState().activeDoc;
  if (currentDoc) {
    const isExactMatch = currentDoc.absolutePath === absolutePath;
    const isDescendant = currentDoc.absolutePath.startsWith(`${absolutePath}/`);
    if (isExactMatch || isDescendant) {
      useVaultEditorStore.getState().closeDocument();
    }
  }

  await Promise.all([
    get().loadVaultDirectory(workspacePath, get().currentPath),
    get().loadContextConfig(workspacePath),
  ]);
},
```

---

## Fix 8 — `VaultCreateDialog` mode not reset on close

**File:** `apps/agent/src/features/vault/components/VaultCreateDialog.tsx` — `handleOpenChange` (line 50)

**Bug:** When dialog closes, `name`, `error`, `isCreating` are reset but `mode` is not. Reopening shows the last-used mode (folder) instead of defaulting to "file".

**Fix:** Add `setMode('file')` to the reset:

```ts
const handleOpenChange = useCallback(
  (nextOpen: boolean): void => {
    if (!nextOpen) {
      onClose();
      setName('');
      setError('');
      setIsCreating(false);
      setMode('file'); // ← add this
    }
  },
  [onClose]
);
```

---

## Fix 9 — File watcher skips conflict detection for non-markdown vault files

**File:** `apps/agent/src/features/vault/hooks/use-vault-file-watcher.ts` — line 64

**Bug:** The `isMarkdownPath` guard fires before conflict detection. Non-markdown UTF-8 files (`.txt`, `.json`, etc.) edited externally won't trigger conflict detection. Also, `renamed` events with `newPath` (e.g., `.txt` → `.md`) are ignored because only `event.path` is checked.

**Fix:** Move conflict detection before the markdown filter, and check both paths for rename events:

```ts
void onFileChange((event) => {
  const changedPath = normalize(event.path);
  if (!changedPath.startsWith(normalizedWorkspace)) return;

  // Conflict detection applies to ALL file types (not just markdown)
  if (normalizedActiveDoc && changedPath === normalizedActiveDoc && event.type === 'modified') {
    markExternalConflict();
  }

  // For directory refresh, check markdown on both old and new paths (rename)
  const pathsToCheck = [changedPath];
  if (event.type === 'renamed' && event.newPath) {
    pathsToCheck.push(normalize(event.newPath));
  }
  const hasMarkdown = pathsToCheck.some(isMarkdownPath);

  if (!hasMarkdown) return;

  if (event.type === 'created' || event.type === 'deleted' || event.type === 'renamed') {
    scheduleProjectDocRefresh();
    if (changedPath.startsWith(normalizedVaultDir)) {
      scheduleVaultRefresh();
    }
  }
});
```

**Also fix watcher churn:** `currentPath` is in the dependency array, causing the watcher to tear down and re-register on every subdirectory navigation. Use a ref instead:

```ts
const currentPathRef = useRef(currentPath);
currentPathRef.current = currentPath;

// In scheduleVaultRefresh:
void loadVaultDirectory(workspacePath, currentPathRef.current);

// Remove currentPath from the dependency array
}, [vaultOpen, workspacePath, activeDoc, markExternalConflict, loadProjectDocs, loadVaultDirectory]);
```

---

## Fix 10 — Rust: dead double-check in `vault_search_all_docs`

**File:** `src-tauri/src/commands/vault/operations.rs` — lines 714–720

**Bug:** `seen_paths.contains(&key)` followed by `seen_paths.insert(key)` + `!inserted` check. The `!inserted` branch is unreachable.

**Fix:**

```rust
for doc in project_docs {
    let absolute_path = PathBuf::from(&doc.path);
    let key = normalize_stored_path(&absolute_path);
    if !seen_paths.insert(key) {
        continue;
    }
    candidates.push(SearchCandidate { ... });
}
```

---

## Fix 11 — Rust: recursive walkers follow symlinks

**File:** `src-tauri/src/commands/vault/operations.rs` — `cleanup_orphan_tmp_files` (line 169), `collect_stats` (line 205), `collect_vault_markdown_candidates` (line 231)

**Bug:** These use `fs::metadata()` / `path.is_dir()` which follow symlinks. A symlink pointing outside the vault or creating a loop will be followed.

**Fix:** Use `fs::symlink_metadata()` and skip symlinks:

```rust
// In cleanup_orphan_tmp_files:
let meta = match fs::symlink_metadata(&path) {
    Ok(m) => m,
    Err(_) => continue,
};
if meta.file_type().is_symlink() { continue; }
if meta.is_dir() {
    cleanup_orphan_tmp_files(&path, max_age);
    continue;
}

// Same pattern for collect_stats and collect_vault_markdown_candidates
```

---

## Verification

After all fixes, run:

```bash
bun run check          # TypeScript + ESLint + tests
cargo clippy           # Rust lint
cargo test             # Rust tests
```

All 1116+ frontend tests should pass. No new warnings.
