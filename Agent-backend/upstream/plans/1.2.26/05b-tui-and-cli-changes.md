# Phase 5B: TUI & CLI Changes

## How to Execute

**All files exist in our fork — apply upstream diffs.**

```bash
cd Agent-backend/upstream/repo/clone
git diff v1.2.24..v1.2.26 -- packages/opencode/src/cli/cmd/tui/<path>
# Apply hunks to our fork's version
```

## Summary

TUI changes from v1.2.24 to v1.2.26 fall into four categories: workspace support propagation (passing `workspaceID` through session creation), branded ID adoption in the TUI layer, bug fixes (auto-submit race condition, better error messages), and cleanup (OpenRouter warning removal, provider hint updates, flag rename).

All 8 affected files exist in our fork and are ready for patching.

---

## Changes by File

### 1. Workspace Support (4 files)

#### `context/route.tsx`

- **What we have:** `HomeRoute` type with `type` and `initialPrompt` fields
- **What changes:** Add optional `workspaceID?: string` field to `HomeRoute`
- **Rename needed:** None (no user-facing strings)
- **Complexity:** Trivial (1 line addition)

#### `component/prompt/index.tsx`

- **What we have:** `PromptProps` without `workspaceID`; session creation uses `sdk.client.session.create({})` with no workspace; uses `Identifier.ascending("message")` and `Identifier.ascending("part")`
- **What changes:**
  1. Add `workspaceID?: string` to `PromptProps`
  2. Session creation passes `workspaceID: props.workspaceID` and adds error handling (toast on failure instead of crash)
  3. Replace `Identifier.ascending("message")` with `MessageID.ascending()` (branded ID)
  4. Replace `Identifier.ascending("part")` with `PartID.ascending()` (branded ID, 3 occurrences)
  5. Import changes: `Identifier` from `@/id/id` becomes `MessageID, PartID` from `@/session/schema`
- **Rename needed:** None
- **Complexity:** Medium (import swap + session creation rewrite + 4 ID call replacements)
- **Dependency:** Requires Phase 2 branded IDs (`MessageID`, `PartID` from `@/session/schema`)

#### `routes/home.tsx`

- **What we have:** `onMount` calls `prompt.submit()` synchronously after setting `--prompt` text
- **What changes:**
  1. Add `useLocal` import and `local = useLocal()` call
  2. Move `prompt.submit()` from `onMount` into a `createEffect(on(...))` that waits for `sync.ready && local.model.ready` before auto-submitting
  3. Pass `workspaceID={route.workspaceID}` to `<Prompt>` component
  4. New imports: `createEffect`, `on` from `solid-js`; `useLocal` from `../context/local`
- **Rename needed:** None
- **Complexity:** Medium (logic restructuring for race condition fix)
- **Bug fix:** `--prompt` flag auto-submit no longer fires before model store is ready

#### `component/dialog-workspace-list.tsx`

- **What we have:** `openWorkspace` calls `client.session.create({})` without workspace ID
- **What changes:** Pass `workspaceID: input.workspaceID` to `client.session.create()`
- **Rename needed:** None
- **Complexity:** Trivial (1 argument addition)

### 2. Bug Fixes (3 files)

#### `routes/home.tsx` (same file as above)

- **Bug:** `--prompt` auto-submit fires before model store is loaded, causing failures
- **Fix:** `createEffect(on(() => sync.ready && local.model.ready, ...))` gates submission on readiness
- **Details:** Covered in workspace support section above

#### `routes/session/index.tsx`

- **What we have:** Share/unshare error handlers use generic "Failed to share/unshare session" messages
- **What changes:** Both `.catch()` handlers now extract `error.message` when `error instanceof Error`, falling back to the generic string
- **Rename needed:** None
- **Complexity:** Trivial (2 catch blocks updated)

#### `event.ts`

- **What we have:** `SessionSelect` event validates `sessionID` with `z.string().regex(/^ses/)`
- **What changes:** Replace with `SessionID.zod.describe("Session ID to navigate to")` (branded Zod schema)
- **Import added:** `SessionID` from `@/session/schema`
- **Rename needed:** None
- **Complexity:** Trivial
- **Dependency:** Requires Phase 2 branded IDs (`SessionID` from `@/session/schema`)

### 3. OpenRouter Warning Removal (1 file)

#### `app.tsx`

- **What we have:** A `createEffect` block (lines ~700-714) that shows a `DialogAlert` warning about OpenRouter provider quality, referencing "OpenCode Zen" at `https://opencode.ai/zen`
- **What changes:** The entire `createEffect` block (~14 lines) is deleted
- **Rename needed:** N/A (being deleted)
- **Complexity:** Trivial (pure deletion)
- **Note:** The deleted warning text referenced "OpenCode Zen" which would have needed rebranding anyway

### 4. Flag Rename (2 files)

#### `app.tsx`

- **What we have:** `Flag.OPENCODE_EXPERIMENTAL_WORKSPACES` (already renamed in our fork)
- **What upstream changed:** `Flag.OPENCODE_EXPERIMENTAL_WORKSPACES_TUI` -> `Flag.OPENCODE_EXPERIMENTAL_WORKSPACES`
- **Status:** Our fork already has the correct name. No action needed.
- **Also in app.tsx:** The workspace navigation now passes `workspaceID` from `sync.session.get(route.data.sessionID)?.workspaceID` when navigating home

#### `routes/session/header.tsx`

- **What we have:** `Flag.OPENCODE_EXPERIMENTAL_WORKSPACES` (already renamed in our fork, 2 occurrences)
- **What upstream changed:** `Flag.OPENCODE_EXPERIMENTAL_WORKSPACES_TUI` -> `Flag.OPENCODE_EXPERIMENTAL_WORKSPACES`
- **Status:** Our fork already has the correct name. No action needed.

### 5. Provider Hint Updates (1 file)

#### `component/dialog-provider.tsx`

- **What we have:** `anthropic: "(Claude Max or API key)"`
- **What changes:** Becomes `anthropic: "(API key)"` (removed "Claude Max" reference)
- **Rename needed:** This file also has user-facing strings referencing "OpenCode Zen" and "OpenCode Go" (see Rename section below)
- **Complexity:** Trivial (1 string change)

---

## Rename Required

### User-Facing Strings (dialog-provider.tsx)

The following strings in `dialog-provider.tsx` reference "OpenCode" and need rebranding to "Orbit":

- Line 50: `opencode: "(Recommended)"` -- this is a provider ID key, **do NOT rename** (it's a backend identifier)
- Line 53: `"opencode-go": "Low cost subscription for everyone"` -- provider ID key, **do NOT rename**
- Line 257-265: OpenCode Zen description block with `https://opencode.ai/zen` URL -- **rename "OpenCode Zen" to "Orbit"** or remove (we don't use this provider)
- Line 269-277: OpenCode Go description block with `https://opencode.ai/zen` URL -- **rename or remove** (we don't use this provider)

**Decision point:** Since our fork doesn't use the `opencode` or `opencode-go` provider IDs, these description blocks could be removed entirely rather than rebranded. The provider ID keys themselves must stay because they match backend provider identifiers.

### Flag Names

- `OPENCODE_EXPERIMENTAL_WORKSPACES` -- Already correct in our fork. The flag name is internal (not user-facing) so renaming to `ORBIT_EXPERIMENTAL_WORKSPACES` is optional but recommended for consistency.

### Deleted OpenRouter Warning (app.tsx)

- The deleted `createEffect` block referenced "OpenCode Zen" and `https://opencode.ai/zen` -- no rename needed since we're deleting it.

---

## Breaking Changes

None expected. All changes are additive (workspace support) or bug fixes. The flag rename from `_TUI` to non-`_TUI` is already done in our fork.

---

## Dependencies

- **Phase 2 (Branded IDs):** `prompt/index.tsx` and `event.ts` require `MessageID`, `PartID`, `SessionID` from `@/session/schema`
- **No other phase dependencies** for the remaining changes

---

## Order of Operations

1. Apply branded ID changes in `event.ts` and `prompt/index.tsx` (requires Phase 2 done first)
2. Apply workspace support changes across all 4 files
3. Apply bug fixes in `home.tsx` and `session/index.tsx`
4. Delete OpenRouter warning from `app.tsx`
5. Update provider hint in `dialog-provider.tsx`
6. Decide on OpenCode Zen/Go description blocks (remove or rebrand)

---

## Verification

```bash
# TUI starts without errors
cd Agent-backend/packages/opencode && bun dev

# Type check passes
cd Agent-backend && bun turbo typecheck

# Workspace dialog renders (if OPENCODE_EXPERIMENTAL_WORKSPACES enabled)
# Provider dialog shows "(API key)" for anthropic, not "(Claude Max or API key)"
# --prompt flag waits for model store before auto-submitting
# Share error messages show actual error text
```
