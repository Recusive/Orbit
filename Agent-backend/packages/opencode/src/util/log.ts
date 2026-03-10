import { createWriteStream } from "fs"
import fs from "fs/promises"
import path from "path"

import z from "zod"

import { Global } from "../global"

import { Glob } from "./glob"

export namespace Log {
  export const Level = z.enum(["DEBUG", "INFO", "WARN", "ERROR"]).meta({ ref: "LogLevel", description: "Log level" })
  export type Level = z.infer<typeof Level>

  const levelPriority: Record<Level, number> = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
  }

  let level: Level = "INFO"

  function shouldLog(input: Level): boolean {
    return levelPriority[input] >= levelPriority[level]
  }

  export interface Logger {
    debug(message?: unknown, extra?: Record<string, unknown>): void
    info(message?: unknown, extra?: Record<string, unknown>): void
    error(message?: unknown, extra?: Record<string, unknown>): void
    warn(message?: unknown, extra?: Record<string, unknown>): void
    tag(key: string, value: string): Logger
    clone(): Logger
    time(
      message: string,
      extra?: Record<string, unknown>,
    ): {
      stop(): void
      [Symbol.dispose](): void
    }
  }

  const loggers = new Map<string, Logger>()

  export const Default = create({ service: "default" })

  export interface Options {
    print: boolean
    dev?: boolean
    level?: Level
  }

  let logpath = ""
  export function file(): string {
    return logpath
  }
  let write = (msg: string): number => {
    process.stderr.write(msg)
    return msg.length
  }

  export async function init(options: Options): Promise<void> {
    if (options.level !== undefined) level = options.level
    void cleanup(Global.Path.log)
    if (options.print) return
    logpath = path.join(
      Global.Path.log,
      options.dev === true ? "dev.log" : (new Date().toISOString().split(".")[0] ?? "").replace(/:/g, "") + ".log",
    )
    await fs.truncate(logpath).catch(() => { /* ignore missing file */ })
    const stream = createWriteStream(logpath, { flags: "a" })
    write = (msg: string): number => {
      stream.write(msg, () => { /* noop callback */ })
      return msg.length
    }
  }

  async function cleanup(dir: string): Promise<void> {
    const files = await Glob.scan("????-??-??T??????.log", {
      cwd: dir,
      absolute: true,
      include: "file",
    })
    if (files.length <= 5) return

    const filesToDelete = files.slice(0, -10)
    await Promise.all(filesToDelete.map((file) => fs.unlink(file).catch(() => { /* ignore */ })))
  }

  function formatError(error: Error, depth = 0): string {
    const result = error.message
    return error.cause instanceof Error && depth < 10
      ? result + " Caused by: " + formatError(error.cause, depth + 1)
      : result
  }

  let last = Date.now()
  export function create(tags?: Record<string, unknown>): Logger {
    tags = tags ?? {}

    const service = tags.service
    if (typeof service === "string" && service !== "") {
      const cached = loggers.get(service)
      if (cached !== undefined) {
        return cached
      }
    }

    function build(message: unknown, extra?: Record<string, unknown>): string {
      const prefix = Object.entries({
        ...tags,
        ...extra,
      })
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => {
          const pfx = `${key}=`
          if (value instanceof Error) return pfx + formatError(value)
          if (typeof value === "object") return pfx + JSON.stringify(value)
          if (typeof value === "string") return pfx + value
          return pfx + JSON.stringify(value)
        })
        .join(" ")
      const next = new Date()
      const diff = next.getTime() - last
      last = next.getTime()
      return [next.toISOString().split(".")[0], "+" + String(diff) + "ms", prefix, message]
        .filter(Boolean)
        .join(" ") + "\n"
    }
    const result: Logger = {
      debug(message?: unknown, extra?: Record<string, unknown>) {
        if (shouldLog("DEBUG")) {
          write("DEBUG " + build(message, extra))
        }
      },
      info(message?: unknown, extra?: Record<string, unknown>) {
        if (shouldLog("INFO")) {
          write("INFO  " + build(message, extra))
        }
      },
      error(message?: unknown, extra?: Record<string, unknown>) {
        if (shouldLog("ERROR")) {
          write("ERROR " + build(message, extra))
        }
      },
      warn(message?: unknown, extra?: Record<string, unknown>) {
        if (shouldLog("WARN")) {
          write("WARN  " + build(message, extra))
        }
      },
      tag(key: string, value: string) {
        tags[key] = value
        return result
      },
      clone() {
        return Log.create({ ...tags })
      },
      time(message: string, extra?: Record<string, unknown>) {
        const now = Date.now()
        result.info(message, { status: "started", ...extra })
        function stop(): void {
          result.info(message, {
            status: "completed",
            duration: Date.now() - now,
            ...extra,
          })
        }
        return {
          stop,
          [Symbol.dispose]() {
            stop()
          },
        }
      },
    }

    if (typeof service === "string" && service !== "") {
      loggers.set(service, result)
    }

    return result
  }
}
