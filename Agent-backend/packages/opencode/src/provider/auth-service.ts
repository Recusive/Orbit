import { NamedError } from "@orbit.build/util/error"
import { Effect, Layer, Record, ServiceMap, Struct } from "effect"
import { filter, fromEntries, map, pipe } from "remeda"
import z from "zod"

import { Plugin } from "../plugin"

import { ProviderID } from "./schema"

import type { AuthOuathResult } from "@orbit.build/plugin"

import * as Auth from "@/auth/service"
import { InstanceState } from "@/util/instance-state"

export const Method = z
  .object({
    type: z.union([z.literal("oauth"), z.literal("api")]),
    label: z.string(),
  })
  .meta({
    ref: "ProviderAuthMethod",
  })
export type Method = z.infer<typeof Method>

export const Authorization = z
  .object({
    url: z.string(),
    method: z.union([z.literal("auto"), z.literal("code")]),
    instructions: z.string(),
  })
  .meta({
    ref: "ProviderAuthAuthorization",
  })
export type Authorization = z.infer<typeof Authorization>

export const OauthMissing = NamedError.create(
  "ProviderAuthOauthMissing",
  z.object({
    providerID: ProviderID.zod,
  }),
)

export const OauthCodeMissing = NamedError.create(
  "ProviderAuthOauthCodeMissing",
  z.object({
    providerID: ProviderID.zod,
  }),
)

export const OauthCallbackFailed = NamedError.create("ProviderAuthOauthCallbackFailed", z.object({}))

export type ProviderAuthError =
  | Auth.AuthServiceError
  | InstanceType<typeof OauthMissing>
  | InstanceType<typeof OauthCodeMissing>
  | InstanceType<typeof OauthCallbackFailed>

export namespace ProviderAuthService {
  export interface Service {
    readonly methods: () => Effect.Effect<Record<string, Method[]>>
    readonly authorize: (input: { providerID: ProviderID; method: number }) => Effect.Effect<Authorization | undefined>
    readonly callback: (input: {
      providerID: ProviderID
      method: number
      code?: string
    }) => Effect.Effect<void, ProviderAuthError>
    readonly api: (input: { providerID: ProviderID; key: string }) => Effect.Effect<void, Auth.AuthServiceError>
  }
}

export class ProviderAuthService extends ServiceMap.Service<ProviderAuthService, ProviderAuthService.Service>()(
  "@orbit/ProviderAuth",
) {
  static readonly layer = Layer.effect(
    ProviderAuthService,
    Effect.gen(function* () {
      const auth = yield* Auth.AuthService
      const state = yield* InstanceState.make({
        lookup: () =>
          Effect.promise(async () => {
            const methods = pipe(
              await Plugin.list(),
              filter(
                (item): item is typeof item & { auth: NonNullable<typeof item.auth> } =>
                  item.auth?.provider !== undefined,
              ),
              map((item) => [item.auth.provider, item.auth] as const),
              fromEntries(),
            )
            return { methods, pending: new Map<ProviderID, AuthOuathResult>() }
          }),
      })

      const methods = Effect.fn("ProviderAuthService.methods")(function* () {
        const data = yield* InstanceState.get(state)
        return Record.map(data.methods, (item) =>
          item.methods.map((method): Method => Struct.pick(method, ["type", "label"])),
        )
      })

      const authorize = Effect.fn("ProviderAuthService.authorize")(function* (input: {
        providerID: ProviderID
        method: number
      }) {
        const data = yield* InstanceState.get(state)
        const method = data.methods[input.providerID].methods[input.method]
        if (method.type !== "oauth") return
        const result = yield* Effect.promise(() => method.authorize())
        data.pending.set(input.providerID, result)
        return {
          url: result.url,
          method: result.method,
          instructions: result.instructions,
        }
      })

      const callback = Effect.fn("ProviderAuthService.callback")(function* (input: {
        providerID: ProviderID
        method: number
        code?: string
      }) {
        const data = yield* InstanceState.get(state)
        const match = data.pending.get(input.providerID)
        if (!match) return yield* Effect.fail(new OauthMissing({ providerID: input.providerID }))

        if (match.method === "code" && !input.code) {
          return yield* Effect.fail(new OauthCodeMissing({ providerID: input.providerID }))
        }

        const result = yield* match.method === "code"
          ? Effect.gen(function* () {
              const code = input.code
              if (code === undefined) {
                return yield* Effect.fail(new OauthCodeMissing({ providerID: input.providerID }))
              }
              return yield* Effect.promise(() => match.callback(code))
            })
          : Effect.promise(() => match.callback())

        if (result.type !== "success") {
          return yield* Effect.fail(new OauthCallbackFailed({}))
        }

        if ("key" in result) {
          yield* auth.set(input.providerID, {
            type: "api",
            key: result.key,
          })
        }

        if ("refresh" in result) {
          yield* auth.set(input.providerID, {
            type: "oauth",
            access: result.access,
            refresh: result.refresh,
            expires: result.expires,
            ...(result.accountId ? { accountId: result.accountId } : {}),
          })
        }
      })

      const api = Effect.fn("ProviderAuthService.api")(function* (input: { providerID: ProviderID; key: string }) {
        yield* auth.set(input.providerID, {
          type: "api",
          key: input.key,
        })
      })

      return ProviderAuthService.of({
        methods,
        authorize,
        callback,
        api,
      })
    }),
  )

  static readonly defaultLayer = ProviderAuthService.layer.pipe(Layer.provide(Auth.AuthService.defaultLayer))
}
