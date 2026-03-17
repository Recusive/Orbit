import path from "path"

import { Effect, Layer, Record, Result, Schema, ServiceMap } from "effect"

import { Global } from "../global"
import { Filesystem } from "../util/filesystem"

export const OAUTH_DUMMY_KEY = "orbit-oauth-dummy-key"

export class Oauth extends Schema.Class<Oauth>("OAuth")({
  type: Schema.Literal("oauth"),
  refresh: Schema.String,
  access: Schema.String,
  expires: Schema.Number,
  accountId: Schema.optional(Schema.String),
  enterpriseUrl: Schema.optional(Schema.String),
}) {}

export class Api extends Schema.Class<Api>("ApiAuth")({
  type: Schema.Literal("api"),
  key: Schema.String,
}) {}

export class WellKnown extends Schema.Class<WellKnown>("WellKnownAuth")({
  type: Schema.Literal("wellknown"),
  key: Schema.String,
  token: Schema.String,
}) {}

export const Info = Schema.Union([Oauth, Api, WellKnown])
export type Info = Schema.Schema.Type<typeof Info>

export class AuthServiceError extends Schema.TaggedErrorClass<AuthServiceError>()("AuthServiceError", {
  message: Schema.String,
  cause: Schema.optional(Schema.Defect),
}) {}

const file = path.join(Global.Path.data, "auth.json")

const fail = (message: string) => (cause: unknown) => new AuthServiceError({ message, cause })

function canonicalKey(key: string): string {
  const normalized = key.replace(/\/+$/, "")
  if (normalized === "opencode") return "orbit"
  return normalized
}

function relatedKeys(key: string): string[] {
  const normalized = canonicalKey(key)
  if (normalized === "orbit") return ["orbit", "opencode"]
  return [normalized]
}

export namespace AuthService {
  export interface Service {
    readonly get: (providerID: string) => Effect.Effect<Info | undefined, AuthServiceError>
    readonly all: () => Effect.Effect<Record<string, Info>, AuthServiceError>
    readonly set: (key: string, info: Info) => Effect.Effect<void, AuthServiceError>
    readonly remove: (key: string) => Effect.Effect<void, AuthServiceError>
  }
}

export class AuthService extends ServiceMap.Service<AuthService, AuthService.Service>()("@orbit/Auth") {
  static readonly layer = Layer.effect(
    AuthService,
    Effect.sync(() => {
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

      const get = Effect.fn("AuthService.get")(function* (providerID: string) {
        const data = yield* all()
        for (const key of relatedKeys(providerID)) {
          if (key in data) return data[key]
        }
        return undefined
      })

      const set = Effect.fn("AuthService.set")(function* (key: string, info: Info) {
        const norm = canonicalKey(key)
        const data = yield* all()
        const cleanup = new Set([...relatedKeys(key), ...relatedKeys(key).map((item) => item + "/"), key])
        const next = Object.fromEntries(Object.entries(data).filter(([item]) => !cleanup.has(item)))
        yield* Effect.tryPromise({
          try: () => Filesystem.writeJson(file, { ...next, [norm]: info }, 0o600),
          catch: fail("Failed to write auth data"),
        })
      })

      const remove = Effect.fn("AuthService.remove")(function* (key: string) {
        const norm = canonicalKey(key)
        const data = yield* all()
        const cleanup = new Set([...relatedKeys(key), ...relatedKeys(key).map((item) => item + "/"), key, norm])
        const next = Object.fromEntries(Object.entries(data).filter(([item]) => !cleanup.has(item)))
        yield* Effect.tryPromise({
          try: () => Filesystem.writeJson(file, next, 0o600),
          catch: fail("Failed to write auth data"),
        })
      })

      return AuthService.of({
        get,
        all,
        set,
        remove,
      })
    }),
  )

  static readonly defaultLayer = AuthService.layer
}
