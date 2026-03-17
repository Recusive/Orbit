# Fix: Image Button Enabled for All Models (Type Mismatch)

## Context

The `DISABLE-IMAGE-BUTTON-UNSUPPORTED-MODELS` plan was implemented but doesn't work — the image button stays enabled for **all** OpenCode models, including those without vision support. The root cause is a **schema-data divergence**: the frontend reads model capabilities from the wrong location in the API response.

**The bug chain:**

1. Backend API route (`server/routes/provider.ts:53-54`) transforms `ModelsDev.Provider` → `Provider.Info` via `fromModelsDevProvider()`. The response contains `model.capabilities.input.image: boolean` (nested).
2. The OpenAPI schema still declares `ModelsDev.Provider.array()` (line 29), so the auto-generated SDK types show flat fields: `model.attachment`, `model.modalities?.input[]`.
3. The frontend compiles against a **local SDK overlay** at `packages/orbit-sdk/src/v2/client.d.ts` (mapped via `tsconfig.json:47-49`), which also declares the flat shape. Backend SDK regeneration alone does NOT fix frontend types.
4. Frontend's `mapProviders()` casts `provider.models` using the flat shape — but at runtime, the data is nested under `capabilities`.
5. `model.modalities` → `undefined`, `model.attachment` → `undefined` → `supportsImageInput: undefined`
6. Selector: `model.supportsImageInput ?? true` → **always `true`**

**Note:** The `reasoning` field suffers from the same bug — `model.reasoning` reads as `undefined` (actual: `model.capabilities.reasoning`). The fix below addresses both fields.

## Changes

### 1. `packages/orbit-sdk/src/v2/client.d.ts` — Update frontend SDK overlay to match actual response shape

Update the `ProviderListResponses` interface (lines 635-685) to match the nested `Provider.Info` response the backend actually sends:

```typescript
export interface ProviderListResponses {
  200: {
    all: Array<{
      id: string;
      name: string;
      env: string[];
      source?: 'env' | 'config' | 'custom' | 'api';
      options?: Record<string, unknown>;
      models: Record<
        string,
        {
          id: string;
          name: string;
          capabilities: {
            temperature: boolean;
            reasoning: boolean;
            attachment: boolean;
            toolcall: boolean;
            input: { text: boolean; audio: boolean; image: boolean; video: boolean; pdf: boolean };
            output: { text: boolean; audio: boolean; image: boolean; video: boolean; pdf: boolean };
            interleaved: boolean | { field: 'reasoning_content' | 'reasoning_details' };
          };
          limit: { context: number; input?: number; output: number };
          variants?: Record<string, Record<string, unknown>>;
        }
      >;
    }>;
    default: Record<string, string>;
    connected: string[];
  };
}
```

This is the **primary type source** the frontend compiles against.

### 2. `Agent-backend/packages/opencode/src/server/routes/provider.ts` — Fix OpenAPI schema

Update the response schema at line 29 from `ModelsDev.Provider.array()` to `Provider.Info.array()` so the OpenAPI spec matches the actual response. Then regenerate:

```bash
cd Agent-backend && ./script/generate.ts
```

This keeps the backend schema honest and ensures the generated SDK also has correct types.

### 3. `apps/agent/src/services/opencode/oc-session-service.ts` — Fix the cast to match actual response shape

Remove the inline `as Record<...>` cast (lines 44-58) and read from the nested `capabilities` structure. After step 1, the SDK overlay type will be correct, so the cast can be simplified or removed.

Update the `.map` callback (lines 61-70) to read from nested fields:

```typescript
{
  id: model.id,
  name: model.name,
  ...(model.capabilities?.reasoning ? { reasoning: true } : {}),
  supportsImageInput: model.capabilities?.input?.image ?? model.capabilities?.attachment ?? false,
  ...(model.variants ? { variants: model.variants } : {}),
  ...(model.limit ? { limit: model.limit } : {}),
}
```

**Priority chain:** `capabilities.input.image` (precise) → `capabilities.attachment` (coarse fallback) → `false` (safe default).

### 4. `apps/agent/src/stores/opencode/oc-provider-store.ts` — Centralize resolver, make `supportsImageInput` required, fix default

**a)** Make `supportsImageInput` a required boolean in `OcProviderModel` (line 10):

```typescript
readonly supportsImageInput: boolean;  // was: optional
```

This eliminates `?? true`/`?? false` ambiguity across consumers since `mapProviders()` now always sets a definitive value.

**b)** Extract a shared resolver function so the selector and send-time guard use identical logic:

```typescript
export function resolveOcModelSupportsImageInput(state: {
  selectedProviderId: string | null;
  selectedModelId: string | null;
  providers: OcProviderInfo[];
}): boolean {
  if (state.selectedProviderId === null || state.selectedModelId === null) {
    return true; // Boot state — assume supported until providers load
  }
  const provider = state.providers.find((p) => p.id === state.selectedProviderId);
  const model = provider?.models[state.selectedModelId];
  return model?.supportsImageInput ?? false; // Conservative: unknown model = no images
}

export const useOcSelectedModelSupportsImageInput = (): boolean =>
  useOcProviderStore((state) => resolveOcModelSupportsImageInput(state));
```

### 5. `apps/agent/src/hooks/chat/use-oc-chat-adapter.ts` — Use shared resolver for send-time guard

Replace the inline lookup at lines 725-728 with the centralized resolver:

```typescript
import { resolveOcModelSupportsImageInput } from '@/stores/opencode';

// In handleSend:
const modelSupportsImages = resolveOcModelSupportsImageInput(useOcProviderStore.getState());
const safeImages = modelSupportsImages ? images : undefined;
```

This ensures UI and send-time behavior agree during partial-load / lookup-miss states.

### 6. Update existing tests

**a)** `apps/agent/src/__tests__/unit/services/opencode/oc-session-service.test.ts` — This is the **only** test that needs `capabilities` fixtures. Update the existing test (lines 94-159) to use nested `capabilities` response shape instead of flat fields. Add assertions for:

- `capabilities.input.image: true` → `supportsImageInput: true`
- `capabilities.input.image: false` → `supportsImageInput: false`
- Missing `capabilities` entirely → `supportsImageInput: false` (safe default) — test via an `as unknown` cast to simulate malformed backend response without weakening the main typed fixtures
- `capabilities.reasoning: true` → `reasoning: true` (explicit assertion, prevents silent regression)
- Mixed catalog-backed and connected/config-backed provider in same response (both synthesize nested `capabilities` via `provider.ts:915-923` and `provider.ts:1048-1071`)

**b)** Downstream store/UI fixture updates — making `supportsImageInput` required will cause typecheck failures in every direct `OcProviderModel` fixture that omits the field. Add `supportsImageInput: true` (or `false` where the test needs an unsupported model) to all of these:

- `use-oc-chat-adapter.test.ts:88-109` (beforeEach store seed)
- `use-oc-chat-adapter.test.ts:510` (second fixture block)
- `use-oc-chat-adapter-compact.test.ts:69` (compact mode fixture)
- `input-mode.test.tsx:162` (general InputControls fixture — the image-gating fixture at line 521 already has it)
- `providers-settings.test.tsx:75` (`createProvider()` helper — fix here propagates to all tests that call it)
- `use-chat-input-file-chip.test.tsx` — already has `supportsImageInput`, no change needed

Run `bun run typecheck` after making `supportsImageInput` required to catch any additional fixtures not listed here.

## Files Modified

| File                                                                                    | Change                                                                         |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `packages/orbit-sdk/src/v2/client.d.ts`                                                 | Update `ProviderListResponses` to nested `capabilities` shape                  |
| `Agent-backend/packages/opencode/src/server/routes/provider.ts`                         | Fix OpenAPI schema: `ModelsDev.Provider.array()` → `Provider.Info.array()`     |
| `Agent-backend/packages/sdk/`                                                           | Regenerate SDK types via `./script/generate.ts`                                |
| `apps/agent/src/services/opencode/oc-session-service.ts`                                | Fix cast + derivation to read `capabilities.input.image`                       |
| `apps/agent/src/stores/opencode/oc-provider-store.ts`                                   | Make `supportsImageInput` required, extract `resolveOcModelSupportsImageInput` |
| `apps/agent/src/hooks/chat/use-oc-chat-adapter.ts`                                      | Use shared resolver for send-time guard                                        |
| `apps/agent/src/__tests__/unit/services/opencode/oc-session-service.test.ts`            | Update fixtures to nested `capabilities` shape                                 |
| `apps/agent/src/__tests__/unit/hooks/chat/use-oc-chat-adapter.test.ts`                  | Add `supportsImageInput: true` to store fixtures (lines 88, 510)               |
| `apps/agent/src/__tests__/unit/hooks/chat/use-oc-chat-adapter-compact.test.ts`          | Add `supportsImageInput: true` to store fixture (line 69)                      |
| `apps/agent/src/__tests__/unit/components/chat/input/input-mode.test.tsx`               | Add `supportsImageInput: true` to general fixture (line 162)                   |
| `apps/agent/src/__tests__/unit/components/modals/providers-settings.test.tsx`           | Add `supportsImageInput: true` to `createProvider()` helper (line 75)          |
| `apps/agent/src/__tests__/unit/components/chat/input/use-chat-input-file-chip.test.tsx` | No change needed (already has `supportsImageInput`)                            |

## Files NOT Modified (no changes needed)

- `InputControls.tsx` — already correctly consumes `supportsImages` boolean
- `use-chat-input.ts` — already correctly clears image chips

## Verification

1. `bun run typecheck` — no type errors (overlay types match runtime data)
2. `bun run lint` — ESLint passes
3. `bun run test` — all updated tests pass with nested `capabilities` fixtures
4. `bunx tauri dev` — manual test:
   - Select an OpenCode model **without** image support (e.g., Ollama text model) → image button should be **disabled** (dimmed, cursor-not-allowed), tooltip "This model doesn't support images"
   - Select an OpenCode model **with** image support (e.g., Claude, GPT-4o) → image button should be **enabled**
   - Switch between models → button toggles reactively
   - Switch to Claude backend → image button always enabled (not affected by OpenCode state)
   - Rapidly switch model while clicking send → images safely stripped by shared resolver
