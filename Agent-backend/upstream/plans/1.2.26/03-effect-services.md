# Phase 3: Effect Service Layer

## Summary

Introduce an Effect-based service architecture for auth and provider auth, replacing imperative `Promise`-based implementations with Effect `ServiceMap` services, `ManagedRuntime`, and `ScopedCache`. This creates a clean separation between service logic (pure Effect, testable) and public API (thin async wrappers calling `runtime.runPromise`).

**Prerequisites:**

- Phase 0 (Effect dependency) -- `effect` must be installed
- Phase 2 (Branded IDs) -- `ProviderID` from `provider/schema.ts` must exist (used by `provider/auth-service.ts`)

## What We Have Today

### `src/auth/index.ts` -- Imperative file-based auth

Our fork has a simple namespace with direct `Filesystem` calls:

```ts
import { Filesystem } from "../util/filesystem"

export namespace Auth {
  const filepath = path.join(Global.Path.data, "auth.json")

  export async function get(providerID: string): Promise<Info | undefined> {
    const auth = await all()
    return auth[providerID]
  }

  export async function all(): Promise<Record<string, Info>> {
    const data = await Filesystem.readJson<Record<string, unknown>>(filepath).catch(() => ({}))
    return Object.entries(data).reduce<Record<string, Info>>((acc, [key, value]) => {
      const parsed = Info.safeParse(value)
      if (!parsed.success) return acc
      acc[key] = parsed.data
      return acc
    }, {})
  }

  export async function set(key: string, info: Info): Promise<void> {
    // direct Filesystem.writeJson calls...
  }

  export async function remove(key: string): Promise<void> {
    // direct Filesystem.writeJson calls...
  }
}
```

### `src/provider/auth.ts` -- Imperative provider auth

Our fork has an `Instance.state()` based namespace with direct `Plugin` calls and manual OAuth flow management:

```ts
export namespace ProviderAuth {
  const state = Instance.state(async () => {
    const methods = pipe(
      await Plugin.list(),
      filter((x) => x.auth?.provider !== undefined),
      map((x) => [x.auth.provider, x.auth] as const),
      fromEntries(),
    )
    return { methods, pending: {} as Record<string, AuthOuathResult> }
  })

  export async function methods(): Promise<Record<string, Method[]>> { ... }
  export const authorize = fn(z.object({ providerID: z.string(), ... }), async (input) => { ... })
  export const callback = fn(z.object({ ... }), async (input) => { ... })
  export const api = fn(z.object({ ... }), async (input) => { ... })

  // Error types defined inline
  export const OauthMissing = NamedError.create(...)
  export const OauthCodeMissing = NamedError.create(...)
  export const OauthCallbackFailed = NamedError.create(...)
}
```

### Missing files

| File                             | Status                                          |
| -------------------------------- | ----------------------------------------------- |
| `src/auth/service.ts`            | **Does not exist**                              |
| `src/provider/auth-service.ts`   | **Does not exist**                              |
| `src/effect/runtime.ts`          | **Does not exist** (no `src/effect/` directory) |
| `src/util/instance-state.ts`     | **Does not exist**                              |
| `src/util/effect-http-client.ts` | **Does not exist**                              |
| `src/account/`                   | **Entire directory does not exist**             |

## What Changes

The pattern is: extract service logic into an Effect `ServiceMap.Service` class, create a `ManagedRuntime` to run it, and rewrite the public API as thin `runPromise` wrappers. The public API signatures stay the same (still `async function`), so callers don't change.

### Before (imperative):

```
auth/index.ts      ── direct Filesystem.readJson/writeJson ──> disk
provider/auth.ts   ── direct Instance.state() + Plugin.list() ──> OAuth
```

### After (Effect services):

```
auth/index.ts        ── runPromise(AuthService.use(...)) ──> effect/runtime.ts
auth/service.ts      ── Effect.tryPromise { Filesystem.* } ──> disk

provider/auth.ts     ── runPromise(ProviderAuthService.use(...)) ──> local ManagedRuntime
provider/auth-service.ts ── Effect.promise { Plugin.* } + AuthService ──> OAuth + disk
```

## New Files

### 1. `src/auth/service.ts` (101 lines)

An Effect `ServiceMap.Service` wrapping the existing auth file operations:

```ts
import { Effect, Layer, Record, Result, Schema, ServiceMap } from "effect"

export const OAUTH_DUMMY_KEY = "opencode-oauth-dummy-key"

// Effect Schema classes for Oauth, Api, WellKnown (parallel to Zod schemas in index.ts)
export class Oauth extends Schema.Class<Oauth>("OAuth")({ ... }) {}
export class Api extends Schema.Class<Api>("ApiAuth")({ ... }) {}
export class WellKnown extends Schema.Class<WellKnown>("WellKnownAuth")({ ... }) {}

export const Info = Schema.Union([Oauth, Api, WellKnown])

export class AuthServiceError extends Schema.TaggedErrorClass<AuthServiceError>()("AuthServiceError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect),
}) {}

export class AuthService extends ServiceMap.Service<AuthService, AuthService.Service>()("@opencode/Auth") {
  static readonly layer = Layer.effect(
    AuthService,
    Effect.gen(function* () {
      const decode = Schema.decodeUnknownOption(Info)

      const all = Effect.fn("AuthService.all")(() =>
        Effect.tryPromise({
          try: async () => {
            const data = await Filesystem.readJson<Record<string, unknown>>(file).catch(() => ({}))
            return Record.filterMap(data, (value) => Result.fromOption(decode(value), () => undefined))
          },
          catch: fail("Failed to read auth data"),
        }),
      )

      // get, set, remove -- all thin wrappers around all()
      return AuthService.of({ get, all, set, remove })
    }),
  )

  static readonly defaultLayer = AuthService.layer
}
```

**Key points:**

- Uses `Schema.Class` (Effect Schema) for auth types, NOT Zod -- these are the Effect-side equivalents
- The Zod schemas in `auth/index.ts` still exist for the HTTP API layer
- `AuthServiceError` is a tagged error class for typed error handling
- `ServiceMap.Service` + `Layer.effect` pattern for dependency injection

### 2. `src/provider/auth-service.ts` (169 lines)

An Effect `ServiceMap.Service` wrapping OAuth flow and API key management:

```ts
import { Effect, Layer, Record, ServiceMap, Struct } from "effect"
import * as Auth from "@/auth/service"
import { InstanceState } from "@/util/instance-state"
import { ProviderID } from "./schema"

export class ProviderAuthService extends ServiceMap.Service<ProviderAuthService, ProviderAuthService.Service>()(
  "@opencode/ProviderAuth",
) {
  static readonly layer = Layer.effect(
    ProviderAuthService,
    Effect.gen(function* () {
      const auth = yield* Auth.AuthService
      const state = yield* InstanceState.make({
        lookup: () => Effect.promise(async () => {
          const methods = pipe(await Plugin.list(), ...)
          return { methods, pending: new Map<ProviderID, AuthOuathResult>() }
        }),
      })
      // methods, authorize, callback, api -- same logic, now Effect-based
      return ProviderAuthService.of({ methods, authorize, callback, api })
    }),
  )

  static readonly defaultLayer = ProviderAuthService.layer.pipe(
    Layer.provide(Auth.AuthService.defaultLayer)
  )
}
```

**Key points:**

- Depends on `AuthService` via Effect dependency injection (not direct import)
- Uses `InstanceState` (new Effect-based scoped cache) instead of `Instance.state()`
- Error types (`OauthMissing`, `OauthCodeMissing`, `OauthCallbackFailed`) moved here from `provider/auth.ts`
- `pending` state uses `Map<ProviderID, AuthOuathResult>` (branded key)

### 3. `src/effect/runtime.ts` (5 lines)

Shared `ManagedRuntime` that combines service layers:

```ts
import { Layer, ManagedRuntime } from "effect"
import { AccountService } from "@/account/service"
import { AuthService } from "@/auth/service"

export const runtime = ManagedRuntime.make(Layer.mergeAll(AccountService.defaultLayer, AuthService.defaultLayer))
```

**Key points:**

- Single shared runtime for auth + account services
- `ProviderAuthService` intentionally NOT included here -- it creates a separate `ManagedRuntime` in `provider/auth.ts` to avoid circular imports (`runtime.ts` -> `auth-service.ts` -> `provider/auth.ts`)
- The duplicate `AuthService` instance in the provider runtime is harmless (stateless file I/O)

### 4. `src/util/instance-state.ts` (51 lines)

Effect-based replacement for `Instance.state()` using `ScopedCache`:

```ts
import { Effect, ScopedCache, Scope } from "effect"
import { Instance } from "@/project/instance"

export namespace InstanceState {
  export interface State<A, E = never, R = never> {
    readonly cache: ScopedCache.ScopedCache<string, A, E, R>
  }

  export const make = <A, E, R>(input: {
    lookup: (key: string) => Effect.Effect<A, E, R>
    release?: (value: A, key: string) => Effect.Effect<void>
  }): Effect.Effect<State<A, E, R>, never, R | Scope.Scope> => ...

  export const get = <A, E, R>(self: State<A, E, R>) => ScopedCache.get(self.cache, Instance.directory)
  export const has = ...
  export const invalidate = ...
  export const dispose = ...  // invalidates all caches for a given directory key
}
```

**Key points:**

- `ScopedCache` ensures automatic cleanup when the scope is closed
- `dispose` is used by `Instance.dispose()` to invalidate all InstanceState caches when a project directory changes
- `make` accepts `lookup` (factory function) and optional `release` (cleanup function)
- Currently used only by `ProviderAuthService`, but designed for general use

### 5. `src/util/effect-http-client.ts` (11 lines)

HTTP client retry wrapper using Effect's `HttpClient`:

```ts
import { Schedule } from "effect"
import { HttpClient } from "effect/unstable/http"

export const withTransientReadRetry = <E, R>(client: HttpClient.HttpClient.With<E, R>) =>
  client.pipe(
    HttpClient.retryTransient({
      retryOn: "errors-and-responses",
      times: 2,
      schedule: Schedule.exponential(200).pipe(Schedule.jittered),
    }),
  )
```

**Key points:**

- Uses `effect/unstable/http` -- Effect's built-in HTTP client
- 2 retries with exponential backoff (200ms base) and jitter
- Currently used only by `AccountService` for control plane API calls
- The `unstable` import path is Effect v4's way of namespacing experimental HTTP APIs

## Modified Files

### 6. `src/auth/index.ts` -- Rewritten to delegate to service

**Before:** Direct `Filesystem` calls.
**After:** Thin `runPromise` wrappers over `AuthService`.

```ts
// NEW
import { Effect } from "effect"
import { runtime } from "@/effect/runtime"
import * as S from "./service"

export { OAUTH_DUMMY_KEY } from "./service" // re-export moved to service

function runPromise<A>(f: (service: S.AuthService.Service) => Effect.Effect<A, S.AuthServiceError>) {
  return runtime.runPromise(S.AuthService.use(f))
}

export namespace Auth {
  // Zod schemas remain unchanged (Oauth, Api, WellKnown, Info)

  // CHANGED: functions delegate to Effect service
  export async function get(providerID: string) {
    return runPromise((service) => service.get(providerID))
  }
  export async function all(): Promise<Record<string, Info>> {
    return runPromise((service) => service.all())
  }
  export async function set(key: string, info: Info) {
    return runPromise((service) => service.set(key, info))
  }
  export async function remove(key: string) {
    return runPromise((service) => service.remove(key))
  }
}
```

**Impact:** Function signatures unchanged. Callers don't need to change. The `OAUTH_DUMMY_KEY` export moves to `service.ts` and is re-exported.

### 7. `src/provider/auth.ts` -- Rewritten to delegate to service

**Before:** 156 lines of imperative OAuth flow logic + error definitions.
**After:** ~55 lines of thin delegation + re-exports.

```ts
// NEW
import { Effect, ManagedRuntime } from "effect"
import * as S from "./auth-service"
import { ProviderID } from "./schema"

// Separate runtime to avoid circular imports
const rt = ManagedRuntime.make(S.ProviderAuthService.defaultLayer)

function runPromise<A>(f: (service: S.ProviderAuthService.Service) => Effect.Effect<A, S.ProviderAuthError>) {
  return rt.runPromise(S.ProviderAuthService.use(f))
}

export namespace ProviderAuth {
  export const Method = S.Method // re-export from service
  export type Method = S.Method

  export async function methods() {
    return runPromise((service) => service.methods())
  }

  export const Authorization = S.Authorization // re-export from service
  export type Authorization = S.Authorization

  export const authorize = fn(z.object({ providerID: ProviderID.zod, method: z.number() }), async (input) =>
    runPromise((service) => service.authorize(input)),
  )

  export const callback = fn(
    z.object({ providerID: ProviderID.zod, method: z.number(), code: z.string().optional() }),
    async (input) => runPromise((service) => service.callback(input)),
  )

  export const api = fn(z.object({ providerID: ProviderID.zod, key: z.string() }), async (input) =>
    runPromise((service) => service.api(input)),
  )

  // Error types re-exported from service
  export import OauthMissing = S.OauthMissing
  export import OauthCodeMissing = S.OauthCodeMissing
  export import OauthCallbackFailed = S.OauthCallbackFailed
}
```

**Key changes:**

- `z.string()` -> `ProviderID.zod` in `authorize`, `callback`, `api` schemas (branded ID from Phase 2)
- `OauthMissing` error `providerID` field: `z.string()` -> `ProviderID.zod`
- `Instance.state()` removed -- replaced by `InstanceState` in the service
- `Provider.reset()` call after `callback`/`api` is removed -- the service doesn't know about `Provider`. If provider cache invalidation is needed, it must be handled by the caller or via an event bus.
- `export import` syntax used for re-exporting error classes from the service module

## Account System (Dependency for runtime.ts)

The `effect/runtime.ts` file imports `AccountService` from `@/account/service`. The entire `src/account/` directory is new in upstream v1.2.26:

| File                         | Lines | Purpose                                                                                               |
| ---------------------------- | ----- | ----------------------------------------------------------------------------------------------------- |
| `src/account/index.ts`       | 41    | Thin async wrappers (`active()`, `config()`, `token()`) via `runtime.runPromise/runSync`              |
| `src/account/service.ts`     | 359   | Full Effect service: OAuth device flow, token refresh, org management, remote config                  |
| `src/account/repo.ts`        | 160   | SQLite CRUD via Drizzle + Effect ServiceMap (accounts, state, tokens)                                 |
| `src/account/schema.ts`      | 91    | Effect Schema branded types (`AccountID`, `OrgID`, `AccessToken`, `RefreshToken`, `DeviceCode`, etc.) |
| `src/account/account.sql.ts` | 39    | Drizzle table definitions (`AccountTable`, `AccountStateTable`, `ControlAccountTable`)                |

**Decision point:** The account system is the upstream control plane authentication (opencode.ai cloud accounts). Orbit may or may not need this. Options:

1. **Port it all** -- brings in the full account system, runtime.ts works as-is
2. **Stub it** -- create a minimal `AccountService` that satisfies the `runtime.ts` layer but does nothing (simplest for now)
3. **Skip runtime.ts dependency** -- have `auth/index.ts` create its own local `ManagedRuntime` without `AccountService`

**Recommendation:** Option 1 (port it all). The account system is self-contained and doesn't conflict with Orbit's auth. It also requires a database migration (`20260228203230_blue_harpoon` for account tables). We can always disable the account UI later.

## Breaking Changes

### API Changes

- **None.** Public function signatures in `Auth` and `ProviderAuth` namespaces are unchanged. Callers still use `await Auth.get(providerID)`, `await ProviderAuth.methods()`, etc.

### Behavioral Changes

- **`Provider.reset()` removed from `ProviderAuth.callback` and `ProviderAuth.api`:** The upstream service version doesn't call `Provider.reset()` after setting credentials. Our fork currently does. If this causes stale provider instances after changing API keys, we may need to re-add it in the wrapper or emit a bus event.
- **Error propagation:** Errors are now wrapped in `AuthServiceError` before being thrown. Code that catches specific error types may need updating if it inspects error shapes.

### Database Schema Changes

- **Account tables added:** `account`, `account_state` tables (if porting account system). Requires running the `20260228203230_blue_harpoon` migration.

### Impact on Desktop App Frontend

- **None.** The HTTP API responses are unchanged. The server routes still call the same `Auth.*` / `ProviderAuth.*` functions.

## Rename Required

### `src/auth/service.ts`

- `OAUTH_DUMMY_KEY = "opencode-oauth-dummy-key"` -- this string value should remain `"opencode-oauth-dummy-key"` (it's a protocol constant, not user-facing). No rename needed.

### `src/effect/runtime.ts`

- No user-facing strings.

### `src/account/service.ts` (if ported)

- `const clientId = "opencode-cli"` -- this is used for OAuth device flow with the opencode.ai control plane. If Orbit uses a different OAuth client ID, change to `"orbit-cli"`. Otherwise leave as-is.
- Various API endpoint URLs pointing to opencode.ai services -- review if Orbit has its own control plane.

### `src/util/instance-state.ts`

- `Symbol.for("@opencode/InstanceState")` -- this is an internal Symbol, not user-facing. Can optionally rename to `"@orbit/InstanceState"` for consistency but it has zero functional impact.

### `src/provider/auth-service.ts`

- Service tag `"@opencode/ProviderAuth"` -- internal identifier, can rename to `"@orbit/ProviderAuth"` for consistency.

### `src/auth/service.ts`

- Service tag `"@opencode/Auth"` -- internal identifier, can rename to `"@orbit/Auth"`.

**Summary:** No user-facing renames needed. Internal service tags and symbols can optionally be rebranded but have no functional impact.

## Execution Order

1. **Ensure prerequisites:**
   - Phase 0 (Effect dependency) is complete
   - `src/util/schema.ts` (withStatics) exists (Phase 2 prerequisite)
   - `src/provider/schema.ts` (ProviderID, ModelID) exists (Phase 2)

2. **Create utility files first:**
   - `src/util/instance-state.ts` -- no dependencies on other new files
   - `src/util/effect-http-client.ts` -- no dependencies on other new files

3. **Create account system (if porting):**
   - `src/account/schema.ts` -- branded types (depends on `util/schema.ts`)
   - `src/account/account.sql.ts` -- Drizzle tables (depends on schema)
   - `src/account/repo.ts` -- SQLite layer (depends on sql + schema)
   - `src/account/service.ts` -- Effect service (depends on repo + schema + effect-http-client)
   - `src/account/index.ts` -- thin wrappers (depends on service + runtime)
   - Run database migration for account tables

4. **Create auth service:**
   - `src/auth/service.ts` -- depends on `effect`, `Filesystem`
   - Modify `src/auth/index.ts` -- depends on `service.ts` + `runtime.ts`

5. **Create Effect runtime:**
   - `src/effect/runtime.ts` -- depends on `auth/service.ts` + `account/service.ts`

6. **Create provider auth service:**
   - `src/provider/auth-service.ts` -- depends on `auth/service.ts` + `instance-state.ts` + `provider/schema.ts`
   - Modify `src/provider/auth.ts` -- depends on `auth-service.ts`

7. **Update storage schema exports:**
   - `src/storage/schema.ts` -- add `AccountTable`, `AccountStateTable` exports

## Verification

```bash
cd Agent-backend/packages/opencode

# Type check -- Effect services must resolve
bun run typecheck

# Test auth operations still work
bun test test/provider/auth.test.ts --timeout 30000

# Test account operations (if ported)
bun test test/account/ --timeout 30000

# Full test suite
bun test --timeout 30000

# Verify runtime initializes without error
bun -e "
import { runtime } from './src/effect/runtime'
const fiber = runtime.runSync(Effect.void)
console.log('runtime initialized')
"
```

## Files Changed

```
# New files
src/auth/service.ts              (101 lines -- AuthService Effect class)
src/provider/auth-service.ts     (169 lines -- ProviderAuthService Effect class)
src/effect/runtime.ts            (5 lines -- shared ManagedRuntime)
src/util/instance-state.ts       (51 lines -- Effect ScopedCache wrapper)
src/util/effect-http-client.ts   (11 lines -- HTTP retry helper)

# New files (account system, if ported)
src/account/index.ts             (41 lines -- thin async wrappers)
src/account/service.ts           (359 lines -- full Effect service)
src/account/repo.ts              (160 lines -- SQLite CRUD via Effect)
src/account/schema.ts            (91 lines -- branded types)
src/account/account.sql.ts       (39 lines -- Drizzle table definitions)

# Modified files
src/auth/index.ts                (rewritten: delegate to service via runtime)
src/provider/auth.ts             (rewritten: delegate to service via local runtime)
src/storage/schema.ts            (add AccountTable/AccountStateTable exports)

# Migration (if porting account system)
migration/20260228203230_blue_harpoon/migration.sql
migration/20260228203230_blue_harpoon/snapshot.json
```
