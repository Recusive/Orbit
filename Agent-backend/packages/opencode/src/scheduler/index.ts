import { Instance } from "../project/instance"
import { Log } from "../util/log"

export namespace Scheduler {
  const log = Log.create({ service: "scheduler" })

  export interface Task {
    id: string
    interval: number
    run: () => Promise<void>
    scope?: "instance" | "global"
  }

  type Timer = ReturnType<typeof setInterval>
  interface Entry {
    tasks: Map<string, Task>
    timers: Map<string, Timer>
  }

  const create = (): Entry => {
    const tasks = new Map<string, Task>()
    const timers = new Map<string, Timer>()
    return { tasks, timers }
  }

  const shared = create()

  const state = Instance.state(
    () => create(),
    (entry): Promise<void> => {
      for (const timer of entry.timers.values()) {
        clearInterval(timer)
      }
      entry.tasks.clear()
      entry.timers.clear()
      return Promise.resolve()
    },
  )

  export function register(task: Task): void {
    const scope = task.scope ?? "instance"
    const entry = scope === "global" ? shared : state()
    const current = entry.timers.get(task.id)
    if (current !== undefined && scope === "global") return
    if (current !== undefined) clearInterval(current)

    entry.tasks.set(task.id, task)
    void run(task)
    const timer = setInterval(() => {
      void run(task)
    }, task.interval)
    timer.unref()
    entry.timers.set(task.id, timer)
  }

  async function run(task: Task): Promise<void> {
    log.info("run", { id: task.id })
    await task.run().catch((error: unknown) => {
      log.error("run failed", { id: task.id, error })
    })
  }
}
