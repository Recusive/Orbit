import path from "path"

import { Instance } from "../project/instance"

import type { Tool } from "./tool"

type Kind = "file" | "directory"

interface Options {
  bypass?: boolean
  kind?: Kind
}

export async function assertExternalDirectory(ctx: Tool.Context, target?: string, options?: Options): Promise<void> {
  if (!target) return

  if (options?.bypass) return

  if (Instance.containsPath(target)) return

  const kind = options?.kind ?? "file"
  const parentDir = kind === "directory" ? target : path.dirname(target)
  const glob = path.join(parentDir, "*").replaceAll("\\", "/")

  await ctx.ask({
    permission: "external_directory",
    patterns: [glob],
    always: [glob],
    metadata: {
      filepath: target,
      parentDir,
    },
  })
}
