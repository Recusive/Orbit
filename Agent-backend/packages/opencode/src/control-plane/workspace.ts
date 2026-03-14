import z from "zod"

import { getAdaptor } from "./adaptors"
import { parseSSE } from "./sse"
import { WorkspaceInfo } from "./types"
import { WorkspaceTable } from "./workspace.sql"

import type { Project } from "@/project/project"

import { BusEvent } from "@/bus/bus-event"
import { GlobalBus } from "@/bus/global"
import { Identifier } from "@/id/id"
import { Database, eq } from "@/storage/db"
import { fn } from "@/util/fn"
import { Log } from "@/util/log"

export namespace Workspace {
  export const Event = {
    Ready: BusEvent.define(
      "workspace.ready",
      z.object({
        name: z.string(),
      }),
    ),
    Failed: BusEvent.define(
      "workspace.failed",
      z.object({
        message: z.string(),
      }),
    ),
  }

  export const Info = WorkspaceInfo.meta({
    ref: "Workspace",
  })
  export type Info = z.infer<typeof Info>

  function fromRow(row: typeof WorkspaceTable.$inferSelect): Info {
    return {
      id: row.id,
      type: row.type,
      branch: row.branch,
      name: row.name,
      directory: row.directory,
      extra: row.extra,
      projectID: row.project_id,
    }
  }

  const CreateInput = z.object({
    id: Identifier.schema("workspace").optional(),
    type: Info.shape.type,
    branch: Info.shape.branch,
    projectID: Info.shape.projectID,
    extra: Info.shape.extra,
  })

  export const create = fn(CreateInput, async (input) => {
    const id = Identifier.ascending("workspace", input.id)
    const adaptor = await getAdaptor(input.type)

    const config = await adaptor.configure({ ...input, id, name: null, directory: null })

    const info: Info = {
      id,
      type: config.type,
      branch: config.branch ?? null,
      name: config.name ?? null,
      directory: config.directory ?? null,
      extra: config.extra ?? null,
      projectID: input.projectID,
    }

    Database.use((db) => {
      db.insert(WorkspaceTable)
        .values({
          id: info.id,
          type: info.type,
          branch: info.branch,
          name: info.name,
          directory: info.directory,
          extra: info.extra,
          project_id: info.projectID,
        })
        .run()
    })

    await adaptor.create(config)
    return info
  })

  export function list(project: Project.Info): Info[] {
    const rows = Database.use((db) =>
      db.select().from(WorkspaceTable).where(eq(WorkspaceTable.project_id, project.id)).all(),
    )
    return rows.map(fromRow).sort((a, b) => a.id.localeCompare(b.id))
  }

  export const get = fn(Identifier.schema("workspace"), (id) => {
    const row = Database.use((db) => db.select().from(WorkspaceTable).where(eq(WorkspaceTable.id, id)).get())
    if (row === undefined) return undefined
    return fromRow(row)
  })

  export const remove = fn(Identifier.schema("workspace"), async (id) => {
    const row = Database.use((db) => db.select().from(WorkspaceTable).where(eq(WorkspaceTable.id, id)).get())
    if (row !== undefined) {
      const info = fromRow(row)
      const adaptor = await getAdaptor(row.type)
      void adaptor.remove(info)
      Database.use((db) => {
        db.delete(WorkspaceTable).where(eq(WorkspaceTable.id, id)).run()
      })
      return info
    }
    return undefined
  })
  const log = Log.create({ service: "workspace-sync" })

  async function workspaceEventLoop(space: Info, stop: AbortSignal): Promise<void> {
    while (!stop.aborted) {
      const adaptor = await getAdaptor(space.type)
      const res = await adaptor.fetch(space, "/event", { method: "GET", signal: stop }).catch(() => undefined)
      if (res === undefined || !res.ok || res.body === null) {
        await Bun.sleep(1000)
        continue
      }
      await parseSSE(res.body, stop, (event) => {
        GlobalBus.emit("event", {
          directory: space.id,
          payload: event,
        })
      })
      // Wait 250ms and retry if SSE connection fails
      await Bun.sleep(250)
    }
  }

  export function startSyncing(project: Project.Info): { stop: () => void } {
    const stop = new AbortController()
    const spaces = list(project).filter((space) => space.type !== "worktree")

    spaces.forEach((space) => {
      void workspaceEventLoop(space, stop.signal).catch((error: unknown) => {
        log.warn("workspace sync listener failed", {
          workspaceID: space.id,
          error,
        })
      })
    })

    return {
      stop() {
        stop.abort()
      },
    }
  }
}
