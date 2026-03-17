# Fix: Provider Not Showing Connected After API Key Save

## Context

After saving a provider API key in Settings, the UI shows no feedback — the provider stays in "Available" instead of moving to "Connected". The user must restart the app for it to take effect. The previous plan (`fix-provider-api-key-flow.md`) added proper loading/error states to the frontend, but the root cause is in the **OpenCode backend**: `Provider.list()` returns stale data because the provider state is permanently cached via `Instance.state()`.

**Root cause chain:**

1. `PUT /auth/:providerID` → `Auth.set()` writes the API key to `auth.json` on disk ✓
2. Frontend calls `loadProviders()` → `GET /provider` → `Provider.list()` → `state().then(s => s.providers)` ✗
3. `state()` returns the **cached** result from `Instance.state()`, which read `Auth.all()` once at initialization (provider.ts:963)
4. The `State.create()` cache (state.ts:24-25) never invalidates — `const exists = entries.get(init); if (exists) return exists.state`
5. On restart, `Instance.state()` re-runs `init()`, reads fresh `auth.json`, and the provider appears connected

**Why the frontend plan didn't fix it:** The frontend code is correct — `handleSaveApiKey()` awaits `setProviderApiKey()`, then calls `loadProviders()`. But `loadProviders()` calls the backend's `GET /provider`, which returns stale cached data because `Provider.list()` uses `Instance.state()`.

**All auth mutation paths that need invalidation:**

| Path              | Caller                     | Location                 |
| ----------------- | -------------------------- | ------------------------ |
| REST API key save | `PUT /auth/:providerID`    | server.ts:158-163        |
| REST auth removal | `DELETE /auth/:providerID` | server.ts:189-193        |
| OAuth callback    | `ProviderAuth.callback()`  | provider/auth.ts:80-123  |
| Plugin API key    | `ProviderAuth.api()`       | provider/auth.ts:126-137 |

---

## Fix: Add `.reset()` to `State.create()` and invalidate after ALL auth mutations

### Step 1: Add `.reset()` to `State.create()` return value

**File:** `Agent-backend/packages/opencode/src/project/state.ts`

The function returned by `State.create()` currently has type `() => S`. Add a `.reset()` method that removes this specific `init` function's cached result from ALL directory-keyed caches. Clean up empty map buckets to avoid dead entries:

```typescript
export function create<S>(
  root: () => string,
  init: () => S,
  dispose?: (state: Awaited<S>) => Promise<void>
): (() => S) & { reset(): void } {
  const fn = (): S => {
    const key = root();
    let entries = recordsByKey.get(key);
    if (!entries) {
      entries = new Map<string, Entry>();
      recordsByKey.set(key, entries);
    }
    const exists = entries.get(init);
    if (exists) return exists.state as S;
    const state = init();
    entries.set(init, {
      state,
      dispose: dispose as ((state: unknown) => Promise<void>) | undefined,
    });
    return state;
  };
  fn.reset = (): void => {
    for (const [key, entries] of recordsByKey) {
      entries.delete(init);
      if (entries.size === 0) {
        recordsByKey.delete(key);
      }
    }
  };
  return fn;
}
```

**Semantics note:** `.reset()` is for cache invalidation only, not resource disposal. States with `dispose` callbacks should use `State.dispose()` for cleanup. The provider state has no dispose callback, so simple deletion is safe.

**Why reset clears ALL directory keys:** The REST auth endpoints (`PUT/DELETE /auth/:providerID`) run outside instance context (before the instance middleware at server.ts:195). We don't know which instance directory the next `GET /provider` request will use. Clearing all is safe — the `init()` function re-runs on next access. In-flight `Provider.list()` calls that already hold a resolved promise are unaffected; only subsequent calls get fresh data.

### Step 2: Update `Instance.state()` return type

**File:** `Agent-backend/packages/opencode/src/project/instance.ts`

Change the return type to propagate `.reset()`:

```typescript
// Line 110-112, change:
state<S>(init: () => S, dispose?: (state: Awaited<S>) => Promise<void>): (() => S) & { reset(): void } {
  return State.create(() => Instance.directory, init, dispose)
}
```

### Step 3: Add `Provider.reset()` export

**File:** `Agent-backend/packages/opencode/src/provider/provider.ts`

Add inside the `Provider` namespace, after the `list()` function (after line 1099):

```typescript
// Clears the cached provider state so the next Provider.list() call
// re-reads auth.json and rebuilds the provider map from scratch.
// Clears all directory-keyed caches because auth endpoints run outside
// instance context — we don't know which instance will read next.
export function reset(): void {
  state.reset();
}
```

### Step 4: Call `Provider.reset()` after REST auth changes

**File:** `Agent-backend/packages/opencode/src/server/server.ts`

In the `PUT /auth/:providerID` handler (line 158-163):

```typescript
async (c) => {
  const providerID = c.req.valid("param").providerID
  const info = c.req.valid("json")
  await Auth.set(providerID, info)
  Provider.reset()
  return c.json(true)
},
```

In the `DELETE /auth/:providerID` handler (line 189-193):

```typescript
async (c) => {
  const providerID = c.req.valid("param").providerID
  await Auth.remove(providerID)
  Provider.reset()
  return c.json(true)
},
```

### Step 5: Call `Provider.reset()` after OAuth and plugin auth mutations

**File:** `Agent-backend/packages/opencode/src/provider/auth.ts`

Add import at top:

```typescript
import { Provider } from './provider';
```

In `ProviderAuth.callback()` — after both `Auth.set()` calls succeed (line 100-118), add reset before return:

```typescript
if (result?.type === 'success') {
  if ('key' in result) {
    await Auth.set(input.providerID, {
      type: 'api',
      key: result.key,
    });
  }
  if ('refresh' in result) {
    const info: Auth.Info = {
      type: 'oauth',
      access: result.access,
      refresh: result.refresh,
      expires: result.expires,
    };
    if (result.accountId) {
      info.accountId = result.accountId;
    }
    await Auth.set(input.providerID, info);
  }
  Provider.reset();
  return;
}
```

In `ProviderAuth.api()` — after `Auth.set()` (line 131-136):

```typescript
async (input) => {
  await Auth.set(input.providerID, {
    type: "api",
    key: input.key,
  })
  Provider.reset()
},
```

---

## What NOT to change

- **`ProvidersSettings.tsx`** — Frontend is already correct (loading states, error handling, model picker all work)
- **`oc-session-service.ts`** — Service methods correctly call `loadProviders()` after save
- **`oc-provider-store.ts`** — Store auto-selection works correctly
- **`auth/index.ts`** — Auth persistence is fine (reads from disk each time via `all()`)
- **`provider/models.ts`** — ModelsDev caching is unrelated (already has its own `.reset()`)
- **`config/config.ts`** — Config's auth-dependent cache (`wellknown` type) is out of scope; the Settings UI only uses `api` and `oauth` types

---

## Verification

### Manual Testing

1. `bunx tauri dev`
2. Switch to OpenCode backend in Settings
3. Go to Providers settings page

**API Key Flow:**

4. Click "API key" on an unconnected provider (e.g., Anthropic)
5. Enter a valid API key → click Save
6. **Verify**: loading spinner appears, then provider moves from "Available" to "Connected"
7. **Verify**: model picker appears below the connected provider
8. Select a model → send a message → **Verify**: chat works immediately without restart

**OAuth Flow:**

9. Click an OAuth method on an unconnected provider
10. Complete the OAuth flow (auto or code)
11. **Verify**: provider moves to "Connected" immediately after callback completes
12. **Verify**: model picker appears, chat works without restart

**Error Path:**

13. Enter an invalid API key → **Verify**: inline error appears
14. Enter valid key for a different provider → **Verify**: also moves to Connected immediately

**Auth Removal:**

15. Remove a provider's auth (if exposed in UI) → **Verify**: provider moves back to "Available"

### Automated

16. `cd Agent-backend/packages/opencode && bun run typecheck` — no type errors from the new return type
17. `cd Agent-backend/packages/opencode && bun test --timeout 30000` — existing tests pass
18. `bun run typecheck` — frontend still types cleanly (no changes to frontend)
