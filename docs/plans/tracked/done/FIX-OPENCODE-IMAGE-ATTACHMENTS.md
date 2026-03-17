# Fix: Image Attachments Not Sent to OpenCode Backend

## Context

When users attach images in the chat input while using the OpenCode backend, the images are collected and displayed as chips in the UI but **silently dropped** before being transmitted to the server. The OpenCode backend already fully supports image attachments via `FilePart` in the prompt `parts` array — the CLI/TUI uses this successfully. The break is purely in the frontend adapter wiring.

**Root cause:** The adapter layer (`use-oc-chat-adapter.ts` → `use-oc-chat.ts` → `oc-session-service.ts`) only forwards the `text` parameter from `onSend`. The `images` parameter is accepted at the type level but never read or forwarded. TypeScript doesn't warn because callback parameter bivariance allows a function accepting fewer parameters to be assigned to a type expecting more.

## Changes

### 1. `packages/orbit-sdk/src/v2/client.d.ts` — Widen SDK overlay types

**What:** The frontend SDK overlay hard-codes `promptAsync.parts` as text-only (`Array<{ type: 'text'; text: string }>`). The upstream SDK supports `FilePartInput` but this overlay doesn't export it. Must fix the overlay before app code can compile.

- Add `FilePartInput` interface (matching upstream `Agent-backend/packages/sdk/js/src/v2/gen/types.gen.ts:1733`):

  ```typescript
  export interface FilePartInput {
    id?: string;
    type: 'file';
    mime: string;
    filename?: string;
    url: string;
    source?: FilePartSource;
  }
  ```

- Widen `promptAsync.parts` at line 737 from:
  ```typescript
  parts: Array<{ type: 'text'; text: string }>;
  ```
  to:
  ```typescript
  parts: Array<{ type: 'text'; text: string } | FilePartInput>;
  ```

### 2. `apps/agent/src/services/opencode/oc-session-service.ts`

**What:** Extend `OcSendMessageOptions` and `sendMessage()` to support image attachments.

- Import `ImageAttachment` and `FilePartInput`:

  ```typescript
  import type { ImageAttachment } from '@/components/chat/input/types';
  import type {
    FilePartInput,
    ProviderListResponses,
    SessionMessagesResponses,
  } from '@orbit.build/sdk/v2/client';
  ```

- Add `images` field to `OcSendMessageOptions`:

  ```typescript
  export interface OcSendMessageOptions {
    readonly providerId?: string;
    readonly modelId?: string;
    readonly agent?: string;
    readonly variant?: string;
    readonly images?: readonly ImageAttachment[];
  }
  ```

- In `sendMessage()`, convert `ImageAttachment[]` to `FilePartInput[]` and spread into the `parts` array. Omit `as const` on type literals to match existing style (line 152 doesn't use it):

  ```typescript
  const fileParts: FilePartInput[] = (options?.images ?? []).map((image) => ({
    type: 'file',
    mime: image.mimeType,
    filename: image.name,
    url: `data:${image.mimeType};base64,${image.data}`,
  }));

  await getClient().session.promptAsync(
    {
      sessionID: sessionId,
      ...(options?.agent ? { agent: options.agent } : {}),
      ...(model ? { model } : {}),
      ...(options?.variant ? { variant: options.variant } : {}),
      parts: [{ type: 'text', text }, ...fileParts],
    },
    { throwOnError: true }
  );
  ```

- Add `imageCount` to the existing logger call for observability:
  ```typescript
  logger.info('Sending message', {
    sessionId,
    hasModel: Boolean(options?.providerId && options.modelId),
    agent: options?.agent,
    variant: options?.variant,
    imageCount: (options?.images ?? []).length,
  });
  ```

**Mapping:** `ImageAttachment` → SDK `FilePartInput`:
| Frontend (`ImageAttachment`) | SDK (`FilePartInput`) |
|------------------------------|----------------------|
| — | `type: "file"` |
| `mimeType` | `mime` |
| `name` | `filename` |
| `data` (base64 string) | `url` = `data:${mime};base64,${data}` |

### 3. `apps/agent/src/hooks/chat/use-oc-chat.ts`

**Verified: no changes required.** The `handleSend` signature already accepts `OcSendMessageOptions` and passes it through to `ocSessionService.sendMessage()`. After step 2 adds `images` to `OcSendMessageOptions`, the type propagates automatically.

### 4. `apps/agent/src/hooks/chat/use-oc-chat-adapter.ts`

**What:** Wire the `images` parameter from `onSend` through to the `send()` call.

- Add import:

  ```typescript
  import type { ImageAttachment } from '@/components/chat/input/types';
  ```

- Update the return type interface `UseOcChatAdapterResult.handleSend` (line 541) — change `images?: unknown[]` to `images?: ImageAttachment[]`.

- Change `handleSend` (line 674) to accept and forward images:

  ```typescript
  const handleSend = useCallback(
    (text: string, _contextFiles?: string[], images?: ImageAttachment[]): void => {
      // ... existing /compact handling unchanged ...

      void send(text, {
        agent,
        ...(providerId ? { providerId } : {}),
        ...(modelId ? { modelId } : {}),
        ...(variant ? { variant } : {}),
        ...(images && images.length > 0 ? { images } : {}),
      });
    },
    [agent, modelId, providerId, send, sessionId, variant]
  );
  ```

### 5. Tests

**a) Adapter forwarding test** — `apps/agent/src/__tests__/unit/hooks/chat/use-oc-chat-adapter.test.ts`

Regression test verifying images are forwarded through `handleSend`:

```typescript
it('forwards images to send() when provided', () => {
  const images = [{ name: 'test.png', mimeType: 'image/png', data: 'abc', previewUrl: '' }];
  result.current.handleSend('describe this', undefined, images);
  expect(mockSend).toHaveBeenCalledWith('describe this', expect.objectContaining({ images }));
});
```

**b) Service payload test** — `apps/agent/src/__tests__/unit/services/opencode/oc-session-service.test.ts` (new file)

Focused test asserting the exact `promptAsync()` body including multi-image ordering:

```typescript
it('builds correct promptAsync payload with images', async () => {
  const mockPromptAsync = vi.fn().mockResolvedValue({ data: true });
  // ... mock getClient to return mockPromptAsync ...

  await ocSessionService.sendMessage('session-1', 'describe these', {
    images: [
      { name: 'a.png', mimeType: 'image/png', data: 'base64a', previewUrl: '' },
      { name: 'b.jpg', mimeType: 'image/jpeg', data: 'base64b', previewUrl: '' },
    ],
  });

  expect(mockPromptAsync).toHaveBeenCalledWith(
    expect.objectContaining({
      parts: [
        { type: 'text', text: 'describe these' },
        {
          type: 'file',
          mime: 'image/png',
          filename: 'a.png',
          url: 'data:image/png;base64,base64a',
        },
        {
          type: 'file',
          mime: 'image/jpeg',
          filename: 'b.jpg',
          url: 'data:image/jpeg;base64,base64b',
        },
      ],
    }),
    expect.anything()
  );
});
```

## Files Modified

| File                                                                         | Change                                                                                                                                        |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/orbit-sdk/src/v2/client.d.ts`                                      | Add `FilePartInput` interface, widen `promptAsync.parts` union                                                                                |
| `apps/agent/src/services/opencode/oc-session-service.ts`                     | Add `images` to options, build `FilePartInput[]`, spread into `parts`, add `imageCount` logging                                               |
| `apps/agent/src/hooks/chat/use-oc-chat-adapter.ts`                           | Import `ImageAttachment`, accept `images` param in `handleSend`, forward to `send()`, fix return type from `unknown[]` to `ImageAttachment[]` |
| `apps/agent/src/__tests__/unit/hooks/chat/use-oc-chat-adapter.test.ts`       | Add adapter image forwarding regression test                                                                                                  |
| `apps/agent/src/__tests__/unit/services/opencode/oc-session-service.test.ts` | New: test `promptAsync` payload construction with images                                                                                      |

## Known Edge Cases (Out of Scope)

These are pre-existing issues not introduced by this fix. Documented for future work:

| Edge Case                     | Details                                                                                                                                                                 |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Image-only send**           | `use-chat-input.ts:143` returns early on empty text (`if (!text) return`). Users must type something to send images. Same limitation exists in the Claude backend.      |
| **File/folder context chips** | `contextFiles` parameter in `onSend` is also silently dropped by the OC adapter. Not in scope — images are the user-reported issue.                                     |
| **Browser element context**   | `elements` parameter in `onSend` is also silently dropped. Same — separate feature gap.                                                                                 |
| **Round-trip rendering**      | After reload, images display as `Referenced: {filename}` text, not thumbnails. `adaptParts` line 295-298 handles `case 'file'` as plain text. UX improvement for later. |

## Verification

1. **TypeScript check:** `bun run typecheck` — ensure no type errors (especially the SDK overlay)
2. **Lint:** `bun run lint` — ensure ESLint passes
3. **All tests:** `bun run test` — ensure all adapter + new service tests pass
4. **Manual test with `bunx tauri dev`:**
   - Switch to OpenCode backend
   - Attach an image in chat input
   - Send a message asking about the image
   - Verify the agent acknowledges and describes the image content
   - Test with multiple images to verify ordering
