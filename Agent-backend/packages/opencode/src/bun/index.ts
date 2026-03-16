import path from "path"

import { NamedError } from "@orbit.build/util/error"
import z from "zod"

import { Global } from "../global"
import { Filesystem } from "../util/filesystem"
import { Lock } from "../util/lock"
import { Log } from "../util/log"
import { Process } from "../util/process"

import { PackageRegistry } from "./registry"

import { proxied } from "@/util/proxied"

export namespace BunProc {
  const log = Log.create({ service: "bun" })

  export async function run(cmd: string[], options?: Process.RunOptions): Promise<Process.Result> {
    const full = [which(), ...cmd]
    log.info("running", {
      cmd: full,
      ...options,
    })
    const result = await Process.run(full, {
      cwd: options?.cwd,
      abort: options?.abort,
      kill: options?.kill,
      timeout: options?.timeout,
      nothrow: options?.nothrow,
      env: {
        ...process.env,
        ...options?.env,
        BUN_BE_BUN: "1",
      },
    })
    log.info("done", {
      code: result.code,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    })
    return result
  }

  export function which(): string {
    return process.execPath
  }

  export const InstallFailedError = NamedError.create(
    "BunInstallFailedError",
    z.object({
      pkg: z.string(),
      version: z.string(),
    }),
  )

  export async function install(pkg: string, version = "latest"): Promise<string> {
    // Use lock to ensure only one install at a time
    using _lock = await Lock.write("bun-install")

    const mod = path.join(Global.Path.cache, "node_modules", pkg)
    const pkgjsonPath = path.join(Global.Path.cache, "package.json")
    const parsed = await Filesystem.readJson<{ dependencies: Record<string, string> }>(pkgjsonPath).catch(async () => {
      const result = { dependencies: {} as Record<string, string> }
      await Filesystem.writeJson(pkgjsonPath, result)
      return result
    })
    const dependencies = parsed.dependencies
    const modExists = Filesystem.exists(mod)
    const cachedVersion = dependencies[pkg]

    if (!modExists || !(pkg in dependencies)) {
      // continue to install
    } else if (version !== "latest" && cachedVersion === version) {
      return mod
    } else if (version === "latest") {
      const isOutdated = await PackageRegistry.isOutdated(pkg, cachedVersion, Global.Path.cache)
      if (!isOutdated) return mod
      log.info("Cached version is outdated, proceeding with install", { pkg, cachedVersion })
    }

    // Build command arguments
    const args = [
      "add",
      "--force",
      "--exact",
      // TODO: get rid of this case (see: https://github.com/oven-sh/bun/issues/19936)
      ...(proxied() || process.env.CI ? ["--no-cache"] : []),
      "--cwd",
      Global.Path.cache,
      pkg + "@" + version,
    ]

    // Let Bun handle registry resolution:
    // - If .npmrc files exist, Bun will use them automatically
    // - If no .npmrc files exist, Bun will default to https://registry.npmjs.org
    // - No need to pass --registry flag
    log.info("installing package using Bun's default registry resolution", {
      pkg,
      version,
    })

    await BunProc.run(args, {
      cwd: Global.Path.cache,
    }).catch((e: unknown) => {
      throw new InstallFailedError(
        { pkg, version },
        {
          cause: e,
        },
      )
    })

    // Resolve actual version from installed package when using "latest"
    // This ensures subsequent starts use the cached version until explicitly updated
    let resolvedVersion = version
    if (version === "latest") {
      const installedPkg = await Filesystem.readJson<{ version?: string }>(path.join(mod, "package.json")).catch(
        () => null,
      )
      if (installedPkg?.version) {
        resolvedVersion = installedPkg.version
      }
    }

    parsed.dependencies[pkg] = resolvedVersion
    await Filesystem.writeJson(pkgjsonPath, parsed)
    return mod
  }
}
