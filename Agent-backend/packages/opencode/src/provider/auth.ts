import { ManagedRuntime } from "effect"
import z from "zod"

import * as S from "./auth-service"
import { Provider } from "./provider"
import { ProviderID } from "./schema"

import type { Effect } from "effect"

import { fn } from "@/util/fn"

const rt = ManagedRuntime.make(S.ProviderAuthService.defaultLayer)

function runPromise<A>(
  f: (service: S.ProviderAuthService.Service) => Effect.Effect<A, S.ProviderAuthError>,
): Promise<A> {
  return rt.runPromise(S.ProviderAuthService.use(f))
}

export namespace ProviderAuth {
  export const Method = S.Method
  export type Method = S.Method

  export async function methods(): Promise<Record<string, Method[]>> {
    return runPromise((service) => service.methods())
  }

  export const Authorization = S.Authorization
  export type Authorization = S.Authorization

  export const authorize = fn(
    z.object({
      providerID: ProviderID.zod,
      method: z.number(),
    }),
    async (input): Promise<Authorization | undefined> => runPromise((service) => service.authorize(input)),
  )

  export const callback = fn(
    z.object({
      providerID: ProviderID.zod,
      method: z.number(),
      code: z.string().optional(),
    }),
    async (input) => {
      await runPromise((service) => service.callback(input))
      Provider.reset()
    },
  )

  export const api = fn(
    z.object({
      providerID: ProviderID.zod,
      key: z.string(),
    }),
    async (input) => {
      await runPromise((service) => service.api(input))
      Provider.reset()
    },
  )

  export import OauthMissing = S.OauthMissing
  export import OauthCodeMissing = S.OauthCodeMissing
  export import OauthCallbackFailed = S.OauthCallbackFailed
}
