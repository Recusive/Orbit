import { Flag } from "../flag/flag"
import { Instance } from "../project/instance"
import { Filesystem } from "../util/filesystem"
import { Log } from "../util/log"

export namespace FileTime {
  const log = Log.create({ service: "file.time" })
  // Per-session read times plus per-file write locks.
  // All tools that overwrite existing files should run their
  // assert/read/write/update sequence inside withLock(filepath, ...)
  // so concurrent writes to the same file are serialized.
  export const state = Instance.state(
    (): {
      read: Record<string, Record<string, Date | undefined>>
      locks: Map<string, Promise<void>>
    } => {
      const read: Record<string, Record<string, Date | undefined>> = {}
      const locks = new Map<string, Promise<void>>()
      return {
        read,
        locks,
      }
    },
  )

  export function read(sessionID: string, file: string): void {
    log.info("read", { sessionID, file })
    const { read } = state()
    read[sessionID] = read[sessionID] ?? {}
    read[sessionID][file] = new Date()
  }

  export function get(sessionID: string, file: string): Date | undefined {
    const sessions = state().read[sessionID] as Record<string, Date | undefined> | undefined
    if (sessions === undefined) return undefined
    return sessions[file]
  }

  export async function withLock<T>(filepath: string, fn: () => Promise<T>): Promise<T> {
    const current = state()
    const currentLock = current.locks.get(filepath) ?? Promise.resolve()
    let release: () => void = () => {
      /* placeholder until replaced by the promise executor */
    }
    const nextLock = new Promise<void>((resolve) => {
      release = resolve
    })
    const chained = currentLock.then(() => nextLock)
    current.locks.set(filepath, chained)
    await currentLock
    try {
      return await fn()
    } finally {
      release()
      if (current.locks.get(filepath) === chained) {
        current.locks.delete(filepath)
      }
    }
  }

  export function assert(sessionID: string, filepath: string): void {
    if (Flag.OPENCODE_DISABLE_FILETIME_CHECK) {
      return
    }

    const time = get(sessionID, filepath)
    if (!time) throw new Error(`You must read file ${filepath} before overwriting it. Use the Read tool first`)
    const mtime = Filesystem.stat(filepath)?.mtime
    // Allow a 50ms tolerance for Windows NTFS timestamp fuzziness / async flushing
    if (mtime && mtime.getTime() > time.getTime() + 50) {
      throw new Error(
        `File ${filepath} has been modified since it was last read.\nLast modification: ${mtime.toISOString()}\nLast read: ${time.toISOString()}\n\nPlease read the file again before modifying it.`,
      )
    }
  }
}
