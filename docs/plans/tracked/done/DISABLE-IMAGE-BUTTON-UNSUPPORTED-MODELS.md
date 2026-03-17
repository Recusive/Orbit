# Disable Image Button When Model Doesn't Support Image Input

## Context

After the image attachment wiring fix, images now correctly reach the OpenCode backend. However, not all models support image input — e.g., Ollama's GPT OSS 120B model. When a user attaches an image to a model without vision support, the LLM responds with "I can't view image files directly." The image button should be disabled when the selected model doesn't support images, and already-attached images should be cleared on model switch.

The backend API already provides this data — each model in `ProviderListResponses` has:

- `modalities.input: Array<'text'|'audio'|'image'|'video'|'pdf'>` — detailed input modalities (preferred)
- `attachment: boolean` — coarser flag for whether the model supports file attachments

But `mapProviders()` in `oc-session-service.ts` strips both fields. `OcProviderModel` only stores `id`, `name`, `reasoning`, `variants`, `limit`.

**IMPORTANT: Backend isolation** — `InputControls` and `use-chat-input` are shared across backends. The OpenCode provider store persists `selectedProviderId`/`selectedModelId` even when the Claude backend is active. All new image-capability logic in shared code MUST be gated with `activeBackend === 'opencode'`. Claude always supports images.

## Changes

### 1. `apps/agent/src/stores/opencode/oc-provider-store.ts` — Add `supportsImageInput` to model type + selector

Derive a semantic boolean from `modalities.input` with `attachment` fallback. Store the derived value, not the raw fields:

```typescript
export interface OcProviderModel {
  readonly id: string;
  readonly name: string;
  readonly reasoning?: boolean;
  readonly supportsImageInput?: boolean;  // ← add (derived from modalities/attachment)
  readonly variants?: Record<string, Record<string, unknown>>;
  readonly limit?: { ... };
}
```

Add a selector (follows existing `useOcSelectedModelContextLimit` pattern at line 168):

```typescript
/**
 * Returns whether the currently selected OpenCode model supports image input.
 * Defaults to true when no provider/model is selected (boot state, no model loaded yet).
 *
 * NOTE: This selector is OpenCode-specific. Callers in shared components MUST gate
 * with `activeBackend === 'opencode'` — Claude always supports images.
 */
export const useOcSelectedModelSupportsImageInput = (): boolean =>
  useOcProviderStore((state) => {
    if (state.selectedProviderId === null || state.selectedModelId === null) {
      return true; // Boot state — assume supported until providers load
    }
    const provider = state.providers.find((p) => p.id === state.selectedProviderId);
    const model = provider?.models[state.selectedModelId];
    if (model === undefined) {
      return true; // Model metadata not loaded yet — don't break UI
    }
    return model.supportsImageInput ?? true; // Safety net for pre-migration data
  });
```

### 2. `apps/agent/src/services/opencode/oc-session-service.ts` — Derive `supportsImageInput` in `mapProviders`

Update the `as Record<string, ...>` cast to include `modalities` and `attachment`:

```typescript
provider.models as Record<
  string,
  {
    id: string;
    name: string;
    reasoning: boolean;
    attachment: boolean;
    modalities?: {
      input: Array<'text' | 'audio' | 'image' | 'video' | 'pdf'>;
      output: Array<'text' | 'audio' | 'image' | 'video' | 'pdf'>;
    };
    variants?: Record<string, Record<string, unknown>>;
    limit?: { context: number; input?: number; output: number };
  }
>;
```

In the `.map` callback, derive and store `supportsImageInput`:

```typescript
{
  id: model.id,
  name: model.name,
  ...(model.reasoning ? { reasoning: true } : {}),
  // Derive image support: prefer modalities (precise) → fall back to attachment (coarse)
  supportsImageInput: model.modalities
    ? model.modalities.input.includes('image')
    : model.attachment,
  ...(model.variants ? { variants: model.variants } : {}),
  ...(model.limit ? { limit: model.limit } : {}),
}
```

Priority chain:

1. `modalities.input.includes('image')` — precise signal (present on most models)
2. `attachment` — coarser fallback (present on all models)
3. Selector `?? true` — safety net when store data is absent

### 3. `apps/agent/src/components/chat/input/InputControls.tsx` — Consume selector, disable button

`InputControls` is a smart component that already reads from multiple stores (lines 81-88). Call the selector directly, **gated by `activeBackend`**:

```typescript
import { useOcSelectedModelSupportsImageInput } from '@/stores/opencode';

// Inside the component (activeBackend already available at line 81):
const ocSupportsImages = useOcSelectedModelSupportsImageInput();
const supportsImages = activeBackend === 'opencode' ? ocSupportsImages : true;
```

In both image button locations (compact mode ~line 227, expanded mode ~line 271):

```typescript
<button
  onClick={handleImageClick}
  disabled={!supportsImages}
  aria-label="Attach image"
  className={cn(
    'h-7 w-7 flex items-center justify-center rounded-[9px]',
    supportsImages
      ? 'bg-transparent text-muted-foreground/70'
      : 'bg-transparent text-muted-foreground/30 cursor-not-allowed',
    supportsImages && TRANSITION_CLASSES.button,
    supportsImages && 'hover:bg-lg-control-hover hover:text-foreground hover:scale-[1.08]',
    supportsImages && 'active:scale-95',
    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50'
  )}
>
  <Image className="h-4 w-4" aria-hidden="true" />
</button>
<TooltipContent>
  {supportsImages ? 'Attach image' : 'This model doesn\'t support images'}
</TooltipContent>
```

### 4. `apps/agent/src/components/chat/input/use-chat-input.ts` — Clear image chips on model switch

When the selected model changes to one that doesn't support images, automatically clear image items from `attachedContext`. **Gated by `activeBackend`** to prevent clearing Claude's images when OpenCode store has stale non-vision model selection.

```typescript
import { useOcSelectedModelSupportsImageInput } from '@/stores/opencode';

// Inside useChatInput() (activeBackend already available at line 44):
const ocSupportsImages = useOcSelectedModelSupportsImageInput();
const supportsImages = activeBackend === 'opencode' ? ocSupportsImages : true;

// Clear image chips when model switches to one without image support
useEffect(() => {
  if (!supportsImages) {
    setAttachedContext((prev) => prev.filter((item) => item.type !== 'image'));
  }
}, [supportsImages]);
```

### 5. `apps/agent/src/hooks/chat/use-oc-chat-adapter.ts` — Send-time guard (defensive backstop)

Strip images at the adapter boundary if the current model doesn't support them. This is OpenCode-only code (not shared), so no backend gate needed. Last-resort guard for race conditions:

```typescript
// In handleSend, before the send() call:
const modelSupportsImages =
  useOcProviderStore.getState().providers.find((p) => p.id === providerId)?.models[modelId ?? '']
    ?.supportsImageInput ?? true;

const safeImages = modelSupportsImages ? images : undefined;

void send(text, {
  agent,
  ...(providerId ? { providerId } : {}),
  ...(modelId ? { modelId } : {}),
  ...(variant ? { variant } : {}),
  ...(safeImages && safeImages.length > 0 ? { images: safeImages } : {}),
});
```

## Files Modified

| File                                                     | Change                                                                                                 |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `apps/agent/src/stores/opencode/oc-provider-store.ts`    | Add `supportsImageInput` to `OcProviderModel`, add `useOcSelectedModelSupportsImageInput` selector     |
| `apps/agent/src/services/opencode/oc-session-service.ts` | Add `modalities`+`attachment` to cast, derive `supportsImageInput` in mapping                          |
| `apps/agent/src/components/chat/input/InputControls.tsx` | Import selector, gate with `activeBackend`, conditionally disable both image buttons + update tooltips |
| `apps/agent/src/components/chat/input/use-chat-input.ts` | Import selector, gate with `activeBackend`, clear image chips on model switch via `useEffect`          |
| `apps/agent/src/hooks/chat/use-oc-chat-adapter.ts`       | Add send-time guard to strip images for unsupported models (OC-only, no gate needed)                   |

## Verification

1. `bun run typecheck` — no type errors
2. `bun run lint` — ESLint passes
3. `bunx tauri dev` — manual test:
   - **OpenCode + unsupported model**: Select Ollama non-vision model → image button disabled (dimmed), tooltip "This model doesn't support images"
   - **OpenCode + supported model**: Select Claude/GPT-4o → image button enabled, tooltip "Attach image"
   - **Model switching**: Switch between models → button toggles reactively
   - **Backend switching**: Switch from unsupported OC model to Claude backend → image button enabled (not poisoned by stale OC state)
   - **Chip cleanup**: Attach images on supported model, switch to unsupported → image chips auto-cleared
   - **Claude → OC → Claude**: Attach images on Claude, switch to OC (unsupported), switch back to Claude → images NOT cleared (gate prevents it)
   - **Race condition**: Rapidly switch model while clicking send → images safely stripped by adapter guard
