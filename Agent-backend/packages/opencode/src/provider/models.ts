import path from "path"

import z from "zod"

import { Flag } from "../flag/flag"
import { Global } from "../global"
import { Installation } from "../installation"
import { Filesystem } from "../util/filesystem"
import { Log } from "../util/log"

import { lazy } from "@/util/lazy"

export namespace ModelsDev {
  const log = Log.create({ service: "models.dev" })
  const filepath = path.join(Global.Path.cache, "models.json")

  export const Model = z.object({
    id: z.string(),
    name: z.string(),
    family: z.string().optional(),
    release_date: z.string(),
    attachment: z.boolean(),
    reasoning: z.boolean(),
    temperature: z.boolean(),
    tool_call: z.boolean(),
    interleaved: z
      .union([
        z.literal(true),
        z
          .object({
            field: z.enum(["reasoning_content", "reasoning_details"]),
          })
          .strict(),
      ])
      .optional(),
    cost: z
      .object({
        input: z.number(),
        output: z.number(),
        cache_read: z.number().optional(),
        cache_write: z.number().optional(),
        context_over_200k: z
          .object({
            input: z.number(),
            output: z.number(),
            cache_read: z.number().optional(),
            cache_write: z.number().optional(),
          })
          .optional(),
      })
      .optional(),
    limit: z.object({
      context: z.number(),
      input: z.number().optional(),
      output: z.number(),
    }),
    modalities: z
      .object({
        input: z.array(z.enum(["text", "audio", "image", "video", "pdf"])),
        output: z.array(z.enum(["text", "audio", "image", "video", "pdf"])),
      })
      .optional(),
    experimental: z.boolean().optional(),
    status: z.enum(["alpha", "beta", "deprecated"]).optional(),
    options: z.record(z.string(), z.any()),
    headers: z.record(z.string(), z.string()).optional(),
    provider: z.object({ npm: z.string().optional(), api: z.string().optional() }).optional(),
    variants: z.record(z.string(), z.record(z.string(), z.any())).optional(),
  })
  export type Model = z.infer<typeof Model>

  export const Provider = z.object({
    api: z.string().optional(),
    name: z.string(),
    env: z.array(z.string()),
    id: z.string(),
    npm: z.string().optional(),
    models: z.record(z.string(), Model),
  })

  export type Provider = z.infer<typeof Provider>

  function normalizeProviderCatalog(providers: Record<string, Provider>): Record<string, Provider> {
    // OpenCode Zen is an external LLM provider service (like OpenRouter or Together AI).
    // Do NOT rename it to "Orbit" — it's their hosted API, not ours.
    // Keep the provider ID and name as-is from the models.dev snapshot.
    return providers
  }

  function url(): string {
    return Flag.OPENCODE_MODELS_URL ?? "https://models.dev"
  }

  export const Data = lazy(async () => {
    const result = await Filesystem.readJson(Flag.OPENCODE_MODELS_PATH ?? filepath).catch(() => undefined)
    if (result !== undefined) return result as Record<string, unknown>
    const snapshot = await import("./models-snapshot")
      .then((m: { snapshot?: Record<string, unknown> }) => m.snapshot)
      .catch(() => undefined)
    if (snapshot !== undefined) return snapshot
    if (Flag.OPENCODE_DISABLE_MODELS_FETCH) return {}
    const json = await fetch(`${url()}/api.json`).then((x) => x.text())
    return JSON.parse(json) as Record<string, unknown>
  })

  export async function get(): Promise<Record<string, Provider>> {
    const result = await Data()
    return normalizeProviderCatalog(result as Record<string, Provider>)
  }

  export async function refresh(): Promise<void> {
    const result = await fetch(`${url()}/api.json`, {
      headers: {
        "User-Agent": Installation.USER_AGENT,
      },
      signal: AbortSignal.timeout(10 * 1000),
    }).catch((e: unknown) => {
      log.error("Failed to fetch models.dev", {
        error: e,
      })
    })
    if (result && result.ok) {
      await Filesystem.write(filepath, await result.text())
      ModelsDev.Data.reset()
    }
  }
}

if (!Flag.OPENCODE_DISABLE_MODELS_FETCH && !process.argv.includes("--get-yargs-completions")) {
  void ModelsDev.refresh()
  setInterval(
    () => {
      void ModelsDev.refresh()
    },
    60 * 1000 * 60,
  ).unref()
}
