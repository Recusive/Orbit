import { createWriteStream, existsSync, statSync, realpathSync  } from "fs"
import { chmod, mkdir, readFile, writeFile } from "fs/promises"
import { dirname, join, relative, resolve as pathResolve } from "path"
import { Readable } from "stream"
import { pipeline } from "stream/promises"

import { lookup } from "mime-types"

import { Glob } from "./glob"

import type { ReadableStream as NodeWebReadableStream } from "node:stream/web"

export namespace Filesystem {
  // Fast sync version for metadata checks
  export function exists(p: string): boolean {
    return existsSync(p)
  }

  export function isDir(p: string): boolean {
    try {
      return statSync(p).isDirectory()
    } catch {
      return false
    }
  }

  export function stat(p: string): ReturnType<typeof statSync> | undefined {
    return statSync(p, { throwIfNoEntry: false }) ?? undefined
  }

  export function size(p: string): number {
    const s = stat(p)?.size ?? 0
    return typeof s === "bigint" ? Number(s) : s
  }

  export async function readText(p: string): Promise<string> {
    return readFile(p, "utf-8")
  }

  export async function readJson<T = unknown>(p: string): Promise<T> {
    return JSON.parse(await readFile(p, "utf-8")) as T
  }

  export async function readBytes(p: string): Promise<Buffer> {
    return readFile(p)
  }

  export async function readArrayBuffer(p: string): Promise<ArrayBuffer> {
    const buf = await readFile(p)
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  }

  function isEnoent(e: unknown): e is { code: "ENOENT" } {
    return typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "ENOENT"
  }

  export async function write(p: string, content: string | Buffer | Uint8Array, mode?: number): Promise<void> {
    try {
      if (mode !== undefined) {
        await writeFile(p, content, { mode })
      } else {
        await writeFile(p, content)
      }
    } catch (e) {
      if (isEnoent(e)) {
        await mkdir(dirname(p), { recursive: true })
        if (mode !== undefined) {
          await writeFile(p, content, { mode })
        } else {
          await writeFile(p, content)
        }
        return
      }
      throw e
    }
  }

  export async function writeJson(p: string, data: unknown, mode?: number): Promise<void> {
    await write(p, JSON.stringify(data, null, 2), mode)
  }

  export async function writeStream(
    p: string,
    stream: ReadableStream<Uint8Array> | Readable,
    mode?: number,
  ): Promise<void> {
    const dir = dirname(p)
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true })
    }

    const nodeStream = stream instanceof ReadableStream ? Readable.fromWeb(stream as unknown as NodeWebReadableStream) : stream
    const writeStr = createWriteStream(p)
    await pipeline(nodeStream, writeStr)

    if (mode !== undefined) {
      await chmod(p, mode)
    }
  }

  export function mimeType(p: string): string {
    const result = lookup(p)
    return result !== false ? result : "application/octet-stream"
  }

  /**
   * On Windows, normalize a path to its canonical casing using the filesystem.
   * This is needed because Windows paths are case-insensitive but LSP servers
   * may return paths with different casing than what we send them.
   */
  export function normalizePath(p: string): string {
    if (process.platform !== "win32") return p
    try {
      return realpathSync.native(p)
    } catch {
      return p
    }
  }

  // We cannot rely on path.resolve() here because git.exe may come from Git Bash, Cygwin, or MSYS2, so we need to translate these paths at the boundary.
  export function resolve(p: string): string {
    return normalizePath(pathResolve(windowsPath(p)))
  }

  export function windowsPath(p: string): string {
    if (process.platform !== "win32") return p
    return (
      p
        .replace(/^\/([a-zA-Z]):(?:[\\/]|$)/, (_, drive: string) => `${drive.toUpperCase()}:/`)
        // Git Bash for Windows paths are typically /<drive>/...
        .replace(/^\/([a-zA-Z])(?:\/|$)/, (_, drive: string) => `${drive.toUpperCase()}:/`)
        // Cygwin git paths are typically /cygdrive/<drive>/...
        .replace(/^\/cygdrive\/([a-zA-Z])(?:\/|$)/, (_, drive: string) => `${drive.toUpperCase()}:/`)
        // WSL paths are typically /mnt/<drive>/...
        .replace(/^\/mnt\/([a-zA-Z])(?:\/|$)/, (_, drive: string) => `${drive.toUpperCase()}:/`)
    )
  }
  export function overlaps(a: string, b: string): boolean {
    const relA = relative(a, b)
    const relB = relative(b, a)
    return relA === "" || !relA.startsWith("..") || !relB.startsWith("..")
  }

  export function contains(parent: string, child: string): boolean {
    return !relative(parent, child).startsWith("..")
  }

  export function findUp(target: string, start: string, stop?: string): string[] {
    let current: string | undefined = start
    const result: string[] = []
    while (current !== undefined) {
      const search = join(current, target)
      if (exists(search)) result.push(search)
      if (stop === current) break
      const parent = dirname(current)
      if (parent === current) {
        current = undefined
      } else {
        current = parent
      }
    }
    return result
  }

  export function* up(options: { targets: string[]; start: string; stop?: string }): Generator<string> {
    const { targets, start, stop } = options
    let current: string | undefined = start
    while (current !== undefined) {
      for (const target of targets) {
        const search = join(current, target)
        if (exists(search)) yield search
      }
      if (stop === current) break
      const parent = dirname(current)
      if (parent === current) {
        current = undefined
      } else {
        current = parent
      }
    }
  }

  export async function globUp(pattern: string, start: string, stop?: string): Promise<string[]> {
    let current: string | undefined = start
    const result: string[] = []
    while (current !== undefined) {
      try {
        const matches = await Glob.scan(pattern, {
          cwd: current,
          absolute: true,
          include: "file",
          dot: true,
        })
        result.push(...matches)
      } catch {
        // Skip invalid glob patterns
      }
      if (stop === current) break
      const parent = dirname(current)
      if (parent === current) {
        current = undefined
      } else {
        current = parent
      }
    }
    return result
  }
}
