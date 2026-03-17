import z from "zod"

import * as S from "./service"

import type { Effect } from "effect"

import { runtime } from "@/effect/runtime"

export { OAUTH_DUMMY_KEY } from "./service"

function runPromise<A>(f: (service: S.AuthService.Service) => Effect.Effect<A, S.AuthServiceError>): Promise<A> {
  return runtime.runPromise(S.AuthService.use(f))
}

export namespace Auth {
  export const Oauth = z
    .object({
      type: z.literal("oauth"),
      refresh: z.string(),
      access: z.string(),
      expires: z.number(),
      accountId: z.string().optional(),
      enterpriseUrl: z.string().optional(),
    })
    .meta({ ref: "OAuth" })

  export const Api = z
    .object({
      type: z.literal("api"),
      key: z.string(),
    })
    .meta({ ref: "ApiAuth" })

  export const WellKnown = z
    .object({
      type: z.literal("wellknown"),
      key: z.string(),
      token: z.string(),
    })
    .meta({ ref: "WellKnownAuth" })

  export const Info = z.discriminatedUnion("type", [Oauth, Api, WellKnown]).meta({ ref: "Auth" })
  export type Info = z.infer<typeof Info>

  export async function get(providerID: string): Promise<Info | undefined> {
    return runPromise((service) => service.get(providerID))
  }

  export async function all(): Promise<Record<string, Info>> {
    return runPromise((service) => service.all())
  }

  export async function set(key: string, info: Info): Promise<void> {
    return runPromise((service) => service.set(key, info))
  }

  export async function remove(key: string): Promise<void> {
    return runPromise((service) => service.remove(key))
  }
}
