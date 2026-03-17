import { spawn } from "node:child_process"

import type { Config } from "./gen/types.gen.js"

export interface ServerOptions {
  hostname?: string
  port?: number
  signal?: AbortSignal
  timeout?: number
  config?: Config
}

export interface TuiOptions {
  project?: string
  model?: string
  session?: string
  agent?: string
  signal?: AbortSignal
  config?: Config
}

interface OrbitServer {
  url: string
  close(): void
}

export async function createOrbitServer(options?: ServerOptions): Promise<OrbitServer> {
  const resolved = Object.assign(
    {
      hostname: "127.0.0.1",
      port: 4096,
      timeout: 5000,
    },
    options ?? {},
  )

  const args = [`serve`, `--hostname=${resolved.hostname}`, `--port=${String(resolved.port)}`]
  if (resolved.config?.logLevel) args.push(`--log-level=${resolved.config.logLevel}`)

  const proc = spawn(`orbit`, args, {
    signal: resolved.signal,
    env: {
      ...process.env,
      OPENCODE_CONFIG_CONTENT: JSON.stringify(resolved.config ?? {}),
    },
  })

  const url = await new Promise<string>((resolve, reject) => {
    const id = setTimeout(() => {
      reject(new Error(`Timeout waiting for server to start after ${String(resolved.timeout)}ms`))
    }, resolved.timeout)
    let output = ""
    proc.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString()
      const lines = output.split("\n")
      for (const line of lines) {
        if (line.startsWith("orbit server listening") || line.startsWith("opencode server listening")) {
          const match = /on\s+(https?:\/\/[^\s]+)/.exec(line)
          if (!match) {
            throw new Error(`Failed to parse server url from output: ${line}`)
          }
          clearTimeout(id)
          resolve(match[1])
          return
        }
      }
    })
    proc.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString()
    })
    proc.on("exit", (code) => {
      clearTimeout(id)
      let msg = `Server exited with code ${String(code)}`
      if (output.trim()) {
        msg += `\nServer output: ${output}`
      }
      reject(new Error(msg))
    })
    proc.on("error", (error) => {
      clearTimeout(id)
      reject(error)
    })
    if (resolved.signal) {
      resolved.signal.addEventListener("abort", () => {
        clearTimeout(id)
        reject(new Error("Aborted"))
      })
    }
  })

  return {
    url,
    close(): void {
      proc.kill()
    },
  }
}

export const createOpencodeServer = createOrbitServer

interface OrbitTui {
  close(): void
}

export function createOrbitTui(options?: TuiOptions): OrbitTui {
  const args: string[] = []

  if (options?.project) {
    args.push(`--project=${options.project}`)
  }
  if (options?.model) {
    args.push(`--model=${options.model}`)
  }
  if (options?.session) {
    args.push(`--session=${options.session}`)
  }
  if (options?.agent) {
    args.push(`--agent=${options.agent}`)
  }

  const proc = spawn(`orbit`, args, {
    signal: options?.signal,
    stdio: "inherit",
    env: {
      ...process.env,
      OPENCODE_CONFIG_CONTENT: JSON.stringify(options?.config ?? {}),
    },
  })

  return {
    close(): void {
      proc.kill()
    },
  }
}

export const createOpencodeTui = createOrbitTui
