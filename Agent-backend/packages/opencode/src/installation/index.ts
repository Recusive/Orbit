import { buffer } from "node:stream/consumers"
import path from "path"

import { NamedError } from "@orbit.build/util/error"
import z from "zod"

import { Flag } from "../flag/flag"
import { Log } from "../util/log"

import { BusEvent } from "@/bus/bus-event"
import { iife } from "@/util/iife"
import { Process } from "@/util/process"

declare global {
  const OPENCODE_VERSION: string
  const OPENCODE_CHANNEL: string
}

export namespace Installation {
  const log = Log.create({ service: "installation" })

  async function text(cmd: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): Promise<string> {
    return Process.text(cmd, {
      cwd: opts.cwd,
      env: opts.env,
      nothrow: true,
    }).then((x) => x.text)
  }

  async function upgradeCurl(target: string): Promise<{
    code: number | null
    stdout: Buffer
    stderr: Buffer
  }> {
    const body = await fetch("https://orbit.build/install").then((res) => {
      if (!res.ok) throw new Error(res.statusText)
      return res.text()
    })
    const proc = Process.spawn(["bash"], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        VERSION: target,
      },
    })
    if (!proc.stdin || !proc.stdout || !proc.stderr) throw new Error("Process output not available")
    proc.stdin.end(body)
    const [code, stdout, stderr] = await Promise.all([proc.exited, buffer(proc.stdout), buffer(proc.stderr)])
    return {
      code,
      stdout,
      stderr,
    }
  }

  export type Method = Awaited<ReturnType<typeof method>>

  export const Event = {
    Updated: BusEvent.define(
      "installation.updated",
      z.object({
        version: z.string(),
      }),
    ),
    UpdateAvailable: BusEvent.define(
      "installation.update-available",
      z.object({
        version: z.string(),
      }),
    ),
  }

  export const Info = z
    .object({
      version: z.string(),
      latest: z.string(),
    })
    .meta({
      ref: "InstallationInfo",
    })
  export type Info = z.infer<typeof Info>

  export async function info(): Promise<Info> {
    return {
      version: VERSION,
      latest: await latest(),
    }
  }

  export function isPreview(): boolean {
    return CHANNEL !== "latest"
  }

  export function isLocal(): boolean {
    return CHANNEL === "local"
  }

  export async function method(): Promise<
    "curl" | "npm" | "yarn" | "pnpm" | "bun" | "brew" | "scoop" | "choco" | "unknown"
  > {
    if (process.execPath.includes(path.join(".orbit", "bin"))) return "curl"
    if (process.execPath.includes(path.join(".local", "bin"))) return "curl"
    const exec = process.execPath.toLowerCase()

    const checks = [
      {
        name: "npm" as const,
        command: () => text(["npm", "list", "-g", "--depth=0"]),
      },
      {
        name: "yarn" as const,
        command: () => text(["yarn", "global", "list"]),
      },
      {
        name: "pnpm" as const,
        command: () => text(["pnpm", "list", "-g", "--depth=0"]),
      },
      {
        name: "bun" as const,
        command: () => text(["bun", "pm", "ls", "-g"]),
      },
      {
        name: "brew" as const,
        command: () => text(["brew", "list", "--formula", "opencode"]),
      },
      {
        name: "scoop" as const,
        command: () => text(["scoop", "list", "opencode"]),
      },
      {
        name: "choco" as const,
        command: () => text(["choco", "list", "--limit-output", "opencode"]),
      },
    ]

    checks.sort((a, b) => {
      const aMatches = exec.includes(a.name)
      const bMatches = exec.includes(b.name)
      if (aMatches && !bMatches) return -1
      if (!aMatches && bMatches) return 1
      return 0
    })

    for (const check of checks) {
      const output = await check.command()
      const installedName =
        check.name === "brew" || check.name === "choco" || check.name === "scoop" ? "opencode" : "opencode-ai"
      if (output.includes(installedName)) {
        return check.name
      }
    }

    return "unknown"
  }

  export const UpgradeFailedError = NamedError.create(
    "UpgradeFailedError",
    z.object({
      stderr: z.string(),
    }),
  )

  async function getBrewFormula(): Promise<string> {
    const tapFormula = await text(["brew", "list", "--formula", "anomalyco/tap/opencode"])
    if (tapFormula.includes("opencode")) return "anomalyco/tap/opencode"
    const coreFormula = await text(["brew", "list", "--formula", "opencode"])
    if (coreFormula.includes("opencode")) return "opencode"
    return "opencode"
  }

  export async function upgrade(method: Method, target: string): Promise<void> {
    let result: Process.Result | undefined
    switch (method) {
      case "curl": {
        const curlResult = await upgradeCurl(target)
        result = { code: curlResult.code ?? 1, stdout: curlResult.stdout, stderr: curlResult.stderr }
        break
      }
      case "npm":
        result = await Process.run(["npm", "install", "-g", `opencode-ai@${target}`], { nothrow: true })
        break
      case "pnpm":
        result = await Process.run(["pnpm", "install", "-g", `opencode-ai@${target}`], { nothrow: true })
        break
      case "bun":
        result = await Process.run(["bun", "install", "-g", `opencode-ai@${target}`], { nothrow: true })
        break
      case "brew": {
        const formula = await getBrewFormula()
        const env = {
          HOMEBREW_NO_AUTO_UPDATE: "1",
          ...process.env,
        }
        if (formula.includes("/")) {
          const tap = await Process.run(["brew", "tap", "anomalyco/tap"], { env, nothrow: true })
          if (tap.code !== 0) {
            result = tap
            break
          }
          const repo = await Process.text(["brew", "--repo", "anomalyco/tap"], { env, nothrow: true })
          if (repo.code !== 0) {
            result = repo
            break
          }
          const dir = repo.text.trim()
          if (dir !== "") {
            const pull = await Process.run(["git", "pull", "--ff-only"], { cwd: dir, env, nothrow: true })
            if (pull.code !== 0) {
              result = pull
              break
            }
          }
        }
        result = await Process.run(["brew", "upgrade", formula], { env, nothrow: true })
        break
      }

      case "choco":
        result = await Process.run(["choco", "upgrade", "opencode", `--version=${target}`, "-y"], { nothrow: true })
        break
      case "scoop":
        result = await Process.run(["scoop", "install", `opencode@${target}`], { nothrow: true })
        break
      case "yarn":
        result = await Process.run(["yarn", "global", "add", `opencode-ai@${target}`], { nothrow: true })
        break
      case "unknown":
        throw new Error(`Unknown installation method`)
    }
    if (result.code !== 0) {
      const stderr = method === "choco" ? "not running from an elevated command shell" : result.stderr.toString("utf8")
      throw new UpgradeFailedError({
        stderr,
      })
    }
    log.info("upgraded", {
      method,
      target,
      stdout: result.stdout.toString(),
      stderr: result.stderr.toString(),
    })
    await Process.text([process.execPath, "--version"], { nothrow: true })
  }

  export const VERSION = typeof OPENCODE_VERSION === "string" ? OPENCODE_VERSION : "local"
  export const CHANNEL = typeof OPENCODE_CHANNEL === "string" ? OPENCODE_CHANNEL : "local"
  export const USER_AGENT = `orbit/${CHANNEL}/${VERSION}/${Flag.OPENCODE_CLIENT}`

  interface BrewVersionInfo {
    formulae?: { versions?: { stable?: string } }[]
  }

  interface NpmVersionInfo {
    version?: string
  }

  interface ChocoVersionInfo {
    d?: { results?: { Version?: string }[] }
  }

  interface ScoopVersionInfo {
    version?: string
  }

  interface GithubReleaseInfo {
    tag_name?: string
  }

  export async function latest(installMethod?: Method): Promise<string> {
    const detectedMethod = installMethod ?? (await method())

    if (detectedMethod === "brew") {
      const formula = await getBrewFormula()
      if (formula.includes("/")) {
        const infoJson = await text(["brew", "info", "--json=v2", formula])
        const info = JSON.parse(infoJson) as BrewVersionInfo
        const version = info.formulae?.[0]?.versions?.stable
        if (version === undefined) throw new Error(`Could not detect version for tap formula: ${formula}`)
        return version
      }
      return fetch("https://formulae.brew.sh/api/formula/opencode.json")
        .then((res) => {
          if (!res.ok) throw new Error(res.statusText)
          return res.json() as Promise<BrewVersionInfo>
        })
        .then((data) => {
          const version = data.formulae?.[0]?.versions?.stable
          if (version === undefined) throw new Error("Could not detect brew version")
          return version
        })
    }

    if (detectedMethod === "npm" || detectedMethod === "bun" || detectedMethod === "pnpm") {
      const registry = await iife(async () => {
        const r = (await text(["npm", "config", "get", "registry"])).trim()
        const reg = r !== "" ? r : "https://registry.npmjs.org"
        return reg.endsWith("/") ? reg.slice(0, -1) : reg
      })
      const channel = CHANNEL
      return fetch(`${registry}/opencode-ai/${channel}`)
        .then((res) => {
          if (!res.ok) throw new Error(res.statusText)
          return res.json() as Promise<NpmVersionInfo>
        })
        .then((data) => {
          if (data.version === undefined) throw new Error("Could not detect npm version")
          return data.version
        })
    }

    if (detectedMethod === "choco") {
      return fetch(
        "https://community.chocolatey.org/api/v2/Packages?$filter=Id%20eq%20%27opencode%27%20and%20IsLatestVersion&$select=Version",
        { headers: { Accept: "application/json;odata=verbose" } },
      )
        .then((res) => {
          if (!res.ok) throw new Error(res.statusText)
          return res.json() as Promise<ChocoVersionInfo>
        })
        .then((data) => {
          const version = data.d?.results?.[0]?.Version
          if (version === undefined) throw new Error("Could not detect choco version")
          return version
        })
    }

    if (detectedMethod === "scoop") {
      return fetch("https://raw.githubusercontent.com/ScoopInstaller/Main/master/bucket/opencode.json", {
        headers: { Accept: "application/json" },
      })
        .then((res) => {
          if (!res.ok) throw new Error(res.statusText)
          return res.json() as Promise<ScoopVersionInfo>
        })
        .then((data) => {
          if (data.version === undefined) throw new Error("Could not detect scoop version")
          return data.version
        })
    }

    return fetch("https://api.github.com/repos/anomalyco/opencode/releases/latest")
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText)
        return res.json() as Promise<GithubReleaseInfo>
      })
      .then((data) => {
        if (data.tag_name === undefined) throw new Error("Could not detect github release version")
        return data.tag_name.replace(/^v/, "")
      })
  }
}
