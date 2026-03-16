import path from "path"

import { describe, expect, test } from "bun:test"

import { Identifier } from "../../src/id/id"
import { Instance } from "../../src/project/instance"
import { Server } from "../../src/server/server"
import { Session } from "../../src/session"
import { Log } from "../../src/util/log"

import type { MessageV2 } from "../../src/session/message-v2"

const projectRoot = path.join(__dirname, "../..")
void Log.init({ print: false })

describe("session message pagination", () => {
  test("returns paginated messages with next cursor headers", async () => {
    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const session = await Session.create({})

        const first = Identifier.ascending("message")
        const second = Identifier.ascending("message")
        const third = Identifier.ascending("message")

        const mk = (id: string, created: number): MessageV2.Info =>
          ({
            id,
            sessionID: session.id,
            role: "user",
            time: { created },
            agent: "user",
            model: { providerID: "test", modelID: "test" },
            tools: {},
            mode: "",
          }) as unknown as MessageV2.Info

        await Session.updateMessage(mk(first, 1))
        await Session.updateMessage(mk(second, 2))
        await Session.updateMessage(mk(third, 3))

        const app = Server.Default()
        const page1 = await app.request(`/session/${session.id}/message?limit=2`)

        expect(page1.status).toBe(200)
        const items1 = (await page1.json()) as { info: { id: string } }[]
        expect(items1.map((item) => item.info.id)).toEqual([second, third])

        const next = page1.headers.get("X-Next-Cursor")
        expect(next).toBeTruthy()
        expect(page1.headers.get("Link")).toContain('rel="next"')

        const page2 = await app.request(`/session/${session.id}/message?limit=2&before=${encodeURIComponent(next!)}`)
        expect(page2.status).toBe(200)
        const items2 = (await page2.json()) as { info: { id: string } }[]
        expect(items2.map((item) => item.info.id)).toEqual([first])
      },
    })
  })
})
