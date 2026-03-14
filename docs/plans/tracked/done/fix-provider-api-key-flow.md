# Fix: Provider API Key → Model Selection End-to-End Flow

## Context

When a user enters an API key for a provider in Settings, nothing visible happens — the provider still appears as needing setup, models don't show in the model picker, and chat doesn't work with the new provider. The root cause is in `ProvidersSettings.tsx`: the save handler silently swallows errors (no `.catch()`), provides no loading/success/error feedback, and has no model selection step after a successful connection. The downstream plumbing (OcModelSelector, OcProviderStore, use-oc-chat-adapter) is already correct — only the settings page needs changes.

**Goal:** Match the OpenCode TUI flow: enter API key → see confirmation → pick a model → ready to chat.

> **Note:** `setProviders()` in `oc-provider-store.ts` already auto-selects the first connected provider + default model when `loadProviders()` refreshes the store. Even without the inline model picker, chat works after connection. The inline picker is UX polish — making the selection visible and intentional so the user isn't confused about what happened.

---

## Files to Modify

- **`apps/agent/src/components/modals/settings/pages/ProvidersSettings.tsx`** — all logic and UI changes
- **`apps/agent/src/__tests__/unit/components/modals/providers-settings.test.tsx`** — new test file

### Reference Files (read-only)

- `apps/agent/src/stores/opencode/oc-provider-store.ts` — `setProviders()` auto-selection logic (lines 65-88)
- `apps/agent/src/services/opencode/oc-session-service.ts` — `setProviderApiKey()`, `loadProviders()`, `authorizeProvider()` — all use `throwOnError: true`
- `apps/agent/src/hooks/opencode/use-opencode-lifecycle.ts` — stale-generation guard pattern (lines 115-117, `startupGenerationRef` + `isStale()`)
- `apps/agent/src/components/modals/settings/components/AppIconPicker.tsx` — reference pattern for `toast.error()` and `createLogger` in settings
- `apps/agent/src/stores/ui/ui-store.ts` — `openSettings` / `setSettingsOpen` methods
- `eslint.config.ts:49-53` — `no-floating-promises: 'error'` + `no-misused-promises` with `checksVoidReturn.attributes: false`

---

## Implementation Steps

### Step 1: Add state, refs, and imports

Add state for loading, two error channels, just-connected tracking, and a stale-request guard ref:

```typescript
const [isSaving, setIsSaving] = useState(false);
const [isAuthorizing, setIsAuthorizing] = useState(false);
const [inlineError, setInlineError] = useState<string | null>(null);
const [bannerError, setBannerError] = useState<string | null>(null);
const [justConnectedId, setJustConnectedId] = useState<string | null>(null);
const authRequestRef = useRef(0);
```

**`isAuthorizing`** — true while `authorizeProvider()` is in flight (before the auth form appears). Used to disable auth-method pills so the user can't fire duplicate requests by clicking the same pill repeatedly. Cleared on success, error, or `dismissAuth()`.

**Two error channels** (resolves audit critical #1 — Step 7/Step 8 contradiction):

- `inlineError` — shown inside the active auth form, cleared by `dismissAuth()`
- `bannerError` — shown as a top-level dismissible banner, survives `dismissAuth()`, dismissed explicitly by user

**Stale-request ref** (resolves audit critical #2 — async race):
Same `generation + isStale()` pattern as `use-opencode-lifecycle.ts:115-117`.

Two operations on the ref:

- `beginAuthRequest()` — increments the counter and returns the new token. Called at the start of every async handler.
- `invalidateAuthRequest()` — increments the counter without returning a token. Called from any **synchronous** flow transition that should cause in-flight requests to be silently dropped (cancel, local-only branch).

```typescript
function beginAuthRequest(): number {
  authRequestRef.current += 1;
  return authRequestRef.current;
}

function invalidateAuthRequest(): void {
  authRequestRef.current += 1;
}

function isCurrentAuthRequest(id: number): boolean {
  return authRequestRef.current === id;
}
```

Add imports: `Loader2` from `lucide-react`, `createLogger` from `@orbit/common/lib`, `toast` from `sonner`, `useRef` from `react`.

### Step 2: Update `dismissAuth()` — clear inline error and invalidate pending requests

```typescript
function dismissAuth(): void {
  invalidateAuthRequest(); // kill any in-flight save/auth — prevents late state mutation
  setApiKey('');
  setOauthCode('');
  setAuthState(EMPTY_AUTH);
  setInlineError(null);
  setIsSaving(false);
  setIsAuthorizing(false);
  // NOTE: bannerError is NOT cleared here — it persists until user dismisses it
}
```

Calling `invalidateAuthRequest()` here is critical: if the user clicks Cancel while `setProviderApiKey` or `loadProviders` is mid-flight, the late completion will see `isCurrentAuthRequest(requestId) === false` and bail out instead of calling `dismissAuth()` / `setJustConnectedId()` on already-stale state.

### Step 3: Rewrite `handleSaveApiKey()` with split error handling and stale guard

Replace the current fire-and-forget `void promise.then(...)`:

```typescript
async function handleSaveApiKey(): Promise<void> {
  if (!authState.providerId || isSaving) return;
  const requestId = beginAuthRequest();
  const targetProviderId = authState.providerId;
  setIsSaving(true);
  setInlineError(null);
  setBannerError(null);

  // Phase 1: Save the API key
  try {
    await ocSessionService.setProviderApiKey(targetProviderId, apiKey.trim());
  } catch (error: unknown) {
    if (!isCurrentAuthRequest(requestId)) return;
    setInlineError(error instanceof Error ? error.message : 'Failed to save API key');
    logger.error('Failed to save provider API key', { providerId: targetProviderId, error });
    setIsSaving(false);
    return;
  }

  // Phase 2: Key saved — refresh provider list
  try {
    await ocSessionService.loadProviders();
    if (!isCurrentAuthRequest(requestId)) return;
    dismissAuth();
    setJustConnectedId(targetProviderId);
  } catch (error: unknown) {
    if (!isCurrentAuthRequest(requestId)) return;
    dismissAuth();
    setBannerError('API key saved, but failed to refresh providers. Please reopen settings.');
    logger.error('Failed to refresh providers after key save', {
      providerId: targetProviderId,
      error,
    });
  } finally {
    if (isCurrentAuthRequest(requestId)) {
      setIsSaving(false);
    }
  }
}
```

Key changes vs. original: `await` instead of fire-and-forget, split `try/catch` with distinct error messages, stale-request guard, loading guard, capture `targetProviderId` at top to avoid stale closure.

> **Input trimming:** Trim `apiKey` before sending: `apiKey.trim()`. Leading/trailing whitespace from paste is a common source of "invalid key" errors. Apply the same to `oauthCode.trim()` in `handleSubmitOauth`.

### Step 4: Rewrite `handleAuthMethod()` — wrap `authorizeProvider` in try/catch with stale guard

The current `void ocSessionService.authorizeProvider(...)` is fire-and-forget with no error handling (same class of bug as `handleSaveApiKey`):

```typescript
async function handleAuthMethod(
  providerId: string,
  method: OcProviderAuthMethod,
  index: number
): Promise<void> {
  // Invalidate any in-flight request from a previous provider flow BEFORE branching.
  // This covers: user was saving A, clicks B's API-key pill → A's late completion is dropped.
  // Also reset isSaving so B's form doesn't inherit A's stale loading state.
  invalidateAuthRequest();
  setIsSaving(false);
  setIsAuthorizing(false);
  setJustConnectedId(null);
  setInlineError(null);
  setBannerError(null);

  if (method.type === 'api') {
    // Local-only state change — no async work, but invalidateAuthRequest() above
    // already killed any pending request from a previous flow.
    setAuthState({ providerId, methodIndex: index, mode: 'api', instructions: null, url: null });
    return;
  }

  const requestId = beginAuthRequest();
  setIsAuthorizing(true); // disable pills while authorizeProvider() is in flight

  try {
    const auth = await ocSessionService.authorizeProvider(providerId, index);
    if (!isCurrentAuthRequest(requestId)) return;
    setIsAuthorizing(false);

    setAuthState({
      providerId,
      methodIndex: index,
      mode: auth.method === 'code' ? 'oauth-code' : 'oauth-auto',
      instructions: auth.instructions,
      url: auth.url,
    });

    if (auth.method === 'auto') {
      void open(auth.url).catch(() => {
        // Leave the inline URL visible if the browser launch fails.
      });
      try {
        await ocSessionService.completeProviderAuthorization(providerId, index);
        await ocSessionService.loadProviders();
        if (!isCurrentAuthRequest(requestId)) return;
        dismissAuth();
        setJustConnectedId(providerId);
      } catch (error: unknown) {
        if (!isCurrentAuthRequest(requestId)) return;
        const message = error instanceof Error ? error.message : 'OAuth authorization failed';
        dismissAuth();
        setBannerError(message);
        logger.error('OAuth auto-flow failed', { providerId, error });
      }
    }
  } catch (error: unknown) {
    if (!isCurrentAuthRequest(requestId)) return;
    setIsAuthorizing(false);
    const message = error instanceof Error ? error.message : 'Failed to start authorization';
    setBannerError(message);
    logger.error('Failed to authorize provider', { providerId, error });
  }
}
```

### Step 5: Apply same fix to `handleSubmitOauth()`

Same async/try/catch pattern with stale guard. Capture `targetProviderId`/`targetMethodIndex` at top:

```typescript
async function handleSubmitOauth(): Promise<void> {
  if (!authState.providerId || authState.methodIndex === null || isSaving) return;
  const requestId = beginAuthRequest();
  const targetProviderId = authState.providerId;
  const targetMethodIndex = authState.methodIndex;
  setIsSaving(true);
  setInlineError(null);
  setBannerError(null);

  try {
    await ocSessionService.completeProviderAuthorization(
      targetProviderId,
      targetMethodIndex,
      oauthCode.trim()
    );
    await ocSessionService.loadProviders();
    if (!isCurrentAuthRequest(requestId)) return;
    dismissAuth();
    setJustConnectedId(targetProviderId);
  } catch (error: unknown) {
    if (!isCurrentAuthRequest(requestId)) return;
    const message = error instanceof Error ? error.message : 'Failed to complete authorization';
    setInlineError(message);
    logger.error('Failed to complete OAuth', { providerId: targetProviderId, error });
  } finally {
    if (isCurrentAuthRequest(requestId)) {
      setIsSaving(false);
    }
  }
}
```

### Step 6: Update `renderAuthFlow()` for loading/error states

Pass `isSaving` and `inlineError` as additional params to `renderAuthFlow()`.

**Promise handling** (resolves audit critical #3): ESLint config has `checksVoidReturn.attributes: false`, so `onClick={handleSaveApiKey}` is lint-safe for async functions. But `onKeyDown` is an inline arrow function, so calls inside it need `void`:

```tsx
// onKeyDown in API key input — needs void
onKeyDown={(event) => {
  if (event.key === 'Enter' && apiKey.trim().length > 0 && !isSaving) {
    event.preventDefault();
    void handleSaveApiKey();
  }
  if (event.key === 'Escape') dismissAuth();
}}

// onClick on Save button — async attribute is lint-safe per checksVoidReturn.attributes: false
onClick={handleSaveApiKey}
```

UI changes:

- **Auth-method pills**: add `|| isAuthorizing` to the existing `disabled={!opencodeHealthy}` condition on all auth-method pill buttons. This prevents duplicate clicks on any pill while `authorizeProvider()` is in flight (the brief window before a form appears). **Do NOT add `isSaving` to pill disable** — the user must be able to click a different provider's pill during a pending save to abandon it and switch. The stale-request guard (`invalidateAuthRequest()` at the top of `handleAuthMethod`) handles the late completion safely. `isSaving` only disables the active form's Save/Submit button.
- **Save/Submit button**: `disabled={isSaving || apiKey.trim().length === 0}`, show `Loader2` spinner + "Saving..." text when `isSaving`
- **Inline error**: below button row in both `api` and `oauth-code` modes:

```tsx
{
  inlineError !== null ? (
    <p className="text-[11px] text-destructive leading-relaxed">{inlineError}</p>
  ) : null;
}
```

- **`oauth-auto` mode**: show a manual "Open browser" fallback link (for when `open(auth.url)` silently fails) plus Cancel. The existing code at `ProvidersSettings.tsx:130-137` only renders a pulsing dot and "Waiting..." text with no fallback — if the shell `open` call fails, the user is stuck. The new rendering must show the URL so the user can open it manually:

```tsx
if (authState.mode === 'oauth-auto') {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-primary" />
        <span className="text-[11px] text-muted-foreground">Waiting for provider callback…</span>
        <button
          type="button"
          onClick={dismissAuth}
          className="ml-auto text-[11px] text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
      {/* Manual fallback — visible if shell open fails or browser doesn't launch */}
      {authState.url !== null ? (
        <button
          type="button"
          onClick={() => {
            if (authState.url) void open(authState.url);
          }}
          className="inline-flex items-center gap-1.5 rounded-full bg-control-fill px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-control-fill-hover hover:text-foreground active:scale-[0.97]"
        >
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
          Open browser manually
        </button>
      ) : null}
      {authState.instructions !== null ? (
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {authState.instructions}
        </p>
      ) : null}
    </div>
  );
}
```

This matches the existing `oauth-code` mode pattern (lines 84-95 in the current file) which already renders an "Open browser" button when `authState.url` is set.

### Step 7: Add dismissible banner for post-auth errors

At the top of the providers section (above "Connected" / "Available" lists), show `bannerError` when set:

```tsx
{
  bannerError !== null ? (
    <div className="mb-4 flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5">
      <p className="flex-1 text-[11px] text-destructive leading-relaxed">{bannerError}</p>
      <button
        type="button"
        onClick={() => {
          setBannerError(null);
        }}
        className="shrink-0 text-[11px] text-destructive/70 hover:text-destructive"
        aria-label="Dismiss error"
      >
        Dismiss
      </button>
    </div>
  ) : null;
}
```

This survives `dismissAuth()` because `dismissAuth` only clears `inlineError`, not `bannerError`. The banner is explicitly dismissed by the user, or cleared at the start of any new auth request.

### Step 8: Add inline model picker for just-connected provider

After a successful save, `justConnectedId` is set. The provider now appears in the "Connected" section (because `loadProviders()` refreshed the store). Below that provider's row, render an inline model picker.

**Guard:** Only show picker if the provider is actually in `connectedProviders` — validates the key was accepted, not just saved:

```typescript
const isJustConnected = justConnectedId === provider.id && connectedProviders.includes(provider.id);
```

**0-model edge case:** If provider has no models, show "No models available" with a Dismiss button.

**Model display names:** Use `model.name` (not `model.id`) for consistency with `OcModelSelector.tsx`.

**Overflow:** Cap list height at ~200px with `overflow-y-auto` for providers with many models.

When user clicks a model:

1. `useOcProviderStore.getState().setSelectedProviderId(providerId)` — set active provider (this auto-selects a default model via store line 93-102)
2. `useOcProviderStore.getState().setSelectedModelId(modelId)` — override with user's explicit choice
3. `setJustConnectedId(null)` — dismiss the inline picker
4. `toast.success(\`Ready to chat with ${modelName}\`)` — confirm selection; do NOT auto-close settings

Extract the picker rendering into a small private helper inside the file for readability (audit recommended #2).

### Step 9: Add component tests (resolves audit critical #4)

New file: `apps/agent/src/__tests__/unit/components/modals/providers-settings.test.tsx`

Coverage targets:

1. **API key save success**: save → loading spinner → provider moves to connected → model picker appears
2. **API key save failure**: save → inline error below form → user can correct and retry
3. **Save success + refresh failure**: key saved but `loadProviders` rejects → banner error shown after auth dismisses
4. **OAuth auto failure**: authorize resolves → callback rejects → banner error shown (not stuck on "Waiting...")
5. **Stale request — cancel while pending**: start save for A → click Cancel → A completes late → no state mutation (no picker, no error)
6. **Stale request — switch provider while pending**: start save for A → click B's API-key pill → A completes late → ignored; B's form is active
7. **Inline model selection**: click model in picker → store `selectedProviderId` + `selectedModelId` updated → picker dismissed → toast shown
8. **0-model edge case**: connected provider with empty models object → "No models available" text with Dismiss
9. **Whitespace trimming**: pasted key with leading/trailing spaces → trimmed before save
10. **OAuth auto-flow browser fallback**: `open(url)` rejects → "Open browser manually" button is visible alongside "Waiting for callback..."
11. **Repeated pill click**: click OAuth pill while `authorizeProvider` is in flight → pill is disabled, no duplicate request

Mock `ocSessionService` methods. Use `@testing-library/react` + `userEvent`. Follow existing pattern from `apps/agent/src/__tests__/unit/components/modals/settings-page.test.tsx`.

---

## What NOT to Change

- **`oc-provider-store.ts`** — `setProviders()` auto-selection already works correctly
- **`oc-session-service.ts`** — service methods already propagate errors via `throwOnError`
- **`OcModelSelector.tsx`** — already reads from store correctly
- **`OcProviderDialog.tsx`** — continues working as quick provider switcher
- **`InputControls.tsx`** — already renders OcModelSelector for opencode backend
- **`use-oc-chat-adapter.ts`** — already passes provider/model to sendMessage

---

## Verification

### Manual Testing

1. `bunx tauri dev` — start the full app
2. Switch to OpenCode backend in Settings
3. Go to Providers settings page
4. Click "API key" on an unconnected provider (e.g., Anthropic)
5. Enter a valid API key → click Save
6. **Verify**: loading spinner appears on Save button, button disabled
7. **Verify**: after save, provider moves from "Available" to "Connected" section
8. **Verify**: inline model picker appears below the provider with model display names
9. Click a model → **Verify**: picker dismisses, toast confirms selection, model selector in chat input shows the selected model
10. Send a message → **Verify**: chat works with the selected provider/model

### Error Path Testing

11. Enter an invalid API key or disconnect network → click Save
12. **Verify**: inline error appears below the Save button in red text
13. **Verify**: user can correct the key and retry
14. Start an OAuth auto-flow → disconnect network mid-flow
15. **Verify**: banner error appears at top, user is not stuck on "Waiting for callback..."
16. **Verify**: banner has a Dismiss button that clears it

### Stale Request Testing

17. Click Save on provider A → immediately click provider B's auth button before A completes
18. **Verify**: provider A's completion is silently ignored, no ghost model picker appears for A
19. **Verify**: provider B's auth flow opens cleanly
20. Click Save on provider A → click Cancel before save completes → **Verify**: late completion is silently dropped, no picker or error appears
21. Start OAuth auto-flow on provider A → click provider B's API key pill → **Verify**: A's pending callback is invalidated, B's API key form opens cleanly

### OAuth Flow Testing

22. Click an OAuth method on an unconnected provider
23. **Verify**: if `authorizeProvider` fails, banner error appears immediately (not silently swallowed)
24. Complete an OAuth code flow → **Verify**: same connection + model picker behavior as API key flow
25. Start OAuth auto-flow → **Verify**: "Waiting for provider callback..." shows with "Open browser manually" button and Cancel
26. Click the same OAuth pill rapidly → **Verify**: pills are disabled after first click, no duplicate `authorizeProvider` calls

### Edge Case Testing

27. Save valid key → provider appears connected but has 0 models → **Verify**: picker shows "No models available" with Dismiss
28. Double-click Save rapidly → **Verify**: only one request fires (button disabled during `isSaving`)
29. Re-authenticate a connected provider → **Verify**: just-connected picker does not override user's existing non-default model selection until they explicitly click a model
30. Paste an API key with leading/trailing whitespace → **Verify**: key is trimmed, save succeeds
31. Check both light and dark themes for banner + picker rendering
32. Resize settings panel narrow → **Verify**: model picker scrolls, names truncate gracefully

### Automated

33. `bun run typecheck` — no type errors
34. `bun run lint` — no lint warnings (verify `void` in onKeyDown, async onClick passes)
35. `bun run test` — existing tests + new `providers-settings.test.tsx` pass
