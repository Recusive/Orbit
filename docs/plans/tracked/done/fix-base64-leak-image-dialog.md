# Plan: Fix base64 data leaking into DOM via image `src` attributes

## Context

After implementing IMAGE-ATTACHMENT-TILES, clicking an image tile opens a lightbox dialog. The `<img src>` attribute in the DOM contains the raw `previewUrl` — which can be a `data:` URL with the full base64 payload (200KB+). Copying HTML from DevTools Elements panel copies this entire base64 string. Bad UX.

This affects two backend paths:

- **Claude backend:** Transient `data:` URL exists for 5-20ms before `cacheImage()` patches it to `asset://`
- **OpenCode backend:** `data:` URLs are permanent (transient derived state from `adaptParts()`, never cached to disk)

And **four rendering surfaces** use raw `previewUrl` as `<img src>`:

1. `ImageAttachmentTiles.tsx` — tile grid thumbnails
2. `ImageLightbox.tsx` — fullscreen image viewer
3. `context-chips.tsx:77` — composer input chips (pre-send)
4. `queued-message-bubble.tsx:72` — queued message preview (during send)

## Fix: `SafeImage` drop-in component

Create a shared `<SafeImage>` component that replaces `<img>` wherever `previewUrl` may be a `data:` URL. Each instance manages its own blob URL lifecycle in `useEffect` (StrictMode-safe).

### Step 1: New file — `apps/agent/src/components/shared/SafeImage.tsx`

```typescript
import { memo, useEffect, useRef, useState } from 'react';
import type { FC, ImgHTMLAttributes } from 'react';

/**
 * Convert a base64 data: URL to a Blob. Returns null on malformed input.
 * Only handles `;base64` encoding — percent-encoded data URLs pass through unchanged.
 * Exported for testing.
 */
export function dataUrlToBlob(dataUrl: string): Blob | null {
  try {
    const commaIndex = dataUrl.indexOf(',');
    if (commaIndex === -1) return null;
    const header = dataUrl.slice(0, commaIndex);
    if (!header.includes(';base64')) return null;
    const base64 = dataUrl.slice(commaIndex + 1);
    const mime = header.match(/data:(.*?);/)?.[1] ?? 'application/octet-stream';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
}

interface SafeImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  readonly src: string;
}

/**
 * Drop-in <img> replacement that converts data: URLs to opaque blob: URLs.
 *
 * Prevents base64 payloads from appearing in the DOM (and being copied via
 * DevTools "Copy outerHTML"). Non-data URLs (asset://, http://, blob://)
 * pass through unchanged.
 *
 * Blob URL lifecycle is managed per-instance via useEffect — StrictMode-safe.
 *
 * IMPORTANT: ChatStore retains the original data: URL as previewUrl so the
 * cache pipeline (patchImagePreviewUrl) can match by URL key when the Rust
 * cache returns an asset:// URL. This component is the ONLY place where
 * conversion happens — never in stores or services.
 */
export const SafeImage: FC<SafeImageProps> = memo(function SafeImage({ src, onError, ...props }) {
  // For non-data URLs, use directly — no conversion needed
  const isDataUrl = src.startsWith('data:');
  const [safeSrc, setSafeSrc] = useState<string>(isDataUrl ? '' : src);
  const [sanitizeFailed, setSanitizeFailed] = useState(false);
  const blobUrlRef = useRef<string | null>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    // Revoke previous blob URL if any
    if (blobUrlRef.current !== null) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    if (!src.startsWith('data:')) {
      setSafeSrc(src);
      setSanitizeFailed(false);
      return;
    }

    const blob = dataUrlToBlob(src);
    if (blob === null) {
      // Malformed data URL — mark as failed so we can notify parent via onError
      setSafeSrc('');
      setSanitizeFailed(true);
      return;
    }

    const blobUrl = URL.createObjectURL(blob);
    blobUrlRef.current = blobUrl;
    setSafeSrc(blobUrl);
    setSanitizeFailed(false);

    return () => {
      URL.revokeObjectURL(blobUrl);
      blobUrlRef.current = null;
    };
  }, [src]);

  // Notify parent on sanitization failure so broken-image fallback UI activates.
  // Both ImageAttachmentTiles and ImageLightbox use onError to set brokenPreviewUrls
  // state — their handlers ignore the event object and capture previewUrl via closure.
  useEffect(() => {
    if (sanitizeFailed) {
      onErrorRef.current?.({} as React.SyntheticEvent<HTMLImageElement, Event>);
    }
  }, [sanitizeFailed]);

  // Don't render <img> with empty src — onError notification handled above
  if (safeSrc === '') {
    return null;
  }

  return <img src={safeSrc} onError={onError} {...props} />;
});
```

**Why `useEffect` instead of `useMemo`:** This app mounts under `StrictMode` (`main.tsx:148`). In StrictMode, React double-invokes render (including `useMemo`) in dev mode. `URL.createObjectURL()` in `useMemo` would create blob URLs in the abandoned first render that never reach cleanup — a memory leak. `useEffect` only fires after commit, so StrictMode's double-render is harmless.

**On the one-frame gap:** When `src` is a `data:` URL, `safeSrc` initializes to `''` and the blob URL is set in `useEffect` (after paint). This creates a single frame where no image renders. This is imperceptible for thumbnails (20×20px chips, 80×80px tiles) and masked by the lightbox's fade-in animation. The tradeoff is correct: StrictMode safety > one invisible frame.

**On conversion failure:** If `dataUrlToBlob` returns null, `safeSrc` stays `''` and the component returns `null` (no `<img>` in the DOM). A separate `useEffect` watches the `sanitizeFailed` flag and fires `onError` via a ref so the parent's broken-image fallback UI activates. Both `ImageAttachmentTiles` and `ImageLightbox` use `onError` to set `brokenPreviewUrls[previewUrl] = true` — their handlers ignore the event object and capture `previewUrl` via closure, so a synthetic `{}` event works. For `context-chips` and `queued-message-bubble`, no `onError` is provided, so the image simply doesn't render — better than leaking malformed base64 into the DOM.

### Step 2: Export from barrel — `apps/agent/src/components/shared/index.ts`

Add `export { SafeImage } from './SafeImage';`

### Step 3: Replace `<img>` with `<SafeImage>` in all four surfaces

**3a. `ImageAttachmentTiles.tsx`** (tile grid — lines 67-78):

```diff
-<img
+<SafeImage
   src={image.previewUrl}
   alt={image.name}
   loading="lazy"
   className="h-full w-full object-cover"
   onError={() => { ... }}
 />
```

**3b. `ImageLightbox.tsx`** (fullscreen view — lines 154-168):

```diff
-<img
+<SafeImage
   key={activeImage.previewUrl}
   src={activeImage.previewUrl}
   alt={activeImage.name}
   className={cn('max-h-[72vh] w-full rounded-[20px] object-contain', ...)}
   onError={() => { ... }}
 />
```

**3c. `context-chips.tsx`** (composer chip — lines 76-80):

```diff
-<img
+<SafeImage
   src={item.previewUrl}
   alt={item.name}
   className="h-5 w-5 object-cover rounded-[5px] shrink-0"
 />
```

**3d. `queued-message-bubble.tsx`** (queued preview — lines 71-75):

```diff
-<img
+<SafeImage
   src={image.previewUrl}
   alt={image.name}
   className="h-4 w-4 object-cover rounded-md opacity-50"
 />
```

### Step 4: Reset `brokenPreviewUrls` in `ImageAttachmentTiles.tsx`

When `attachedImages` changes (e.g., `data:` → `asset://` patch from cache pipeline), old blob URL keys in `brokenPreviewUrls` become stale. Reset on change:

```typescript
useEffect(() => {
  setBrokenPreviewUrls({});
}, [attachedImages]);
```

### Step 5: Tests — `apps/agent/src/__tests__/unit/components/shared/safe-image.test.tsx`

Unit tests for `SafeImage` and `dataUrlToBlob` covering lifecycle, fallback, and the `data:` → `asset://` transition.

**5a. `dataUrlToBlob` utility (exported for testing or tested via component):**

| Test case                             | Input                                  | Expected                         |
| ------------------------------------- | -------------------------------------- | -------------------------------- |
| Valid base64 PNG                      | `data:image/png;base64,iVBORw0KGgo...` | `Blob` with `type: 'image/png'`  |
| Valid base64 JPEG                     | `data:image/jpeg;base64,/9j/4AAQ...`   | `Blob` with `type: 'image/jpeg'` |
| Missing comma                         | `data:image/png;base64`                | `null`                           |
| No `;base64` header (percent-encoded) | `data:image/png,%89PNG...`             | `null`                           |
| Invalid base64 payload                | `data:image/png;base64,!!!invalid`     | `null` (atob throws)             |
| Empty string                          | `''`                                   | `null`                           |

**5b. `SafeImage` component tests (React Testing Library + Vitest):**

| Test case                                     | Setup                                                          | Assert                                              |
| --------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------- |
| Non-data URL passes through                   | `render(<SafeImage src="asset://foo.png" />)`                  | `<img src="asset://foo.png">`                       |
| `data:` URL converted to `blob:`              | `render(<SafeImage src={validDataUrl} />)`                     | After `act()`, `<img src>` starts with `blob:`      |
| Blob URL revoked on unmount                   | Render then unmount                                            | `URL.revokeObjectURL` called with the blob URL      |
| Blob URL revoked on src change                | Render with `data:` URL, rerender with `asset://` URL          | `URL.revokeObjectURL` called for old blob URL       |
| `data:` → `asset://` transition (cache patch) | Render with `data:` URL, rerender with `asset://localhost/...` | `<img src>` updates to `asset://`, old blob revoked |
| Malformed `data:` URL fires `onError`         | `render(<SafeImage src="data:bad" onError={spy} />)`           | `onError` spy called, no `<img>` in DOM             |
| `onError` not called for valid URLs           | `render(<SafeImage src={validDataUrl} onError={spy} />)`       | `onError` spy NOT called                            |
| Props forwarded                               | `render(<SafeImage src="..." alt="test" className="foo" />)`   | `<img alt="test" class="foo">`                      |

**5c. Mock setup:**

```typescript
// Spy on URL.createObjectURL / URL.revokeObjectURL
const createSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');

// Minimal valid data URL for testing (1x1 transparent PNG)
const VALID_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
```

**5d. What NOT to test:** Don't test that `ImageAttachmentTiles` or `ImageLightbox` properly renders the broken-image fallback — those already have their own `brokenPreviewUrls` logic and would require full component rendering with Dialog, Radix, etc. The `SafeImage` tests prove that `onError` fires on sanitization failure; the parent components' fallback behavior is a pre-existing concern.

## Files to Create

| File                                                                  | Purpose                                                           |
| --------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `apps/agent/src/components/shared/SafeImage.tsx`                      | Drop-in `<img>` replacement — converts `data:` to `blob:` URLs    |
| `apps/agent/src/__tests__/unit/components/shared/safe-image.test.tsx` | Unit tests for SafeImage lifecycle, fallback, and URL transitions |

## Files to Modify

| File                                                                      | Change                                                        |
| ------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `apps/agent/src/components/shared/index.ts`                               | Export `SafeImage`                                            |
| `apps/agent/src/components/chat/messages/ImageAttachmentTiles.tsx`        | `<img>` → `<SafeImage>`, add `brokenPreviewUrls` reset effect |
| `apps/agent/src/components/chat/messages/ImageLightbox.tsx`               | `<img>` → `<SafeImage>`                                       |
| `apps/agent/src/components/chat/input/context-chips.tsx`                  | `<img>` → `<SafeImage>`                                       |
| `apps/agent/src/components/chat/queued-message/queued-message-bubble.tsx` | `<img>` → `<SafeImage>`                                       |

## Store Invariant

ChatStore retains the original `data:` URL in `previewUrl` so `patchImagePreviewUrl` can match by URL key when the Rust cache returns an `asset://` URL. Blob conversion happens **strictly at the rendering boundary** (`SafeImage` component) — never in stores or services.

## Verification

1. Attach image in composer → inspect context chip `<img src>` in DevTools → `blob:...` not `data:...`
2. Queue a message with image → inspect queued bubble `<img src>` → `blob:...`
3. Send message → inspect tile `<img src>` → `blob:...` (briefly), then `asset:...` after cache patch
4. Click tile to open lightbox → inspect fullscreen `<img src>` → `blob:...` or `asset:...`
5. Copy outerHTML from any surface → clipboard has short URL, no base64
6. Lightbox open while cache patches `data:` → `asset://` → image stays visible (SafeImage reacts to new src)
7. Malformed data URL → `onError` fires synthetically → "Preview unavailable" fallback UI shows in tiles/lightbox (no base64 leak on failure path)
8. StrictMode double render → no leaked blob URLs (creation in useEffect, not useMemo)
9. Switch sessions and return → images persist (asset:// URLs pass through SafeImage unchanged)
10. `bun run test apps/agent/src/__tests__/unit/components/shared/safe-image.test.tsx` — all pass
11. `bun run typecheck` — pass
12. `bun run lint` — pass
