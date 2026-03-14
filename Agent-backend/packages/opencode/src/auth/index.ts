import path from "path"

import z from "zod"

import { Global } from "../global"
import { Filesystem } from "../util/filesystem"

export const OAUTH_DUMMY_KEY = "opencode-oauth-dummy-key"

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
    const normalized = key.replace(/\/+$/, "")
    const data = await all()
    const cleaned = Object.fromEntries(Object.entries(data).filter(([k]) => k !== key && k !== normalized + "/"))
    await Filesystem.writeJson(filepath, { ...cleaned, [normalized]: info }, 0o600)
  }

  export async function remove(key: string): Promise<void> {
    const normalized = key.replace(/\/+$/, "")
    const data = await all()
    const cleaned = Object.fromEntries(Object.entries(data).filter(([k]) => k !== key && k !== normalized))
    await Filesystem.writeJson(filepath, cleaned, 0o600)
  }
}
