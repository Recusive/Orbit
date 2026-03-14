import { Log } from "@/util/log"

export namespace State {
  interface Entry<S = unknown> {
    state: S
    dispose?: (state: S) => Promise<void>
  }

  const log = Log.create({ service: "state" })
  const recordsByKey = new Map<string, Map<unknown, Entry>>()

  export function create<S>(
    root: () => string,
    init: () => S,
    dispose?: (state: Awaited<S>) => Promise<void>,
  ): (() => S) & { reset(): void } {
    const fn = (): S => {
      const key = root()
      let entries = recordsByKey.get(key)
      if (!entries) {
        entries = new Map<string, Entry>()
        recordsByKey.set(key, entries)
      }
      const exists = entries.get(init)
      if (exists) return exists.state as S
      const state = init()
      entries.set(init, {
        state,
        dispose: dispose as ((state: unknown) => Promise<void>) | undefined,
      })
      return state
    }
    // Cache invalidation only (not resource disposal).
    // Clears this specific init from ALL directory-keyed caches so the
    // next call re-runs init() with fresh data.
    fn.reset = (): void => {
      for (const [key, entries] of recordsByKey) {
        entries.delete(init)
        if (entries.size === 0) {
          recordsByKey.delete(key)
        }
      }
    }
    return fn
  }

  export async function dispose(key: string): Promise<void> {
    const entries = recordsByKey.get(key)
    if (!entries) return

    log.info("waiting for state disposal to complete", { key })

    let disposalFinished = false

    setTimeout(() => {
      if (!disposalFinished) {
        log.warn(
          "state disposal is taking an unusually long time - if it does not complete in a reasonable time, please report this as a bug",
          { key },
        )
      }
    }, 10000).unref()

    const tasks: Promise<void>[] = []
    for (const [init, entry] of entries) {
      if (!entry.dispose) continue

      const label = typeof init === "function" ? (init as { name?: string }).name : String(init)
      const disposeFn = entry.dispose

      const task = Promise.resolve(entry.state)
        .then((state) => disposeFn(state))
        .catch((error: unknown) => {
          log.error("Error while disposing state:", { error, key, init: label })
        })

      tasks.push(task)
    }
    await Promise.all(tasks)

    entries.clear()
    recordsByKey.delete(key)

    disposalFinished = true
    log.info("state disposal completed", { key })
  }
}
