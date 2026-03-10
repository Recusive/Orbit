import { setTimeout as sleep } from "node:timers/promises"

import { describe, expect, test } from "bun:test"

import { Bus } from "../../src/bus"
import { Instance } from "../../src/project/instance"
import { Pty } from "../../src/pty"
import { tmpdir } from "../fixture/fixture"

const wait = async (fn: () => boolean, ms = 2000): Promise<void> => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (fn()) return
    await sleep(25)
  }
  throw new Error("timeout waiting for pty events")
}

const pick = (log: { type: "created" | "exited" | "deleted"; id: string }[], id: string): string[] => {
  return log.filter((evt) => evt.id === id).map((evt) => evt.type)
}

describe("pty", () => {
  test("publishes created, exited, deleted in order for /bin/ls + remove", async () => {
    if (process.platform === "win32") return

    await using dir = await tmpdir({ git: true })

    await Instance.provide({
      directory: dir.path,
      fn: async () => {
        const log: { type: "created" | "exited" | "deleted"; id: string }[] = []
        const off = [
          Bus.subscribe(Pty.Event.Created, (evt) => log.push({ type: "created", id: evt.properties.info.id })),
          Bus.subscribe(Pty.Event.Exited, (evt) => log.push({ type: "exited", id: evt.properties.id })),
          Bus.subscribe(Pty.Event.Deleted, (evt) => log.push({ type: "deleted", id: evt.properties.id })),
        ]

        let id = ""
        try {
          const info = await Pty.create({ command: "/bin/ls", title: "ls" })
          id = info.id

          await wait(() => pick(log, id).includes("exited"))

          Pty.remove(id)
          await wait(() => pick(log, id).length >= 3)
          expect(pick(log, id)).toEqual(["created", "exited", "deleted"])
        } finally {
          off.forEach((x) => { x(); })
          if (id) Pty.remove(id)
        }
      },
    })
  })

  test("publishes created, exited, deleted in order for /bin/sh + remove", async () => {
    if (process.platform === "win32") return

    await using dir = await tmpdir({ git: true })

    await Instance.provide({
      directory: dir.path,
      fn: async () => {
        const log: { type: "created" | "exited" | "deleted"; id: string }[] = []
        const off = [
          Bus.subscribe(Pty.Event.Created, (evt) => log.push({ type: "created", id: evt.properties.info.id })),
          Bus.subscribe(Pty.Event.Exited, (evt) => log.push({ type: "exited", id: evt.properties.id })),
          Bus.subscribe(Pty.Event.Deleted, (evt) => log.push({ type: "deleted", id: evt.properties.id })),
        ]

        let id = ""
        try {
          const info = await Pty.create({ command: "/bin/sh", title: "sh" })
          id = info.id

          await sleep(100)

          Pty.remove(id)
          await wait(() => pick(log, id).length >= 3)
          expect(pick(log, id)).toEqual(["created", "exited", "deleted"])
        } finally {
          off.forEach((x) => { x(); })
          if (id) Pty.remove(id)
        }
      },
    })
  })
})
