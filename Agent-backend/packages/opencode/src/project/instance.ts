import { Effect } from "effect"

import { Context } from "../util/context"

import { Project } from "./project"
import { State } from "./state"

import { GlobalBus } from "@/bus/global"
import { Filesystem } from "@/util/filesystem"
import { iife } from "@/util/iife"
import { InstanceState } from "@/util/instance-state"
import { Log } from "@/util/log"

interface InstanceContext {
  directory: string
  worktree: string
  project: Project.Info
}
const context = Context.create<InstanceContext>("instance")
const cache = new Map<string, Promise<InstanceContext>>()

const disposal = {
  all: undefined as Promise<void> | undefined,
}

function emit(directory: string): void {
  GlobalBus.emit("event", {
    directory,
    payload: {
      type: "server.instance.disposed",
      properties: {
        directory,
      },
    },
  })
}

function boot(input: {
  directory: string
  init?: () => Promise<unknown>
  project?: Project.Info
  worktree?: string
}): Promise<InstanceContext> {
  return iife(async () => {
    const ctx =
      input.project && input.worktree
        ? {
            directory: input.directory,
            worktree: input.worktree,
            project: input.project,
          }
        : await Project.fromDirectory(input.directory).then(({ project, sandbox }) => ({
            directory: input.directory,
            worktree: sandbox,
            project,
          }))
    await context.provide(ctx, async () => {
      await input.init?.()
    })
    return ctx
  })
}

function track(directory: string, next: Promise<InstanceContext>): Promise<InstanceContext> {
  const task = next.catch((error: unknown) => {
    if (cache.get(directory) === task) cache.delete(directory)
    throw error
  })
  cache.set(directory, task)
  return task
}

export const Instance = {
  async provide<R>(input: { directory: string; init?: () => Promise<unknown>; fn: () => R }): Promise<R> {
    const directory = Filesystem.resolve(input.directory)
    let existing = cache.get(directory)
    if (!existing) {
      Log.Default.info("creating instance", { directory })
      existing = track(
        directory,
        boot({
          directory,
          init: input.init,
        }),
      )
    }
    const ctx = await existing
    return context.provide(ctx, () => {
      return input.fn()
    })
  },
  get directory(): string {
    return context.use().directory
  },
  get worktree(): string {
    return context.use().worktree
  },
  get project(): Project.Info {
    return context.use().project
  },
  /**
   * Check if a path is within the project boundary.
   * Returns true if path is inside Instance.directory OR Instance.worktree.
   * Paths within the worktree but outside the working directory should not trigger external_directory permission.
   */
  containsPath(filepath: string): boolean {
    if (Filesystem.contains(Instance.directory, filepath)) return true
    // Non-git projects set worktree to "/" which would match ANY absolute path.
    // Skip worktree check in this case to preserve external_directory permissions.
    if (Instance.worktree === "/") return false
    return Filesystem.contains(Instance.worktree, filepath)
  },
  state<S>(init: () => S, dispose?: (state: Awaited<S>) => Promise<void>): (() => S) & { reset(): void } {
    return State.create(() => Instance.directory, init, dispose)
  },
  async reload(input: {
    directory: string
    init?: () => Promise<unknown>
    project?: Project.Info
    worktree?: string
  }): Promise<InstanceContext> {
    const directory = Filesystem.resolve(input.directory)
    Log.Default.info("reloading instance", { directory })
    await Promise.all([State.dispose(directory), Effect.runPromise(InstanceState.dispose(directory))])
    cache.delete(directory)
    const next = track(directory, boot({ ...input, directory }))
    emit(directory)
    return await next
  },
  async dispose(): Promise<void> {
    Log.Default.info("disposing instance", { directory: Instance.directory })
    await Promise.all([State.dispose(Instance.directory), Effect.runPromise(InstanceState.dispose(Instance.directory))])
    cache.delete(Instance.directory)
    emit(Instance.directory)
  },
  async disposeAll(): Promise<void> {
    if (disposal.all) return disposal.all

    disposal.all = iife(async () => {
      Log.Default.info("disposing all instances")
      const entries = [...cache.entries()]
      for (const [key, value] of entries) {
        if (cache.get(key) !== value) continue

        const ctx = await value.catch((error: unknown) => {
          Log.Default.warn("instance dispose failed", { key, error })
          return undefined
        })

        if (!ctx) {
          if (cache.get(key) === value) cache.delete(key)
          continue
        }

        if (cache.get(key) !== value) continue

        await context.provide(ctx, async () => {
          await Instance.dispose()
        })
      }
    }).finally(() => {
      disposal.all = undefined
    })

    return disposal.all
  },
}
