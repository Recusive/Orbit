# Plan: Image Attachment Tiles in Chat Messages

## Context

When users attach images to chat messages, they currently display as inline text `Referenced: illustration.png` inside the user message bubble. Images should be visually represented as thumbnail tiles below the chat bubble, clickable to enlarge, navigable when multiple, and fully persisted across reload on both backends.

The image attachment **send pipeline** is already fully wired (FIX-OPENCODE-IMAGE-ATTACHMENTS.md, completed). The gaps are:

1. **Display layer** — no tile rendering, no lightbox
2. **OpenCode data pipeline** — adapter drops images to text on round-trip
3. **Claude data pipeline** — Rust JSONL parser discards image content blocks
4. **Send path** — image-only messages blocked by empty-text guard
5. **Visibility** — `hasVisibleContent()` hides image-only messages
6. **Memory** — no base64 in persisted frontend state — images served from disk via `asset://` protocol

### Scope

All six gaps are in scope. Both backends must survive reload. Image-only messages must be sendable. No deferred items.

### Requirement: No base64 persisted in frontend state

Base64 image data must not **remain** in Zustand or ChatStore. During the send flow, a `data:` URL may exist transiently in ChatStore for the 5-20ms between optimistic insert and async cache patch — this is acceptable (same pattern as message ID reconciliation). But once the cache patch completes, only short `asset://` or `http:` URLs remain. If caching fails, the image is removed from `attachedImages` rather than leaving a `data:` URL in the store.

The agent/model still receives raw base64 via the API payload at send time (that's how image input works). This requirement applies to **frontend persisted state**, not the API transport.

### Image Storage Architecture

```
User attaches image → compressImage() → base64 in memory (transient)
    ↓
Tauri command: cache_image(session_id, name, base64) → writes to ~/.orbit/image-cache/
    ↓ returns file path
convertFileSrc(path) → asset://localhost/~/.orbit/image-cache/{session}/{hash}.{ext}
    ↓
ChatMessage.attachedImages[].previewUrl = "asset://..."  (~50 chars in Zustand)
    ↓
API send uses original base64 (from input, not from store)
    ↓
base64 goes out of scope → GC'd
```

On reload:

- **Claude backend:** Rust parser reads base64 from JSONL → writes to image cache → returns file path in DTO → frontend calls `convertFileSrc()` → `asset://` URL in ChatStore
- **OpenCode backend:** `adaptParts()` collects image URLs synchronously → `data:` or `http:` URLs used directly as `previewUrl`. These are **transient derived state** (re-derived from SSE on every session load), never persisted to ChatStore or Zustand. No disk caching needed for this path.

### Type Strategy

`ImageAttachment` keeps `data` as **optional** — it's present at input/send time and absent after caching. This avoids breaking the existing send pipeline while ensuring persisted state never holds base64.

```typescript
export interface ImageAttachment {
  name: string;
  mimeType: string;
  data?: string | undefined; // Base64 — present at input, absent after cache
  previewUrl: string; // asset:// URL (after cache) or data: URL (transient, before cache)
}
```

---

## What Exists Already

| Piece                                            | Location                                                       | Status                                                         |
| ------------------------------------------------ | -------------------------------------------------------------- | -------------------------------------------------------------- |
| `ChatMessage.attachedImages?: ImageAttachment[]` | `messages/types.ts:65`                                         | Field exists, populated on send                                |
| `ImageAttachment` type                           | `input/types.ts:18-23`                                         | `data` field needs to become optional                          |
| `StoredImageAttachmentSchema` (Zod)              | `protocol/protocol.ts:140-147`                                 | Needs update: `data` optional                                  |
| `convertFileSrc()`                               | `@tauri-apps/api/core` — `icons.ts:37`, `file-handlers.ts:155` | Existing pattern                                               |
| Asset protocol                                   | `tauri.conf.json:49` — enabled, scope `$HOME/**`               | Already configured                                             |
| `adaptOcMessage()`                               | `use-oc-chat-adapter.ts:487`                                   | Synchronous, called in `useMemo` — MUST stay sync              |
| `handleGlobalEvent()`                            | `oc-event-coordinator.ts:70`                                   | Synchronous — MUST stay sync                                   |
| `DialogContentGlass`                             | `dialog.tsx:98-122`                                            | Content wrapper only — NO close button, NO title               |
| `UserContent::Blocks`                            | `conversations/src/lib.rs:248`                                 | Parsed from JSONL — contains image blocks                      |
| `UserContent::to_text()`                         | `conversations/src/lib.rs:252-268`                             | **Discards image blocks**                                      |
| `process_user_line()` guard                      | `conversations/src/lib.rs:1334`                                | `if text.is_empty() { return; }` **discards image-only turns** |
| `SendMessageSchema`                              | `protocol.ts:208`                                              | `content: z.string().min(1)` rejects empty content             |

---

## Implementation Plan

### Step 1: Create Rust image cache command

**New file or addition to:** `src-tauri/src/commands/common/` (e.g., `image_cache.rs` or add to `files.rs`)

```rust
#[tauri::command]
pub async fn cache_image(
    session_id: String,
    filename: String,
    mime_type: String,
    base64_data: String,
) -> Result<String, String> {
    let ext = mime_to_ext(&mime_type);
    let hash = sha256_short(&base64_data);
    let cache_dir = dirs::home_dir()
        .ok_or("No home directory")?
        .join(".orbit/image-cache")
        .join(&session_id);
    std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    let file_path = cache_dir.join(format!("{hash}.{ext}"));
    if !file_path.exists() {
        let bytes = base64::decode(&base64_data).map_err(|e| e.to_string())?;
        std::fs::write(&file_path, bytes).map_err(|e| e.to_string())?;
    }
    Ok(file_path.to_string_lossy().to_string())
}
```

Register in `lib.rs`. Add cache cleanup when sessions are deleted.

### Step 2: Create TypeScript image cache helper

**New file:** `apps/agent/src/lib/api/image-cache.ts`

```typescript
import { convertFileSrc } from '@tauri-apps/api/core';
import { invoke } from './core';

export async function cacheImage(
  sessionId: string,
  filename: string,
  mimeType: string,
  base64Data: string
): Promise<string> {
  const filePath = await invoke<string>('cache_image', {
    sessionId,
    filename,
    mimeType,
    base64Data,
  });
  return convertFileSrc(filePath);
}
```

### Step 3: Make `ImageAttachment.data` optional

**Modify:** `apps/agent/src/components/chat/input/types.ts`

```typescript
export interface ImageAttachment {
  name: string;
  mimeType: string;
  data?: string | undefined; // Present at input time, absent in persisted state
  previewUrl: string;
}
```

**Modify:** `apps/agent/src/types/protocol/protocol.ts` — `StoredImageAttachmentSchema`:

```tsx
export const StoredImageAttachmentSchema = z
  .object({
    name: z.string(),
    mimeType: z.string(),
    data: z.string().optional(), // Absent for asset:// cached images
    previewUrl: z.string(),
  })
  .strict();
```

The existing send pipeline (`onSend`, `oc-session-service`, queued messages) passes `ImageAttachment` objects with `data` populated — this still works since `data` is now optional, not removed. No existing call site breaks.

### Step 4: Update send path — optimistic insert + async cache patch

**Strategy: insert-then-patch.** The `ChatMessage` is created synchronously with `previewUrl` set to the input's `data:` URL (from `compressImage()` — already in memory). The tile renders instantly. Then an async fire-and-forget caches to disk and patches the `previewUrl` to `asset://`. This matches existing reconciliation patterns (checkpoint ID reconciliation, message ID reconciliation).

**Modify:** `apps/agent/src/hooks/chat/handlers/chat-actions.ts`

```typescript
// 1. Build API payload with full base64 (existing code, unchanged)
const context = {
  images: hasImages ? images.map(img => ({
    name: img.name, mimeType: img.mimeType, data: img.data,
  })) : undefined,
};
postMessage({ type: 'message:send', content: text, context, ... });

// 2. Insert optimistic message with data: URL preview (instant, synchronous)
const optimisticImages: ImageAttachment[] | undefined = hasImages
  ? images.map(img => ({
      name: img.name,
      mimeType: img.mimeType,
      previewUrl: img.previewUrl,  // data: URL from compressImage() — works for <img src>
    }))
  : undefined;

const userMessage: ChatMessage = {
  content: text,
  attachedImages: optimisticImages,
  ...
};
useChatStore.getState().addMessage(sessionId, userMessage);

// 3. Fire-and-forget: cache to disk, patch previewUrl to asset://
if (optimisticImages !== undefined) {
  void Promise.all(images.map(async (img) => {
    const assetUrl = await cacheImage(sessionId, img.name, img.mimeType, img.data!);
    useChatStore.getState().patchImagePreviewUrl(sessionId, userMessage.id, img.name, assetUrl);
  }));
}
```

**Add `patchImagePreviewUrl` action to ChatStore** (`apps/agent/src/stores/chat/chat-store.ts`):

```typescript
patchImagePreviewUrl: (sessionId: string, messageId: string, imageName: string, assetUrl: string) => {
  set((state) => {
    const session = state.sessions[sessionId];
    if (!session) return;
    const message = session.messages.find(m => m.id === messageId);
    if (!message?.attachedImages) return;
    const img = message.attachedImages.find(i => i.name === imageName);
    if (img) img.previewUrl = assetUrl;
  });
},
```

**Apply the same pattern in `use-chat-messages.ts` and `use-queued-message.ts`** — insert with `data:` URL, fire-and-forget cache + patch. Also apply the `text || 'Image conversation'` title fallback in `use-chat-messages.ts`.

**Fallback:** If `cacheImage()` fails (disk full, permission error), remove the failed image from `attachedImages` in ChatStore rather than leaving a `data:` URL. The image disappears from the tile grid but the message text is unaffected. Log a warning via `createLogger`. This ensures no `data:` URL persists in Zustand after the patch window.

```typescript
try {
  const assetUrl = await cacheImage(sessionId, img.name, img.mimeType, img.data!);
  useChatStore.getState().patchImagePreviewUrl(sessionId, userMessage.id, img.name, assetUrl);
} catch (err) {
  logger.warn({ err, imageName: img.name }, 'Image cache failed — removing from message');
  useChatStore.getState().removeImageFromMessage(sessionId, userMessage.id, img.name);
}
```

**Add `removeImageFromMessage` action to ChatStore** — filters out the failed image from `attachedImages`. If the array becomes empty, set `attachedImages` to `undefined`.

**Timing:** `cacheImage()` writes ~100-200KB to disk via Tauri IPC. Typical: 5-20ms. The patch fires before the user could notice.

### Step 5: Create `ImageAttachmentTiles` component

**New file:** `apps/agent/src/components/chat/messages/ImageAttachmentTiles.tsx`

- Wrap in `memo()`
- Props: `readonly attachedImages: ImageAttachment[]`
- `flex flex-wrap gap-2`, right-aligned
- Each tile: `rounded-lg`, ~80×80px, `object-cover`, `<img src={previewUrl}>`
- `title` for filename, `loading="lazy"`, `onError` fallback
- Click opens lightbox at that index

### Step 6: Create `ImageLightbox` component

**New file:** `apps/agent/src/components/chat/messages/ImageLightbox.tsx`

Uses `DialogContentGlass` with explicit `DialogClose`, `DialogTitle` (sr-only), `DialogDescription`. Left/right arrow navigation, wrap-around, keyboard support.

### Step 7: Wire tiles into message rendering

**Modify:** `apps/agent/src/components/chat/messages/MessageItem.tsx`

```tsx
<div className="flex flex-col items-end gap-1 pb-3">
  {message.displayedContent.trim().length > 0 ? (
    <UserMessageBubble ... />
  ) : null}
  {message.attachedImages !== undefined && message.attachedImages.length > 0 ? (
    <ImageAttachmentTiles attachedImages={message.attachedImages} />
  ) : null}
</div>
```

### Step 8: Fix OpenCode adapter — synchronous image collection

**Key constraint:** `adaptOcMessage()` is called inside `useMemo` (line 616-618) and MUST stay synchronous. No async, no effects, no ChatStore updates.

**Why no disk caching is needed for OpenCode:** The OpenCode surface (`OcAgentSurface.tsx`) renders `displayedMessages` from `useOcChatAdapter()`, which derives state from `useOcMessageStore` (SSE events), NOT from ChatStore. These `ChatMessage` objects are **transient derived state** — they exist only in the adapter hook's render cycle and are re-derived from the backend on every session load. They are never persisted to Zustand or localStorage. The "no base64 in persisted state" requirement is already met.

**Implementation — purely synchronous:**

**8a.** Add `images` to `AdaptedOcParts` interface.

**8b.** In `adaptParts()`, replace `case 'file'`:

```tsx
case 'file': {
  const mime = part.mime ?? '';
  if (mime.startsWith('image/') && part.url) {
    images.push({
      name: part.filename ?? 'image',
      mimeType: mime,
      previewUrl: part.url,  // data: or http: — both work for <img src>
    });
  } else {
    const file = part.filename ?? part.source?.path ?? part.url;
    content = appendLine(content, `Referenced: ${file}`);
  }
  break;
}
```

**8c.** Wire `images` into `adaptOcMessage()` → `ChatMessage.attachedImages`:

```tsx
...(adapted.images.length > 0 ? { attachedImages: adapted.images } : {}),
```

No `useEffect`, no ChatStore mutation, no `updateImagePreviewUrl` action. The adapter stays pure derived state.

### Step 9: Fix `hasVisibleContent()` for image-only messages

**Modify:** `apps/agent/src/components/chat/messages/message-utils.ts`

```tsx
if (message.role === 'user') {
  const trimmed = message.content.trim();
  const hasImages = message.attachedImages !== undefined && message.attachedImages.length > 0;
  if (trimmed.length === 0 && !hasImages) return false;
  if (trimmed.startsWith('<local-command-stdout>')) return false;
  return true;
}
```

### Step 10: Fix image-only send path (3 layers)

**10a. `SendMessageSchema`** — `content: z.string().min(1)` → `content: z.string()`

**10b. `use-chat-input.ts:181`** — `if (!text && !hasImages) return;`

**10c. `chat-actions.ts`** — same guard relaxation + title fallback: `text || 'Image conversation'`

Apply title fallback in `use-chat-messages.ts` too.

### Step 11: Claude backend — parse image blocks, cache to disk in Rust

**11a.** Add `ImageAttachmentData` struct to `lib.rs`:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageAttachmentData {
    pub name: String,
    pub mime_type: String,
    pub preview_url: String,  // File path — frontend calls convertFileSrc()
}
```

Add `attached_images: Vec<ImageAttachmentData>` to `Message`.

**11b.** Add `extract_and_cache_images()` to `UserContent` — reads image blocks, writes to `~/.orbit/image-cache/{session}/`, returns file paths (not base64).

**11c.** Fix `process_user_line()` — call `extract_and_cache_images()` BEFORE the empty-text guard. Change guard to `if text.is_empty() && attached_images.is_empty() { return; }`. Fix `first_user_text` guard: `if self.first_user_text.is_none() && !text.is_empty()`.

**11d.** Thread through `MessageDto` → `ConversationMessageDto` → `mapPersistedMessage()`. In `mapPersistedMessage()`, convert file paths to `asset://` URLs via `convertFileSrc()`.

**11e.** Update `PersistedMessageSchema` — MANDATORY (`.strip()` removes unknown fields):

```tsx
attachedImages: z.array(StoredImageAttachmentSchema).optional(),
```

Add to `.transform()` output: `attachedImages: msg.attachedImages,`

### Step 12: Update barrel exports + register Tauri command

### Step 13: Tests

**TypeScript:**

- `adaptParts` image detection (data URL → `previewUrl`, http URL → direct, non-image → text)
- `hasVisibleContent` with image-only messages
- Image-only send path (empty text + images → allowed)
- `updateImagePreviewUrl` ChatStore action

**Rust:**

- `extract_and_cache_images` with image blocks → files written + paths returned
- `process_user_line` with image-only content → message NOT discarded
- `process_user_line` with empty text + no images → message discarded

---

## Files to Create

| File                                                               | Purpose                                            |
| ------------------------------------------------------------------ | -------------------------------------------------- |
| `apps/agent/src/components/chat/messages/ImageAttachmentTiles.tsx` | Thumbnail tile grid + lightbox trigger             |
| `apps/agent/src/components/chat/messages/ImageLightbox.tsx`        | Fullscreen image viewer with navigation            |
| `apps/agent/src/lib/api/image-cache.ts`                            | `cacheImage()` Tauri invoke wrapper                |
| `src-tauri/src/commands/common/image_cache.rs`                     | `cache_image` Rust command — writes base64 to disk |

## Files to Modify

| File                                                                  | Change                                                                                                                                            |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/agent/src/components/chat/input/types.ts`                       | Make `data` optional on `ImageAttachment`                                                                                                         |
| `apps/agent/src/types/protocol/protocol.ts`                           | `StoredImageAttachmentSchema.data` optional; relax `SendMessageSchema.content`; add `attachedImages` to `PersistedMessageSchema` + `.transform()` |
| `apps/agent/src/hooks/chat/handlers/chat-actions.ts`                  | Cache images to disk before storing, relax empty-text guard, title fallback                                                                       |
| `apps/agent/src/hooks/chat/use-chat-messages.ts`                      | Cache images to disk before storing, title fallback                                                                                               |
| `apps/agent/src/components/chat/queued-message/use-queued-message.ts` | Cache images to disk before storing                                                                                                               |
| `apps/agent/src/stores/chat/chat-store.ts`                            | Add `patchImagePreviewUrl` action (targeted Immer mutation)                                                                                       |
| `apps/agent/src/hooks/chat/use-oc-chat-adapter.ts`                    | Add `images` to `AdaptedOcParts`, fix `adaptParts` case `'file'` (sync), wire `adaptOcMessage`                                                    |
| `apps/agent/src/components/chat/messages/MessageItem.tsx`             | Add tiles below bubble, hide empty bubble for image-only                                                                                          |
| `apps/agent/src/components/chat/messages/message-utils.ts`            | Fix `hasVisibleContent()`                                                                                                                         |
| `apps/agent/src/components/chat/input/use-chat-input.ts`              | Relax empty-text guard                                                                                                                            |
| `crates/common/conversations/src/lib.rs`                              | `ImageAttachmentData`, `extract_and_cache_images()`, fix `process_user_line()` guard                                                              |
| `src-tauri/src/commands/agent/conversations.rs`                       | Add `attached_images` to `MessageDto`                                                                                                             |
| `apps/agent/src/lib/api/conversations.ts`                             | Add `attachedImages` to `ConversationMessageDto`                                                                                                  |
| `apps/agent/src/services/chat/chat-message-service.ts`                | Map `attachedImages` with `convertFileSrc()`                                                                                                      |
| `src-tauri/src/lib.rs`                                                | Register `cache_image` command                                                                                                                    |
| `apps/agent/src/components/chat/messages/index.ts`                    | Export new components                                                                                                                             |

---

## Memory Guarantee

| Data                           | Where                                                  | Lifetime                                            | Persisted?                  |
| ------------------------------ | ------------------------------------------------------ | --------------------------------------------------- | --------------------------- |
| Raw base64 (input)             | JS local variable in send handler                      | GC'd after send + cache                             | No                          |
| Raw base64 (API payload)       | `context.images[].data` in `postMessage()`             | GC'd after IPC send                                 | No                          |
| Image file bytes               | `~/.orbit/image-cache/{session}/{hash}.{ext}`          | Cleaned on session delete                           | Disk only                   |
| `data:` URL (Claude send)      | `ChatMessage.attachedImages[].previewUrl` in ChatStore | Transient — patched to `asset://` within 5-20ms     | Briefly (replaced by patch) |
| `asset://` URL string (Claude) | `ChatMessage.attachedImages[].previewUrl` in ChatStore | ~50 chars in Zustand                                | Yes (Zustand)               |
| `data:` URL (OpenCode)         | `ChatMessage` in adapter `useMemo` output              | Transient derived state, re-derived on session load | **No** — never in ChatStore |
| `http:` URL (OpenCode)         | Same as above                                          | Same                                                | **No**                      |
| Decoded pixels                 | Browser image cache                                    | Browser-managed, evictable                          | No                          |

**No base64 persists in Zustand or ChatStore.**

- **Claude backend:** `ChatMessage.attachedImages[].previewUrl` is an `asset://` URL (~50 chars). base64 is on disk only.
- **OpenCode backend:** `ChatMessage` objects are transient derived state in `useOcChatAdapter()` → `useMemo`. They live only during the render cycle and are re-derived from backend SSE data on every session load. `data:` URLs in these messages are **not** persisted — they exist only in the adapter hook's local scope. The "no base64 in persisted state" requirement is met because OC messages never enter ChatStore or Zustand.

---

## Verification

1. **Send image + text** — tile below bubble, text in bubble
2. **Send image-only (no text)** — tiles render, no empty bubble
3. **Click tile** — lightbox with X close, accessible title
4. **Arrow keys** — navigate between images, wrap-around
5. **Escape / click outside** — close, focus returns to tile
6. **Multiple images** — grid layout, counter in lightbox
7. **Corrupt image** — fallback placeholder
8. **Inspect Zustand** — `previewUrl` is `asset://` or `http`, NEVER `data:`
9. **Check disk** — `ls ~/.orbit/image-cache/{session}/` shows cached files
10. **Session switch + return** — images persist
11. **Reload (OpenCode)** — images from `file` parts → `useEffect` caches → `asset://`
12. **Reload (Claude)** — Rust parses JSONL → caches to disk → `asset://` in DTO
13. **Delete session** — cache directory cleaned
14. **Non-image file part** — "Referenced: filename" text
15. **HTTP image URL** — renders directly (no caching)
16. **Narrow viewport** — tiles wrap
17. **Long filename** — truncated in footer, full in tooltip
18. **`bun run typecheck`** — pass
19. **`bun run lint`** — pass
20. **`bun run test`** — pass
21. **`cargo test`** — pass
