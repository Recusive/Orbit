import { Config } from "../config/config"
import { MCP } from "../mcp"
import { Provider } from "../provider/provider"

import { UI } from "./ui"

import type z from "zod"

import { ConfigMarkdown } from "@/config/markdown"

export function FormatError(input: unknown): string | undefined {
  const err = input as { data: Record<string, unknown> }
  if (MCP.Failed.isInstance(input)) {
    const data = err.data as { name: string }
    return `MCP server "${data.name}" failed. Note, orbit does not support MCP authentication yet.`
  }
  if (Provider.ModelNotFoundError.isInstance(input)) {
    const data = err.data as { providerID: string; modelID: string; suggestions?: string[] }
    return [
      `Model not found: ${data.providerID}/${data.modelID}`,
      ...(Array.isArray(data.suggestions) && data.suggestions.length > 0
        ? ["Did you mean: " + data.suggestions.join(", ")]
        : []),
      `Try: \`orbit models\` to list available models`,
      `Or check your config (orbit.json) provider/model names`,
    ].join("\n")
  }
  if (Provider.InitError.isInstance(input)) {
    const data = err.data as { providerID: string }
    return `Failed to initialize provider "${data.providerID}". Check credentials and configuration.`
  }
  if (Config.JsonError.isInstance(input)) {
    const data = err.data as { path: string; message?: string }
    return (
      `Config file at ${data.path} is not valid JSON(C)` + (typeof data.message === "string" ? `: ${data.message}` : "")
    )
  }
  if (Config.ConfigDirectoryTypoError.isInstance(input)) {
    const data = err.data as { path: string; dir: string; suggestion: string }
    return `Directory "${data.dir}" in ${data.path} is not valid. Rename the directory to "${data.suggestion}" or remove it. This is a common typo.`
  }
  if (ConfigMarkdown.FrontmatterError.isInstance(input)) {
    const data = err.data as { message: string }
    return data.message
  }
  if (Config.InvalidError.isInstance(input)) {
    const data = err.data as { path?: string; message?: string; issues?: z.core.$ZodIssue[] }
    return [
      `Configuration is invalid${typeof data.path === "string" && data.path !== "config" ? ` at ${data.path}` : ""}` +
        (typeof data.message === "string" ? `: ${data.message}` : ""),
      ...(data.issues?.map((issue) => "↳ " + issue.message + " " + issue.path.join(".")) ?? []),
    ].join("\n")
  }

  if (UI.CancelledError.isInstance(input)) return ""
  return undefined
}

export function FormatUnknownError(input: unknown): string {
  if (input instanceof Error) {
    return input.stack ?? `${input.name}: ${input.message}`
  }

  if (typeof input === "object" && input !== null) {
    try {
      return JSON.stringify(input, null, 2)
    } catch {
      return "Unexpected error (unserializable)"
    }
  }

  return String(input)
}
