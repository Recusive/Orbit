import { afterEach, describe, mock, test } from "bun:test"

import { GlobalBus } from "../../src/bus/global"
import * as adaptors from "../../src/control-plane/adaptors"
import { WorkspaceTable } from "../../src/control-plane/workspace.sql"
import { Identifier } from "../../src/id/id"
import { Project } from "../../src/project/project"
import { Database } from "../../src/storage/db"
import { Log } from "../../src/util/log"
import { resetDatabase } from "../fixture/db"
import { tmpdir } from "../fixture/fixture"

import type { Adaptor } from "../../src/control-plane/types"

afterEach(async () => {
  mock.restore()
  await resetDatabase()
})

void Log.init({ print: false })

const remote = { type: "testing", name: "remote-a" } as unknown as typeof WorkspaceTable.$inferInsert

const TestAdaptor: Adaptor = {
  configure(config) {
    return config
  },
  create() {
    throw new Error("not used")
  },
  async remove() {
    /* noop */
  },
  async fetch(_config, _input, _init?) {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder()
        controller.enqueue(encoder.encode('data: {"type":"remote.ready","properties":{}}\n\n'))
        controller.close()
      },
    })
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "text/event-stream",
      },
    })
  },
}

adaptors.installAdaptor("testing", TestAdaptor)

describe("control-plane/workspace.startSyncing", () => {
  test("syncs only remote workspaces and emits remote SSE events", async () => {
    const { Workspace } = await import("../../src/control-plane/workspace")
    await using tmp = await tmpdir({ git: true })
    const { project } = await Project.fromDirectory(tmp.path)

    const id1 = Identifier.descending("workspace")
    const id2 = Identifier.descending("workspace")

    Database.use((db) => {
      db.insert(WorkspaceTable)
        .values([
          {
            id: id1,
            branch: "main",
            project_id: project.id,
            type: remote.type,
            name: remote.name,
          },
          {
            id: id2,
            branch: "main",
            project_id: project.id,
            type: "worktree",
            directory: tmp.path,
            name: "local",
          },
        ])
        .run()
    })

    const done = new Promise<void>((resolve) => {
      const listener = (event: { directory?: string; payload: unknown }): void => {
        if (event.directory !== id1) return
        const payload = event.payload as { type?: string }
        if (payload.type !== "remote.ready") return
        GlobalBus.off("event", listener)
        resolve()
      }
      GlobalBus.on("event", listener)
    })

    const sync = Workspace.startSyncing(project)
    await Promise.race([
      done,
      new Promise((_, reject) =>
        setTimeout(() => {
          reject(new Error("timed out waiting for sync event"))
        }, 2000),
      ),
    ])

    sync.stop()
  })
})
